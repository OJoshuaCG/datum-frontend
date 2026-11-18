import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/api/query-keys'
import { invalidateDatabaseViews } from '@/features/managed-databases/invalidate'
import { handleUncertainRun } from '@/features/managed-databases/uncertain-run'
import { notifyMutationError } from '@/features/auth'
import { destructiveApprovalMessage } from '@/features/destructive-approvals/messages'
import { MIGRATION_APPLY_JOB_ALREADY_ACTIVE_CODE, toApiError } from '@/lib/api/errors'
import { useToast } from '@/lib/toast/use-toast'
import {
  MIGRATION_APPLY_JOB_ACTIVE_STATUSES,
  type MigrationApplyJobOut,
  type MigrationApplyJobStatus,
} from '@/lib/contracts'
import {
  getApplyAllJob,
  launchApplyAllJob,
  listApplyAllJobs,
  type ApplyAllJobOptions,
} from '../api/model-migrations.api'
import { invalidateAfterBatchApply } from './use-model-migrations'

/**
 * Polling del detalle de un job. Dentro de la ventana de 2–5 s que pide el contrato: el job
 * recorre las bases en serie y cada una tarda lo suyo, así que más seguido no muestra nada nuevo.
 */
const APPLY_JOB_DETAIL_POLL_MS = 3000

/**
 * Polling del historial, solo mientras alguna fila visible siga activa. Más lento que el detalle:
 * acá solo cambia el contador de la fila, y el detalle (si está abierto) ya se consulta aparte.
 */
const APPLY_JOB_LIST_POLL_MS = 5000

/** Cuántos jobs muestra el historial. Es el default del backend. */
export const APPLY_JOB_LIST_LIMIT = 20

export function isApplyJobActive(status: MigrationApplyJobStatus): boolean {
  return MIGRATION_APPLY_JOB_ACTIVE_STATUSES.has(status)
}

/** Historial de jobs del blueprint, del más nuevo al más viejo (sin `results`). */
export function useMigrationApplyJobs(modelId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.databaseModels.applyJobList(modelId, APPLY_JOB_LIST_LIMIT),
    queryFn: ({ signal }) => listApplyAllJobs(modelId, APPLY_JOB_LIST_LIMIT, signal),
    enabled,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? []
      return jobs.some((job) => isApplyJobActive(job.status)) ? APPLY_JOB_LIST_POLL_MS : false
    },
  })
}

/**
 * Detalle de un job, con polling mientras esté `pending` o `running`; se corta solo en cualquier
 * estado terminal.
 *
 * Al detectar el paso de activo a terminal invalida lo mismo que el `apply-all` síncrono: las
 * versiones aplicadas cambiaron en las bases. Se hace dentro del `queryFn` comparando con lo que
 * había en caché, y no en un efecto, para que ocurra UNA vez por transición aunque varios
 * componentes miren el mismo job. Abrir un job que ya estaba terminado no invalida nada: no hubo
 * transición que observar.
 */
export function useMigrationApplyJob(modelId: number, jobId: number | null) {
  const queryClient = useQueryClient()
  const resolvedJobId = jobId ?? 0
  const queryKey = queryKeys.databaseModels.applyJobDetail(modelId, resolvedJobId)
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<MigrationApplyJobOut>(queryKey)
      const job = await getApplyAllJob(modelId, resolvedJobId, signal)
      const justFinished =
        previous !== undefined && isApplyJobActive(previous.status) && !isApplyJobActive(job.status)
      if (justFinished) {
        invalidateAfterBatchApply(queryClient, modelId)
        // Solo los listados: invalidar la raíz `applyJobs` incluiría este mismo detalle, y
        // `invalidateQueries` cancelaría el fetch en curso para volver a pedirlo.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.databaseModels.applyJobLists(modelId),
        })
      }
      return job
    },
    enabled: jobId !== null && Number.isFinite(jobId) && jobId > 0,
    // Un 404 (job inexistente o de otro blueprint) no se arregla reintentando.
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && isApplyJobActive(status) ? APPLY_JOB_DETAIL_POLL_MS : false
    },
  })
}

/**
 * Lanza un job de `apply-all-jobs` 🔌.
 *
 * Siembra el detalle con la respuesta del 202 para que el panel arranque sin esperar el primer
 * polling, y para que la transición a terminal se detecte aunque el job termine rápido.
 */
export function useLaunchApplyAllJob(modelId: number) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (options: ApplyAllJobOptions) => launchApplyAllJob(modelId, options),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.databaseModels.applyJobDetail(modelId, job.id), job)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.databaseModels.applyJobLists(modelId),
      })
    },
    onError: (error) => {
      // Sin respuesta: el job pudo haberse creado y estar corriendo. Se refresca el historial y
      // el estado por base para que el operador lo encuentre en vez de lanzar otro a ciegas.
      if (
        handleUncertainRun(error, toast, 'Sin respuesta al lanzar la aplicación masiva', () => {
          invalidateDatabaseViews(queryClient, null)
          void queryClient.invalidateQueries({
            queryKey: queryKeys.databaseModels.applyJobLists(modelId),
          })
        })
      ) {
        return
      }
      const apiError = toApiError(error)
      // El 409 «ya hay uno en curso» no es un fallo para el operador: el diálogo salta a ese job.
      if (apiError.code === MIGRATION_APPLY_JOB_ALREADY_ACTIVE_CODE) return
      // El 503 deja un job `failed` en el historial: se refresca para que aparezca.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.databaseModels.applyJobLists(modelId),
      })
      notifyMutationError(
        toast,
        error,
        'No se pudo lanzar la aplicación masiva',
        destructiveApprovalMessage(apiError.code, apiError.selfApprovalRule) ?? undefined,
      )
    },
  })
}

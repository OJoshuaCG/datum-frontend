import { useId, type ReactNode } from 'react'
import { ForbiddenState, isAccessForbidden } from '@/features/auth'
import { Badge, Button, Callout, ErrorState, Spinner } from '@/components/ui'
import { toApiError } from '@/lib/api/errors'
import { type MigrationApplyJobOut } from '@/lib/contracts'
import { formatDateTime } from '@/lib/utils'
import { isApplyJobActive, useMigrationApplyJob } from '../hooks/use-migration-apply-jobs'
import { APPLY_JOB_STATUS_LABEL, APPLY_JOB_STATUS_TONE } from '../apply-job-status'
import { ApplyAllResultList } from './ApplyAllResultList'

/** Código HTTP del job inexistente o de otro blueprint. */
const HTTP_NOT_FOUND = 404

interface MigrationApplyJobPanelProps {
  modelId: number
  jobId: number
  /**
   * Relanza con los MISMOS parámetros. Solo lo pasa quien los conoce (el diálogo que lanzó el
   * job): el job no guarda `database_ids` ni `max_databases`, así que relanzar desde sus campos
   * podría ampliar el alcance a todas las bases del blueprint sin que nadie lo pidiera.
   */
  onRelaunch?: () => void
  isRelaunching?: boolean
  /** Motivo visible por el que «Relanzar» está deshabilitado (rate limit, falta de permiso…). */
  relaunchDisabledReason?: string | null
}

/**
 * Estado, progreso y resultados por base de un job de `apply-all-jobs`.
 *
 * Consulta el detalle cada pocos segundos mientras el job está `pending` o `running`, y deja de
 * hacerlo en cuanto llega a un estado terminal. Los resultados crecen durante el polling: uno por
 * base terminada, en orden.
 */
export function MigrationApplyJobPanel({
  modelId,
  jobId,
  onRelaunch,
  isRelaunching = false,
  relaunchDisabledReason,
}: MigrationApplyJobPanelProps) {
  const job = useMigrationApplyJob(modelId, jobId)

  if (job.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner label="Cargando la ejecución" /> Cargando la ejecución #{jobId}…
      </div>
    )
  }

  if (job.isError) {
    if (isAccessForbidden(job.error)) return <ForbiddenState />
    if (toApiError(job.error).status === HTTP_NOT_FOUND) {
      return (
        <Callout tone="warning" title={`No se encontró la ejecución #${jobId}`}>
          <p>No existe o pertenece a otro blueprint.</p>
        </Callout>
      )
    }
    return (
      <ErrorState
        error={job.error}
        title="No se pudo cargar la ejecución"
        onRetry={() => void job.refetch()}
      />
    )
  }

  if (!job.data) return null

  return (
    <JobDetail
      job={job.data}
      onRelaunch={onRelaunch}
      isRelaunching={isRelaunching}
      relaunchDisabledReason={relaunchDisabledReason}
    />
  )
}

interface JobDetailProps {
  job: MigrationApplyJobOut
  onRelaunch?: () => void
  isRelaunching: boolean
  relaunchDisabledReason?: string | null
}

function JobDetail({ job, onRelaunch, isRelaunching, relaunchDisabledReason }: JobDetailProps) {
  const results = job.results ?? []
  const active = isApplyJobActive(job.status)

  return (
    <section
      aria-label={`Ejecución #${job.id}`}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">Ejecución #{job.id}</span>
        <Badge tone={APPLY_JOB_STATUS_TONE[job.status]}>{APPLY_JOB_STATUS_LABEL[job.status]}</Badge>
        <span className="text-xs text-muted-foreground">
          {job.created_by_username ? `Lanzada por ${job.created_by_username}` : 'Lanzada'}
          {job.created_at ? ` · ${formatDateTime(job.created_at)}` : ''}
          {job.finished_at ? ` · terminó ${formatDateTime(job.finished_at)}` : ''}
        </span>
      </div>

      {job.status === 'pending' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner label="En cola" /> En cola: el job todavía no empezó a recorrer las bases.
        </p>
      ) : (
        <JobProgress job={job} />
      )}

      <JobOutcome
        job={job}
        onRelaunch={onRelaunch}
        isRelaunching={isRelaunching}
        relaunchDisabledReason={relaunchDisabledReason}
      />

      {results.length > 0 && (
        <ApplyAllResultList
          title={active ? 'Progreso' : 'Resultado'}
          processed={job.processed}
          outOf={job.planned}
          targetVersion={job.target_version}
          channelSlug={job.channel_slug}
          results={results}
          wasDryRun={false}
        />
      )}
    </section>
  )
}

function JobProgress({ job }: { job: MigrationApplyJobOut }) {
  // Un job sin bases que recorrer (`planned = 0`) se da por completo: no hay nada pendiente.
  const percent = job.planned > 0 ? Math.round((job.processed / job.planned) * 100) : 100
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label="Bases procesadas"
        aria-valuemin={0}
        aria-valuemax={job.planned}
        aria-valuenow={job.processed}
        aria-valuetext={`${job.processed} de ${job.planned} bases`}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {job.processed} de {job.planned} base(s) procesada(s)
        {job.failed > 0 ? ` · ${job.failed} con error` : ''}
      </p>
    </div>
  )
}

function JobOutcome({ job, onRelaunch, isRelaunching, relaunchDisabledReason }: JobDetailProps) {
  const reasonId = useId()

  if (job.status === 'done') {
    return (
      <Callout tone="success" title="Todas las bases terminaron sin error">
        <p>Las omitidas por falta de permiso, si las hay, figuran como «sin permiso».</p>
      </Callout>
    )
  }

  if (job.status === 'partial') {
    return (
      <Callout tone="warning" title={`${job.failed} base(s) terminaron con error`}>
        <p>El job recorrió todas las bases; las que fallaron están resaltadas al principio.</p>
      </Callout>
    )
  }

  if (job.status === 'failed') {
    return (
      <Callout tone="danger" title="La ejecución se cortó por un error inesperado">
        <p>{job.error ?? 'El servidor no informó el motivo.'}</p>
      </Callout>
    )
  }

  if (job.status === 'interrupted') {
    let relaunch: ReactNode
    if (onRelaunch) {
      relaunch = (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            isLoading={isRelaunching}
            disabled={Boolean(relaunchDisabledReason)}
            aria-describedby={relaunchDisabledReason ? reasonId : undefined}
            onClick={onRelaunch}
          >
            Relanzar 🔌
          </Button>
          {relaunchDisabledReason && (
            <span id={reasonId} className="text-xs text-muted-foreground">
              {relaunchDisabledReason}
            </span>
          )}
        </div>
      )
    } else {
      relaunch = (
        <p className="mt-1">Para relanzarlo, abrí «Aplicar migraciones» con los mismos destinos.</p>
      )
    }
    return (
      <Callout tone="danger" title="La ejecución se interrumpió">
        <p>
          {job.error ?? 'El servidor se reinició con el job en curso.'} No se re-encola sola. Las
          bases que ya terminaron no tienen pendientes y se saltean al relanzar.
        </p>
        {relaunch}
      </Callout>
    )
  }

  return null
}

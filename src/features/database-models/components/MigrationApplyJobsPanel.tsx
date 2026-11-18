import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ForbiddenState, isAccessForbidden } from '@/features/auth'
import { Badge, DataTable, EmptyState, ErrorState, RowActionButton } from '@/components/ui'
import { type MigrationApplyJobOut } from '@/lib/contracts'
import { formatDateTime } from '@/lib/utils'
import { APPLY_JOB_LIST_LIMIT, useMigrationApplyJobs } from '../hooks/use-migration-apply-jobs'
import { APPLY_JOB_STATUS_LABEL, APPLY_JOB_STATUS_TONE } from '../apply-job-status'
import { MigrationApplyJobPanel } from './MigrationApplyJobPanel'

interface MigrationApplyJobsPanelProps {
  modelId: number
  /** Job abierto. Vive en la URL (`?job=`) para que el enlace desde el diálogo lo abra. */
  selectedJobId: number | null
  onSelectJob: (jobId: number | null) => void
}

/** Hasta qué versión apuntó el job, tal como se pidió. */
function targetLabel(job: MigrationApplyJobOut): string {
  if (job.target_version) return job.target_version
  if (job.channel_slug) return `canal ${job.channel_slug}`
  return 'última'
}

/**
 * Historial de aplicaciones masivas en background del blueprint, con el detalle del job elegido.
 *
 * No ofrece «Relanzar»: el job no guarda qué bases eligió el operador (`database_ids`) ni el
 * tope, así que relanzarlo desde acá podría ampliar el alcance a todas las bases. Eso se hace
 * desde «Aplicar migraciones», que sí conoce los parámetros.
 */
export function MigrationApplyJobsPanel({
  modelId,
  selectedJobId,
  onSelectJob,
}: MigrationApplyJobsPanelProps) {
  const jobs = useMigrationApplyJobs(modelId)

  // Ninguna columna ordena: el orden (más nueva primero) es información del backend.
  const columns = useMemo<ColumnDef<MigrationApplyJobOut>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Ejecución',
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">#{row.original.id}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={APPLY_JOB_STATUS_TONE[row.original.status]}>
            {APPLY_JOB_STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'progress',
        header: 'Progreso',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.processed}/{row.original.planned}
            {row.original.failed > 0 ? ` · ${row.original.failed} con error` : ''}
          </span>
        ),
      },
      {
        id: 'target',
        header: 'Hasta',
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs">{targetLabel(row.original)}</span>,
      },
      {
        accessorKey: 'created_by_username',
        header: 'Lanzada por',
        enableSorting: false,
        cell: ({ row }) => row.original.created_by_username ?? '—',
      },
      {
        accessorKey: 'created_at',
        header: 'Lanzada',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowActionButton
              label="Ver detalle"
              subject={`la ejecución #${row.original.id}`}
              onClick={() => onSelectJob(row.original.id)}
            />
          </div>
        ),
      },
    ],
    [onSelectJob],
  )

  if (jobs.isError) {
    if (isAccessForbidden(jobs.error)) return <ForbiddenState />
    return (
      <ErrorState
        error={jobs.error}
        title="No se pudo cargar el historial de ejecuciones"
        onRetry={() => void jobs.refetch()}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Las últimas {APPLY_JOB_LIST_LIMIT} aplicaciones masivas lanzadas en background, de la más
        nueva a la más vieja. Se actualiza sola mientras alguna está en curso.
      </p>
      <DataTable
        data={jobs.data ?? []}
        columns={columns}
        isLoading={jobs.isLoading}
        isFetching={jobs.isFetching}
        enableGlobalFilter={false}
        getRowId={(job) => String(job.id)}
        emptyState={
          <EmptyState
            title="Todavía no hay ejecuciones"
            description="Se crean al aplicar migraciones a varias bases desde «Aplicar migraciones»."
          />
        }
      />
      {selectedJobId !== null && <MigrationApplyJobPanel modelId={modelId} jobId={selectedJobId} />}
    </div>
  )
}

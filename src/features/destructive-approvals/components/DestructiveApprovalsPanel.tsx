import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Pagination,
  Spinner,
} from '@/components/ui'
import { useCapabilityGuard, useSession } from '@/features/auth'
import {
  APPROVAL_BATCH_MAX_ITEMS,
  CAPABILITIES,
  type BatchItemError,
  type ActorRef,
  type BatchItemResult,
  type DestructiveApproval,
  type DestructiveVersion,
} from '@/lib/contracts'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/format'
import { useDestructiveVersions } from '../hooks/use-destructive-approvals'
import { DESTRUCTIVE_APPROVALS_ANCHOR_ID } from '../anchors'
import {
  batchBlockReason,
  classifyBatchResult,
  isRowSelected,
  isSelectionFull,
  isSelectionStale,
  rowBatchKey,
  rowNeedsApproval,
  selectedBatchRows,
  type BatchSelection,
} from '../batch-selection'
import {
  approvalStatusLabel,
  approvalStatusTone,
  batchBlockText,
  batchItemMessage,
  directionLabel,
} from '../messages'
import {
  APPROVAL_STATUS_FILTERS,
  countByStatusFilter,
  DEFAULT_VERSION_FILTERS,
  DEFAULT_VERSION_PAGE_SIZE,
  filterDestructiveVersions,
  paginate,
  SMALLEST_VERSION_PAGE_SIZE,
  VERSION_PAGE_SIZE_OPTIONS,
  type ApprovalStatusFilter,
  type DestructiveVersionFilters,
} from '../version-filters'
import { ApproveDestructiveBatchDialog } from './ApproveDestructiveBatchDialog'
import { ApproveDestructiveDialog } from './ApproveDestructiveDialog'
import { RevokeApprovalDialog } from './RevokeApprovalDialog'

/** La base sobre la que se evalúa y a la que se limita la aprobación (alcance `database`). */
export interface DestructiveApprovalsDatabase {
  id: number
  name: string
  serverId: number
  environmentId: number | null
}

interface DestructiveApprovalsPanelProps {
  modelId: number
  modelName?: string
  /**
   * Con base: el estado se evalúa PARA ella y aprobar vale solo para ella (alcance `database`).
   * Sin base: aprobar vale para todas las bases protegidas del blueprint (alcance `blueprint`).
   */
  database?: DestructiveApprovalsDatabase
  /**
   * Abre la versión en la pestaña «Versiones» de la página del blueprint. Hace falta además del
   * enlace porque esa página lee `?version=` solo al montar y el enlace navega a la MISMA ruta: sin
   * esto, la URL cambiaría y la ficha seguiría mostrando otra versión. Desde la ficha de una base el
   * enlace cambia de ruta, la página se monta de nuevo y no hace falta.
   */
  onOpenVersion?: (version: string) => void
}

/**
 * Versiones destructivas del blueprint con su estado de aprobación, y desde acá se aprueba y se
 * revoca.
 *
 * Una migración destructiva no corre en un entorno protegido hasta que una SEGUNDA persona la
 * aprueba. La aprobación está atada al SQL: editarlo la deja vencida (`stale_hash`) y pide aprobar
 * de nuevo. «Aprobada» acá es informativa, no un permiso para ejecutar: ejecutar sigue pidiendo
 * `blueprints.apply_destructive`, el re-tipeo del nombre y un token de confirmación.
 *
 * El botón «Aprobar» NO se renderiza sin `blueprints.approve_destructive` (no se deshabilita): un
 * control que nunca va a funcionar para esta persona solo la invita a pedir un acceso que quizá no
 * le corresponde, y la regla de cuatro ojos ya hace que muchos no puedan aprobar sus propias
 * versiones.
 */
export function DestructiveApprovalsPanel({
  modelId,
  modelName,
  database,
  onOpenVersion,
}: DestructiveApprovalsPanelProps) {
  const versions = useDestructiveVersions(modelId, database?.id ?? null)
  const approveGuard = useCapabilityGuard(
    CAPABILITIES.blueprintsApproveDestructive,
    'aprobar migraciones destructivas',
    {
      scope: database
        ? { serverId: database.serverId, environmentId: database.environmentId }
        : undefined,
    },
  )
  const [approving, setApproving] = useState<DestructiveVersion | null>(null)
  const [revoking, setRevoking] = useState<DestructiveApproval | null>(null)
  // Filas del lote en curso, congeladas al abrir el diálogo: la selección se vacía a medida que se
  // aprueba, y el diálogo tiene que seguir mostrando TODAS las filas con su resultado.
  const [batchRows, setBatchRows] = useState<DestructiveVersion[] | null>(null)
  // Clave de fila → `sql_hash` que se vio al marcarla (ver `batch-selection.ts`).
  const [selection, setSelection] = useState<BatchSelection>(new Map())
  // Último motivo de fallo por fila de un lote, para dejarlas marcadas en la lista.
  const [failures, setFailures] = useState<ReadonlyMap<string, BatchItemError>>(new Map())
  const [filters, setFilters] = useState<DestructiveVersionFilters>(DEFAULT_VERSION_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_VERSION_PAGE_SIZE)
  const { admin } = useSession()

  const confirmWord = database?.name ?? modelName ?? ''
  const rows = versions.data ?? []
  const statusCounts = countByStatusFilter(rows)
  const filteredRows = filterDestructiveVersions(rows, filters)
  const visible = paginate(filteredRows, page, pageSize)
  const hasActiveFilters =
    filters.status !== DEFAULT_VERSION_FILTERS.status || filters.query.trim() !== ''
  const selectedRows = selectedBatchRows(rows, selection)
  // «Seleccionar pendientes» marca lo que se está mirando: con un filtro puesto (por ejemplo, las
  // de una persona) marcar también filas ocultas aprobaría cosas que nadie tiene en pantalla. Abarca
  // todas las páginas del filtro, no solo la visible, porque la página es solo un corte de lectura.
  const selectableRows = filteredRows.filter(
    (row) => rowNeedsApproval(row) && batchBlockReason(row, admin?.id) === null,
  )

  // Cambiar un filtro vuelve a la página 1 en el mismo evento: quedarse en la 3 de un resultado
  // que ahora tiene una sola página mostraría la última por el acotado de `paginate`, no la primera.
  const updateFilters = (next: Partial<DestructiveVersionFilters>) => {
    setFilters((previous) => ({ ...previous, ...next }))
    setPage(1)
  }
  const clearFilters = () => {
    setFilters(DEFAULT_VERSION_FILTERS)
    setPage(1)
  }

  const toggleRow = (row: DestructiveVersion, checked: boolean) => {
    const key = rowBatchKey(row)
    setSelection((previous) => {
      const next = new Map(previous)
      if (checked) next.set(key, row.sql_hash)
      else next.delete(key)
      return next
    })
    setFailures((previous) => {
      if (!previous.has(key)) return previous
      const next = new Map(previous)
      next.delete(key)
      return next
    })
  }

  const selectAllPending = () => {
    const next = new Map<string, string>()
    for (const row of selectableRows.slice(0, APPROVAL_BATCH_MAX_ITEMS)) {
      next.set(rowBatchKey(row), row.sql_hash)
    }
    setSelection(next)
    setFailures(new Map())
  }

  // Tras un lote: lo aprobado (y lo que ya estaba aprobado) sale de la selección; lo que falló por
  // algo reintentable o por SQL cambiado queda marcado, y el resto se desmarca porque reintentarlo
  // tal cual no cambiaría nada. Las filas con SQL cambiado las suelta solas la guarda del hash.
  const applyBatchResults = (results: BatchItemResult[]) => {
    setSelection((previous) => {
      const next = new Map(previous)
      for (const result of results) {
        const outcome = classifyBatchResult(result)
        const keepMarked = outcome === 'retryable' || outcome === 'sql_changed'
        if (!keepMarked) next.delete(rowBatchKey(result))
      }
      return next
    })
    setFailures((previous) => {
      const next = new Map(previous)
      for (const result of results) {
        const key = rowBatchKey(result)
        const outcome = classifyBatchResult(result)
        const isProblem = outcome !== 'approved' && outcome !== 'already_approved'
        if (isProblem && result.error) next.set(key, result.error)
        else next.delete(key)
      }
      return next
    })
  }

  return (
    <Card id={DESTRUCTIVE_APPROVALS_ANCHOR_ID}>
      <CardHeader>
        <CardTitle>Aprobaciones de migraciones destructivas</CardTitle>
        <CardDescription>
          {database
            ? `Versiones con SQL destructivo (DROP, TRUNCATE…) y su estado para «${database.name}». Aprobar acá vale solo para esta base.`
            : 'Versiones con SQL destructivo (DROP, TRUNCATE…). Aprobar acá vale para todas las bases protegidas del blueprint, incluidas las que se creen después.'}{' '}
          Los entornos protegidos no las ejecutan hasta que una segunda persona las aprueba.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {versions.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Cargando versiones destructivas…
          </div>
        ) : versions.isError ? (
          <ErrorState
            error={versions.error}
            title="No se pudieron cargar las versiones destructivas"
            onRetry={() => void versions.refetch()}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna versión de este blueprint tiene SQL destructivo: no hay nada que aprobar.
          </p>
        ) : (
          <>
            <VersionFilterBar
              filters={filters}
              counts={statusCounts}
              onStatusChange={(status) => updateFilters({ status })}
              onQueryChange={(query) => updateFilters({ query })}
            />
            {approveGuard.allowed && selectableRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {selectedRows.length === 0
                    ? 'Marcá varias versiones para aprobarlas de una vez.'
                    : `${selectedRows.length} ${selectedRows.length === 1 ? 'seleccionada' : 'seleccionadas'}${
                        isSelectionFull(selection)
                          ? ` (tope de ${APPROVAL_BATCH_MAX_ITEMS} por lote)`
                          : ''
                      }`}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={selectAllPending}>
                    Seleccionar pendientes
                  </Button>
                  {selectedRows.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setSelection(new Map())}>
                      Limpiar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedRows.length === 0}
                    onClick={() => setBatchRows(selectedRows)}
                  >
                    Aprobar seleccionadas…
                  </Button>
                </div>
              </div>
            )}
            {filteredRows.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <span>Ninguna versión coincide con los filtros.</span>
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {visible.items.map((row) => (
                  <VersionRow
                    key={`${row.migration_id}-${row.direction}`}
                    modelId={modelId}
                    row={row}
                    canApprove={approveGuard.allowed}
                    selected={isRowSelected(selection, row)}
                    selectionStale={isSelectionStale(selection, row)}
                    selectionFull={isSelectionFull(selection)}
                    blockText={blockTextFor(row, admin?.id)}
                    failure={failures.get(rowBatchKey(row))}
                    onToggle={(checked) => toggleRow(row, checked)}
                    onApprove={() => setApproving(row)}
                    onRevoke={setRevoking}
                    onOpenVersion={onOpenVersion}
                  />
                ))}
              </ul>
            )}
            {/* Sin paginador mientras todo entra en la página más chica: «Página 1 de 1» no informa
                nada y ocupa una línea. */}
            {visible.total > SMALLEST_VERSION_PAGE_SIZE && (
              <Pagination
                page={visible.page}
                pages={visible.pages}
                total={visible.total}
                size={pageSize}
                hasPrev={visible.page > 1}
                hasNext={visible.page < visible.pages}
                onPageChange={setPage}
                onSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
                sizeOptions={VERSION_PAGE_SIZE_OPTIONS}
              />
            )}
            {hasActiveFilters && filteredRows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Mostrando {filteredRows.length} de {rows.length} versiones.{' '}
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </p>
            )}
          </>
        )}
      </CardContent>

      {approving && (
        <ApproveDestructiveDialog
          key={`${approving.migration_id}-${approving.direction}`}
          modelId={modelId}
          version={approving}
          managedDatabaseId={database?.id}
          confirmWord={confirmWord}
          guardScope={
            database
              ? { serverId: database.serverId, environmentId: database.environmentId }
              : undefined
          }
          onClose={() => setApproving(null)}
        />
      )}
      {batchRows && (
        <ApproveDestructiveBatchDialog
          modelId={modelId}
          rows={batchRows}
          managedDatabaseId={database?.id}
          confirmWord={confirmWord}
          guardScope={
            database
              ? { serverId: database.serverId, environmentId: database.environmentId }
              : undefined
          }
          onResult={applyBatchResults}
          onClose={() => setBatchRows(null)}
        />
      )}
      {revoking && (
        <RevokeApprovalDialog
          key={revoking.id}
          modelId={modelId}
          approval={revoking}
          onClose={() => setRevoking(null)}
        />
      )}
    </Card>
  )
}

/** Por qué la fila no se puede marcar para el lote (cuatro ojos), o `null` si se puede. */
function blockTextFor(row: DestructiveVersion, adminId: number | undefined): string | null {
  const reason = batchBlockReason(row, adminId)
  return reason === null ? null : batchBlockText(reason)
}

interface VersionFilterBarProps {
  filters: DestructiveVersionFilters
  counts: Record<ApprovalStatusFilter, number>
  onStatusChange: (status: ApprovalStatusFilter) => void
  onQueryChange: (query: string) => void
}

/**
 * Filtro por estado (con el conteo de cada uno, para saber cuántas esperan aprobación sin tener que
 * filtrar) y búsqueda por versión o persona. Ambos se aplican al instante: es un filtro en memoria
 * sobre decenas de filas, no hay petición que amortiguar.
 */
function VersionFilterBar({
  filters,
  counts,
  onStatusChange,
  onQueryChange,
}: VersionFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {APPROVAL_STATUS_FILTERS.map((option) => {
          const active = filters.status === option.value
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={active ? 'outline' : 'ghost'}
              aria-pressed={active}
              className={cn(active && 'border-primary text-primary')}
              onClick={() => onStatusChange(option.value)}
            >
              {option.label} ({counts[option.value]})
            </Button>
          )
        })}
      </div>
      <div className="sm:w-80">
        <Input
          type="search"
          label="Buscar"
          value={filters.query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Versión, nombre o usuario"
          hint="Usuario: quien la creó, editó el SQL, aprobó o revocó."
        />
      </div>
    </div>
  )
}

/** Usuario de una persona registrada, o «desconocido» si el snapshot no lo trae. */
function actorName(actor: ActorRef | null | undefined): string {
  return actor?.username ?? 'desconocido'
}

/**
 * Quién creó la versión y quién tocó el SQL por última vez. Son las dos personas que la regla de
 * cuatro ojos excluye de aprobar, así que es lo primero que hay que ver para saber a quién pedírsela.
 * Si son la misma persona se dice una vez. `author_unknown`: versión anterior al registro de autoría,
 * sin último editor con qué comparar.
 */
function AuthorshipLine({ row }: { row: DestructiveVersion }) {
  const author = actorName(row.author)
  const editor = actorName(row.last_sql_editor)
  const sameAuthorAndEditor =
    row.author.admin_id !== null &&
    row.author.admin_id !== undefined &&
    row.author.admin_id === row.last_sql_editor.admin_id
  return (
    <p className="text-xs text-muted-foreground">
      Creada por <strong className="text-foreground">{author}</strong>
      {row.author_unknown ? (
        ' · último editor del SQL sin registrar (versión anterior al registro de autoría)'
      ) : sameAuthorAndEditor ? (
        ', que también editó el SQL por última vez'
      ) : (
        <>
          {' '}
          · último cambio del SQL por <strong className="text-foreground">{editor}</strong>
        </>
      )}
    </p>
  )
}

interface VersionRowProps {
  modelId: number
  row: DestructiveVersion
  canApprove: boolean
  selected: boolean
  /** Se marcó, pero el SQL cambió desde entonces: hay que volver a revisarla. */
  selectionStale: boolean
  /** Ya hay `APPROVAL_BATCH_MAX_ITEMS` marcadas: no se deja marcar más. */
  selectionFull: boolean
  /** Motivo por el que no se puede aprobar esta fila (cuatro ojos). */
  blockText: string | null
  /** Por qué falló en el último lote, para dejarla marcada. */
  failure?: BatchItemError
  onToggle: (checked: boolean) => void
  onApprove: () => void
  onRevoke: (approval: DestructiveApproval) => void
  onOpenVersion?: (version: string) => void
}

function VersionRow({
  modelId,
  row,
  canApprove,
  selected,
  selectionStale,
  selectionFull,
  blockText,
  failure,
  onToggle,
  onApprove,
  onRevoke,
  onOpenVersion,
}: VersionRowProps) {
  const liveApprovals = row.approvals.filter((approval) => approval.is_live)
  const reasons = Object.entries(row.reasons_by_engine)
  // Una aprobación vigente solo cubre si el hash coincide: con `approved` ya no hace falta
  // aprobar; con cualquier otro estado sí (primera vez, revocada o SQL cambiado).
  const needsApproval = rowNeedsApproval(row)

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && needsApproval && (
            <input
              type="checkbox"
              aria-label={`Seleccionar la versión ${row.version} (${directionLabel(row.direction).toLowerCase()})`}
              className="h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              checked={selected}
              disabled={blockText !== null || (selectionFull && !selected)}
              onChange={(event) => onToggle(event.target.checked)}
            />
          )}
          {/* Enlace real (y no solo un clic): se puede abrir en otra pestaña o copiar, como el resto
              de los enlaces a una versión. */}
          <Link
            to={`/database-models/${modelId}/migrations?version=${encodeURIComponent(row.version)}`}
            onClick={() => onOpenVersion?.(row.version)}
            className="group flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Ver la versión completa"
          >
            <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{row.version}</code>
            <span className="text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">
              {row.name}
            </span>
          </Link>
          <Badge tone="neutral">{directionLabel(row.direction)}</Badge>
          <Badge tone={approvalStatusTone(row.approval_status)}>
            {approvalStatusLabel(row.approval_status)}
          </Badge>
        </div>
        {canApprove && needsApproval && (
          <Button size="sm" variant="outline" onClick={onApprove}>
            {row.approval_status === 'stale_hash' ? 'Aprobar de nuevo…' : 'Aprobar…'}
          </Button>
        )}
      </div>

      <AuthorshipLine row={row} />

      {reasons.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {reasons.map(([engine, list]) => `${engine}: ${list.join(', ')}`).join(' · ')}
        </p>
      )}

      {canApprove && needsApproval && blockText && (
        <p className="text-xs text-muted-foreground">{blockText}</p>
      )}
      {selectionStale && (
        <p className="text-xs text-error">
          El SQL cambió desde que la marcaste: leelo de nuevo y volvé a marcarla.
        </p>
      )}
      {failure && (
        <p className="text-xs text-error">
          No se aprobó en el último lote:{' '}
          {batchItemMessage(failure.code, failure.rule) ?? failure.message}
        </p>
      )}

      {row.approval_status === 'stale_hash' && (
        <p className="text-xs text-error">
          El SQL cambió después de aprobarse: esa aprobación ya no vale y hay que aprobar de nuevo.
        </p>
      )}
      {row.approval_status === 'revoked' && (
        <p className="text-xs text-muted-foreground">
          La aprobación se revocó: la ejecución sigue bloqueada hasta aprobarla de nuevo.
        </p>
      )}

      {liveApprovals.map((approval) => (
        <div
          key={approval.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted/50 px-2 py-1.5 text-xs text-muted-foreground"
        >
          <span>
            Aprobada por{' '}
            <strong className="text-foreground">
              {approval.approved_by.username ?? 'desconocido'}
            </strong>{' '}
            el {formatDateTime(approval.approved_at)} ·{' '}
            {approval.scope === 'blueprint' ? 'todo el blueprint' : 'una base'}
            {approval.execution_count > 0
              ? ` · ejecutada ${approval.execution_count} vez/veces`
              : ''}
            {approval.author_unknown ? ' · autoría incompleta' : ''}
          </span>
          <Button size="sm" variant="danger-soft" onClick={() => onRevoke(approval)}>
            Revocar…
          </Button>
        </div>
      ))}
    </li>
  )
}

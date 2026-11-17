import { type ActorRef, type DestructiveVersion } from '@/lib/contracts'
import { rowNeedsApproval } from './batch-selection'

/**
 * Filtro y paginación de la lista de versiones destructivas, EN EL CLIENTE.
 *
 * `GET /database-models/{id}/destructive-versions` devuelve la lista completa, sin paginación ni
 * filtros (api-reference §23.2), y el frontend no puede cambiar el contrato. Son decenas de filas
 * (solo las versiones con SQL destructivo, una por dirección), así que filtrar y cortar en memoria
 * es barato y deja la paginación coherente con el filtro: se pagina lo que queda DESPUÉS de filtrar.
 *
 * Vive aparte del componente para probar las reglas sin montar la pantalla.
 */

/**
 * Filtro por estado. «Pendientes» agrupa todo lo que necesita una aprobación nueva (sin aprobar,
 * revocada o vencida por cambio de SQL), con la misma regla que decide si una fila ofrece
 * «Aprobar…»: así el filtro nunca esconde una fila que pide acción ni muestra una que no la pide.
 */
export type ApprovalStatusFilter = 'all' | 'pending' | 'approved'

export const APPROVAL_STATUS_FILTERS: { value: ApprovalStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
]

/** Filas por página. Pocas: cada fila ocupa varias líneas (motivos por motor, aprobaciones). */
export const SMALLEST_VERSION_PAGE_SIZE = 10
export const VERSION_PAGE_SIZE_OPTIONS = [SMALLEST_VERSION_PAGE_SIZE, 20, 50]
export const DEFAULT_VERSION_PAGE_SIZE = SMALLEST_VERSION_PAGE_SIZE

export interface DestructiveVersionFilters {
  status: ApprovalStatusFilter
  /** Texto libre: número o nombre de la versión, o el usuario de una persona involucrada. */
  query: string
}

export const DEFAULT_VERSION_FILTERS: DestructiveVersionFilters = { status: 'all', query: '' }

function matchesStatus(row: DestructiveVersion, status: ApprovalStatusFilter): boolean {
  if (status === 'pending') return rowNeedsApproval(row)
  if (status === 'approved') return !rowNeedsApproval(row)
  return true
}

/**
 * Usuarios que tienen algo que ver con la fila: quien la creó, quien editó el SQL por última vez y
 * quien la aprobó o revocó (historial completo, no solo la vigente: buscar «quién aprobó esto
 * alguna vez» también es una pregunta válida).
 */
function peopleOf(row: DestructiveVersion): string[] {
  const actors: (ActorRef | null | undefined)[] = [row.author, row.last_sql_editor]
  for (const approval of row.approvals) {
    actors.push(approval.approved_by, approval.revoked_by)
  }
  const usernames: string[] = []
  for (const actor of actors) {
    const username = actor?.username
    if (username) usernames.push(username)
  }
  return usernames
}

function matchesQuery(row: DestructiveVersion, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true
  const searchable = [row.version, row.name, ...peopleOf(row)]
  return searchable.some((value) => value.toLowerCase().includes(normalizedQuery))
}

/** Filas que pasan el filtro de estado Y el de texto, en el orden en que llegaron. */
export function filterDestructiveVersions(
  rows: readonly DestructiveVersion[],
  filters: DestructiveVersionFilters,
): DestructiveVersion[] {
  const normalizedQuery = filters.query.trim().toLowerCase()
  return rows.filter(
    (row) => matchesStatus(row, filters.status) && matchesQuery(row, normalizedQuery),
  )
}

/** Cuántas filas hay de cada estado, para mostrarlo en el propio filtro. */
export function countByStatusFilter(
  rows: readonly DestructiveVersion[],
): Record<ApprovalStatusFilter, number> {
  const pending = rows.filter((row) => rowNeedsApproval(row)).length
  return { all: rows.length, pending, approved: rows.length - pending }
}

export interface PageSlice<T> {
  items: T[]
  /** Página efectiva (1-based), ya acotada al rango válido. */
  page: number
  pages: number
  total: number
}

/**
 * Corta una página. La página pedida se ACOTA en vez de confiar en ella: al aprobar o filtrar, la
 * lista puede encogerse y dejar la página actual fuera de rango, y mostrar una página vacía con
 * «Página 4 de 2» es peor que caer en la última que existe. Se acota al calcular, no con un efecto
 * que corrija el estado (eso es error de lint en este repo).
 */
export function paginate<T>(
  items: readonly T[],
  requestedPage: number,
  size: number,
): PageSlice<T> {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(Math.max(1, requestedPage), pages)
  const start = (page - 1) * size
  return { items: items.slice(start, start + size), page, pages, total }
}

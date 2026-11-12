import {
  APPROVAL_BATCH_MAX_ITEMS,
  type ApproveDestructiveBatchItemInput,
  type DestructiveDirection,
  type DestructiveVersion,
} from '@/lib/contracts'

/**
 * Lógica pura de la selección múltiple para aprobar en lote. Vive aparte de los componentes para
 * poder probar las reglas sin montar la pantalla.
 *
 * La selección guarda, por fila, el `sql_hash` que la persona VIO al marcarla. Es lo que se manda
 * como `expected_sql_hash`: si el SQL cambió después (la lista se refrescó), el hash guardado ya no
 * coincide con el de la fila y la marca deja de valer. Sin esto, reintentar tras un `sql_changed`
 * firmaría en silencio un SQL que nadie leyó, que es justo lo que el hash existe para impedir.
 */

/** Selección: clave de fila → `sql_hash` visto al marcarla. */
export type BatchSelection = ReadonlyMap<string, string>

/** Una fila se identifica por versión y dirección (la unidad que el backend no deja repetir). */
export function batchKey(version: string, direction: string): string {
  return `${version}:${direction}`
}

export function rowBatchKey(row: Pick<DestructiveVersion, 'version' | 'direction'>): string {
  return batchKey(row.version, row.direction)
}

export type BatchBlockReason = 'creator' | 'last_editor'

/**
 * Por qué una fila NO se puede aprobar, o `null` si se puede. Replica la regla de cuatro ojos con
 * los datos que ya trae la lista, para no mandar ítems que se sabe que van a fallar. Es una pista:
 * decide el servidor. Con autoría desconocida no se bloquea (no hay con qué comparar).
 */
export function batchBlockReason(
  row: Pick<DestructiveVersion, 'author' | 'last_sql_editor'>,
  currentAdminId: number | null | undefined,
): BatchBlockReason | null {
  if (currentAdminId === null || currentAdminId === undefined) return null
  if (row.author.admin_id === currentAdminId) return 'creator'
  if (row.last_sql_editor.admin_id === currentAdminId) return 'last_editor'
  return null
}

export function batchBlockText(reason: BatchBlockReason): string {
  return reason === 'creator'
    ? 'Creaste esta versión: tiene que aprobarla otra persona.'
    : 'Editaste su SQL por última vez: tiene que aprobarla otra persona.'
}

/** Una fila ya aprobada para este alcance no tiene nada que aprobar. */
export function rowNeedsApproval(row: Pick<DestructiveVersion, 'approval_status'>): boolean {
  return row.approval_status !== 'approved'
}

/** La marca vale solo si el SQL sigue siendo el que se vio al marcarla. */
export function isRowSelected(selection: BatchSelection, row: DestructiveVersion): boolean {
  return selection.get(rowBatchKey(row)) === row.sql_hash
}

/** La fila se marcó, pero su SQL cambió desde entonces: hay que volver a revisarla. */
export function isSelectionStale(selection: BatchSelection, row: DestructiveVersion): boolean {
  const seen = selection.get(rowBatchKey(row))
  return seen !== undefined && seen !== row.sql_hash
}

/** `true` si ya se llegó al tope por lote: no se deja marcar más para no armar un 422. */
export function isSelectionFull(selection: BatchSelection): boolean {
  return selection.size >= APPROVAL_BATCH_MAX_ITEMS
}

/**
 * Las filas marcadas, en el orden de la lista. Solo entran las que aún necesitan aprobación y cuya
 * marca sigue vigente (mismo hash que se vio).
 */
export function selectedBatchRows(
  rows: readonly DestructiveVersion[],
  selection: BatchSelection,
): DestructiveVersion[] {
  return rows.filter((row) => rowNeedsApproval(row) && isRowSelected(selection, row))
}

/**
 * Convierte una fila en el ítem que viaja al backend. `expected_sql_hash` es el SQL que la persona
 * revisó: si cambió mientras tanto, el servidor rechaza solo ese ítem en vez de aprobar a ciegas.
 */
export function toBatchItem(row: DestructiveVersion): ApproveDestructiveBatchItemInput {
  return {
    version: row.version,
    direction: row.direction as DestructiveDirection,
    expectedSqlHash: row.sql_hash,
  }
}

/** Los ítems del lote, en el orden de la lista, con el hash que se vio al marcar. */
export function selectedBatchItems(
  rows: readonly DestructiveVersion[],
  selection: BatchSelection,
): ApproveDestructiveBatchItemInput[] {
  return selectedBatchRows(rows, selection).map(toBatchItem)
}

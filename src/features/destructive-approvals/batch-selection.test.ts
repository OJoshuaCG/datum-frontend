import { describe, expect, it } from 'vitest'
import {
  APPROVAL_BATCH_MAX_ITEMS,
  BATCH_ITEM_STATUS_APPROVED,
  DESTRUCTIVE_APPROVAL_ERROR_CODES as CODES,
  type DestructiveVersion,
} from '@/lib/contracts'
import {
  batchBlockReason,
  batchKey,
  classifyBatchResult,
  isRowSelected,
  isSelectionFull,
  isSelectionStale,
  rowBatchKey,
  rowNeedsApproval,
  selectedBatchRows,
  toBatchItem,
} from './batch-selection'

const ME = 7
const OTHER = 9

function rowFixture(overrides: Partial<DestructiveVersion> = {}): DestructiveVersion {
  return {
    migration_id: 1,
    version: '0001',
    name: 'drop legacy',
    direction: 'up',
    sql_hash: 'a'.repeat(64),
    reasons_by_engine: {},
    author: { admin_id: OTHER, username: 'ana' },
    last_sql_editor: { admin_id: OTHER, username: 'ana' },
    author_unknown: false,
    approval_status: 'unapproved',
    effective_approval_id: null,
    approvals: [],
    ...overrides,
  }
}

describe('batchBlockReason (cuatro ojos)', () => {
  it('bloquea la fila que creó quien consulta', () => {
    const row = rowFixture({ author: { admin_id: ME, username: 'yo' } })
    expect(batchBlockReason(row, ME)).toBe('creator')
  })

  it('bloquea la fila cuyo SQL editó por última vez quien consulta', () => {
    const row = rowFixture({ last_sql_editor: { admin_id: ME, username: 'yo' } })
    expect(batchBlockReason(row, ME)).toBe('last_editor')
  })

  it('no bloquea una fila de otra persona ni con autoría desconocida', () => {
    expect(batchBlockReason(rowFixture(), ME)).toBeNull()
    const unknown = rowFixture({ author: {}, last_sql_editor: {}, author_unknown: true })
    expect(batchBlockReason(unknown, ME)).toBeNull()
  })

  it('sin sesión cargada no bloquea nada: decide el servidor', () => {
    const row = rowFixture({ author: { admin_id: ME } })
    expect(batchBlockReason(row, undefined)).toBeNull()
  })
})

describe('selección con el hash visto', () => {
  it('la marca vale solo mientras el SQL siga siendo el que se vio', () => {
    const row = rowFixture()
    const selection = new Map([[rowBatchKey(row), row.sql_hash]])
    expect(isRowSelected(selection, row)).toBe(true)

    const edited = rowFixture({ sql_hash: 'b'.repeat(64) })
    expect(isRowSelected(selection, edited)).toBe(false)
    expect(isSelectionStale(selection, edited)).toBe(true)
  })

  it('una fila sin marcar no está desactualizada', () => {
    expect(isSelectionStale(new Map(), rowFixture())).toBe(false)
  })

  it('devuelve las filas marcadas en el orden de la lista y deja fuera lo aprobado', () => {
    const first = rowFixture({ version: '0001', sql_hash: '1'.repeat(64) })
    const second = rowFixture({ version: '0002', direction: 'down', sql_hash: '2'.repeat(64) })
    const approved = rowFixture({ version: '0003', approval_status: 'approved' })
    const selection = new Map([
      [batchKey('0003', 'up'), approved.sql_hash],
      [batchKey('0002', 'down'), second.sql_hash],
      [batchKey('0001', 'up'), first.sql_hash],
    ])

    expect(selectedBatchRows([first, second, approved], selection)).toEqual([first, second])
  })

  it('no devuelve una fila cuyo SQL cambió desde que se marcó', () => {
    const edited = rowFixture({ sql_hash: 'c'.repeat(64) })
    const selection = new Map([[rowBatchKey(edited), 'a'.repeat(64)]])
    expect(selectedBatchRows([edited], selection)).toEqual([])
  })

  it('el ítem que viaja al backend lleva el hash de la fila', () => {
    const row = rowFixture({ version: '0002', direction: 'down', sql_hash: '2'.repeat(64) })
    expect(toBatchItem(row)).toEqual({
      version: '0002',
      direction: 'down',
      expectedSqlHash: '2'.repeat(64),
    })
  })
})

describe('tope por lote', () => {
  it('declara llena la selección al llegar al máximo del backend', () => {
    const full = new Map(
      Array.from({ length: APPROVAL_BATCH_MAX_ITEMS }, (_, index) => [`k${index}`, 'h']),
    )
    expect(isSelectionFull(full)).toBe(true)
    expect(isSelectionFull(new Map([['k', 'h']]))).toBe(false)
  })
})

describe('classifyBatchResult', () => {
  const failed = (code: string) => ({
    status: 'failed',
    error: { code, message: 'x', status_code: 409 },
  })

  it('distingue lo aprobado, lo que ya estaba aprobado y cada tipo de fallo', () => {
    expect(classifyBatchResult({ status: BATCH_ITEM_STATUS_APPROVED })).toBe('approved')
    expect(classifyBatchResult(failed(CODES.duplicate))).toBe('already_approved')
    expect(classifyBatchResult(failed(CODES.batchItemFailed))).toBe('retryable')
    expect(classifyBatchResult(failed(CODES.sqlChanged))).toBe('sql_changed')
    expect(classifyBatchResult(failed(CODES.notFound))).toBe('failed')
  })

  it('un fallo sin error informado cuenta como fallo, no como aprobado', () => {
    expect(classifyBatchResult({ status: 'failed' })).toBe('failed')
  })
})

describe('rowNeedsApproval', () => {
  it('solo lo ya aprobado no necesita aprobación; vencida y revocada sí', () => {
    expect(rowNeedsApproval({ approval_status: 'approved' })).toBe(false)
    expect(rowNeedsApproval({ approval_status: 'stale_hash' })).toBe(true)
    expect(rowNeedsApproval({ approval_status: 'revoked' })).toBe(true)
    expect(rowNeedsApproval({ approval_status: 'unapproved' })).toBe(true)
  })
})

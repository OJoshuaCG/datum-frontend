import { describe, expect, it } from 'vitest'
import { type DestructiveApproval, type DestructiveVersion } from '@/lib/contracts'
import {
  countByStatusFilter,
  DEFAULT_VERSION_FILTERS,
  filterDestructiveVersions,
  paginate,
} from './version-filters'

const ANA = { admin_id: 1, username: 'ana' }
const BETO = { admin_id: 2, username: 'beto' }
const CARLA = { admin_id: 3, username: 'carla' }

function approval(overrides: Partial<DestructiveApproval> = {}): DestructiveApproval {
  return {
    id: 1,
    model_migration_id: 1,
    database_model_id: 1,
    version: '0001',
    direction: 'up',
    scope: 'blueprint',
    managed_database_id: null,
    sql_hash: 'a'.repeat(64),
    hash_basis: 'raw_source_v1',
    destructive_summary: null,
    author: ANA,
    last_sql_editor: ANA,
    author_unknown: false,
    reason: 'revisado con el equipo',
    approved_by: BETO,
    approved_at: '2026-11-12T21:46:00Z',
    is_live: true,
    execution_count: 0,
    ...overrides,
  }
}

function version(overrides: Partial<DestructiveVersion> = {}): DestructiveVersion {
  return {
    migration_id: 1,
    version: '0001',
    name: 'views',
    direction: 'up',
    sql_hash: 'a'.repeat(64),
    reasons_by_engine: {},
    author: ANA,
    last_sql_editor: ANA,
    author_unknown: false,
    approval_status: 'unapproved',
    effective_approval_id: null,
    approvals: [],
    ...overrides,
  }
}

const ROWS = [
  version({ migration_id: 1, version: '0017', name: 'views' }),
  version({
    migration_id: 2,
    version: '0018',
    name: 'procedures pt1',
    approval_status: 'approved',
    approvals: [approval({ approved_by: BETO })],
  }),
  version({ migration_id: 3, version: '0019', name: 'triggers', approval_status: 'stale_hash' }),
  version({
    migration_id: 4,
    version: '0020',
    name: 'routing',
    approval_status: 'revoked',
    last_sql_editor: CARLA,
  }),
]

const versionsOf = (rows: DestructiveVersion[]) => rows.map((row) => row.version)

describe('filterDestructiveVersions', () => {
  it('sin filtros devuelve todas, en el orden en que llegaron', () => {
    expect(versionsOf(filterDestructiveVersions(ROWS, DEFAULT_VERSION_FILTERS))).toEqual([
      '0017',
      '0018',
      '0019',
      '0020',
    ])
  })

  it('«Pendientes» incluye sin aprobar, vencidas por SQL cambiado y revocadas', () => {
    const pending = filterDestructiveVersions(ROWS, { status: 'pending', query: '' })
    expect(versionsOf(pending)).toEqual(['0017', '0019', '0020'])
  })

  it('«Aprobadas» deja solo las que no piden una aprobación nueva', () => {
    const approved = filterDestructiveVersions(ROWS, { status: 'approved', query: '' })
    expect(versionsOf(approved)).toEqual(['0018'])
  })

  it('busca por número y por nombre, sin distinguir mayúsculas e ignorando espacios', () => {
    expect(versionsOf(filterDestructiveVersions(ROWS, { status: 'all', query: '0019' }))).toEqual([
      '0019',
    ])
    expect(
      versionsOf(filterDestructiveVersions(ROWS, { status: 'all', query: '  PROCEDURES ' })),
    ).toEqual(['0018'])
  })

  it('busca por persona: último editor del SQL y aprobador', () => {
    expect(versionsOf(filterDestructiveVersions(ROWS, { status: 'all', query: 'carla' }))).toEqual([
      '0020',
    ])
    expect(versionsOf(filterDestructiveVersions(ROWS, { status: 'all', query: 'beto' }))).toEqual([
      '0018',
    ])
  })

  it('busca por quien revocó una aprobación del historial', () => {
    const rows = [
      version({
        version: '0030',
        approval_status: 'revoked',
        approvals: [approval({ is_live: false, revoked_by: CARLA, approved_by: ANA })],
      }),
      version({ migration_id: 2, version: '0031' }),
    ]
    expect(versionsOf(filterDestructiveVersions(rows, { status: 'all', query: 'carla' }))).toEqual([
      '0030',
    ])
  })

  it('combina estado y texto: las dos condiciones se cumplen a la vez', () => {
    // «ana» creó todas; con «Aprobadas» solo queda la 0018.
    expect(
      versionsOf(filterDestructiveVersions(ROWS, { status: 'approved', query: 'ana' })),
    ).toEqual(['0018'])
  })

  it('una persona sin usuario registrado no rompe la búsqueda', () => {
    const rows = [version({ author: { admin_id: null, username: null } })]
    expect(filterDestructiveVersions(rows, { status: 'all', query: 'ana' })).toHaveLength(1)
    expect(filterDestructiveVersions(rows, { status: 'all', query: 'zzz' })).toHaveLength(0)
  })
})

describe('countByStatusFilter', () => {
  it('cuenta todas, pendientes y aprobadas', () => {
    expect(countByStatusFilter(ROWS)).toEqual({ all: 4, pending: 3, approved: 1 })
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1)

  it('corta la página pedida y calcula el total de páginas', () => {
    const slice = paginate(items, 2, 10)
    expect(slice.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(slice).toMatchObject({ page: 2, pages: 3, total: 25 })
  })

  it('una página fuera de rango cae en la última que existe, no en una vacía', () => {
    const slice = paginate(items, 9, 10)
    expect(slice.page).toBe(3)
    expect(slice.items).toEqual([21, 22, 23, 24, 25])
  })

  it('sin elementos hay una sola página, vacía', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, pages: 1, total: 0 })
  })
})

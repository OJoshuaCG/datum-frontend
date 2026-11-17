import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, meFixture } from '@/test/fixtures/authz-catalog'
import { APPROVAL_BATCH_MAX_ITEMS } from '@/lib/contracts'
import { DestructiveApprovalsPanel } from './DestructiveApprovalsPanel'

const API = 'http://localhost/api/v1'
const MODEL_ID = 3
const ME = 1
const OTHER = { admin_id: 2, username: 'beto' }

function versionFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    migration_id: 11,
    version: '0003',
    name: 'drop legacy table',
    direction: 'up',
    sql_hash: 'a'.repeat(64),
    reasons_by_engine: { mysql: ['DROP TABLE'] },
    author: OTHER,
    last_sql_editor: OTHER,
    author_unknown: false,
    approval_status: 'unapproved',
    effective_approval_id: null,
    approvals: [],
    ...overrides,
  }
}

function mockSession(role: 'owner' | 'viewer') {
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ data: meFixture({ id: ME, role }) })),
    http.get(`${API}/authz/catalog`, () => HttpResponse.json({ data: CATALOG_FIXTURE })),
  )
}

function mockVersions(rows: ReturnType<typeof versionFixture>[]) {
  server.use(
    http.get(`${API}/database-models/${MODEL_ID}/destructive-versions`, () =>
      HttpResponse.json({ data: rows }),
    ),
  )
}

const APPROVAL_OUT = {
  id: 90,
  model_migration_id: 11,
  database_model_id: MODEL_ID,
  version: '0001',
  direction: 'up',
  scope: 'blueprint',
  managed_database_id: null,
  sql_hash: '1'.repeat(64),
  hash_basis: 'raw_source_v1',
  author: OTHER,
  last_sql_editor: OTHER,
  author_unknown: false,
  reason: 'revisado con el equipo',
  approved_by: { admin_id: ME, username: 'admin' },
  approved_at: '2026-11-12T10:00:00Z',
  is_live: true,
  execution_count: 0,
}

describe('DestructiveApprovalsPanel — aprobar en lote', () => {
  it('manda UNA petición con el hash visto de cada fila y muestra el resultado por fila', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture({ migration_id: 1, version: '0001', sql_hash: '1'.repeat(64) }),
      versionFixture({
        migration_id: 2,
        version: '0002',
        direction: 'down',
        sql_hash: '2'.repeat(64),
      }),
    ])
    const bodies: unknown[] = []
    server.use(
      http.post(
        `${API}/database-models/${MODEL_ID}/destructive-approvals/batch`,
        async ({ request }) => {
          bodies.push(await request.json())
          return HttpResponse.json({
            data: {
              total: 2,
              approved_count: 1,
              failed_count: 1,
              results: [
                { version: '0001', direction: 'up', status: 'approved', approval: APPROVAL_OUT },
                {
                  version: '0002',
                  direction: 'down',
                  status: 'failed',
                  error: {
                    code: 'destructive_approval.sql_changed',
                    message: 'texto del backend',
                    status_code: 409,
                  },
                },
              ],
            },
          })
        },
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    await user.click(await screen.findByRole('checkbox', { name: /versión 0001 \(aplicar\)/ }))
    await user.click(screen.getByRole('checkbox', { name: /versión 0002 \(rollback\)/ }))
    await user.click(screen.getByRole('button', { name: 'Aprobar seleccionadas…' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Motivo de la aprobación/), 'Revisado con datos')
    await user.type(within(dialog).getByLabelText(/Escribí «core»/), 'core')
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar 2' }))

    // Resultado por fila, no un toast genérico: lo aprobado y lo que falló, con su motivo.
    expect(await within(dialog).findByText('Aprobada')).toBeInTheDocument()
    expect(within(dialog).getByText('No aprobada')).toBeInTheDocument()
    expect(within(dialog).getByText(/El SQL cambió desde que lo revisaste/)).toBeInTheDocument()
    expect(within(dialog).queryByText('texto del backend')).not.toBeInTheDocument()

    expect(bodies).toEqual([
      {
        reason: 'Revisado con datos',
        items: [
          { version: '0001', direction: 'up', expected_sql_hash: '1'.repeat(64) },
          { version: '0002', direction: 'down', expected_sql_hash: '2'.repeat(64) },
        ],
      },
    ])
  })

  it('un error inesperado de un ítem se reintenta solo ese, con el mismo motivo', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture({ migration_id: 1, version: '0001', sql_hash: '1'.repeat(64) }),
      versionFixture({ migration_id: 2, version: '0002', sql_hash: '2'.repeat(64) }),
    ])
    const bodies: { reason: string; items: { version: string }[] }[] = []
    server.use(
      http.post(
        `${API}/database-models/${MODEL_ID}/destructive-approvals/batch`,
        async ({ request }) => {
          const body = (await request.json()) as (typeof bodies)[number]
          bodies.push(body)
          const first = bodies.length === 1
          return HttpResponse.json({
            data: {
              total: body.items.length,
              approved_count: 1,
              failed_count: first ? 1 : 0,
              results: body.items.map((item) =>
                first && item.version === '0002'
                  ? {
                      version: '0002',
                      direction: 'up',
                      status: 'failed',
                      error: {
                        code: 'destructive_approval.batch_item_failed',
                        message: 'x',
                        status_code: 500,
                      },
                    }
                  : {
                      version: item.version,
                      direction: 'up',
                      status: 'approved',
                      approval: APPROVAL_OUT,
                    },
              ),
            },
          })
        },
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    await user.click(await screen.findByRole('button', { name: 'Seleccionar pendientes' }))
    await user.click(screen.getByRole('button', { name: 'Aprobar seleccionadas…' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Motivo de la aprobación/), 'Revisado con datos')
    await user.type(within(dialog).getByLabelText(/Escribí «core»/), 'core')
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar 2' }))

    await user.click(await within(dialog).findByRole('button', { name: 'Reintentar 1 fallida' }))

    await within(dialog).findByText(/2 de 2 aprobadas/)
    expect(bodies).toHaveLength(2)
    const [, retryBody] = bodies
    expect(retryBody?.reason).toBe('Revisado con datos')
    expect(retryBody?.items.map((item) => item.version)).toEqual(['0002'])
  })

  it('deshabilita con explicación las filas que la persona creó o editó (cuatro ojos)', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture({ version: '0001', author: { admin_id: ME, username: 'admin' } }),
      versionFixture({
        migration_id: 12,
        version: '0002',
        last_sql_editor: { admin_id: ME, username: 'admin' },
      }),
      versionFixture({ migration_id: 13, version: '0003' }),
    ])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByRole('checkbox', { name: /versión 0001/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /versión 0002/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /versión 0003/ })).toBeEnabled()
    expect(screen.getByText(/Creaste esta versión/)).toBeInTheDocument()
    expect(screen.getByText(/Editaste su SQL por última vez/)).toBeInTheDocument()
  })

  it('«Seleccionar pendientes» no pasa del tope por lote, para no armar un 422', async () => {
    mockSession('owner')
    const total = APPROVAL_BATCH_MAX_ITEMS + 1
    mockVersions(
      Array.from({ length: total }, (_, index) =>
        versionFixture({
          migration_id: index + 1,
          version: String(index + 1).padStart(4, '0'),
          sql_hash: index.toString(16).padStart(64, '0'),
        }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    await user.click(await screen.findByRole('button', { name: 'Seleccionar pendientes' }))

    expect(
      screen.getByText(
        `${APPROVAL_BATCH_MAX_ITEMS} seleccionadas (tope de ${APPROVAL_BATCH_MAX_ITEMS} por lote)`,
      ),
    ).toBeInTheDocument()
    // La fila 101 no se puede marcar mientras el lote esté lleno. Está en otra página de la lista,
    // así que se la trae con la búsqueda: filtrar no toca la selección ya hecha.
    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), '0101')
    expect(screen.getByRole('checkbox', { name: /versión 0101/ })).toBeDisabled()
  })

  it('sin `blueprints.approve_destructive` no hay selección ni botón de lote', async () => {
    mockSession('viewer')
    mockVersions([versionFixture()])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText('Sin aprobar')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprobar seleccionadas/ })).not.toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, meFixture } from '@/test/fixtures/authz-catalog'
import { DestructiveApprovalsPanel } from './DestructiveApprovalsPanel'

const API = 'http://localhost/api/v1'
const MODEL_ID = 3

const ACTOR = { admin_id: 1, username: 'ana' }

function versionFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    migration_id: 11,
    version: '0003',
    name: 'drop legacy table',
    direction: 'up',
    sql_hash: 'a'.repeat(64),
    reasons_by_engine: { mysql: ['DROP TABLE'] },
    author: ACTOR,
    last_sql_editor: ACTOR,
    author_unknown: false,
    approval_status: 'unapproved',
    effective_approval_id: null,
    approvals: [],
    ...overrides,
  }
}

function mockSession(role: 'owner' | 'viewer') {
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ data: meFixture({ role }) })),
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

describe('DestructiveApprovalsPanel', () => {
  it('muestra el estado de aprobación de cada versión destructiva', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture(),
      versionFixture({ migration_id: 12, version: '0004', approval_status: 'stale_hash' }),
    ])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText('Sin aprobar')).toBeInTheDocument()
    expect(screen.getByText('Aprobación vencida (SQL cambió)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar de nuevo…' })).toBeInTheDocument()
  })

  it('S37: sin `blueprints.approve_destructive` no hay botón de aprobar', async () => {
    mockSession('viewer')
    mockVersions([versionFixture()])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText('Sin aprobar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprobar/ })).not.toBeInTheDocument()
  })

  it('una versión ya aprobada no ofrece aprobar, y deja revocar la aprobación vigente', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture({
        approval_status: 'approved',
        effective_approval_id: 5,
        approvals: [
          {
            id: 5,
            model_migration_id: 11,
            database_model_id: MODEL_ID,
            version: '0003',
            direction: 'up',
            scope: 'blueprint',
            managed_database_id: null,
            sql_hash: 'a'.repeat(64),
            hash_basis: 'raw_source_v1',
            destructive_summary: null,
            author: ACTOR,
            last_sql_editor: ACTOR,
            author_unknown: false,
            reason: 'revisado con el equipo',
            approved_by: { admin_id: 2, username: 'beto' },
            approved_at: '2026-10-25T10:00:00Z',
            is_live: true,
            execution_count: 0,
          },
        ],
      }),
    ])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText('Aprobada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar…' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revocar…' })).toBeInTheDocument()
  })

  it('sin versiones destructivas lo dice en vez de mostrar una lista vacía', async () => {
    mockSession('owner')
    mockVersions([])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText(/no hay nada que aprobar/)).toBeInTheDocument()
  })

  it('muestra quién creó la versión y quién editó el SQL por última vez', async () => {
    mockSession('owner')
    mockVersions([versionFixture({ last_sql_editor: { admin_id: 4, username: 'dani' } })])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    const line = await screen.findByText(/Creada por/)
    expect(line).toHaveTextContent('Creada por ana · último cambio del SQL por dani')
  })

  it('con autoría incompleta lo dice en vez de inventar un editor', async () => {
    mockSession('owner')
    mockVersions([versionFixture({ author_unknown: true })])
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText(/Creada por/)).toHaveTextContent(
      'Creada por ana · último editor del SQL sin registrar',
    )
  })

  it('el filtro «Pendientes» oculta las aprobadas y cuenta cada estado', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture({ name: 'pendiente' }),
      versionFixture({
        migration_id: 12,
        version: '0004',
        name: 'lista',
        approval_status: 'approved',
      }),
    ])
    const user = userEvent.setup()
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    await user.click(await screen.findByRole('button', { name: 'Pendientes (1)' }))

    expect(screen.getByRole('button', { name: 'Pendientes (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('pendiente')).toBeInTheDocument()
    expect(screen.queryByText('lista')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobadas (1)' })).toBeInTheDocument()
  })

  it('busca por persona y, si nada coincide, ofrece limpiar los filtros', async () => {
    mockSession('owner')
    mockVersions([
      versionFixture({ name: 'de ana' }),
      versionFixture({
        migration_id: 12,
        version: '0004',
        name: 'de dani',
        author: { admin_id: 4, username: 'dani' },
        last_sql_editor: { admin_id: 4, username: 'dani' },
      }),
    ])
    const user = userEvent.setup()
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    const search = await screen.findByRole('searchbox', { name: 'Buscar' })
    await user.type(search, 'dani')
    expect(screen.getByText('de dani')).toBeInTheDocument()
    expect(screen.queryByText('de ana')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'nadie')
    expect(screen.getByText('Ninguna versión coincide con los filtros.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('de ana')).toBeInTheDocument()
    expect(screen.getByText('de dani')).toBeInTheDocument()
  })

  it('el número y el nombre enlazan a la versión completa y avisan a la página', async () => {
    mockSession('owner')
    mockVersions([versionFixture()])
    const onOpenVersion = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <DestructiveApprovalsPanel
        modelId={MODEL_ID}
        modelName="core"
        onOpenVersion={onOpenVersion}
      />,
    )

    const link = await screen.findByRole('link', { name: /0003\s*drop legacy table/ })
    expect(link).toHaveAttribute('href', `/database-models/${MODEL_ID}/migrations?version=0003`)
    await user.click(link)
    expect(onOpenVersion).toHaveBeenCalledWith('0003')
  })

  it('pagina la lista: diez por página y el resto en la siguiente', async () => {
    mockSession('owner')
    mockVersions(
      Array.from({ length: 12 }, (_, index) =>
        versionFixture({
          migration_id: index + 1,
          version: String(index + 1).padStart(4, '0'),
          name: `versión ${index + 1}`,
        }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<DestructiveApprovalsPanel modelId={MODEL_ID} modelName="core" />)

    expect(await screen.findByText('versión 10')).toBeInTheDocument()
    expect(screen.queryByText('versión 11')).not.toBeInTheDocument()
    expect(screen.getByText(/Página 1 de 2 · 12 resultados/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(screen.getByText('versión 11')).toBeInTheDocument()
    expect(screen.getByText('versión 12')).toBeInTheDocument()
    expect(screen.queryByText('versión 1')).not.toBeInTheDocument()
  })
})

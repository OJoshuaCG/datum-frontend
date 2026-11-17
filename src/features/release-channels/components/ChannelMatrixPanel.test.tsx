import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { pageOf } from '@/test/fixtures/authz-catalog'
import { ChannelMatrixPanel } from './ChannelMatrixPanel'

const API = 'http://localhost/api/v1'

function modelFixture(id: number, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    description: null,
    current_version: '0001',
    is_active: true,
    charset: null,
    collation: null,
  }
}

function catalogChannel(id: number, slug: string, name: string) {
  return {
    id,
    name,
    slug,
    resolution_mode: 'manual',
    environment_id: null,
    pointer_count: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  }
}

function resolution(slug: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    channel_slug: slug,
    channel_name: name,
    resolution_mode: 'manual',
    environment_slug: null,
    resolved: true,
    code: null,
    version: '0002',
    model_migration_id: 1,
    source: 'pointer',
    databases: [],
    derived_reference: null,
    ...overrides,
  }
}

function mockMatrix() {
  server.use(
    http.get(`${API}/database-models`, () =>
      HttpResponse.json(pageOf([modelFixture(1, 'Ventas'), modelFixture(2, 'Inventario')])),
    ),
    http.get(`${API}/release-channels`, () =>
      HttpResponse.json(
        pageOf([catalogChannel(1, 'stable', 'Estable'), catalogChannel(2, 'dev', 'Desarrollo')]),
      ),
    ),
    http.get(`${API}/database-models/1/channels`, () =>
      HttpResponse.json({
        data: [
          resolution('stable', 'Estable', { version: '0003' }),
          resolution('dev', 'Desarrollo', { version: '0005' }),
        ],
      }),
    ),
    // Inventario solo conoce el canal `stable`: `dev` queda sin celda («—»).
    http.get(`${API}/database-models/2/channels`, () =>
      HttpResponse.json({ data: [resolution('stable', 'Estable', { version: '0001' })] }),
    ),
  )
}

/** La tabla y la tarjeta móvil conviven en el DOM: se toma la primera tabla. */
async function findMatrixTable(): Promise<HTMLElement> {
  const tables = await screen.findAllByRole('table')
  const table = tables[0]
  if (!table) throw new Error('La matriz no renderizó ninguna tabla')
  return table
}

describe('ChannelMatrixPanel', () => {
  it('cruza cada blueprint con cada canal del catálogo y muestra la versión servida', async () => {
    mockMatrix()
    renderWithProviders(<ChannelMatrixPanel />)

    const table = await findMatrixTable()
    expect(await within(table).findByText('0003')).toBeInTheDocument()
    expect(within(table).getByText('0005')).toBeInTheDocument()
    expect(within(table).getByText('0001')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Estable' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Desarrollo' })).toBeInTheDocument()
  })

  it('enlaza cada blueprint a su pantalla de versiones, donde se promueve', async () => {
    mockMatrix()
    renderWithProviders(<ChannelMatrixPanel />)

    const table = await findMatrixTable()
    const link = await within(table).findByRole('link', { name: 'Ventas' })
    expect(link).toHaveAttribute('href', '/database-models/1/migrations')
  })

  it('un canal sin versión explica el motivo en vez de dejar la celda vacía', async () => {
    mockMatrix()
    server.use(
      http.get(`${API}/database-models/1/channels`, () =>
        HttpResponse.json({
          data: [
            resolution('stable', 'Estable', {
              resolved: false,
              version: null,
              code: 'release_channel.no_released_version',
            }),
            resolution('dev', 'Desarrollo', { version: '0005' }),
          ],
        }),
      ),
    )
    renderWithProviders(<ChannelMatrixPanel />)

    const table = await findMatrixTable()
    expect(await within(table).findByText('0005')).toBeInTheDocument()
    expect(within(table).queryByText('0003')).not.toBeInTheDocument()
  })
})

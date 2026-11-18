import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, meFixture } from '@/test/fixtures/authz-catalog'
import { applyAllItemSchema, type ApplyAllItem } from '@/lib/contracts'
import { ApplyAllResultList } from './ApplyAllResultList'

const API = 'http://localhost/api/v1'

function item(raw: Record<string, unknown>): ApplyAllItem {
  return applyAllItemSchema.parse(raw)
}

function mount(results: ApplyAllItem[]) {
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ data: meFixture({ role: 'owner' }) })),
    http.get(`${API}/authz/catalog`, () => HttpResponse.json({ data: CATALOG_FIXTURE })),
  )
  renderWithProviders(
    <ApplyAllResultList
      title="Progreso"
      processed={3}
      outOf={4}
      targetVersion="0007"
      channelSlug={null}
      results={results}
      wasDryRun={false}
    />,
  )
}

describe('ApplyAllResultList', () => {
  it('resume processed/outOf y el tope del lote', () => {
    mount([])
    expect(screen.getByText('Progreso · 3 de 4 BD(s) procesada(s)')).toBeInTheDocument()
    expect(screen.getByText('0007')).toBeInTheDocument()
  })

  it('pone primero las fallidas y marca las omitidas por alcance como «Sin permiso»', () => {
    mount([
      item({ managed_database_id: 1, database_name: 'ventas', ok: true }),
      item({ managed_database_id: 2, ok: false, error_code: 'access.forbidden' }),
      item({ managed_database_id: 3, database_name: 'stock', ok: false, error: 'Timeout' }),
    ])

    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText(/stock/)).toBeInTheDocument()
    expect(screen.getAllByText('Sin permiso').length).toBeGreaterThan(0)
  })
})

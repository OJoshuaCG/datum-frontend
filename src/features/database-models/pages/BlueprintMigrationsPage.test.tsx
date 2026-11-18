import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, meFixture, pageOf } from '@/test/fixtures/authz-catalog'
import { BlueprintMigrationsPage } from './BlueprintMigrationsPage'

const API = 'http://localhost/api/v1'
const JOBS_URL = `${API}/database-models/3/migrations/apply-all-jobs`

const job = {
  id: 12,
  model_id: 3,
  status: 'done',
  environment_id: null,
  target_version: '0007',
  channel_slug: null,
  on_failure: 'auto',
  force: false,
  total_databases: 2,
  matched_databases: 2,
  planned: 2,
  processed: 2,
  failed: 0,
  error: null,
  created_by_username: 'admin',
  created_at: '2026-11-18T10:00:00Z',
  started_at: '2026-11-18T10:00:01Z',
  finished_at: '2026-11-18T10:01:00Z',
  results: [],
}

describe('BlueprintMigrationsPage — pestaña «Ejecuciones»', () => {
  it('?tab=ejecuciones&job=12 muestra el historial y el detalle de ese job', async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ data: meFixture({ role: 'owner' }) })),
      http.get(`${API}/authz/catalog`, () => HttpResponse.json({ data: CATALOG_FIXTURE })),
      http.get(`${API}/database-models/3`, () =>
        HttpResponse.json({
          data: {
            id: 3,
            name: 'Ventas',
            slug: 'ventas',
            current_version: '0007',
            is_active: true,
            created_at: '2026-11-01T00:00:00Z',
            updated_at: '2026-11-01T00:00:00Z',
          },
        }),
      ),
      http.get(JOBS_URL, () => HttpResponse.json({ data: [{ ...job, results: null }] })),
      http.get(`${JOBS_URL}/12`, () => HttpResponse.json({ data: job })),
      // Lecturas secundarias de la página (catálogo de versiones, proyectos, canales…): vacías.
      // Va al final porque MSW usa el primer handler que coincide.
      http.get(`${API}/*`, () => HttpResponse.json(pageOf([]))),
    )

    renderWithProviders(
      <Routes>
        <Route path="/database-models/:modelId/migrations" element={<BlueprintMigrationsPage />} />
      </Routes>,
      { route: '/database-models/3/migrations?tab=ejecuciones&job=12' },
    )

    expect(await screen.findByText('Ejecución #12')).toBeInTheDocument()
    // DataTable monta la vista de escritorio y la de móvil a la vez.
    expect((await screen.findAllByText('#12')).length).toBeGreaterThan(0)
  })
})

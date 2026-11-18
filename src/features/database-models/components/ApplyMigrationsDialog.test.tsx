import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, meFixture, pageOf } from '@/test/fixtures/authz-catalog'
import { ApplyMigrationsDialog } from './ApplyMigrationsDialog'

const API = 'http://localhost/api/v1'
const MIGRATIONS_URL = `${API}/database-models/3/migrations`

const jobFixture = {
  id: 12,
  model_id: 3,
  status: 'pending',
  environment_id: null,
  target_version: null,
  channel_slug: null,
  on_failure: 'auto',
  force: false,
  total_databases: 2,
  matched_databases: 2,
  planned: 2,
  processed: 0,
  failed: 0,
  error: null,
  created_by_username: 'admin',
  created_at: '2026-11-18T10:00:00Z',
  started_at: null,
  finished_at: null,
  results: [],
}

/** Lo que el diálogo lee al abrirse; cada `it` agrega solo el endpoint que decide su caso. */
function mountDialog() {
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ data: meFixture({ role: 'owner' }) })),
    http.get(`${API}/authz/catalog`, () => HttpResponse.json({ data: CATALOG_FIXTURE })),
    http.get(MIGRATIONS_URL, () => HttpResponse.json(pageOf([]))),
    http.get(`${API}/database-models/3/databases`, () => HttpResponse.json({ data: [] })),
    http.get(`${API}/environments`, () => HttpResponse.json(pageOf([]))),
  )
  renderWithProviders(<ApplyMigrationsDialog modelId={3} open onClose={() => {}} />)
}

describe('ApplyMigrationsDialog — ejecución en background', () => {
  it('«Aplicar a todas» lanza apply-all-jobs (no el apply síncrono) y sigue el job', async () => {
    let syncApplyCalls = 0
    server.use(
      http.post(`${MIGRATIONS_URL}/apply-all`, () => {
        syncApplyCalls += 1
        return HttpResponse.json({ data: {} })
      }),
      http.post(`${MIGRATIONS_URL}/apply-all-jobs`, () =>
        HttpResponse.json({ data: jobFixture }, { status: 202 }),
      ),
      http.get(`${MIGRATIONS_URL}/apply-all-jobs/12`, () =>
        HttpResponse.json({ data: jobFixture }),
      ),
    )
    mountDialog()

    await userEvent.click(await screen.findByRole('button', { name: /Aplicar a todas/ }))

    expect(await screen.findByText('Ejecución #12')).toBeInTheDocument()
    expect(screen.getByText('En cola')).toBeInTheDocument()
    expect(syncApplyCalls).toBe(0)
  })

  it('un 409 already_active sigue el job que ya estaba en curso', async () => {
    server.use(
      http.post(`${MIGRATIONS_URL}/apply-all-jobs`, () =>
        HttpResponse.json(
          {
            detail: {
              msg: 'Ya hay una aplicación masiva en curso.',
              type: 'AppHttpException',
              public_context: { code: 'migration_apply_job.already_active', active_job_id: 41 },
            },
          },
          { status: 409 },
        ),
      ),
      http.get(`${MIGRATIONS_URL}/apply-all-jobs/41`, () =>
        HttpResponse.json({ data: { ...jobFixture, id: 41, status: 'running', processed: 1 } }),
      ),
    )
    mountDialog()

    await userEvent.click(await screen.findByRole('button', { name: /Aplicar a todas/ }))

    expect(await screen.findByText('Ya había una aplicación masiva en curso')).toBeInTheDocument()
    expect(await screen.findByText('Ejecución #41')).toBeInTheDocument()
  })

  it('un 429 deshabilita el lanzamiento con el motivo visible', async () => {
    server.use(
      http.post(`${MIGRATIONS_URL}/apply-all-jobs`, () =>
        HttpResponse.json({ detail: 'Rate limit' }, { status: 429 }),
      ),
    )
    mountDialog()

    const launchButton = await screen.findByRole('button', { name: /Aplicar a todas/ })
    await userEvent.click(launchButton)

    expect(await screen.findByText(/Límite de lanzamientos alcanzado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aplicar a todas/ })).toBeDisabled()
  })
})

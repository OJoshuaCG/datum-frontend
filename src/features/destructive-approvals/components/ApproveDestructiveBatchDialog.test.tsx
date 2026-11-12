import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, meFixture } from '@/test/fixtures/authz-catalog'
import type { DestructiveVersion } from '@/lib/contracts'
import { ApproveDestructiveBatchDialog } from './ApproveDestructiveBatchDialog'

const API = 'http://localhost/api/v1'
const MODEL_ID = 3

const ROW: DestructiveVersion = {
  migration_id: 11,
  version: '0003',
  name: 'drop legacy table',
  direction: 'up',
  sql_hash: 'a'.repeat(64),
  reasons_by_engine: { mysql: ['DROP TABLE'] },
  author: { admin_id: 2, username: 'beto' },
  last_sql_editor: { admin_id: 2, username: 'beto' },
  author_unknown: false,
  approval_status: 'unapproved',
  effective_approval_id: null,
  approvals: [],
}

describe('ApproveDestructiveBatchDialog', () => {
  it('si el servidor rechaza TODA la petición, lo dice en el diálogo y no avisa resultados', async () => {
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({ data: meFixture({ id: 1, role: 'owner' }) }),
      ),
      http.get(`${API}/authz/catalog`, () => HttpResponse.json({ data: CATALOG_FIXTURE })),
      http.post(`${API}/database-models/${MODEL_ID}/destructive-approvals/batch`, () =>
        HttpResponse.json(
          {
            detail: {
              msg: 'texto del backend',
              type: 'AppHttpException',
              public_context: { code: 'destructive_approval.machine_actor' },
            },
          },
          { status: 403 },
        ),
      ),
    )
    const onResult = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ApproveDestructiveBatchDialog
        modelId={MODEL_ID}
        rows={[ROW]}
        confirmWord="core"
        onResult={onResult}
        onClose={() => {}}
      />,
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Motivo de la aprobación/), 'Revisado con datos')
    await user.type(within(dialog).getByLabelText(/Escribí «core»/), 'core')
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar 1' }))

    expect(await within(dialog).findByText(/la tiene que dar una persona/)).toBeInTheDocument()
    expect(onResult).not.toHaveBeenCalled()
  })

  it('no habilita «Aprobar» hasta tener motivo válido y la palabra de confirmación', async () => {
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({ data: meFixture({ id: 1, role: 'owner' }) }),
      ),
      http.get(`${API}/authz/catalog`, () => HttpResponse.json({ data: CATALOG_FIXTURE })),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <ApproveDestructiveBatchDialog
        modelId={MODEL_ID}
        rows={[ROW]}
        confirmWord="core"
        onResult={() => {}}
        onClose={() => {}}
      />,
    )

    const dialog = await screen.findByRole('dialog')
    const approveButton = within(dialog).getByRole('button', { name: 'Aprobar 1' })
    expect(approveButton).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/Motivo de la aprobación/), 'Revisado con datos')
    expect(approveButton).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/Escribí «core»/), 'core')
    expect(approveButton).toBeEnabled()
  })
})

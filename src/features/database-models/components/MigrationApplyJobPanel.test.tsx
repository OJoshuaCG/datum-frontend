import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { MigrationApplyJobPanel } from './MigrationApplyJobPanel'

const JOB_URL = 'http://localhost/api/v1/database-models/3/migrations/apply-all-jobs/12'

const baseJob = {
  id: 12,
  model_id: 3,
  status: 'running',
  environment_id: null,
  target_version: null,
  channel_slug: null,
  on_failure: 'auto',
  force: false,
  total_databases: 4,
  matched_databases: 4,
  planned: 4,
  processed: 2,
  failed: 0,
  error: null,
  created_by_username: 'admin',
  created_at: '2026-11-18T10:00:00Z',
  started_at: '2026-11-18T10:00:01Z',
  finished_at: null,
  results: [],
}

function serveJob(job: Record<string, unknown>) {
  server.use(http.get(JOB_URL, () => HttpResponse.json({ data: job })))
}

describe('MigrationApplyJobPanel', () => {
  it('en curso muestra la barra con processed/planned', async () => {
    serveJob(baseJob)
    renderWithProviders(<MigrationApplyJobPanel modelId={3} jobId={12} />)

    const bar = await screen.findByRole('progressbar', { name: 'Bases procesadas' })
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '4')
    expect(screen.getByText('En curso')).toBeInTheDocument()
  })

  it('partial avisa cuántas bases fallaron', async () => {
    serveJob({ ...baseJob, status: 'partial', processed: 4, failed: 1 })
    renderWithProviders(<MigrationApplyJobPanel modelId={3} jobId={12} />)

    expect(await screen.findByText('1 base(s) terminaron con error')).toBeInTheDocument()
  })

  it('failed muestra el error del job', async () => {
    serveJob({ ...baseJob, status: 'failed', error: 'Worker caído' })
    renderWithProviders(<MigrationApplyJobPanel modelId={3} jobId={12} />)

    expect(await screen.findByText('Worker caído')).toBeInTheDocument()
  })

  it('interrupted ofrece «Relanzar» solo si quien lo monta conoce los parámetros', async () => {
    serveJob({ ...baseJob, status: 'interrupted' })
    const onRelaunch = vi.fn()
    renderWithProviders(<MigrationApplyJobPanel modelId={3} jobId={12} onRelaunch={onRelaunch} />)

    await userEvent.click(await screen.findByRole('button', { name: /Relanzar/ }))
    expect(onRelaunch).toHaveBeenCalledTimes(1)
  })

  it('interrupted sin parámetros explica cómo relanzar en vez de ofrecer el botón', async () => {
    serveJob({ ...baseJob, status: 'interrupted' })
    renderWithProviders(<MigrationApplyJobPanel modelId={3} jobId={12} />)

    expect(await screen.findByText(/abrí «Aplicar migraciones»/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Relanzar/ })).not.toBeInTheDocument()
  })

  it('un 404 dice que la ejecución no existe o es de otro blueprint', async () => {
    server.use(
      http.get(JOB_URL, () => HttpResponse.json({ detail: 'No encontrado' }, { status: 404 })),
    )
    renderWithProviders(<MigrationApplyJobPanel modelId={3} jobId={12} />)

    expect(await screen.findByText('No se encontró la ejecución #12')).toBeInTheDocument()
  })
})

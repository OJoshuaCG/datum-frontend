import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { APPLY_JOB_STATUS_LABEL, APPLY_JOB_STATUS_TONE } from '../apply-job-status'
import { MigrationApplyJobsPanel } from './MigrationApplyJobsPanel'

const JOBS_URL = 'http://localhost/api/v1/database-models/3/migrations/apply-all-jobs'

const listedJob = {
  id: 12,
  model_id: 3,
  status: 'partial',
  environment_id: null,
  target_version: '0007',
  channel_slug: null,
  on_failure: 'auto',
  force: false,
  total_databases: 3,
  matched_databases: 3,
  planned: 3,
  processed: 3,
  failed: 1,
  error: null,
  created_by_username: 'admin',
  created_at: '2026-11-18T10:00:00Z',
  started_at: '2026-11-18T10:00:01Z',
  finished_at: '2026-11-18T10:02:00Z',
  results: null,
}

describe('apply-job-status', () => {
  it('cada estado tiene etiqueta y tono; partial no va en rojo', () => {
    expect(Object.keys(APPLY_JOB_STATUS_LABEL)).toHaveLength(6)
    expect(APPLY_JOB_STATUS_TONE.partial).toBe('warning')
    expect(APPLY_JOB_STATUS_TONE.interrupted).toBe('error')
  })
})

describe('MigrationApplyJobsPanel', () => {
  it('lista los jobs y «Ver detalle» elige el job', async () => {
    server.use(http.get(JOBS_URL, () => HttpResponse.json({ data: [listedJob] })))
    const onSelectJob = vi.fn()
    renderWithProviders(
      <MigrationApplyJobsPanel modelId={3} selectedJobId={null} onSelectJob={onSelectJob} />,
    )

    // DataTable monta a la vez la tabla de escritorio y las tarjetas de móvil: cada dato aparece
    // una vez por vista.
    expect((await screen.findAllByText('#12')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Con errores').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0007').length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('button', { name: /Ver detalle/ })[0]!)
    expect(onSelectJob).toHaveBeenCalledWith(12)
  })

  it('sin jobs muestra el estado vacío', async () => {
    server.use(http.get(JOBS_URL, () => HttpResponse.json({ data: [] })))
    renderWithProviders(
      <MigrationApplyJobsPanel modelId={3} selectedJobId={null} onSelectJob={() => {}} />,
    )

    expect((await screen.findAllByText('Todavía no hay ejecuciones')).length).toBeGreaterThan(0)
  })
})

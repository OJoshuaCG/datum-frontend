import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { server } from '@/test/server'
import { queryKeys } from '@/lib/api/query-keys'
import { toApiError } from '@/lib/api/errors'
import { AllProviders, createTestQueryClient } from '@/test/utils'
import { migrationApplyJobOutSchema } from '@/lib/contracts/model-migrations'
import {
  isApplyJobActive,
  useLaunchApplyAllJob,
  useMigrationApplyJob,
  useMigrationApplyJobs,
} from './use-migration-apply-jobs'

const JOBS_URL = 'http://localhost/api/v1/database-models/3/migrations/apply-all-jobs'

function wrapperWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AllProviders queryClient={client}>{children}</AllProviders>
  }
}

/**
 * El cliente de test descarta en el acto lo que no tiene observador (`gcTime: 0`); acá hace falta
 * que el detalle sembrado sobreviva para poder leerlo, como en la app (gcTime por defecto).
 */
function jobsClient(): QueryClient {
  const client = createTestQueryClient()
  client.setQueryDefaults(queryKeys.databaseModels.applyJobs(3), { gcTime: Infinity })
  return client
}

const jobFixture = {
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
  processed: 1,
  failed: 0,
  error: null,
  created_by_username: 'admin',
  created_at: '2026-11-18T10:00:00Z',
  started_at: '2026-11-18T10:00:01Z',
  finished_at: null,
  results: [{ managed_database_id: 5, database_name: 'ventas', ok: true }],
}

describe('migrationApplyJobOutSchema', () => {
  it('acepta los nulls anidados del backend y un job sin results', () => {
    const parsed = migrationApplyJobOutSchema.parse({ ...jobFixture, results: null })
    expect(parsed.results).toBeNull()
    expect(parsed.environment_id).toBeNull()
  })

  it('rechaza un estado fuera del contrato', () => {
    expect(migrationApplyJobOutSchema.safeParse({ ...jobFixture, status: 'queued' }).success).toBe(
      false,
    )
  })
})

describe('isApplyJobActive', () => {
  it('solo pending y running siguen activos', () => {
    expect(isApplyJobActive('pending')).toBe(true)
    expect(isApplyJobActive('running')).toBe(true)
    for (const status of ['done', 'partial', 'failed', 'interrupted'] as const) {
      expect(isApplyJobActive(status)).toBe(false)
    }
  })
})

describe('useMigrationApplyJobs', () => {
  it('pide el historial con limit=20 y acepta results null', async () => {
    let requestedLimit: string | null = null
    server.use(
      http.get(JOBS_URL, ({ request }) => {
        requestedLimit = new URL(request.url).searchParams.get('limit')
        return HttpResponse.json({ data: [{ ...jobFixture, status: 'done', results: null }] })
      }),
    )
    const { result } = renderHook(() => useMigrationApplyJobs(3), {
      wrapper: wrapperWith(createTestQueryClient()),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requestedLimit).toBe('20')
    expect(result.current.data?.[0]?.results).toBeNull()
  })
})

describe('useMigrationApplyJob', () => {
  it('no consulta sin id', () => {
    const { result } = renderHook(() => useMigrationApplyJob(3, null), {
      wrapper: wrapperWith(createTestQueryClient()),
    })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('al pasar de activo a terminal invalida las vistas de las bases y el catálogo', async () => {
    let calls = 0
    server.use(
      http.get(`${JOBS_URL}/12`, () => {
        calls += 1
        const job = calls === 1 ? jobFixture : { ...jobFixture, status: 'done', processed: 4 }
        return HttpResponse.json({ data: job })
      }),
    )
    const client = jobsClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useMigrationApplyJob(3, 12), {
      wrapper: wrapperWith(client),
    })
    await waitFor(() => expect(result.current.data?.status).toBe('running'))
    // Abrir un job activo no invalida nada: todavía no hubo transición.
    expect(invalidate).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.data?.status).toBe('done'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.managedDatabases.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.databaseModels.migrations(3) })
  })

  it('un 404 no se reintenta', async () => {
    let calls = 0
    server.use(
      http.get(`${JOBS_URL}/99`, () => {
        calls += 1
        return HttpResponse.json({ detail: 'No encontrado' }, { status: 404 })
      }),
    )
    const { result } = renderHook(() => useMigrationApplyJob(3, 99), {
      wrapper: wrapperWith(createTestQueryClient()),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toApiError(result.current.error).status).toBe(404)
    expect(calls).toBe(1)
  })
})

describe('useLaunchApplyAllJob', () => {
  it('manda los parámetros sin dry_run y siembra el detalle con la respuesta 202', async () => {
    let query: URLSearchParams | null = null
    server.use(
      http.post(JOBS_URL, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json({ data: { ...jobFixture, status: 'pending' } }, { status: 202 })
      }),
    )
    const client = jobsClient()
    const { result } = renderHook(() => useLaunchApplyAllJob(3), { wrapper: wrapperWith(client) })

    act(() => {
      result.current.mutate({ databaseIds: [5, 6], confirmToken: 'tok', confirmPhrase: 'prod' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const sent = query as URLSearchParams | null
    expect(sent?.get('dry_run')).toBeNull()
    expect(sent?.getAll('database_ids')).toEqual(['5', '6'])
    expect(sent?.get('confirm_token')).toBe('tok')
    expect(sent?.get('confirm_phrase')).toBe('prod')
    expect(client.getQueryData(queryKeys.databaseModels.applyJobDetail(3, 12))).toMatchObject({
      id: 12,
      status: 'pending',
    })
  })

  it('el 409 already_active expone active_job_id para seguir ese job', async () => {
    server.use(
      http.post(JOBS_URL, () =>
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
    )
    const { result } = renderHook(() => useLaunchApplyAllJob(3), {
      wrapper: wrapperWith(createTestQueryClient()),
    })

    act(() => {
      result.current.mutate({})
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toApiError(result.current.error).migrationApplyJobContext?.activeJobId).toBe(41)
  })
})

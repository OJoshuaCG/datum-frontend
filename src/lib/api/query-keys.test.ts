import { describe, expect, it } from 'vitest'
import { queryKeys } from './query-keys'

/** ¿`key` cae dentro del prefijo `prefix`? Es la regla con la que TanStack Query invalida. */
function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => key[index] === part)
}

describe('queryKeys.databaseModels — apply-all-jobs', () => {
  it('lista y detalle cuelgan de applyJobs, así una invalidación cubre ambos', () => {
    const root = queryKeys.databaseModels.applyJobs(3)
    expect(startsWith(queryKeys.databaseModels.applyJobList(3, 20), root)).toBe(true)
    expect(startsWith(queryKeys.databaseModels.applyJobDetail(3, 12), root)).toBe(true)
  })

  it('applyJobLists cubre cada listado pero no el detalle que se está sondeando', () => {
    const lists = queryKeys.databaseModels.applyJobLists(3)
    expect(startsWith(queryKeys.databaseModels.applyJobList(3, 20), lists)).toBe(true)
    expect(startsWith(queryKeys.databaseModels.applyJobDetail(3, 12), lists)).toBe(false)
  })

  it('no cuelgan de migrations: invalidar el catálogo al terminar un job no reinicia su sondeo', () => {
    const migrations = queryKeys.databaseModels.migrations(3)
    expect(startsWith(queryKeys.databaseModels.applyJobDetail(3, 12), migrations)).toBe(false)
  })

  it('cada blueprint tiene su propio espacio de claves', () => {
    expect(
      startsWith(
        queryKeys.databaseModels.applyJobDetail(4, 12),
        queryKeys.databaseModels.applyJobs(3),
      ),
    ).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  MIGRATION_APPLY_JOB_ACTIVE_STATUSES,
  migrationApplyJobStatusSchema,
} from './model-migrations'

describe('migrationApplyJobStatusSchema', () => {
  it('acepta los seis estados del contrato de apply-all-jobs', () => {
    for (const status of ['pending', 'running', 'done', 'partial', 'failed', 'interrupted']) {
      expect(migrationApplyJobStatusSchema.safeParse(status).success).toBe(true)
    }
  })

  it('rechaza un estado que el backend no emite', () => {
    expect(migrationApplyJobStatusSchema.safeParse('queued').success).toBe(false)
  })
})

describe('MIGRATION_APPLY_JOB_ACTIVE_STATUSES', () => {
  it('solo pending y running se sondean; los terminales no', () => {
    expect([...MIGRATION_APPLY_JOB_ACTIVE_STATUSES].sort()).toEqual(['pending', 'running'])
  })
})

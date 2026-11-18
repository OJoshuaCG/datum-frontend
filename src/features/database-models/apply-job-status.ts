import { type BadgeTone } from '@/components/ui'
import { type MigrationApplyJobStatus } from '@/lib/contracts'

/** Etiqueta visible de cada estado de un job de `apply-all-jobs`. */
export const APPLY_JOB_STATUS_LABEL: Record<MigrationApplyJobStatus, string> = {
  pending: 'En cola',
  running: 'En curso',
  done: 'Completada',
  partial: 'Con errores',
  failed: 'Fallida',
  interrupted: 'Interrumpida',
}

/**
 * `partial` va en ámbar y no en rojo: el job terminó y recorrió todo, solo que alguna base falló.
 * El rojo queda para el job que se cortó (`failed`, `interrupted`).
 */
export const APPLY_JOB_STATUS_TONE: Record<MigrationApplyJobStatus, BadgeTone> = {
  pending: 'neutral',
  running: 'info',
  done: 'success',
  partial: 'warning',
  failed: 'error',
  interrupted: 'error',
}

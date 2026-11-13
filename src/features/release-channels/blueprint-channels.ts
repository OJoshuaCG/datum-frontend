import type { ChannelReference, ChannelResolutionOut } from '@/lib/contracts'

/**
 * ¿Mover un canal de `current` a `target` es un RETROCESO?
 *
 * Las versiones son dígitos de ancho variable y se comparan por valor NUMÉRICO (`'10'` es posterior
 * a `'9'`), igual que en `database-models/version-nav`. Si alguna no es numérica no se puede
 * afirmar que sea un retroceso y se devuelve `false`: es solo una pista de UI para pedir la
 * confirmación por adelantado, y el servidor sigue siendo quien decide (devuelve 409
 * `promote_backward_requires_confirm`, que el diálogo también atiende).
 */
export function isBackwardPromotion(
  current: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (!current || !target) return false
  const currentNumber = Number(current)
  const targetNumber = Number(target)
  if (Number.isNaN(currentNumber) || Number.isNaN(targetNumber)) return false
  return targetNumber < currentNumber
}

/**
 * La versión CALCULADA (mínimo de las bases de un entorno) de un canal, tal como la trae el dato.
 *
 * La resolución de cualquier modo es el puntero del canal; la referencia viene aparte en
 * `derived_reference` (caché del inventario) para todo canal con entorno enlazado, y se muestra
 * junto al puntero, nunca en su lugar ni decide nada. Sin entorno no hay nada que calcular y
 * devuelve `null`.
 */
export function derivedReferenceOf(resolution: ChannelResolutionOut): ChannelReference | null {
  return resolution.derived_reference ?? null
}

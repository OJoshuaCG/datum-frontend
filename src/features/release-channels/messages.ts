/**
 * Traducción de los códigos del módulo de canales de liberación a texto accionable.
 *
 * Se clasifica **por `code`, nunca por la prosa del mensaje** (mismo criterio que
 * `environments/messages.ts`). Los 409/422 llegan como `ApiError` y su código sale de
 * `detail.public_context.code`. El modo inválido NO tiene código propio: es el 422 estándar de
 * Pydantic, y el formulario ya lo previene al ofrecer solo los tres modos.
 */

import {
  CHANNEL_EVENT_TYPES,
  RELEASE_CHANNEL_ERROR_CODES,
  type ReleaseChannelMode,
} from '@/lib/contracts'

const CODES = RELEASE_CHANNEL_ERROR_CODES

const MESSAGES: Record<string, string> = {
  [CODES.notFound]: 'El canal indicado no existe.',
  [CODES.nameTaken]: 'Ya existe un canal con ese nombre.',
  [CODES.slugTaken]: 'Ya existe un canal con ese identificador.',
  [CODES.environmentRequired]: 'Un canal derivado necesita un entorno enlazado.',
  [CODES.confirmationRequired]:
    'El canal tiene punteros de blueprint: hay que repetir su identificador para borrarlo.',
  [CODES.notManual]: 'Solo los canales manuales se pueden promover.',
  [CODES.versionNotFound]: 'La versión indicada no existe.',
  [CODES.versionNotInBlueprint]: 'Esa versión pertenece a otro blueprint.',
  [CODES.versionUnreviewed]: 'La versión todavía no fue revisada, así que no se puede promover.',
  [CODES.promoteBackwardRequiresConfirm]:
    'Promover una versión anterior a la actual exige confirmarlo repitiendo el identificador del canal.',
  [CODES.noReleasedVersion]:
    'El canal todavía no tiene ninguna versión revisada para este blueprint.',
  [CODES.derivedUnreadable]:
    'No se pudo leer la versión de alguna base del entorno, así que el canal derivado no se resolvió.',
  [CODES.derivedNoScope]:
    'El canal derivado no tiene bases con versión en su entorno, así que no hay nada que resolver.',
  [CODES.pointerInconsistent]:
    'El puntero del canal apunta a una versión de otro blueprint. Hay que corregirlo por API.',
  [CODES.targetConflict]: 'No se puede indicar un canal y una versión a la vez.',
}

/** Traduce un código, o `null` si no es de este módulo (o si no viene ninguno). */
export function releaseChannelMessage(code: string | null | undefined): string | null {
  if (!code) return null
  return MESSAGES[code] ?? null
}

/** Etiqueta de cada modo. Un modo desconocido (backend más nuevo) se muestra crudo. */
const MODE_LABELS: Record<ReleaseChannelMode, string> = {
  manual: 'Manual',
  derived: 'Derivado',
  latest: 'Última versión',
}

const MODE_DESCRIPTIONS: Record<ReleaseChannelMode, string> = {
  manual: 'Una persona mueve el puntero de cada blueprint a una versión revisada.',
  derived:
    'El puntero sigue la versión mínima del entorno según el inventario, y solo sobre versiones revisadas.',
  latest: 'La última versión revisada; el puntero se mueve solo.',
}

export function releaseChannelModeLabel(mode: string): string {
  return MODE_LABELS[mode as ReleaseChannelMode] ?? mode
}

export function releaseChannelModeDescription(mode: string): string | null {
  return MODE_DESCRIPTIONS[mode as ReleaseChannelMode] ?? null
}

/**
 * Quién escribe canales, y cómo desbloquearlo. `release_channels.write` es SOLO de
 * `security_officer` y **no hay fallback**: mismo criterio que `ENVIRONMENTS_WRITE_UNBLOCK`.
 */
export const RELEASE_CHANNELS_WRITE_UNBLOCK =
  'Solo security_officer puede crear, editar o borrar canales. Si nadie lo tiene, asigná security_officer a alguien desde Usuarios → Accesos.'

/**
 * De dónde sale la versión que muestra un canal en un blueprint. Un origen desconocido (backend más
 * nuevo) se muestra crudo en vez de esconderse.
 */
const SOURCE_LABELS: Record<string, string> = {
  pointer: 'Puntero del canal',
  tip: 'Última versión del blueprint',
  live: 'Lectura en vivo',
  inventory_cache: 'Caché del inventario',
}

export function channelSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null
  return SOURCE_LABELS[source] ?? source
}

/** Por qué una base no entró en el mínimo de un canal derivado. */
const IGNORED_REASON_LABELS: Record<string, string> = {
  quarantined: 'en cuarentena',
  database_missing: 'no existe en el motor',
  at_base: 'sin migrar (en la base)',
}

export function channelIgnoredReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null
  return IGNORED_REASON_LABELS[reason] ?? reason
}

/** Etiqueta de cada evento del historial de un puntero. */
const EVENT_TYPE_LABELS: Record<string, string> = {
  promote: 'Promovido',
  demote: 'Retrocedido',
  version_deleted: 'Versión borrada (movimiento automático)',
}

/** Valor de `actor_type` de los movimientos que hace el propio gateway (punteros latest/derived). */
const SYSTEM_ACTOR_TYPE = 'system'

/**
 * ¿El movimiento lo hizo el gateway y no una persona? Un `version_deleted` siempre es automático;
 * un promote/demote lo es cuando el actor es el sistema (puntero latest/derived que se mueve solo).
 */
export function isAutomaticChannelEvent(
  eventType: string,
  actorType: string | null | undefined,
): boolean {
  return eventType === CHANNEL_EVENT_TYPES.versionDeleted || actorType === SYSTEM_ACTOR_TYPE
}

export function channelEventTypeLabel(eventType: string, actorType?: string | null): string {
  const label = EVENT_TYPE_LABELS[eventType] ?? eventType
  const isMovedBySystem =
    actorType === SYSTEM_ACTOR_TYPE &&
    (eventType === CHANNEL_EVENT_TYPES.promote || eventType === CHANNEL_EVENT_TYPES.demote)
  return isMovedBySystem ? `${label} (automático)` : label
}

import { describe, expect, it } from 'vitest'
import { RELEASE_CHANNEL_ERROR_CODES } from '@/lib/contracts'
import {
  channelEventTypeLabel,
  channelSourceLabel,
  isAutomaticChannelEvent,
  releaseChannelMessage,
  releaseChannelModeDescription,
  releaseChannelModeLabel,
} from './messages'

describe('releaseChannelMessage', () => {
  it('traduce TODOS los códigos del vocabulario cerrado', () => {
    for (const code of Object.values(RELEASE_CHANNEL_ERROR_CODES)) {
      expect(releaseChannelMessage(code), code).not.toBeNull()
    }
  })

  it('devuelve null para un código ajeno o ausente', () => {
    expect(releaseChannelMessage('environment.not_found')).toBeNull()
    expect(releaseChannelMessage(undefined)).toBeNull()
    expect(releaseChannelMessage(null)).toBeNull()
  })
})

describe('releaseChannelModeLabel', () => {
  it('etiqueta los tres modos y deja pasar uno desconocido tal cual', () => {
    expect(releaseChannelModeLabel('manual')).toBe('Manual')
    expect(releaseChannelModeLabel('derived')).toBe('Derivado')
    expect(releaseChannelModeLabel('latest')).toBe('Última versión')
    expect(releaseChannelModeLabel('pinned')).toBe('pinned')
  })
})

describe('releaseChannelModeDescription', () => {
  it('latest y derived describen un puntero que se mueve solo, sobre versiones revisadas', () => {
    expect(releaseChannelModeDescription('latest')).toBe(
      'La última versión revisada; el puntero se mueve solo.',
    )
    expect(releaseChannelModeDescription('derived')).toContain('versiones revisadas')
    expect(releaseChannelModeDescription('derived')).not.toContain('en vivo')
  })

  it('manual no cambia y un modo desconocido no tiene descripción', () => {
    expect(releaseChannelModeDescription('manual')).toBe(
      'Una persona mueve el puntero de cada blueprint a una versión revisada.',
    )
    expect(releaseChannelModeDescription('pinned')).toBeNull()
  })
})

describe('channelSourceLabel', () => {
  it('rotula el puntero como del canal y conserva las demás etiquetas', () => {
    expect(channelSourceLabel('pointer')).toBe('Puntero del canal')
    expect(channelSourceLabel('inventory_cache')).toBe('Caché del inventario')
    expect(channelSourceLabel('otro')).toBe('otro')
    expect(channelSourceLabel(null)).toBeNull()
  })
})

describe('eventos automáticos del historial', () => {
  it('rotula como automático un promote/demote del sistema y deja igual el de una persona', () => {
    expect(channelEventTypeLabel('promote', 'system')).toBe('Promovido (automático)')
    expect(channelEventTypeLabel('demote', 'system')).toBe('Retrocedido (automático)')
    expect(channelEventTypeLabel('promote', 'admin')).toBe('Promovido')
    expect(channelEventTypeLabel('promote')).toBe('Promovido')
    expect(channelEventTypeLabel('version_deleted', 'system')).toBe(
      'Versión borrada (movimiento automático)',
    )
  })

  it('distingue los movimientos automáticos de los de una persona', () => {
    expect(isAutomaticChannelEvent('promote', 'system')).toBe(true)
    expect(isAutomaticChannelEvent('version_deleted', 'admin')).toBe(true)
    expect(isAutomaticChannelEvent('promote', 'admin')).toBe(false)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { renderWithProviders } from '@/test/utils'
import { CATALOG_FIXTURE, managedDatabaseFixture, meFixture } from '@/test/fixtures/authz-catalog'
import type { DatabaseState } from '../database-actions'
import {
  DatabaseDangerZone,
  DatabaseHeaderActions,
  type DatabaseActionTarget,
} from './DatabaseRowActions'

function targetIn(state: DatabaseState): DatabaseActionTarget {
  const isManaged = state.startsWith('managed')
  return {
    serverId: 1,
    name: 'ventas_prod',
    managed: isManaged ? managedDatabaseFixture() : null,
    state,
  }
}

/**
 * Sesión de dueña en cada test: tiene `databases.drop`, así que la ficha ofrece «Eliminar del motor
 * 🔌». Sin estos handlers, la sesión que leen los guards sale a la red y MSW la rechaza.
 */
beforeEach(() => {
  server.use(
    http.get('http://localhost/api/v1/auth/me', () =>
      HttpResponse.json({ data: meFixture({ role: 'owner' }) }),
    ),
    http.get('http://localhost/api/v1/authz/catalog', () =>
      HttpResponse.json({ data: CATALOG_FIXTURE }),
    ),
  )
})

describe('DatabaseHeaderActions', () => {
  it('una base activa deja a la vista Comparar y Clonar y pliega el resto en «Gestionar»', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DatabaseHeaderActions target={targetIn('managed-active')} onAction={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Comparar esquema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clonar' })).toBeInTheDocument()
    const manage = screen.getByRole('button', { name: 'Gestionar' })
    // Las destructivas ya no están en la cabecera: viven en la zona de peligro.
    expect(screen.queryByRole('button', { name: 'Quitar del inventario' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar del motor 🔌' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)

    await user.click(manage)
    const menu = screen.getByRole('menu', { name: 'Gestionar «ventas_prod»' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Editar', 'Reasignar propietario', 'Acceso de agentes', 'Exportar'])
  })

  it('con tres acciones o menos las muestra todas y no pinta el menú', () => {
    renderWithProviders(
      <DatabaseHeaderActions target={targetIn('managed-error')} onAction={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reasignar propietario' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acceso de agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gestionar' })).not.toBeInTheDocument()
  })

  it('la acción de dominio queda visible aunque el resto se pliegue', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    const target = targetIn('managed-unprovisioned')
    renderWithProviders(<DatabaseHeaderActions target={target} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: 'Aprovisionar 🔌' }))
    expect(onAction).toHaveBeenCalledWith({ action: 'provision', target, surface: 'detail' })
    expect(screen.getByRole('button', { name: 'Gestionar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('elegir un ítem de «Gestionar» pide la misma acción que su botón', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    const target = targetIn('managed-active')
    renderWithProviders(<DatabaseHeaderActions target={target} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: 'Gestionar' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reasignar propietario' }))
    expect(onAction).toHaveBeenCalledWith({ action: 'reassign', target, surface: 'detail' })
  })
})

describe('DatabaseDangerZone', () => {
  it('ofrece las dos destructivas con lo que provoca cada una', async () => {
    renderWithProviders(
      <DatabaseDangerZone target={targetIn('managed-active')} onAction={vi.fn()} />,
    )

    const zone = screen.getByRole('region', { name: 'Zona de peligro' })
    expect(within(zone).getByRole('button', { name: 'Quitar del inventario' })).toBeInTheDocument()
    expect(
      await within(zone).findByRole('button', { name: 'Eliminar del motor 🔌' }),
    ).toBeInTheDocument()
    expect(within(zone).getByText(/siguen en el motor/)).toBeInTheDocument()
    expect(within(zone).getByText(/No se puede deshacer/)).toBeInTheDocument()
  })

  it('una base archivada solo ofrece quitarla del inventario', () => {
    renderWithProviders(
      <DatabaseDangerZone target={targetIn('managed-archived')} onAction={vi.fn()} />,
    )

    const zone = screen.getByRole('region', { name: 'Zona de peligro' })
    expect(within(zone).getAllByRole('button')).toHaveLength(1)
    expect(within(zone).getByRole('button', { name: 'Quitar del inventario' })).toBeInTheDocument()
  })
})

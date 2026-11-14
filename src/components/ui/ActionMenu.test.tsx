import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionMenu } from './ActionMenu'

const TRIGGER_NAME = 'Más acciones de «ventas»'

function renderMenu(onExport = vi.fn(), onClone = vi.fn()) {
  render(
    <ActionMenu
      label={TRIGGER_NAME}
      items={[
        { id: 'export', label: 'Exportar', onSelect: onExport },
        { id: 'clone', label: 'Clonar', onSelect: onClone },
        {
          id: 'blocked',
          label: 'Comparar esquema',
          onSelect: vi.fn(),
          disabled: true,
          disabledReason: 'La base no existe en el motor',
        },
      ]}
    />,
  )
  return { onExport, onClone }
}

describe('ActionMenu', () => {
  it('no pinta los ítems hasta que se abre y anuncia el estado en el disparador', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: TRIGGER_NAME })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(screen.getByRole('menu', { name: TRIGGER_NAME })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('ejecuta exactamente el ítem elegido y cierra el menú', async () => {
    const { onExport, onClone } = renderMenu()
    await userEvent.click(screen.getByRole('button', { name: TRIGGER_NAME }))

    await userEvent.click(screen.getByRole('menuitem', { name: 'Exportar' }))

    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onClone).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('mantiene el ítem bloqueado en el menú, deshabilitado y con su motivo', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: TRIGGER_NAME }))

    const blocked = screen.getByRole('menuitem', { name: 'Comparar esquema' })

    expect(blocked).toBeDisabled()
    expect(blocked).toHaveAttribute('title', 'La base no existe en el motor')
  })

  it('se mueve con las flechas, omite lo deshabilitado y Esc devuelve el foco al disparador', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: TRIGGER_NAME })
    await userEvent.click(trigger)

    expect(screen.getByRole('menuitem', { name: 'Exportar' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Clonar' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Exportar' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('cierra al hacer clic fuera', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: TRIGGER_NAME }))

    await userEvent.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('deshabilita el disparador cuando no hay ítems', () => {
    render(<ActionMenu label="Más acciones" items={[]} />)

    expect(screen.getByRole('button', { name: 'Más acciones' })).toBeDisabled()
  })
})

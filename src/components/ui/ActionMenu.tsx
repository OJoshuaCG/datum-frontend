import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { MoreIcon } from './icons'

export interface ActionMenuItem {
  /** Identidad estable del ítem (clave de lista). */
  id: string
  /** Texto visible y nombre accesible del ítem. */
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Motivo del bloqueo: se ve como tooltip y el ítem sigue en el menú, nunca desaparece. */
  disabledReason?: string
}

export interface ActionMenuProps {
  /** Nombre accesible del disparador: dice de QUÉ fila son las acciones. */
  label: string
  items: ActionMenuItem[]
  /**
   * Texto visible del disparador. Sin él es un icono «⋯» (filas, donde se repite); con él es un
   * botón `outline` con texto (cabecera de una ficha, donde aparece una sola vez y un icono suelto
   * no dice qué hay dentro).
   */
  triggerText?: string
  className?: string
}

/** Alto aproximado de un ítem, solo para decidir si el menú abre hacia arriba. */
const ESTIMATED_ITEM_HEIGHT_PX = 36
const MENU_VERTICAL_PADDING_PX = 8
const MENU_GAP_PX = 4

interface MenuPosition {
  right: number
  top?: number
  bottom?: number
}

/**
 * Menú de acciones secundarias («Más acciones»). Existe para las filas con tantas acciones que los
 * botones se pisan: lo habitual queda visible y lo poco frecuente se agrupa aquí.
 *
 * Reglas que no se negocian:
 * - Es un complemento, nunca un reemplazo de las acciones de dominio ni de las destructivas: esas
 *   siguen como botones visibles.
 * - Cada ítem ejecuta exactamente lo que ejecutaba el botón que sustituye. Un ítem bloqueado se
 *   queda en el menú (deshabilitado y con su motivo), no se oculta.
 * - Se pinta en un portal con posición fija: las tablas recortan el desbordamiento y un menú
 *   absoluto quedaría cortado en la última fila.
 */
export function ActionMenu({ label, items, triggerText, className }: ActionMenuProps) {
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const isOpen = position !== null

  const close = () => setPosition(null)

  const open = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const estimatedHeight = items.length * ESTIMATED_ITEM_HEIGHT_PX + MENU_VERTICAL_PADDING_PX
    const fitsBelow = rect.bottom + MENU_GAP_PX + estimatedHeight <= window.innerHeight
    const right = Math.max(window.innerWidth - rect.right, MENU_GAP_PX)
    setPosition(
      fitsBelow
        ? { right, top: rect.bottom + MENU_GAP_PX }
        : { right, bottom: window.innerHeight - rect.top + MENU_GAP_PX },
    )
  }

  // Al abrir, el foco entra al primer ítem habilitado (patrón de menú de WAI-ARIA).
  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [isOpen])

  // Cerrar al hacer clic fuera y al desplazar o redimensionar: con posición fija el menú
  // quedaría flotando lejos de su fila.
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setPosition(null)
    }
    const handleViewportChange = () => setPosition(null)
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [isOpen])

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const enabledItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    )
    const currentIndex = enabledItems.indexOf(document.activeElement as HTMLElement)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        enabledItems[(currentIndex + 1) % enabledItems.length]?.focus()
        return
      case 'ArrowUp':
        event.preventDefault()
        enabledItems[(currentIndex - 1 + enabledItems.length) % enabledItems.length]?.focus()
        return
      case 'Home':
        event.preventDefault()
        enabledItems[0]?.focus()
        return
      case 'End':
        event.preventDefault()
        enabledItems[enabledItems.length - 1]?.focus()
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        triggerRef.current?.focus()
        return
      case 'Tab':
        close()
        return
    }
  }

  const select = (item: ActionMenuItem) => {
    // El foco vuelve al disparador ANTES de ejecutar: si el ítem abre un diálogo, éste devuelve el
    // foco a un elemento que sigue montado, no a un ítem que ya desapareció con el menú.
    triggerRef.current?.focus()
    close()
    item.onSelect()
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={triggerText ? 'outline' : 'ghost'}
        size={triggerText ? undefined : 'icon-sm'}
        className={className}
        // Con texto visible, el nombre accesible es ese texto (WCAG 2.5.3: la etiqueta visible
        // tiene que estar en el nombre); `label` sigue nombrando el menú desplegado.
        aria-label={triggerText ? undefined : label}
        title={triggerText ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        disabled={items.length === 0}
        onClick={() => (isOpen ? close() : open())}
      >
        {triggerText ?? <MoreIcon />}
      </Button>
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={handleMenuKeyDown}
            style={{
              position: 'fixed',
              right: position.right,
              top: position.top,
              bottom: position.bottom,
            }}
            className="z-50 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-elevated"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => select(item)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground',
                  'hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:outline-none',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

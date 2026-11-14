import type { KeyboardEvent, ReactNode } from 'react'

/**
 * Patrón WAI-ARIA de pestañas: las flechas, Inicio y Fin mueven el foco entre las pestañas del
 * mismo `tablist` y la activan. Se resuelve por DOM (hermanos con `role="tab"`) para no cambiar la
 * API del componente ni obligar a cada página a conocer a sus vecinas.
 */
function moveFocusBetweenTabs(event: KeyboardEvent<HTMLButtonElement>) {
  const navigationKeys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
  if (!navigationKeys.includes(event.key)) return

  const tablist = event.currentTarget.closest('[role="tablist"]')
  if (!tablist) return
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(
    (tab) => !tab.disabled,
  )
  const currentIndex = tabs.indexOf(event.currentTarget)
  if (currentIndex === -1) return

  let targetIndex = currentIndex
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length
  if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
  if (event.key === 'Home') targetIndex = 0
  if (event.key === 'End') targetIndex = tabs.length - 1

  event.preventDefault()
  // `click()` activa la pestaña destino con el mismo camino que el ratón (URL `?tab=`, estado).
  const targetTab = tabs[targetIndex]
  if (!targetTab) return
  targetTab.focus()
  targetTab.click()
}

/**
 * Botón de pestaña compartido. Precedente: `AdminPage` (Fase 0 de este patrón). Se extrae porque
 * había quedado triplicado con una divergencia real (`ServerUserDetailPage` sumaba `-mb-px`, que
 * desalinea el borde inferior activo respecto al de la barra) — usalo siempre dentro de un
 * contenedor `<div role="tablist" aria-label="Secciones de …" className="flex gap-1 border-b
 * border-border">`: sin `aria-label`, el lector de pantalla anuncia una lista de pestañas sin nombre.
 */
export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      // Tabindex móvil: solo la pestaña activa entra en el orden de Tab; el resto, con flechas.
      tabIndex={active ? 0 : -1}
      onKeyDown={moveFocusBetweenTabs}
      onClick={onClick}
      // Foco visible propio: sin él, recorrer las pestañas con teclado no deja rastro de dónde
      // está el foco (el subrayado marca la pestaña ACTIVA, no la enfocada).
      className={
        active
          ? 'border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
          : 'border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
      }
    >
      {children}
    </button>
  )
}

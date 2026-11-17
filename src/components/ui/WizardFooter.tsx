import type { ReactNode } from 'react'
import { ChevronLeftIcon } from './icons'
import { IconButton } from './IconButton'

interface WizardFooterProps {
  /** Lado izquierdo: normalmente «Atrás». Sin él se deja un hueco para que la acción quede a la derecha. */
  left?: ReactNode
  /** Lado derecho: la acción que avanza y, antes de ella, la pista de capacidad si la hay. */
  children?: ReactNode
}

/**
 * Pie de navegación de un asistente, FUERA del `<Card>` y fijo al borde inferior.
 *
 * Existe porque cinco asistentes (clones, snapshot, comparaciones de esquema, collation y
 * exportaciones) repetían este contenedor y empezaban a divergir. Reglas que fija:
 * - `mt-auto`: en pasos cortos absorbe el espacio libre y ancla la barra al pie, así la posición
 *   no salta entre pasos.
 * - `sticky bottom-0`: en pasos largos la mantiene visible mientras se hace scroll.
 * - Quien avanza va a la derecha y es el único `primary`; «Atrás» va a la izquierda y es `ghost`.
 */
export function WizardFooter({ left, children }: WizardFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-elevated">
      {left ?? <span aria-hidden />}
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}

interface WizardBackButtonProps {
  onClick: () => void
  disabled?: boolean
}

/** «Atrás» de un asistente: el mismo botón en todos, para que no haya un chevron aquí y texto allá. */
export function WizardBackButton({ onClick, disabled }: WizardBackButtonProps) {
  return (
    <IconButton
      label="Atrás"
      icon={<ChevronLeftIcon />}
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
    />
  )
}

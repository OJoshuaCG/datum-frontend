import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'
import { BUTTON_BASE, SIZES, VARIANTS, type ButtonSize, type ButtonVariant } from './button-styles'

export type { ButtonSize, ButtonVariant } from './button-styles'

/** Tamaños sin texto: el spinner de carga los SUSTITUYE en vez de sumarse (no cabrían los dos). */
const ICON_ONLY_SIZES = new Set<ButtonSize>(['icon', 'icon-sm'])

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  /**
   * Motivo por el que el botón está deshabilitado. Se muestra SOLO como tooltip nativo (`title`):
   * NO es una descripción accesible, y el tooltip de un botón `disabled` no llega por teclado ni
   * en táctil. Es un complemento para quien usa puntero: el motivo tiene que estar además
   * VISIBLE junto al control, enlazado con `aria-describedby` (ver `docs/ui-conventions.md` §4).
   * Solo se usa mientras el botón está deshabilitado por `disabled`; el estado de carga no lo necesita.
   */
  disabledReason?: string
}

/**
 * Botón accesible. El foco visible se garantiza por el ring (color de token `ring`).
 * No usa neumorphism (rompería el contraste de un control interactivo).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    disabledReason,
    className,
    children,
    title,
    ...props
  },
  ref,
) {
  const iconOnly = ICON_ONLY_SIZES.has(size)
  const showDisabledReason = disabled === true && !isLoading && disabledReason !== undefined
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      title={showDisabledReason ? disabledReason : title}
      className={cn(
        BUTTON_BASE,
        // Con motivo, el puntero debe llegar al botón para que aparezca el tooltip; sin motivo se
        // conserva el comportamiento anterior.
        showDisabledReason
          ? 'disabled:cursor-not-allowed disabled:opacity-50'
          : 'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {/* El hueco entre spinner y texto lo pone el `gap` del tamaño: un margen extra lo duplicaba. */}
      {isLoading && <Spinner className="h-4 w-4" />}
      {!(iconOnly && isLoading) && children}
    </button>
  )
})

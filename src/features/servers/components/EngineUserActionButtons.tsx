import type { ReactNode } from 'react'
import { ActionMenu, Button, ListRemoveIcon, RowActionButton, TrashIcon } from '@/components/ui'
import {
  ACTION_LABELS,
  DESTRUCTIVE_IDENTITY_ACTIONS,
  type IdentityAction,
  type IdentityActionId,
  type UsernameAction,
} from './engine-user-actions'

/**
 * `row`: fila de tabla, donde la acción se repite y el icono se entiende solo (eliminar).
 * `header`: cabecera de la ficha, una sola vez por pantalla — todo con texto.
 */
type Layout = 'row' | 'header'

/**
 * Variante de cada acción. Rojo suave para las dos destructivas, igual que en las bases y en
 * `ServerUsersPage`: «Quitar del inventario» iba en `ghost` solo aquí, y la misma acción se veía
 * inocua en una pantalla y destructiva en otra. El resto, ghost u outline.
 */
const VARIANT: Record<IdentityActionId, 'outline' | 'ghost' | 'danger-soft'> = {
  adopt: 'outline',
  recreate: 'outline',
  viewGrants: 'ghost',
  reveal: 'ghost',
  rotatePassword: 'ghost',
  edit: 'ghost',
  removeFromInventory: 'danger-soft',
  dropFromEngine: 'danger-soft',
}

/**
 * Icono de las destructivas: el mismo par que en las bases (lista con «−» para quitar el
 * registro, papelera para el DROP), así el dibujo solo ya distingue las dos consecuencias.
 */
const ICON: Partial<Record<IdentityActionId, ReactNode>> = {
  removeFromInventory: <ListRemoveIcon />,
  dropFromEngine: <TrashIcon />,
}

/**
 * A partir de cuántas acciones una FILA manda las de uso ocasional al menú «Más acciones». La fila
 * de una identidad adoptada suma además los botones batch del username, y con más de tres
 * acciones propias la celda se partía en dos líneas de botones. La ficha (`header`) no usa menú.
 */
const ROW_VISIBLE_ACTION_LIMIT = 3

/**
 * Acciones que una fila cargada pasa al menú. Siguen completas en la ficha; el menú ejecuta el
 * mismo `onRun`. Quedan a la vista Permisos efectivos, Adoptar, Recrear y las destructivas.
 */
const ROW_OVERFLOW_ACTIONS: ReadonlySet<IdentityActionId> = new Set<IdentityActionId>([
  'reveal',
  'rotatePassword',
])

interface IdentityActionButtonsProps {
  actions: IdentityAction[]
  layout: Layout
  /** La identidad (`usuario@host`): completa el nombre accesible de cada botón de la fila. */
  subject: string
  onRun: (action: IdentityAction) => void
  /** La acción `removeFromInventory` de una huérfana está en curso. */
  isRemoving?: boolean
  /** Hay registro del inventario: sin él, las acciones `needsRecord` no pueden abrir nada. */
  recordReady?: boolean
  /** El registro está cargando: las `needsRecord` lo dicen con un spinner en vez de apagarse. */
  recordLoading?: boolean
}

/**
 * Pinta las acciones de una identidad tal como las decide `identityActions`: la vista no elige
 * cuáles, solo dónde. Mismo aspecto en la tabla del servidor y en la ficha.
 */
export function IdentityActionButtons({
  actions,
  layout,
  subject,
  onRun,
  isRemoving = false,
  recordReady = true,
  recordLoading = false,
}: IdentityActionButtonsProps) {
  const overflowActions =
    layout === 'row' && actions.length > ROW_VISIBLE_ACTION_LIMIT
      ? actions.filter((action) => ROW_OVERFLOW_ACTIONS.has(action.id))
      : []
  const visibleActions = actions.filter((action) => !overflowActions.includes(action))
  // El menú va antes de la primera destructiva para que ésta siga siendo lo último de la fila.
  const firstDestructiveIndex = visibleActions.findIndex((action) =>
    DESTRUCTIVE_IDENTITY_ACTIONS.has(action.id),
  )
  const menuIndex = firstDestructiveIndex === -1 ? visibleActions.length : firstDestructiveIndex
  const overflowMenu =
    overflowActions.length > 0 ? (
      <ActionMenu
        key="overflow-menu"
        label={`Más acciones de «${subject}»`}
        items={overflowActions.map((action) => ({
          id: action.id,
          label: ACTION_LABELS[action.id],
          onSelect: () => onRun(action),
        }))}
      />
    ) : null

  const buttons = visibleActions.map((action, index) => {
    const label = ACTION_LABELS[action.id]
    // Mientras carga el registro, «cargando» y no un `disabled` mudo: un botón gris sin
    // motivo parece roto, y el tooltip de uno deshabilitado no llega por teclado ni en táctil.
    // Solo si la carga FALLÓ queda deshabilitado; la pestaña que lo necesita muestra el error.
    const isLoading =
      (action.needsRecord && recordLoading) ||
      (action.id === 'removeFromInventory' && !action.needsRecord && isRemoving)
    const disabled = action.needsRecord && !recordReady
    const destructive = DESTRUCTIVE_IDENTITY_ACTIONS.has(action.id)
    const firstDestructive = destructive && index === firstDestructiveIndex
    if (layout === 'row') {
      return (
        <RowActionButton
          key={action.id}
          label={label}
          subject={subject}
          icon={ICON[action.id]}
          // La papelera es un icono universal; la lista con «−» no, y en táctil necesita su
          // texto para no confundirse con ella.
          iconText={action.id === 'removeFromInventory' ? 'card' : 'table'}
          variant={VARIANT[action.id]}
          isLoading={isLoading}
          disabled={disabled}
          className={firstDestructive ? 'ml-2' : undefined}
          onClick={() => onRun(action)}
        />
      )
    }
    return (
      <Button
        key={action.id}
        variant={VARIANT[action.id]}
        size="sm"
        isLoading={isLoading}
        disabled={disabled}
        onClick={() => onRun(action)}
      >
        {!isLoading && ICON[action.id]}
        {label}
      </Button>
    )
  })

  return (
    <>
      {buttons.slice(0, menuIndex)}
      {overflowMenu}
      {buttons.slice(menuIndex)}
    </>
  )
}

interface UsernameActionButtonsProps {
  actions: UsernameAction[]
  onRun: (action: UsernameAction) => void
}

/**
 * Acciones batch de un username. Una deshabilitada lleva su motivo escrito al lado: el tooltip
 * de un botón `disabled` no llega por teclado ni en táctil (ver `IconButton`).
 */
export function UsernameActionButtons({ actions, onRun }: UsernameActionButtonsProps) {
  return (
    <>
      {actions.map((action) => (
        <span key={action.id} className="inline-flex flex-wrap items-center gap-1.5">
          <Button
            variant={
              action.id === 'definePassword' || action.id === 'rotateAllHosts' ? 'ghost' : 'outline'
            }
            size="sm"
            disabled={Boolean(action.disabledReason)}
            onClick={() => onRun(action)}
          >
            {ACTION_LABELS[action.id]}
          </Button>
          {action.disabledReason && (
            <span className="text-xs text-muted-foreground">{action.disabledReason}</span>
          )}
        </span>
      ))}
    </>
  )
}

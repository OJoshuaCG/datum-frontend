import { Badge } from './Badge'
import { AlertIcon, BanIcon, CheckIcon } from './icons'

/**
 * Estado de una entidad física (base de datos o identidad de usuario del motor) frente al
 * inventario del gateway: `adopted` está registrada, `unmanaged` existe en el motor pero no en
 * el inventario, `orphan` existe en el inventario pero ya no en el motor. Las bases de datos
 * nunca llegan a `orphan` (no hay flujo que lo produzca), pero comparten el mismo tipo para que
 * un solo componente sirva a las tres pantallas que muestran este estado.
 */
export type AdoptionStatus = 'adopted' | 'unmanaged' | 'orphan'

// Cada estado lleva icono además del color: el color solo no distingue «no adoptada» de
// «huérfana» para quien no percibe el rojo/ámbar. El `consequence` va en `title` como refuerzo del
// hover; lo que decide algo ya está en la etiqueta visible.
const ADOPTION_BADGE: Record<
  AdoptionStatus,
  {
    tone: 'success' | 'warning' | 'error'
    label: string
    consequence: string
    Icon: typeof CheckIcon
  }
> = {
  adopted: {
    tone: 'success',
    label: 'Adoptada',
    consequence: 'Está en el inventario del gateway y se puede operar desde aquí.',
    Icon: CheckIcon,
  },
  unmanaged: {
    tone: 'warning',
    label: 'No adoptada',
    consequence: 'Existe en el motor pero el gateway no la registró: adoptala para gestionarla.',
    Icon: AlertIcon,
  },
  orphan: {
    tone: 'error',
    label: 'Huérfana',
    consequence: 'Está en el inventario pero ya no existe en el motor.',
    Icon: BanIcon,
  },
}

/**
 * Badge único para "está en el inventario del gateway": mismo texto, mismo tono, en las tres
 * pantallas que cruzan una entidad física contra el inventario (`ServerDatabaseDetailPage`,
 * `EngineUsersPanel`, `ServerUserDetailPage`). Antes cada una tenía su propio vocabulario
 * («Gestionada»/«No gestionada», «🟢 Adoptado»/«🟡 Sin adoptar»/«🔴 Huérfano», «📥 adoptada»);
 * esto evita que vuelvan a divergir.
 */
export function AdoptionBadge({
  status,
  className,
}: {
  status: AdoptionStatus
  className?: string
}) {
  const { tone, label, consequence, Icon } = ADOPTION_BADGE[status]
  return (
    <Badge tone={tone} className={className} title={consequence}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

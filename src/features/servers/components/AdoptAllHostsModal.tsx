import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge, Button, DataTable, Input, Modal, Textarea } from '@/components/ui'
import type { BadgeTone } from '@/components/ui'
import { useCapabilityGuard } from '@/features/auth'
import {
  CAPABILITY_ESCALATIONS,
  type BatchAdoptResult,
  type BatchAdoptStatus,
} from '@/lib/contracts'
import { useAdoptAllHosts } from '../hooks/use-engine-users'

interface AdoptAllHostsModalProps {
  onClose: () => void
  serverId: number
  username: string
  supportsHosts: boolean
}

interface FormValues {
  known_password: string
  notes: string
}

const schema = z.object({
  known_password: z.string(),
  notes: z.string(),
})

const RESULT_BADGE: Record<BatchAdoptStatus, { tone: BadgeTone; label: string }> = {
  adopted: { tone: 'success', label: 'Adoptada' },
  already_adopted: { tone: 'neutral', label: 'Ya adoptada' },
}

/** Sin ordenar: es el orden en que el servidor reportó los hosts. */
const RESULT_COLUMNS: ColumnDef<BatchAdoptResult>[] = [
  {
    id: 'host',
    header: 'Host',
    enableSorting: false,
    cell: ({ row }) => (
      <code className="font-mono text-xs text-foreground">{row.original.host ?? '—'}</code>
    ),
  },
  {
    id: 'status',
    header: 'Resultado',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={RESULT_BADGE[row.original.status].tone}>
        {RESULT_BADGE[row.original.status].label}
      </Badge>
    ),
  },
]

/**
 * `POST /users/adopt-all-hosts` (§7.4) — adopta TODAS las identidades en vivo de un username de
 * una sola llamada (nunca `CREATE USER`). Fail-tolerant: el modal no se cierra al terminar, sino
 * que pinta el desenlace por host desde `results[]` (`already_adopted` NO es error).
 */
export function AdoptAllHostsModal({
  onClose,
  serverId,
  username,
  supportsHosts,
}: AdoptAllHostsModalProps) {
  const adoptAll = useAdoptAllHosts(serverId)
  /*
   * Adoptar es `write`; guardar `known_password` en la misma llamada sube a
   * `engine_users.credentials`. Sin ella solo se deshabilita ese campo, con el motivo: la adopción
   * sin contraseña sigue disponible.
   */
  const passwordGuard = useCapabilityGuard(
    CAPABILITY_ESCALATIONS.adoptAllHostsKnownPassword,
    'guardar una contraseña conocida al adoptar',
    { scope: { serverId, environmentId: null } },
  )
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { known_password: '', notes: '' },
  })

  const submit = handleSubmit((values) => {
    adoptAll.mutate({
      username,
      known_password:
        passwordGuard.allowed && values.known_password.trim() ? values.known_password : undefined,
      notes: values.notes.trim() ? values.notes.trim() : null,
    })
  })

  const result = adoptAll.data

  return (
    <Modal
      open
      onClose={onClose}
      title="Adoptar todos los hosts"
      description={
        supportsHosts
          ? `Registra en el inventario todas las identidades en vivo de «${username}», sin ejecutar CREATE USER.`
          : `Registra en el inventario la identidad en vivo de «${username}», sin ejecutar CREATE USER.`
      }
      size="md"
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            {result.adopted} de {result.total_hosts} identidad(es) adoptada(s) ahora
            {result.total_hosts - result.adopted > 0
              ? '; el resto ya estaba en el inventario.'
              : '.'}
          </p>
          <DataTable
            data={result.results}
            columns={RESULT_COLUMNS}
            enableGlobalFilter={false}
            getRowId={(item) => item.host ?? '(sin host)'}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Contraseña conocida (opcional)"
            type="password"
            autoComplete="new-password"
            hint={
              passwordGuard.hint ??
              'Si la indicás, se cifra y guarda en TODAS las identidades sin ejecutar ALTER USER — el motor no se toca y el gateway no verifica que sea la vigente.'
            }
            disabled={!passwordGuard.allowed}
            error={errors.known_password?.message}
            {...register('known_password')}
          />
          <Textarea label="Notas (opcional)" rows={2} {...register('notes')} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={adoptAll.isPending}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={adoptAll.isPending}>
              {supportsHosts ? 'Adoptar todos los hosts 🔌' : 'Adoptar usuario 🔌'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge, Button, DataTable, Input, Modal, Switch } from '@/components/ui'
import { CapabilityHint, useCapabilityGuard } from '@/features/auth'
import { CAPABILITIES, type PasswordChangeBatchResult } from '@/lib/contracts'
import { useChangeEngineUserPasswordAllHosts } from '../hooks/use-engine-users'

/** Sin ordenar: es el orden en que el servidor reportó los hosts. */
const RESULT_COLUMNS: ColumnDef<PasswordChangeBatchResult>[] = [
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
      <Badge tone={row.original.status === 'rotated' ? 'success' : 'error'}>
        {row.original.status === 'rotated' ? 'Rotada' : 'Error'}
      </Badge>
    ),
  },
  {
    id: 'detail',
    header: 'Detalle',
    enableSorting: false,
    cell: ({ row }) => {
      const item = row.original
      if (item.status === 'error') {
        return <span className="text-xs text-error">{item.error ?? 'Error desconocido'}</span>
      }
      return (
        <span className="text-xs text-muted-foreground">
          {item.adopted ? 'Adoptada al rotar' : '—'}
        </span>
      )
    },
  },
]

interface RotatePasswordAllHostsModalProps {
  onClose: () => void
  serverId: number
  username: string
}

interface FormValues {
  new_password: string
  confirm_username: string
  adopt_if_missing: boolean
}

function buildSchema(username: string) {
  return z.object({
    new_password: z.string().min(1, 'Requerido'),
    confirm_username: z
      .string()
      .refine((value) => value === username, `Debe coincidir exactamente con «${username}»`),
    adopt_if_missing: z.boolean(),
  })
}

/**
 * `PATCH /users/password-all-hosts` (§7.4) — `ALTER USER/ROLE` REAL en TODOS los hosts en vivo.
 * Exige reescribir el username exacto (doble intención, patrón `confirmWord`). Fail-tolerant:
 * el desenlace SIEMPRE se pinta por host — un host con `status='error'` conserva la contraseña
 * ANTERIOR en el motor, así que jamás se muestra un "contraseña cambiada" genérico.
 */
export function RotatePasswordAllHostsModal({
  onClose,
  serverId,
  username,
}: RotatePasswordAllHostsModalProps) {
  const rotateAll = useChangeEngineUserPasswordAllHosts(serverId)
  const guard = useCapabilityGuard(
    CAPABILITIES.engineUsersCredentials,
    'cambiar contraseñas del motor',
    { scope: { serverId, environmentId: null } },
  )
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(username)),
    defaultValues: { new_password: '', confirm_username: '', adopt_if_missing: false },
  })

  const confirmMatches = watch('confirm_username') === username

  const submit = handleSubmit((values) => {
    if (!guard.allowed) return
    rotateAll.mutate({
      username,
      new_password: values.new_password,
      confirm_username: values.confirm_username,
      adopt_if_missing: values.adopt_if_missing,
    })
  })

  const result = rotateAll.data
  const failed = result ? result.results.filter((item) => item.status === 'error') : []

  return (
    <Modal
      open
      onClose={onClose}
      title="Rotar contraseña en todos los hosts"
      description={`Ejecuta ALTER USER/ROLE en todas las identidades en vivo de «${username}» 🔌.`}
      size="md"
    >
      {result ? (
        <div className="flex flex-col gap-4">
          {failed.length > 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              {failed.length} de {result.total_hosts} host(s) fallaron y{' '}
              <strong>conservan la contraseña anterior</strong> en el motor. Reintentá o rotá esas
              identidades individualmente.
            </p>
          ) : (
            <p className="text-sm text-foreground">
              Contraseña rotada en los {result.total_hosts} host(s).
            </p>
          )}
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
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            Cambia la contraseña <strong>real</strong> en el motor: las aplicaciones que sigan
            usando la anterior perderán acceso. Para guardar una contraseña ya vigente sin
            cambiarla, usá «Definir contraseña conocida».
          </p>
          <Input
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            required
            error={errors.new_password?.message}
            {...register('new_password')}
          />
          <Input
            label={`Escribí «${username}» para confirmar`}
            autoComplete="off"
            required
            error={errors.confirm_username?.message}
            {...register('confirm_username')}
          />
          <Controller
            control={control}
            name="adopt_if_missing"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Adoptar identidades sin fila de inventario"
                hint="Los hosts rotados que no estén en el inventario se registran con la nueva contraseña cifrada."
              />
            )}
          />
          <CapabilityHint guard={guard} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={rotateAll.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={rotateAll.isPending}
              disabled={!confirmMatches || !guard.allowed}
              aria-describedby={guard.describedBy}
            >
              Rotar en todos los hosts 🔌
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Spinner,
} from '@/components/ui'
import { useDatabaseModels } from '@/features/database-models/hooks/use-database-models'
import { toApiError } from '@/lib/api/errors'
import type { ChannelResolutionOut, DatabaseModelOut } from '@/lib/contracts'
import { useBlueprintChannelsOf } from '../hooks/use-blueprint-channels'
import { useReleaseChannelOptions } from '../hooks/use-release-channels'
import { releaseChannelMessage } from '../messages'

/** Blueprints por página: cada fila cuesta una consulta, así que la página es corta a propósito. */
const MATRIX_PAGE_SIZE = 10

/** Lo que la matriz sabe de la celda (blueprint, canal). */
type CellState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'missing' }
  | { kind: 'resolved'; version: string }
  | { kind: 'unresolved'; code: string | null | undefined }

interface MatrixRow {
  model: DatabaseModelOut
  /** Un estado por `slug` de canal del catálogo. */
  cells: Record<string, CellState>
}

function cellOf(
  channels: ChannelResolutionOut[] | undefined,
  slug: string,
  isLoading: boolean,
  isError: boolean,
): CellState {
  if (isLoading) return { kind: 'loading' }
  if (isError || !channels) return { kind: 'error' }
  const channel = channels.find((candidate) => candidate.channel_slug === slug)
  if (!channel) return { kind: 'missing' }
  if (channel.resolved && channel.version) return { kind: 'resolved', version: channel.version }
  return { kind: 'unresolved', code: channel.code }
}

function MatrixCell({ state }: { state: CellState }) {
  switch (state.kind) {
    case 'loading':
      return <Spinner className="h-4 w-4" />
    case 'error':
      return <span className="text-xs text-error">No se pudo leer</span>
    case 'missing':
      return <span className="text-muted-foreground">—</span>
    case 'resolved':
      return <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{state.version}</code>
    case 'unresolved':
      // Un canal que no resuelve no es un fallo de la pantalla: se dice por qué en vez de dejar
      // una celda vacía que se leería como «sin canal».
      return (
        <span className="text-xs text-muted-foreground">
          {releaseChannelMessage(state.code) ?? 'Sin versión'}
        </span>
      )
  }
}

/**
 * Matriz blueprint × canal: qué versión sirve cada canal del catálogo para cada blueprint, en una
 * sola vista. Es de SOLO LECTURA: promover un puntero se sigue haciendo desde el blueprint, donde
 * están las versiones revisadas y el historial.
 *
 * Las versiones salen de la lista de canales de cada blueprint (referencia de la caché del
 * inventario). Es una foto para mirar; la lectura estricta que consumen las integraciones es otra.
 */
export function ChannelMatrixPanel() {
  const [page, setPage] = useState(1)
  const models = useDatabaseModels({ page, size: MATRIX_PAGE_SIZE })
  const channelCatalog = useReleaseChannelOptions()

  const modelItems = useMemo(() => models.data?.items ?? [], [models.data])
  const perModelChannels = useBlueprintChannelsOf(modelItems.map((model) => model.id))
  const catalogChannels = useMemo(() => channelCatalog.data ?? [], [channelCatalog.data])

  const rows = useMemo<MatrixRow[]>(
    () =>
      modelItems.map((model, index) => {
        const query = perModelChannels[index]
        const cells: Record<string, CellState> = {}
        for (const channel of catalogChannels) {
          cells[channel.slug] = cellOf(
            query?.data,
            channel.slug,
            query === undefined || query.isLoading,
            query?.isError ?? false,
          )
        }
        return { model, cells }
      }),
    [modelItems, perModelChannels, catalogChannels],
  )

  const columns = useMemo<ColumnDef<MatrixRow>[]>(
    () => [
      {
        id: 'blueprint',
        header: 'Blueprint',
        accessorFn: (row) => row.model.name,
        cell: ({ row }) => (
          <Link
            to={`/database-models/${row.original.model.id}/migrations`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.model.name}
          </Link>
        ),
      },
      ...catalogChannels.map<ColumnDef<MatrixRow>>((channel) => ({
        id: `channel-${channel.slug}`,
        header: channel.name,
        enableSorting: false,
        cell: ({ row }) => (
          <MatrixCell state={row.original.cells[channel.slug] ?? { kind: 'missing' }} />
        ),
      })),
    ],
    [catalogChannels],
  )

  const isError = models.isError || channelCatalog.isError
  const failure = models.error ?? channelCatalog.error

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matriz blueprint × canal</CardTitle>
        <CardDescription>
          La versión que sirve cada canal para cada blueprint. Solo lectura: para mover un puntero,
          abre el blueprint.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isError ? (
          <ErrorState
            error={toApiError(failure)}
            onRetry={() => {
              void models.refetch()
              void channelCatalog.refetch()
            }}
          />
        ) : (
          <>
            <DataTable
              data={rows}
              columns={columns}
              isLoading={models.isLoading || channelCatalog.isLoading}
              getRowId={(row) => String(row.model.id)}
              enableGlobalFilter={false}
              emptyState={
                <EmptyState
                  title="No hay blueprints ni canales que cruzar."
                  description="La matriz aparece cuando existe al menos un blueprint y un canal."
                />
              }
            />
            {models.data && models.data.items.length > 0 && (
              <Pagination
                page={models.data.pagination.page}
                pages={models.data.pagination.pages}
                total={models.data.pagination.total}
                size={models.data.pagination.size}
                hasNext={models.data.pagination.has_next}
                hasPrev={models.data.pagination.has_prev}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

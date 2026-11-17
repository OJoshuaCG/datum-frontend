import type { ColumnDef } from '@tanstack/react-table'
import { Badge, DataTable } from '@/components/ui'
import type {
  SchemaComparisonExecutionStatus,
  SchemaComparisonStatementResult,
} from '@/lib/contracts'
import { OBJECT_TYPE_LABELS } from './logic'

const STATUS_TONE: Record<SchemaComparisonExecutionStatus, 'success' | 'error' | 'neutral'> = {
  applied: 'success',
  failed: 'error',
  skipped: 'neutral',
}

const STATUS_LABEL: Record<SchemaComparisonExecutionStatus, string> = {
  applied: 'Aplicada',
  failed: 'Falló',
  skipped: 'Omitida',
}

/**
 * Las columnas no se ordenan: la tabla es el registro de ejecución y su orden (el de aplicación)
 * es información, que un clic en la cabecera destruiría.
 */
const COLUMNS: ColumnDef<SchemaComparisonStatementResult>[] = [
  {
    id: 'object_name',
    header: 'Objeto',
    enableSorting: false,
    cell: ({ row }) => (
      <code className="font-mono text-xs text-foreground">{row.original.object_name}</code>
    ),
  },
  {
    id: 'object_type',
    header: 'Tipo',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{OBJECT_TYPE_LABELS[row.original.object_type]}</span>
    ),
  },
  {
    id: 'status',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={STATUS_TONE[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>
    ),
  },
  {
    id: 'execution_ms',
    header: 'ms',
    enableSorting: false,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.execution_ms}</span>,
  },
  {
    id: 'error',
    header: 'Error',
    enableSorting: false,
    cell: ({ row }) => <span className="text-error">{row.original.error ?? '—'}</span>,
  },
]

/** Tabla de resultado por sentencia de `POST .../execute` (Vista 6B). */
export function ExecutionResultTable({
  statements,
}: {
  statements: SchemaComparisonStatementResult[]
}) {
  if (statements.length === 0) return null

  return (
    <DataTable
      data={statements}
      columns={COLUMNS}
      enableGlobalFilter={false}
      getRowId={(statement) => String(statement.item_id)}
    />
  )
}

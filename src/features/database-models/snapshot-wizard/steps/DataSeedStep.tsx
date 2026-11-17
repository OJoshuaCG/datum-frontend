import type { ColumnDef } from '@tanstack/react-table'
import { Badge, Button, Checkbox, DataTable, Spinner } from '@/components/ui'
import { CapabilityCallout, useCapabilityGuard } from '@/features/auth'
import { CAPABILITIES, MAX_DATA_TABLES, type OnOversize } from '@/lib/contracts'
import { cn } from '@/lib/utils'
import { HIGH_ROW_ESTIMATE, type DataCandidate } from '../logic'
import type { SnapshotWizard } from '../use-snapshot-wizard'

const OVERSIZE_OPTIONS: { value: OnOversize; label: string }[] = [
  { value: 'skip', label: 'Omitir las tablas que excedan el guardrail y reportarlas' },
  { value: 'error', label: 'Fallar la creación si alguna excede el guardrail' },
]

/** Vista 5b — datos-semilla de catálogos (opcional). */
export function DataSeedStep({ wizard }: { wizard: SnapshotWizard }) {
  const statsLoaded = wizard.snapshot.data?.table_stats != null
  const loadingStats = wizard.includeDataStats && !statsLoaded && wizard.snapshot.isFetching
  const candidates = wizard.dataCandidateList
  const atLimit = wizard.dataCount >= MAX_DATA_TABLES
  /*
   * Mandar `data_tables` SUBE el requisito a `blueprints.captures` (v23 §4), que solo tiene
   * `owner`: los datos-semilla son filas reales de la base del cliente guardadas en el
   * gateway, o sea el mismo eje de divulgación que la captura de SELECT. Todo este paso es
   * opcional, así que sin la capacidad se explica y se sigue de largo — no se bloquea el
   * asistente, que funciona perfectamente sin datos-semilla.
   */
  const seedGuard = useCapabilityGuard(
    CAPABILITIES.blueprintsCaptures,
    'incluir datos-semilla en un snapshot',
  )

  // Sin ordenar: el orden de las candidatas lo decide `dataCandidateList`. Los controles por fila
  // conservan su `aria-label` con el nombre de la tabla: sin él un lector de pantalla oye N
  // casillas idénticas.
  const candidateColumns: ColumnDef<DataCandidate>[] = [
    {
      id: 'select',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const candidate = row.original
        const selected = candidate.table in wizard.dataModes
        const disabled = !candidate.hasPrimaryKey || (!selected && atLimit)
        return (
          <input
            type="checkbox"
            className="accent-primary"
            checked={selected}
            disabled={disabled}
            onChange={() => wizard.toggleDataTable(candidate.table)}
            aria-label={`Seleccionar ${candidate.table}`}
            title={!candidate.hasPrimaryKey ? 'Sin PK: no puede sembrar datos' : undefined}
          />
        )
      },
    },
    {
      id: 'table',
      header: 'Tabla',
      enableSorting: false,
      cell: ({ row }) => (
        <code className="font-mono text-xs text-foreground">{row.original.table}</code>
      ),
    },
    {
      id: 'rows',
      header: 'Filas (est.)',
      enableSorting: false,
      cell: ({ row }) => {
        const estimatedRows = row.original.estimatedRows
        return (
          <div className="tabular-nums">
            <span className={cn(estimatedRows >= HIGH_ROW_ESTIMATE && 'text-warning')}>
              {estimatedRows.toLocaleString('es')}
            </span>
            {/* Visible y no en un `title`: decide si conviene incluir la tabla, y un ⚠ suelto no
                dice nada por teclado, lector de pantalla ni táctil. */}
            {estimatedRows >= HIGH_ROW_ESTIMATE && (
              <span className="block text-xs text-warning">
                <span aria-hidden>⚠ </span>puede superar el guardrail y omitirse
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'pk',
      header: 'PK',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.hasPrimaryKey ? (
          <Badge tone="success">sí</Badge>
        ) : (
          <Badge tone="neutral">no</Badge>
        ),
    },
    {
      id: 'mode',
      header: 'Modo',
      enableSorting: false,
      cell: ({ row }) => {
        const table = row.original.table
        return (
          <select
            value={wizard.dataModes[table] ?? 'upsert'}
            disabled={!(table in wizard.dataModes)}
            onChange={(event) =>
              wizard.setDataMode(table, event.target.value as 'upsert' | 'insert_ignore')
            }
            className="h-8 rounded-md border border-input bg-surface px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label={`Modo de siembra de ${table}`}
          >
            <option value="upsert">upsert</option>
            <option value="insert_ignore">insert_ignore</option>
          </select>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Datos-semilla (opcional)</h2>
        <p className="text-sm text-muted-foreground">
          Solo catálogos pequeños (tipos, estados, monedas…). No es para datos masivos. Requieren
          clave primaria y rigen guardrails de tamaño (filas/bytes/nº de tablas).
        </p>
      </div>

      {!seedGuard.allowed ? (
        <CapabilityCallout
          canDo="crear el snapshot"
          cannotDo="incluirle datos-semilla"
          missing={seedGuard.missing}
          unresolved={seedGuard.unresolved}
        >
          <p>
            Los datos-semilla son opcionales y solo aportan catálogos pequeños. Continuá al paso
            siguiente.
          </p>
        </CapabilityCallout>
      ) : !statsLoaded ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Para elegir catálogos hay que leer estadísticas por tabla (una consulta extra por
            tabla).
          </p>
          <Button
            variant="outline"
            onClick={() => wizard.setIncludeDataStats(true)}
            isLoading={loadingStats}
          >
            Cargar estadísticas
          </Button>
        </div>
      ) : loadingStats ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Leyendo estadísticas por tabla…
        </div>
      ) : candidates.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted-foreground">
          No hay tablas elegibles para datos-semilla (ninguna con estructura incluida y clave
          primaria). Podés continuar sin datos.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Seleccionadas: <strong className="text-foreground">{wizard.dataCount}</strong> / máx{' '}
              {MAX_DATA_TABLES}
            </span>
            {atLimit && <Badge tone="warning">Límite de tablas alcanzado</Badge>}
          </div>

          <DataTable
            data={candidates}
            columns={candidateColumns}
            enableGlobalFilter={false}
            getRowId={(candidate) => candidate.table}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">
              Si una tabla excede el guardrail
            </legend>
            {OVERSIZE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="on-oversize"
                  className="accent-primary"
                  checked={wizard.onOversize === option.value}
                  onChange={() => wizard.setOnOversize(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <Checkbox
              label="Confirmo el rollback por PK (DELETE) de las versiones de datos"
              hint="Al revertir una versión de datos se ejecutará DELETE por PK sobre las filas sembradas. Sin marcar, el rollback queda solo como sugerencia (no ejecutable)."
              checked={wizard.confirmDataRollback}
              onChange={(event) => wizard.setConfirmDataRollback(event.target.checked)}
            />
          </div>
        </>
      )}
    </div>
  )
}

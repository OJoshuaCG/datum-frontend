import { Link } from 'react-router-dom'
import { SKIPPED_BY_SCOPE_REASON, skippedBaseLabel, useCapabilities } from '@/features/auth'
import { Badge } from '@/components/ui'
import { CAPABILITIES, type ApplyAllItem } from '@/lib/contracts'
import { cn } from '@/lib/utils'
import { CAPTURE_UNREVIEWED_CODE, describeCaptureRejection } from '../capture'
import {
  classifyItem,
  databaseLabel,
  describeItemRejection,
  OUTCOME_LABEL,
  OUTCOME_TONE,
} from '@/features/environments'

/**
 * Orden de lectura: primero lo que necesita acción.
 *
 * La lista es `max-h-64 overflow-auto`, así que todo lo que pase de la cuarta fila queda bajo el
 * pliegue: con 2 errores entre 28 filas OK, los dos que importan quedaban enterrados. Errores,
 * después bloqueadas, después OK.
 */
const OUTCOME_ORDER = { failed: 0, blocked: 1, forbidden: 2, ok: 3 } as const

export interface ApplyAllResultListProps {
  /** Encabezado de la línea de resumen: «Plan (sin aplicar)», «Resultado», «Progreso»… */
  title: string
  /** Bases terminadas. */
  processed: number
  /**
   * Contra qué se cuenta `processed`. En el `apply-all` síncrono son las que coincidieron con los
   * filtros (`matched_databases`); en un job, las que recorre (`planned`).
   */
  outOf: number
  /** Tope REAL del lote, ya resuelto (si se pidió por canal, la versión del canal). */
  targetVersion?: string | null
  /** Canal desde el que se resolvió el tope, si se pidió por canal. */
  channelSlug?: string | null
  results: ApplyAllItem[]
  wasDryRun: boolean
}

/**
 * Resultado por base de una aplicación masiva. Lo comparten el `apply-all` síncrono y los jobs de
 * `apply-all-jobs`, cuyo ítem es idéntico: una sola forma de leer «qué pasó en cada base».
 */
export function ApplyAllResultList({
  title,
  processed,
  outOf,
  targetVersion,
  channelSlug,
  results,
  wasDryRun,
}: ApplyAllResultListProps) {
  const canSeeCaptures = useCapabilities().can(CAPABILITIES.blueprintsCaptures)
  const items = [...results].sort(
    (a, b) => OUTCOME_ORDER[classifyItem(a)] - OUTCOME_ORDER[classifyItem(b)],
  )
  const counts = { ok: 0, blocked: 0, failed: 0, forbidden: 0 }
  for (const item of results) counts[classifyItem(item)] += 1

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {title} · {processed} de {outOf} BD(s) procesada(s)
      </p>
      {/*
        El tope REAL del lote. Con un canal es lo único que fija qué significaba «stable» al correr:
        el canal es un puntero que se mueve, y sin esto nadie sabría después hasta dónde se aplicó.
      */}
      {targetVersion && (
        <p className="text-xs text-muted-foreground">
          Tope del lote: <code>{targetVersion}</code>
          {channelSlug ? ` (el canal ${channelSlug} servía esa versión)` : ''}. Las bases que ya
          estaban por encima no se tocaron.
        </p>
      )}
      {/*
        Tres cubos, no dos. Con 6 bloqueadas y 2 falladas, ocho filas rojas idénticas obligan a
        leer ocho frases para saber cuáles necesitan acción.
      */}
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="success">{counts.ok} aplicada(s)</Badge>
        {counts.blocked > 0 && (
          <Badge tone="warning">{counts.blocked} bloqueada(s) por política</Badge>
        )}
        {counts.failed > 0 && <Badge tone="error">{counts.failed} con error</Badge>}
        {counts.forbidden > 0 && (
          <Badge tone="neutral">{counts.forbidden} sin permiso (omitida(s))</Badge>
        )}
      </p>
      <ul className="flex max-h-64 flex-col divide-y divide-border overflow-auto rounded-lg border border-border">
        {items.map((item) => {
          const outcome = classifyItem(item)
          // La versión a la que enlazar es la que REALMENTE capturó, que el backend informa
          // en `captured_versions`. Antes se adivinaba con la última aplicada: un apply
          // 0005→0010 cuya captura ocurrió en 0007 enlazaba a `…/0010/select-results`, vacío.
          // El fallback a la última aplicada cubre un backend previo al campo.
          const capturedAt = item.captured_versions?.[0] ?? item.applied?.at(-1)?.version
          return (
            <li
              key={item.managed_database_id}
              // Las falladas se resaltan además de ir primero: en un job `partial` son las únicas
              // filas que piden acción.
              className={cn('flex flex-col gap-1 p-3', outcome === 'failed' && 'bg-error/5')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {/*
                    Por acá y no `item.database_name` directo: el backend lo tipa `str | None` y
                    React renderiza `null` como vacío sin que TypeScript avise (`ReactNode` lo
                    acepta). Una fila bloqueada o fallada SIN nombre es inaccionable.
                  */}
                  {outcome === 'forbidden'
                    ? skippedBaseLabel(item.managed_database_id)
                    : databaseLabel(item)}
                </span>
                <span className="flex items-center gap-1">
                  {item.environment_slug && (
                    <Badge tone="neutral" className="shrink-0">
                      {item.environment_slug}
                    </Badge>
                  )}
                  {/*
                    "Bloqueada" va en ÁMBAR, no en rojo: acá el rojo significa "esto está roto",
                    y un rechazo por política es el sistema FUNCIONANDO. El color es lo que
                    distingue "no pasó nada, por diseño" de "algo se rompió".
                  */}
                  <Badge tone={OUTCOME_TONE[outcome]}>
                    {outcome === 'blocked' ? '🔒 ' : ''}
                    {OUTCOME_LABEL[outcome]}
                  </Badge>
                </span>
              </div>
              {item.applied && item.applied.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Aplicadas:{' '}
                  {item.applied
                    .map((a) => {
                      const resumed = a.resumed
                        ? ` (retomada desde sentencia ${a.resumed_from_statement ?? '?'})`
                        : ''
                      const failedAt =
                        a.failed_at_statement_index != null
                          ? ` (falló en sentencia ${a.failed_at_statement_index}${
                              a.statement_total != null ? ` de ${a.statement_total}` : ''
                            })`
                          : ''
                      return `${a.version}${resumed}${failedAt}`
                    })
                    .join(', ')}
                </span>
              )}
              {item.pending_versions && item.pending_versions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Pendientes: {item.pending_versions.join(', ')}
                </span>
              )}
              {/* Puente que faltaba: desde el blueprint no había forma de llegar a lo
                  capturado; solo se llegaba entrando a la ficha de cada BD. */}
              {/*
                El ENLACE se condiciona a `blueprints.captures`: ver las filas es divulgación
                (son datos reales de la base gestionada). El conteo de arriba se deja: ya viene
                en el resumen de la corrida que el usuario tiene delante, así que ocultarlo no
                protegería nada y solo confundiría.
              */}
              {item.select_results_available && capturedAt && canSeeCaptures && (
                <Link
                  to={`/managed-databases/${item.managed_database_id}/migrations/${capturedAt}/select-results`}
                  className="text-xs text-primary hover:underline"
                >
                  Ver {item.captured_select_count} resultado(s) capturado(s) →
                </Link>
              )}
              {/*
                Rechazo por política: texto propio, en ámbar, y con "no se intentó" como carga
                útil — esa es la distinción que antes no existía en ninguna forma. NO se ofrece
                reintento: `force` no es un override de esto; las salidas reales son reclasificar
                la base o separar las sentencias destructivas de la versión.
              */}
              {outcome === 'blocked' && (
                <span className="text-xs text-warning">{describeItemRejection(item)}</span>
              )}
              {/* Omitida por la capa 2: el backend no manda nombre ni entorno, solo el id. */}
              {outcome === 'forbidden' && (
                <span className="text-xs text-muted-foreground">{SKIPPED_BY_SCOPE_REASON}</span>
              )}
              {/*
                Rechazo por CAPTURA sin revisar. Llega como ítem de una respuesta 200 —el guard
                corre por BD dentro del bucle del backend—, así que nunca fue un error de la
                mutación y el `onError` del diálogo no lo veía: caía como el `item.error` crudo,
                sin decir que no se ejecutó nada ni cómo salir. Se clasifica por `error_code`,
                que es el único canal estable acá (el `public_context` de la respuesta HTTP no
                existe para un rechazo por ítem).
              */}
              {item.error_code === CAPTURE_UNREVIEWED_CODE ? (
                <span className="text-xs text-warning">
                  {describeCaptureRejection(item.unreviewed_capture ?? [])}
                </span>
              ) : (
                outcome === 'failed' &&
                item.error && <span className="text-xs text-error">{item.error}</span>
              )}
              {/* Dry-run: informativo, el plan no falla. */}
              {wasDryRun && item.blocked_by && item.blocked_by.length > 0 && (
                <span className="text-xs text-warning">
                  El apply real rechazaría: {item.blocked_by.join(', ')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

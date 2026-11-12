import { useState } from 'react'
import { Badge, Button, Callout, Input, Modal, Textarea } from '@/components/ui'
import { CapabilityHint, useCapabilityGuard, useStepUp } from '@/features/auth'
import { toApiError } from '@/lib/api/errors'
import {
  APPROVAL_REASON_MAX_LENGTH,
  APPROVAL_REASON_MIN_LENGTH,
  BATCH_ITEM_STATUS_APPROVED,
  CAPABILITIES,
  type BatchItemResult,
  type DestructiveVersion,
} from '@/lib/contracts'
import { batchKey, rowBatchKey, toBatchItem } from '../batch-selection'
import { useApproveDestructiveBatch } from '../hooks/use-destructive-approvals'
import {
  batchItemMessage,
  destructiveApprovalMessage,
  directionLabel,
  isInformationalBatchCode,
  isRetryableBatchCode,
} from '../messages'

interface ApproveDestructiveBatchDialogProps {
  modelId: number
  /** Las filas marcadas, tal como se vieron al marcarlas (su `sql_hash` es el que se firma). */
  rows: DestructiveVersion[]
  /** Con base = aprobación solo para esa base; sin base = para todo el blueprint. */
  managedDatabaseId?: number
  /** Lo que hay que re-tipear: el nombre de la base o el del blueprint. Solo de pantalla. */
  confirmWord: string
  /** Alcance de la capa 2 para la pista de permisos; sin él rige el rol base. */
  guardScope?: { serverId: number | null; environmentId: number | null }
  /** Avisa el resultado de cada petición para que la lista actualice su selección y sus marcas. */
  onResult: (results: BatchItemResult[]) => void
  onClose: () => void
}

/**
 * Aprueba varias versiones con UNA petición y muestra el resultado FILA POR FILA.
 *
 * El resultado es parcial: un ítem que falla no frena a los demás y lo aprobado queda aprobado, así
 * que un `200` no significa que todo salió bien. Por eso el diálogo no se cierra solo ni anuncia un
 * éxito genérico: queda abierto mostrando qué se aprobó y qué no, y por qué.
 *
 * El motivo es uno para todo el lote y se pide una sola vez: reintentar las filas con error
 * inesperado reusa el mismo motivo. Cada ítem manda el `sql_hash` que la persona vio al marcarlo.
 */
export function ApproveDestructiveBatchDialog({
  modelId,
  rows,
  managedDatabaseId,
  confirmWord,
  guardScope,
  onResult,
  onClose,
}: ApproveDestructiveBatchDialogProps) {
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  // Resultado más reciente por fila (un reintento pisa el de la tanda anterior).
  const [results, setResults] = useState<ReadonlyMap<string, BatchItemResult>>(new Map())
  // Filas que faltan por mandar: al inicio todas; tras un resultado, solo las reintentables.
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(
    () => new Set(rows.map(rowBatchKey)),
  )

  const approve = useApproveDestructiveBatch(modelId)
  const stepUp = useStepUp()
  const guard = useCapabilityGuard(
    CAPABILITIES.blueprintsApproveDestructive,
    'aprobar migraciones destructivas',
    { scope: guardScope },
  )

  const hasResults = results.size > 0
  const trimmedReason = reason.trim()
  const reasonValid =
    trimmedReason.length >= APPROVAL_REASON_MIN_LENGTH &&
    trimmedReason.length <= APPROVAL_REASON_MAX_LENGTH
  const typedMatches = typed === confirmWord
  const rowsToSend = rows.filter((row) => pendingKeys.has(rowBatchKey(row)))
  const canSubmit =
    guard.allowed &&
    reasonValid &&
    (hasResults || typedMatches) &&
    rowsToSend.length > 0 &&
    !approve.isPending

  const rejection = approve.isError ? toApiError(approve.error) : null
  const rejectionText = rejection
    ? (destructiveApprovalMessage(rejection.code, rejection.selfApprovalRule) ?? rejection.message)
    : null

  const approvedCount = [...results.values()].filter(
    (result) => result.status === BATCH_ITEM_STATUS_APPROVED,
  ).length
  const failedCount = [...results.values()].filter(
    (result) =>
      result.status !== BATCH_ITEM_STATUS_APPROVED && !isInformationalBatchCode(result.error?.code),
  ).length

  const scopeText =
    managedDatabaseId === undefined
      ? 'todas las bases protegidas de este blueprint (incluidas las que se creen después)'
      : 'solo esta base'

  const submit = () => {
    const items = rowsToSend.map(toBatchItem)
    stepUp.withFresh(CAPABILITIES.blueprintsApproveDestructive, () =>
      approve.mutate(
        { input: { reason: trimmedReason, items }, managedDatabaseId },
        {
          onSuccess: (batch) => {
            setResults((previous) => {
              const next = new Map(previous)
              for (const result of batch.results) {
                next.set(batchKey(result.version, result.direction), result)
              }
              return next
            })
            // Solo se reintenta lo que falló por un error inesperado: el resto exige que alguien
            // lea o decida algo antes (SQL cambiado, cuatro ojos, versión borrada…).
            setPendingKeys(
              new Set(
                batch.results
                  .filter(
                    (result) =>
                      result.status !== BATCH_ITEM_STATUS_APPROVED &&
                      isRetryableBatchCode(result.error?.code),
                  )
                  .map((result) => batchKey(result.version, result.direction)),
              ),
            )
            onResult(batch.results)
          },
        },
      ),
    )
  }

  const canRetry = hasResults && rowsToSend.length > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={`Aprobar ${rows.length} ${rows.length === 1 ? 'versión' : 'versiones'} destructivas`}
      description={`Habilita ejecutar este SQL destructivo en ${scopeText}.`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={approve.isPending}>
            {hasResults ? 'Cerrar' : 'Cancelar'}
          </Button>
          {(!hasResults || canRetry) && (
            <Button
              variant="danger"
              disabled={!canSubmit}
              isLoading={approve.isPending}
              aria-describedby={guard.describedBy}
              onClick={submit}
            >
              {hasResults
                ? `Reintentar ${rowsToSend.length} ${rowsToSend.length === 1 ? 'fallida' : 'fallidas'}`
                : `Aprobar ${rows.length}`}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {!hasResults && (
          <Callout tone="warning" title="Una sola aprobación para todo el lote">
            <p>
              Cada versión se aprueba por separado y con las mismas reglas que una aprobación
              individual: si alguna falla, las demás igual quedan aprobadas. Quien creó una versión
              o editó su SQL por última vez no puede aprobarla (cuatro ojos). Cada aprobación vale
              solo para el SQL que viste al marcarla.
            </p>
          </Callout>
        )}

        {hasResults && (
          <Callout
            tone={failedCount === 0 ? 'success' : 'warning'}
            title={`${approvedCount} de ${rows.length} aprobadas${
              failedCount > 0 ? ` · ${failedCount} con problema` : ''
            }`}
          >
            <p>
              {failedCount === 0
                ? 'Todas las versiones del lote tienen ya su aprobación.'
                : 'Lo aprobado quedó aprobado. Las filas con problema siguen marcadas en la lista; revocar un lote se hace aprobación por aprobación.'}
            </p>
          </Callout>
        )}

        <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rows.map((row) => (
            <BatchRow key={rowBatchKey(row)} row={row} result={results.get(rowBatchKey(row))} />
          ))}
        </ul>

        {!hasResults && (
          <>
            <Textarea
              label="Motivo de la aprobación (el mismo para todo el lote)"
              rows={3}
              maxLength={APPROVAL_REASON_MAX_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint={`Entre ${APPROVAL_REASON_MIN_LENGTH} y ${APPROVAL_REASON_MAX_LENGTH} caracteres. Queda en la auditoría de cada aprobación.`}
              error={
                reason !== '' && !reasonValid
                  ? `Escribí al menos ${APPROVAL_REASON_MIN_LENGTH} caracteres.`
                  : undefined
              }
            />

            <Input
              label={`Escribí «${confirmWord}» para confirmar`}
              value={typed}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              error={
                typed !== '' && !typedMatches ? `Debe ser exactamente «${confirmWord}».` : undefined
              }
              onChange={(event) => setTyped(event.target.value)}
            />
          </>
        )}

        <CapabilityHint guard={guard} />

        {rejectionText && (
          <Callout tone="danger" title="No se aprobó el lote">
            <p>{rejectionText}</p>
          </Callout>
        )}
      </div>
    </Modal>
  )
}

function BatchRow({ row, result }: { row: DestructiveVersion; result?: BatchItemResult }) {
  const failed = result !== undefined && result.status !== BATCH_ITEM_STATUS_APPROVED
  const informational = failed && isInformationalBatchCode(result.error?.code)

  return (
    <li className="flex flex-col gap-1 p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{row.version}</code>
        <span className="font-medium text-foreground">{row.name}</span>
        <Badge tone="neutral">{directionLabel(row.direction)}</Badge>
        {result === undefined ? null : !failed ? (
          <Badge tone="success">Aprobada</Badge>
        ) : informational ? (
          <Badge tone="neutral">Ya estaba aprobada</Badge>
        ) : (
          <Badge tone="error">No aprobada</Badge>
        )}
      </div>
      {failed && (
        <p className={informational ? 'text-xs text-muted-foreground' : 'text-xs text-error'}>
          {batchItemMessage(result.error?.code, result.error?.rule) ??
            result.error?.message ??
            'No se pudo aprobar esta versión.'}
        </p>
      )}
    </li>
  )
}

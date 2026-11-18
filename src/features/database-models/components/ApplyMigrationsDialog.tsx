import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { CapabilityHint, useCapabilityGuard } from '@/features/auth'
import { CAPABILITIES } from '@/lib/contracts'
import { ReleaseChannelCombobox } from '@/features/release-channels'
import {
  DestructiveConfirmDialog,
  destructiveApprovalMessage,
  requiresNewDryRun,
} from '@/features/destructive-approvals'
import {
  MIGRATION_APPLY_JOB_ALREADY_ACTIVE_CODE,
  MIGRATION_APPLY_JOB_ENQUEUE_FAILED_CODE,
  toApiError,
} from '@/lib/api/errors'
import { formatCountdown } from '@/lib/utils/countdown'
import { useCountdown } from '@/lib/utils/use-countdown'
import {
  Badge,
  Button,
  Callout,
  Combobox,
  Input,
  Modal,
  MultiCombobox,
  RadioCardGroup,
  Switch,
} from '@/components/ui'
import {
  type ApplyAllResult,
  type DestructiveConfirmation,
  type ModelDatabaseStatus,
  type OnFailureMode,
  type EnvironmentOut,
} from '@/lib/contracts'
import { useModelDatabases } from '../hooks/use-database-models'
import { useAllModelMigrations, useApplyAllMigrations } from '../hooks/use-model-migrations'
import { useLaunchApplyAllJob } from '../hooks/use-migration-apply-jobs'
import { type ApplyAllJobOptions } from '../api/model-migrations.api'
import { ApplyAllResultList } from './ApplyAllResultList'
import { MigrationApplyJobPanel } from './MigrationApplyJobPanel'
import { OnFailureSelect } from './OnFailureSelect'
import { sortVersionsAscending } from '../version-nav'
import { splitCaptureVersions } from '../capture'
import {
  blockingEnvironments,
  useEnvironmentMap,
  useSelectableEnvironments,
} from '@/features/environments'

interface ApplyMigrationsDialogProps {
  modelId: number
  modelName?: string
  open: boolean
  onClose: () => void
  /** Preselección al abrir desde una fila de la tabla de estado. */
  initialTargets?: ModelDatabaseStatus[]
}

type TargetMode = 'all' | 'selection'

/**
 * Espera tras un 429 al lanzar. El backend limita `apply-all-jobs` a 3 por minuto y no informa
 * cuánto falta, así que se espera la ventana entera: un reintento antes solo gasta otro 429.
 */
const LAUNCH_RATE_LIMIT_COOLDOWN_MS = 60_000

/**
 * Hasta qué versión se aplica. Eje ORTOGONAL a los destinos (qué bases): los tres valores son
 * excluyentes entre sí y solo viaja el que está elegido, así que el 422
 * `release_channel.target_conflict` (versión y canal a la vez) no se puede provocar desde acá.
 */
type LimitMode = 'head' | 'version' | 'channel'

const LIMIT_OPTIONS = [
  {
    value: 'head' as const,
    label: 'Hasta la última',
    hint: 'Aplica todas las versiones pendientes.',
  },
  {
    value: 'version' as const,
    label: 'Hasta una versión',
    hint: 'Aplica hasta la que elijas, inclusive.',
  },
  {
    value: 'channel' as const,
    label: 'Hasta la versión de un canal',
    hint: 'La que el canal sirve hoy para este blueprint.',
  },
]

const TARGET_OPTIONS = [
  {
    value: 'all' as const,
    label: 'Todas las BDs del blueprint',
    description: 'Hasta el máximo indicado, en orden de id.',
  },
  {
    value: 'selection' as const,
    label: 'Solo las que elija',
    description: 'Para probar en una BD antes de ir a por todas.',
  },
]

/**
 * Aplica las migraciones del blueprint a **los destinos que se elijan** (§8 + v11 §3).
 *
 * Sustituye al antiguo «Aplicar a todas», que solo permitía acotar *cuántas* BDs, nunca
 * *cuáles*: en desarrollo lo normal es probar una versión nueva contra una BD y solo después
 * ir a por el resto, y eso obligaba a salir a la ficha de esa BD.
 *
 * Sigue siendo UNA llamada: el backend acepta `database_ids`, así que elegir destinos no
 * multiplica las peticiones ni consume el rate limit por BD.
 *
 * El dry-run sigue siendo el `apply-all` síncrono (es el que emite el `confirm_token`), pero la
 * ejecución real se lanza como job en background (`apply-all-jobs`): con muchas bases el request
 * síncrono superaba los timeouts del proxy y el operador no veía el avance.
 */
export function ApplyMigrationsDialog({
  modelId,
  modelName,
  open,
  onClose,
  initialTargets,
}: ApplyMigrationsDialogProps) {
  const [mode, setMode] = useState<TargetMode>(initialTargets?.length ? 'selection' : 'all')
  const [targets, setTargets] = useState<ModelDatabaseStatus[]>(initialTargets ?? [])
  const [maxDatabases, setMaxDatabases] = useState(10)
  const [force, setForce] = useState(false)
  const [onFailure, setOnFailure] = useState<OnFailureMode>('auto')
  const [environment, setEnvironment] = useState<EnvironmentOut | null>(null)
  const [result, setResult] = useState<ApplyAllResult | null>(null)
  const [limitMode, setLimitMode] = useState<LimitMode>('head')
  const [limitVersion, setLimitVersion] = useState<string | null>(null)
  const [limitChannelSlug, setLimitChannelSlug] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [jobId, setJobId] = useState<number | null>(null)
  /** El job que se muestra es uno que YA estaba en curso (409), no el que se intentó lanzar. */
  const [followingActiveJob, setFollowingActiveJob] = useState(false)
  /**
   * Parámetros del último lanzamiento, para «Relanzar» un job interrumpido con el MISMO alcance.
   * Se guardan sin token ni frase: son de un solo uso y ya se consumieron.
   */
  const [lastLaunch, setLastLaunch] = useState<ApplyAllJobOptions | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null)
  const cooldownMs = useCountdown(cooldownUntil)
  const cooldownReasonId = useId()

  const applyAll = useApplyAllMigrations(modelId)
  const launchJob = useLaunchApplyAllJob(modelId)
  // `apply-all` es `blueprints.apply`, también en dry-run: es el mismo endpoint.
  const applyGuard = useCapabilityGuard(CAPABILITIES.blueprintsApply, 'aplicar versiones')
  // Catálogo COMPLETO, no una página: este aviso no lista versiones, las CALCULA. Con una sola
  // página, un blueprint con más versiones que el tope producía un «van a capturar estas» y un
  // «estas están bloqueadas por review» incompletos, sin ninguna señal de que lo estaban —y el
  // apply masivo sí las mira todas, así que el aviso contradecía lo que iba a pasar.
  const migrations = useAllModelMigrations(modelId, open)
  // Misma respuesta que alimenta la pestaña de estado: no es una llamada extra.
  const databases = useModelDatabases(modelId, open)
  const environments = useSelectableEnvironments()
  const environmentMap = useEnvironmentMap()
  // Del más reciente al más antiguo: lo habitual es acotar hacia abajo desde la punta.
  const limitVersions = sortVersionsAscending(migrations.data?.items ?? [])
    .reverse()
    .map((item) => item.version)

  // Predicado COMPARTIDO con la ficha de la BD (`features/database-models/capture`). Vivía
  // duplicado y las dos copias divergieron en el borde de `reviewed === undefined`.
  const { willCapture, blockedByReview } = splitCaptureVersions(migrations.data?.items ?? [])
  // El helper corta en su tope de páginas ante un historial anormalmente largo. Si eso pasa, se
  // dice: el cálculo de arriba vuelve a ser parcial y callarlo sería repetir el fallo original.
  const catalogTruncated = migrations.data?.truncated ?? false

  const handleClose = () => {
    setResult(null)
    setJobId(null)
    setFollowingActiveJob(false)
    onClose()
  }

  const launch = (options: ApplyAllJobOptions) => {
    launchJob.mutate(options, {
      onSuccess: (job) => {
        setConfirming(false)
        // El plan ya se consumió: lo que importa ahora es el avance del job.
        setResult(null)
        setFollowingActiveJob(false)
        setLastLaunch({ ...options, confirmToken: undefined, confirmPhrase: undefined })
        setJobId(job.id)
      },
      onError: (error) => {
        setConfirming(false)
        const apiError = toApiError(error)
        const activeJobId = apiError.migrationApplyJobContext?.activeJobId
        if (apiError.code === MIGRATION_APPLY_JOB_ALREADY_ACTIVE_CODE && activeJobId) {
          setFollowingActiveJob(true)
          setJobId(activeJobId)
          return
        }
        if (apiError.isRateLimited) {
          setCooldownUntil(new Date(Date.now() + LAUNCH_RATE_LIMIT_COOLDOWN_MS).toISOString())
        }
      },
    })
  }

  const run = (dryRun: boolean, confirmation?: { token: string; phrase: string }) => {
    // Planificar de nuevo descarta el resultado anterior: su token (y su plan) ya no valen.
    if (dryRun) setResult(null)
    const options: ApplyAllJobOptions = {
      // Las guardas van ACÁ y no en el JSX: ocultar un control no impide que su valor viaje.
      // `maxDatabases` ya se mandaba incondicionalmente incluso en modo `selection`, y copiar
      // ese patrón habría mandado `environmentId` junto a `databaseIds`.
      maxDatabases: mode === 'all' ? maxDatabases : undefined,
      environmentId: mode === 'all' ? (environment?.id ?? undefined) : undefined,
      databaseIds: mode === 'selection' ? targets.map((t) => t.id) : undefined,
      force,
      onFailure,
      // Solo viaja el tope elegido: ocultar un control no impide que su valor viaje.
      targetVersion: limitMode === 'version' ? (limitVersion ?? undefined) : undefined,
      channel: limitMode === 'channel' ? (limitChannelSlug ?? undefined) : undefined,
      // Solo en la ejecución confirmada: el token es del dry-run que la precede.
      confirmToken: confirmation?.token,
      confirmPhrase: confirmation?.phrase,
    }
    if (!dryRun) {
      launch(options)
      return
    }
    applyAll.mutate(
      { ...options, dryRun: true },
      {
        onSuccess: (data) => setResult(data),
      },
    )
  }

  /**
   * Rechazo del flujo de aprobación en la ÚLTIMA llamada (token vencido, falta de permiso, lote en
   * dos entornos…). Se pinta acá y no solo en el toast: con el toast solo, quien tarda en leer
   * queda sin saber que tiene que volver a planificar.
   */
  const launchError = launchJob.isError ? toApiError(launchJob.error) : null
  const dryRunError = applyAll.isError ? toApiError(applyAll.error) : null
  const rejection = launchError ?? dryRunError
  const rejectionText = rejection
    ? destructiveApprovalMessage(rejection.code, rejection.selfApprovalRule)
    : null

  const enqueueFailedJobId =
    launchError?.code === MIGRATION_APPLY_JOB_ENQUEUE_FAILED_CODE
      ? launchError.migrationApplyJobContext?.jobId
      : undefined
  const isBusy = applyAll.isPending || launchJob.isPending
  const coolingDown = cooldownMs > 0
  const cooldownReason = coolingDown
    ? `Límite de lanzamientos alcanzado: esperá ${formatCountdown(cooldownMs)}.`
    : null

  const nothingSelected =
    (mode === 'selection' && targets.length === 0) ||
    (limitMode === 'version' && limitVersion === null) ||
    (limitMode === 'channel' && limitChannelSlug === null)

  /**
   * Aviso derivado de los DESTINOS, no del control.
   *
   * En modo `selection` los destinos se conocen en cliente (`ModelDatabaseStatus` hereda
   * `environment_id` del schema compartido), así que se puede ser preciso. En modo `all` sin
   * filtro **no se finge precisión**: el lote puede alcanzar cualquier entorno y la única forma
   * de saber cuáles es el dry-run.
   */
  const warning = (() => {
    const blocking = blockingEnvironments(environments.selectable)
    if (blocking.length === 0) return null

    if (mode === 'selection') {
      const hits = targets.filter((t) => {
        const env = t.environment_id != null ? environmentMap.byId.get(t.environment_id) : undefined
        return env?.blocks_destructive_migrations
      })
      if (hits.length === 0) return null
      const names = [
        ...new Set(
          hits.map((t) => environmentMap.byId.get(t.environment_id as number)?.name ?? '—'),
        ),
      ]
      return {
        title: `Este lote alcanza ${hits.length} BD(s) de ${names.join(', ')}.`,
        detail:
          'Ese entorno bloquea las migraciones destructivas: si alguna versión pendiente las ' +
          'contiene, el servidor va a rechazarla y no se va a ejecutar ningún DDL en esa base.',
      }
    }

    if (environment) {
      if (!environment.blocks_destructive_migrations) return null
      return {
        title: `El lote está acotado a ${environment.name}, que bloquea las migraciones destructivas.`,
        detail:
          'Las versiones con DROP / TRUNCATE / DELETE sin WHERE / ALTER DROP COLUMN se van a ' +
          'rechazar por política. "Forzar" no habilita esto.',
      }
    }

    return {
      title: 'El lote puede alcanzar cualquier entorno, incluidos los que bloquean destructivas.',
      detail: `Corré el dry-run para ver a cuáles llega (${blocking
        .map((e) => e.name)
        .join(', ')} bloquea${blocking.length > 1 ? 'n' : ''} las migraciones destructivas).`,
    }
  })()

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Aplicar migraciones"
      description={modelName ? `Aplica las versiones pendientes de «${modelName}».` : undefined}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <RadioCardGroup
          title="Destinos"
          options={TARGET_OPTIONS}
          value={mode}
          onChange={setMode}
          columns={2}
        />

        {mode === 'selection' && (
          <MultiCombobox<ModelDatabaseStatus>
            label="BDs destino"
            items={databases.data ?? []}
            selectedItems={targets}
            onChange={setTargets}
            itemToString={(db) => db.name}
            itemToKey={(db) => db.id}
            renderItem={(db) => (
              <span className="flex w-full items-center gap-2">
                <span className="truncate">{db.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <Badge tone={db.pending_count > 0 ? 'warning' : 'success'}>
                    {db.pending_count} pendiente(s)
                  </Badge>
                  {db.has_partial_application && <Badge tone="error">parcial</Badge>}
                </span>
              </span>
            )}
            placeholder="Añadir BD…"
          />
        )}

        <RadioCardGroup
          title="Hasta qué versión"
          options={LIMIT_OPTIONS}
          value={limitMode}
          onChange={setLimitMode}
          columns={3}
          name="apply-all-limit"
        />

        {limitMode === 'version' && (
          <Combobox<string>
            items={limitVersions}
            value={limitVersion}
            onChange={setLimitVersion}
            itemToString={(version) => version}
            itemToKey={(version) => version}
            label="Versión tope"
            placeholder="Elegí una versión"
            isLoading={migrations.isLoading}
            hint="Las bases que ya están por encima de esta versión no se tocan ni retroceden."
          />
        )}

        {limitMode === 'channel' && (
          <ReleaseChannelCombobox
            value={limitChannelSlug}
            onChange={setLimitChannelSlug}
            enabled={open}
            hint="La versión se resuelve desde el puntero del canal al ejecutar. Si el canal no tiene versión, no se aplica nada: no cae a «la última». Las bases por encima de ella no retroceden."
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'all' && (
            <Input
              label="Máx. BDs por llamada"
              type="number"
              min={1}
              max={100}
              value={maxDatabases}
              onChange={(event) => setMaxDatabases(Number(event.target.value))}
              hint="1–100. Se procesan en background, de a una."
            />
          )}
          {/*
            El entorno NO es un tercer modo del selector de destinos: es un eje ORTOGONAL que
            acota `all`. De ahí que viva acá, junto al tope, y no en el `RadioCardGroup`.
          */}
          {mode === 'all' && (
            <Combobox<EnvironmentOut>
              items={environments.selectable}
              value={environment}
              onChange={setEnvironment}
              itemToString={(e) =>
                e.blocks_destructive_migrations ? `${e.name} · bloquea destructivas` : e.name
              }
              itemToKey={(e) => e.id}
              label="Entorno (opcional)"
              placeholder="Todos los entornos"
              isLoading={environments.isLoading}
              hint="El filtro se aplica ANTES del tope, así que el máximo no se gasta en otros entornos."
              clearable
            />
          )}
          <div className="flex items-end">
            <Switch
              checked={force}
              onCheckedChange={setForce}
              label="Forzar"
              hint="Override de cuarentena en cada BD."
            />
          </div>
        </div>

        <div className="max-w-sm">
          <OnFailureSelect value={onFailure} onChange={setOnFailure} />
        </div>

        {/* AVISO, no control. Acá había un interruptor de consentimiento por corrida; se
            retiró (contrato v13 §1) porque con un solo admin no aportaba una decisión nueva
            —`reviewed` ya aprueba la consulta concreta— y no dejaba rastro en la auditoría,
            mientras que un click de más en cada corrida entrena el «siempre que sí». Lo que sí
            hacía falta es que se lea QUÉ está en juego, y eso se conserva. */}
        {willCapture.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Este lote va a capturar resultados.</strong> Las
              versiones <strong>{willCapture.join(', ')}</strong> guardan en el gateway el resultado
              de sus SELECT: filas de <strong>cada BD alcanzada</strong>, cifradas. Solo se conserva
              la corrida más reciente por BD y versión, y caduca sola; podrás verlas o purgarlas
              desde cada BD al terminar.
            </p>
          </div>
        )}

        {/* Distinto del anterior: esto NO va a pasar, va a ser rechazado. Se avisa antes de
            gastar una corrida y descubrirlo ítem por ítem. */}
        {blockedByReview.length > 0 && (
          <div className="rounded-lg border border-error/40 bg-error/5 p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">
                Captura sin aprobar: {blockedByReview.join(', ')}
              </strong>{' '}
              — el backend va a rechazar (409) cada BD que tenga esas versiones pendientes. Revisá
              qué consultan y aprobalas antes de aplicar: el aviso «sin revisar» de la pantalla del
              blueprint las lista y lleva a cada una.
            </p>
          </div>
        )}

        {/* Los dos avisos de arriba se calculan sobre el catálogo. Si no se pudo cargar entero,
            son parciales, y decirlo es el punto: un aviso incompleto que se presenta como
            completo es peor que no tenerlo. */}
        {catalogTruncated && (
          <Callout tone="warning" title="Catálogo de versiones incompleto">
            <p>
              El blueprint tiene más versiones de las que se pudieron cargar, así que los avisos de
              captura de arriba pueden estar dejando alguna fuera. El apply sí las considera todas.
            </p>
          </Callout>
        )}

        {/*
          BANDA PERSISTENTE, no un `hint`. Tres motivos: (a) un `hint` viviría en un control que
          NO existe en modo `selection` —que es justamente el camino para aplicar a UNA base
          productiva—; (b) el peligro son los destinos resueltos, no el filtro; y (c) la regla del
          repo ya está escrita en `Callout`: "va como banda y no como tooltip a propósito, porque
          un tooltip se descubre por accidente y esto tiene que leerse antes de decidir".
        */}
        {warning && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
            <p className="font-medium text-foreground">⚠️ {warning.title}</p>
            <p className="mt-1 text-muted-foreground">{warning.detail}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            isLoading={applyAll.isPending}
            disabled={nothingSelected || !applyGuard.allowed || isBusy}
            aria-describedby={applyGuard.describedBy}
            onClick={() => run(true)}
          >
            Previsualizar (dry-run)
          </Button>
          <Button
            isLoading={launchJob.isPending}
            disabled={nothingSelected || !applyGuard.allowed || isBusy || coolingDown}
            aria-describedby={
              [applyGuard.describedBy, coolingDown ? cooldownReasonId : undefined]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onClick={() => run(false)}
          >
            {mode === 'selection' ? `Aplicar a ${targets.length} BD(s) 🔌` : 'Aplicar a todas 🔌'}
          </Button>
          <CapabilityHint guard={applyGuard} className="basis-full" />
          {cooldownReason && (
            <p id={cooldownReasonId} className="basis-full text-xs text-muted-foreground">
              {cooldownReason}
            </p>
          )}
        </div>

        {enqueueFailedJobId !== undefined && (
          <Callout tone="danger" title="No se pudo encolar la aplicación masiva">
            <p>
              El servidor registró la ejecución #{enqueueFailedJobId} como fallida y no tocó ninguna
              base. No bloquea nuevos lanzamientos: podés volver a intentarlo.
            </p>
          </Callout>
        )}

        {rejectionText && (
          <Callout
            tone="danger"
            title={
              requiresNewDryRun(rejection?.code)
                ? 'Hay que volver a planificar'
                : 'No se ejecutó el lote'
            }
          >
            <p>{rejectionText}</p>
          </Callout>
        )}

        {result?.destructive_confirmation && (
          <DestructiveBatchPlan
            confirmation={result.destructive_confirmation}
            isBusy={isBusy}
            onConfirm={() => setConfirming(true)}
          />
        )}

        {result && (
          <ApplyAllResultList
            title="Plan (sin aplicar)"
            processed={result.processed}
            outOf={result.matched_databases || result.total_databases}
            targetVersion={result.target_version}
            channelSlug={result.resolved_channel?.slug}
            results={result.results}
            wasDryRun
          />
        )}

        {jobId !== null && (
          <div className="flex flex-col gap-2">
            {followingActiveJob && (
              <Callout tone="info" title="Ya había una aplicación masiva en curso">
                <p>
                  El blueprint admite una sola a la vez, así que no se lanzó otra: abajo se sigue la
                  que estaba corriendo.
                </p>
              </Callout>
            )}
            <MigrationApplyJobPanel
              modelId={modelId}
              jobId={jobId}
              onRelaunch={lastLaunch && !followingActiveJob ? () => launch(lastLaunch) : undefined}
              isRelaunching={launchJob.isPending}
              relaunchDisabledReason={cooldownReason}
            />
            <Link
              to={`?tab=ejecuciones&job=${jobId}`}
              onClick={handleClose}
              className="self-start text-xs font-medium text-primary hover:underline"
            >
              Ver en el historial de ejecuciones
            </Link>
          </div>
        )}
      </div>

      {confirming && result?.destructive_confirmation?.environment_slug && (
        <DestructiveConfirmDialog
          title="Aplicar migraciones destructivas al lote"
          description={`Se va a ejecutar SQL destructivo en las bases de «${result.destructive_confirmation.environment_slug}». No se puede deshacer.`}
          confirmWord={result.destructive_confirmation.environment_slug}
          confirmLabel="Aplicar el lote"
          isLoading={launchJob.isPending}
          onConfirm={() => {
            const confirmation = result.destructive_confirmation
            if (!confirmation?.confirm_token || !confirmation.environment_slug) return
            run(false, { token: confirmation.confirm_token, phrase: confirmation.environment_slug })
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </Modal>
  )
}

interface DestructiveBatchPlanProps {
  confirmation: DestructiveConfirmation
  isBusy: boolean
  onConfirm: () => void
}

/**
 * Qué falta para ejecutar un lote que toca entornos protegidos con SQL destructivo.
 *
 * El lote es TODO O NADA para las bases protegidas: si una sola tiene una versión sin aprobar, no
 * se ejecuta ninguna. Y el token es UNO para el lote entero y se re-tipea el slug del entorno, no
 * un nombre de base; por eso un lote que alcanza dos entornos protegidos no tiene token y hay que
 * acotarlo a uno.
 */
function DestructiveBatchPlan({ confirmation, isBusy, onConfirm }: DestructiveBatchPlanProps) {
  const multiEnvironment = confirmation.environment_slugs.length > 1
  const hasUnapproved = !confirmation.all_approved
  const canConfirm =
    !multiEnvironment &&
    !hasUnapproved &&
    confirmation.executor_allowed &&
    Boolean(confirmation.confirm_token) &&
    Boolean(confirmation.environment_slug)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/50 bg-warning/5 p-3">
      <p className="text-sm font-medium text-foreground">
        Plan destructivo del lote
        {confirmation.environment_slugs.length > 0 && (
          <> · entorno(s): {confirmation.environment_slugs.join(', ')}</>
        )}
      </p>

      {multiEnvironment && (
        <Callout tone="warning" title="El lote alcanza más de un entorno protegido">
          <p>
            Un lote destructivo se confirma contra UN solo entorno. Elegí el entorno en el filtro
            «Entorno (opcional)» y volvé a planificar.
          </p>
        </Callout>
      )}

      {hasUnapproved && (
        <Callout tone="warning" title="Faltan aprobaciones: no se ejecuta ninguna base protegida">
          <p>Estas bases tienen versiones destructivas sin aprobar:</p>
          <ul className="mt-1 list-disc pl-5">
            {confirmation.unapproved_databases.map((database) => (
              <li key={database.managed_database_id}>
                <Link
                  to={`/managed-databases/${database.managed_database_id}/migrations`}
                  className="font-medium text-primary hover:underline"
                >
                  Base #{database.managed_database_id}
                </Link>
                : {database.versions.join(', ')}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Una segunda persona las aprueba desde la pestaña «Aprobaciones» del blueprint (para
            todas las bases) o desde la ficha de cada base.
          </p>
        </Callout>
      )}

      {!hasUnapproved && !confirmation.executor_allowed && (
        <Callout tone="warning" title="No podés ejecutar este lote">
          <p>
            Está aprobado, pero ejecutarlo pide <code>blueprints.apply_destructive</code> en cada
            base protegida y una sesión de persona. Pedile a un owner que lo ejecute.
          </p>
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="danger" size="sm" disabled={!canConfirm || isBusy} onClick={onConfirm}>
          Aplicar con confirmación…
        </Button>
        <span className="text-xs text-muted-foreground">
          La confirmación vale 5 minutos desde que planificaste.
        </span>
      </div>
    </div>
  )
}

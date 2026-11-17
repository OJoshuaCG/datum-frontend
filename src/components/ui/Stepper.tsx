import { cn } from '@/lib/utils'

export interface StepperStep<Key extends string = string> {
  key: Key
  label: string
}

interface StepperProps<Key extends string> {
  steps: readonly StepperStep<Key>[]
  /** Posición de la etapa actual. Fuera de rango por arriba = todas completas; -1 = ninguna. */
  activeIndex: number
  /**
   * Si las etapas ya completadas se pueden volver a abrir. Cada asistente lo apaga en su paso
   * terminal (monitor/resultado): ahí el plan ya se consumió y volver atrás ofrecería editar algo
   * que no se puede reenviar.
   */
  canJumpBack: boolean
  onJump: (key: Key) => void
}

/**
 * Indicador de pasos de los asistentes. Estaba copiado en cinco asistentes con el mismo marcado y
 * solo cambiaba de dónde salían las etapas; aquí queda una sola copia. Cada asistente decide QUÉ
 * etapas muestra (a partir de su `order`) y cuándo se puede saltar; este componente solo pinta.
 * La etapa actual se resalta, las completadas son navegables hacia atrás y las futuras quedan
 * inertes.
 */
export function Stepper<Key extends string>({
  steps,
  activeIndex,
  canJumpBack,
  onJump,
}: StepperProps<Key>) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Pasos">
      {steps.map((step, index) => {
        const isCurrent = index === activeIndex
        const isDone = index < activeIndex
        const canJump = isDone && canJumpBack
        return (
          <li key={step.key} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canJump}
              onClick={() => canJump && onJump(step.key)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 font-medium transition-colors',
                isCurrent && 'bg-primary text-primary-foreground',
                isDone && 'text-success hover:bg-primary/10',
                !isCurrent && !isDone && 'text-muted-foreground',
                !canJump && 'cursor-default',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                  isCurrent && 'border-primary-foreground',
                  isDone && 'border-success',
                  !isCurrent && !isDone && 'border-border',
                )}
              >
                {isDone ? '✓' : index + 1}
              </span>
              {step.label}
            </button>
            {index < steps.length - 1 && (
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

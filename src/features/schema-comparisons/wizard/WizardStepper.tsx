import { Stepper } from '@/components/ui'
import {
  WIZARD_STAGES,
  type SchemaComparisonWizard,
  type WizardStep,
} from './use-schema-comparison-wizard'

/**
 * Indicador de pasos del asistente. Las etapas ya completadas son navegables hacia atrás; la
 * actual se resalta; las futuras quedan inertes. `items` y las 4 vistas de acción se agrupan
 * bajo las etapas "Resumen"/"Acción" respectivamente (mismo técnica que el asistente de snapshot
 * agrupa su paso `manual` bajo "Versionado").
 */
export function WizardStepper({ wizard }: { wizard: SchemaComparisonWizard }) {
  const activeIndex = wizard.step === 'result' ? WIZARD_STAGES.length : wizard.stageIndex

  // Una etapa agrupa varias vistas: «Acción» vuelve a la vista de acción por la que se entró.
  const jumpTargetOf = (stageKey: string): WizardStep =>
    stageKey === 'selector'
      ? 'selector'
      : stageKey === 'summary'
        ? 'summary'
        : (wizard.actionEntryStep ?? 'summary')

  return (
    <Stepper
      steps={WIZARD_STAGES}
      activeIndex={activeIndex}
      canJumpBack={wizard.step !== 'result'}
      onJump={(stageKey) => wizard.goToStep(jumpTargetOf(stageKey))}
    />
  )
}

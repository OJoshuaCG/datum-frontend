import { Stepper } from '@/components/ui'
import { WIZARD_STAGES, type SnapshotWizard } from './use-snapshot-wizard'

/**
 * Indicador de pasos del asistente. Las etapas ya completadas son navegables hacia atrás; la
 * actual se resalta; las futuras quedan inertes. En `result` todas se muestran como completas.
 */
export function WizardStepper({ wizard }: { wizard: SnapshotWizard }) {
  const activeIndex = wizard.step === 'result' ? WIZARD_STAGES.length : wizard.stageIndex

  return (
    <Stepper
      steps={WIZARD_STAGES}
      activeIndex={activeIndex}
      canJumpBack={wizard.step !== 'result'}
      onJump={wizard.goToStep}
    />
  )
}

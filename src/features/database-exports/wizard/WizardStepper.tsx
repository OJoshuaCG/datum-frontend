import { Stepper } from '@/components/ui'
import type { DatabaseExportWizard, ExportWizardStep } from './use-database-export-wizard'

const STEP_LABELS: Partial<Record<ExportWizardStep, string>> = {
  origin: 'Origen y formato',
  objects: 'Qué exportar',
  options: 'Opciones',
  confirm: 'Confirmar',
}

/**
 * Indicador de pasos del asistente. Las etapas se derivan de `wizard.order` —la única fuente de
 * verdad del orden— y no de una lista escrita acá: si el hook cambia el recorrido, el indicador lo
 * sigue sin tocar este archivo. Se filtra `monitor` porque no es una etapa del formulario sino el
 * desenlace del job.
 *
 * Solo los pasos ya completados son clicables, y **nunca desde el monitor**: llegar ahí significa
 * que el plan ya se consumió (un plan es de un solo uso), así que volver atrás ofrecería editar una
 * configuración que ya no se puede reenviar.
 */
export function WizardStepper({ wizard }: { wizard: DatabaseExportWizard }) {
  const stages: ExportWizardStep[] = wizard.order.filter((step) => step !== 'monitor')

  return (
    <Stepper
      steps={stages.map((key) => ({ key, label: STEP_LABELS[key] ?? key }))}
      activeIndex={stages.indexOf(wizard.step)}
      canJumpBack={wizard.step !== 'monitor'}
      onJump={wizard.goToStep}
    />
  )
}

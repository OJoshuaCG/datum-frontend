import { Stepper } from '@/components/ui'
import type { DatabaseCloneWizard, WizardStep } from './use-database-clone-wizard'

const STAGE_LABELS: Partial<Record<WizardStep, string>> = {
  plan: 'Plan',
  selection: 'Selección',
  preview: 'Vista previa',
  monitor: 'Monitor',
}

/**
 * Indicador de pasos del asistente. Deriva las etapas mostradas de `wizard.order` (filtrando
 * `summary`, una pantalla de tránsito, no una etapa del flujo) en vez de una lista fija: `order`
 * ya excluye `selection` para un clon COMPLETO (nunca se visita), así que el indicador nunca la
 * marca como "completada"/navegable para un plan que nunca pasó por ahí — evitar eso importa
 * porque saltar a esa vista permitiría sobrescribir `finalSelectionPlan` (que debía quedar en
 * `kind: 'full'`) con una selección parcial no pedida. Los pasos ya visitados son
 * navegables hacia atrás; el monitor, una vez alcanzado, es terminal.
 */
export function WizardStepper({ wizard }: { wizard: DatabaseCloneWizard }) {
  const stages: WizardStep[] = wizard.order.filter((step) => step !== 'summary')

  return (
    <Stepper
      steps={stages.map((key) => ({ key, label: STAGE_LABELS[key] ?? key }))}
      activeIndex={stages.indexOf(wizard.step)}
      canJumpBack={wizard.step !== 'monitor'}
      onJump={wizard.goToStep}
    />
  )
}

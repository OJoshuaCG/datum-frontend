import { Stepper } from '@/components/ui'
import type {
  CollationConversionWizard,
  CollationConversionWizardStep,
} from './use-collation-conversion-wizard'

const STAGE_LABELS: Partial<Record<CollationConversionWizardStep, string>> = {
  plan: 'Objetivo',
  inventory: 'Inventario',
  preview: 'Vista previa',
  monitor: 'Monitor',
}

/**
 * Indicador de pasos del asistente. Deriva las etapas mostradas de `wizard.order` (filtrando
 * `summary`, una pantalla de tránsito de reentrada, no una etapa del flujo) en vez de una lista
 * fija. Los pasos ya visitados son navegables hacia atrás; una vez alcanzado el monitor, todo
 * queda bloqueado (es terminal: la conversión ya se disparó).
 */
export function WizardStepper({ wizard }: { wizard: CollationConversionWizard }) {
  const stages: CollationConversionWizardStep[] = wizard.order.filter((step) => step !== 'summary')

  return (
    <Stepper
      steps={stages.map((key) => ({ key, label: STAGE_LABELS[key] ?? key }))}
      activeIndex={stages.indexOf(wizard.step)}
      canJumpBack={wizard.step !== 'monitor'}
      onJump={wizard.goToStep}
    />
  )
}

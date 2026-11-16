import type { Scenario, TierOutlook } from '../../Shared/taskAggregations'

/** Semana de domingo a sábado. Dois cenários: delivered (só concluídas) e forecast (+ em aberto, só na corrente). */
export type GetWeeklyProgressResponseModel = {
  start: string
  end: string
  period: 'past' | 'current' | 'future'
  /** início das semanas vizinhas, para navegar */
  previousWeek: string
  nextWeek: string
  goalHours: number
  /** meta de 100% até o fim de hoje: dias úteis da semana até hoje (inclusive) × HOURS_PER_DAY */
  targetByEndOfToday: number
  workingDays: number
  /** dias úteis de hoje (inclusive) até sábado */
  remainingWorkdays: number
  doneHours: number
  openHours: number
  forecastHours: number
  delivered: Scenario<TierOutlook>
  forecast: Scenario<TierOutlook>
}

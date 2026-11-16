import { hours } from '../format'

type Tier = { percent: number; hours: number }

type Props = {
  value: number
  tiers: Tier[]
  /** meta de 100% até o fim de hoje (conta hoje); só no período corrente */
  expected?: number
  onDark?: boolean
}

/** Barra de progresso com marcadores em cada faixa de meta (ex.: 100% e 125%) e, opcional, a meta até o fim de hoje. */
export function TierBar({ value, tiers, expected, onDark = false }: Props) {
  const max = Math.max(value, ...tiers.map((t) => t.hours), 1)
  const ratio = (n: number) => Math.min(1, n / max)
  const pct = (n: number) => `${ratio(n) * 100}%`
  const first = tiers[0]?.hours ?? 0
  const tone = onDark || (first > 0 && value >= first) ? 'bg-success' : 'bg-dark'
  const showToday = expected !== undefined && expected > 0
  // Rótulo de "hoje" centrado no traço, mas preso às bordas para não sair da barra.
  const todayAlign = showToday ? (ratio(expected) < 0.1 ? 'start' : ratio(expected) > 0.9 ? 'end' : 'center') : 'center'

  return (
    <div className={`tier-bar mt-3 ${onDark ? 'on-dark' : ''} ${showToday ? 'has-today' : ''}`}>
      <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={`progress-bar ${tone}`} style={{ width: pct(value) }} />
      </div>
      {tiers.map((t) => (
        <div key={t.percent} className={`tier-marker ${value >= t.hours && t.hours > 0 ? 'reached' : ''}`} style={{ left: pct(t.hours) }}>
          <span>
            {t.percent}%<span className="d-none d-sm-inline"> · {hours(t.hours)}</span>
          </span>
        </div>
      ))}
      {showToday && (
        <div
          className={`today-marker align-${todayAlign} ${value >= expected ? 'reached' : ''}`}
          style={{ left: pct(expected) }}
          title={`Meta até o fim de hoje (100%): ${hours(expected)}`}
        >
          <span>hoje · {hours(expected)}</span>
        </div>
      )}
    </div>
  )
}

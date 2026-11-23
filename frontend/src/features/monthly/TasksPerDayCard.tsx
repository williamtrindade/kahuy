import type { MonthlyProgressViewModel } from '../../api/client'
import { decimal } from '../../format'

/** Média de tasks concluídas por dia útil do mês, até hoje (inclusive). */
export function TasksPerDayCard({ data }: { data: MonthlyProgressViewModel }) {
  const { tasksPerWorkday, doneTaskCount, elapsedWorkingDays, period } = data

  return (
    <div className="card">
      <div className="card-body">
        <div className="label mb-2">Tasks por dia</div>
        {tasksPerWorkday === null ? (
          <p className="small text-secondary mb-0">
            {period === 'future' ? 'O mês ainda não começou.' : 'Aparece a partir do primeiro dia útil do mês.'}
          </p>
        ) : (
          <>
            <div className="metric">
              {decimal(tasksPerWorkday)} <small>{tasksPerWorkday === 1 ? 'task' : 'tasks'} /dia útil</small>
            </div>
            <div className="small text-secondary">
              {doneTaskCount} {doneTaskCount === 1 ? 'task concluída' : 'tasks concluídas'} em {elapsedWorkingDays}{' '}
              {elapsedWorkingDays === 1 ? 'dia útil' : 'dias úteis'}
              {period === 'current' ? ' até hoje' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

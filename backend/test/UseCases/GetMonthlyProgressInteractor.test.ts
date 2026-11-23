import { describe, expect, it } from 'vitest'
import { DomainError } from '../../src/Entities/DomainError'
import type { Task } from '../../src/Entities/Task'
import type { InvalidTask } from '../../src/UseCases/Contracts/TaskRepositoryInterface'
import { GetMonthlyProgressInteractor } from '../../src/UseCases/GetMonthlyProgress/GetMonthlyProgressInteractor'
import type { GetMonthlyProgressRequestModel } from '../../src/UseCases/GetMonthlyProgress/DTOs/GetMonthlyProgressRequestModel'
import type { GetMonthlyProgressResponseModel } from '../../src/UseCases/GetMonthlyProgress/DTOs/GetMonthlyProgressResponseModel'
import { CapturingPresenter, FixedCalendar, FixedClock, InMemoryTaskRepository, makeTask, novemberTasks } from '../support/fakes'

const settings = { doneStatuses: ['Concluido'], timeZone: 'America/Sao_Paulo', goalTiers: [100, 125], testTypes: ['TESTE'] }

async function run(
  request: GetMonthlyProgressRequestModel,
  opts: { tasks?: Task[]; invalid?: InvalidTask[]; days?: Record<string, number>; now?: string; holidays?: Record<string, string>; vacations?: Record<string, string> } = {},
): Promise<GetMonthlyProgressResponseModel> {
  const interactor = new GetMonthlyProgressInteractor(
    new InMemoryTaskRepository(opts.tasks ?? novemberTasks(), opts.invalid),
    new FixedCalendar(opts.days ?? { '2026-11': 19 }, 8, opts.holidays, opts.vacations),
    new FixedClock(opts.now ?? '2026-11-05T15:00:00Z'),
    settings,
  )
  const presenter = new CapturingPresenter<GetMonthlyProgressResponseModel>()
  await interactor.execute(request, presenter)
  return presenter.response!
}

describe('GetMonthlyProgressInteractor', () => {
  it('computes the current month', async () => {
    const r = await run({})
    expect(r.month).toBe('2026-11')
    expect(r.isCurrent).toBe(true)
    expect(r.goalHours).toBe(152)
    expect(r.goalEstimated).toBe(false)
    expect(r.workingDays).toBe(19)
    expect(r.doneHours).toBe(5)
    expect(r.openHours).toBe(6)
    expect(r.forecastHours).toBe(11)
    expect(r.remainingWorkingDays).toBe(18)
    expect(r.delivered.hours).toBe(5)
    expect(r.delivered.tiers[0]!.remainingHours).toBe(147)
    expect(r.delivered.tiers[0]!.requiredPerDay).toBeCloseTo(147 / 18)
  })

  it('gives the target by the end of today (100%), counting today when it is a workday', async () => {
    // qui 05/11: seg 02 a qui 05 = 4 dos 21 dias úteis calculados
    expect((await run({})).targetByEndOfToday).toBeCloseTo((152 * 4) / 21)
    expect((await run({}, { now: '2026-11-02T15:00:00Z' })).targetByEndOfToday).toBeCloseTo(152 / 21) // segunda: já 1 dia
    expect((await run({ month: '2026-10' })).targetByEndOfToday).toBe(176) // passado: meta inteira
    expect((await run({ month: '2026-12' })).targetByEndOfToday).toBe(0) // futuro
  })

  it('projects the month by the pace of its workdays up to today, today included', async () => {
    const r = await run({}) // qui 05/11: seg 02 a qui 05 = 4 dias úteis, com 5h; restam 17 depois de hoje
    expect(r.dailyGoalHours).toBe(8)
    expect(r.pacePerWorkday).toBeCloseTo(5 / 4)
    expect(r.projectedHours).toBeCloseTo(5 + (5 / 4) * 17)
    const past = await run({ month: '2026-10' }) // outubro inteiro encerrado: 5h em 22 dias úteis
    expect(past.pacePerWorkday).toBeCloseTo(5 / 22)
    expect(past.projectedHours).toBe(5)
    const future = await run({ month: '2026-12' })
    expect([future.pacePerWorkday, future.projectedHours]).toEqual([null, null])
    const beforeFirstWorkday = await run({}, { now: '2026-11-01T15:00:00Z' }) // domingo 01: nenhum dia útil ainda
    expect(beforeFirstWorkday.pacePerWorkday).toBeNull()
  })

  it('averages the done tasks per workday up to today, today included', async () => {
    const r = await run({}) // qui 05/11: A e B concluídas em 4 dias úteis
    expect(r.elapsedWorkingDays).toBe(4)
    expect(r.tasksPerWorkday).toBeCloseTo(2 / 4)
    const withToday = await run({}, { tasks: [...novemberTasks(), makeTask({ title: 'hoje', hours: 1, endDate: new Date('2026-11-05T13:00:00Z') })] })
    expect(withToday.tasksPerWorkday).toBeCloseTo(3 / 4)
    const past = await run({ month: '2026-10' }) // outubro inteiro: só C em 22 dias úteis
    expect([past.elapsedWorkingDays, past.tasksPerWorkday]).toEqual([22, 1 / 22])
    const future = await run({ month: '2026-12' })
    expect([future.elapsedWorkingDays, future.tasksPerWorkday]).toEqual([0, null])
    const beforeFirstWorkday = await run({}, { now: '2026-11-01T15:00:00Z' })
    expect(beforeFirstWorkday.tasksPerWorkday).toBeNull()
  })

  it('counts the hours delivered today in the pace, the projection and the expected hours', async () => {
    const tasks = [...novemberTasks(), makeTask({ title: 'hoje', hours: 3, endDate: new Date('2026-11-05T13:00:00Z') })]
    const r = await run({}, { tasks })
    expect(r.pacePerWorkday).toBeCloseTo(8 / 4)
    expect(r.projectedHours).toBeCloseTo(8 + 2 * 17)
    expect(r.delivered.tiers[0]!.expectedHours).toBeCloseTo(r.targetByEndOfToday)
    expect(r.delivered.tiers[0]!.deltaHours).toBeCloseTo(8 - (152 * 4) / 21)
  })

  it('splits the month into delivered and forecast scenarios', async () => {
    const r = await run({})
    expect(r.forecast.hours).toBe(11)
    expect(r.forecast.tiers[0]).toMatchObject({ percent: 100, goalHours: 152, remainingHours: 141 })
    expect(r.forecast.tiers[0]!.requiredPerDay).toBeCloseTo(141 / 18)
    expect(r.forecast.tiers[0]!.deltaHours).toBeCloseTo(11 - (152 * 4) / 21)
    expect(r.forecast.tiers[1]).toMatchObject({ percent: 125, goalHours: 190, remainingHours: 179 })
    const past = await run({ month: '2026-10' })
    expect(past.forecast).toEqual(past.delivered) // sem abertas fora do mês corrente
  })

  it('past month has no open tasks and uses an estimated goal', async () => {
    const r = await run({ month: '2026-10' })
    expect(r.isCurrent).toBe(false)
    expect(r.doneHours).toBe(5)
    expect(r.openHours).toBe(0)
    expect(r.tasks.map((t) => [t.title, t.done])).toEqual([['C', true]]) // só as concluídas em outubro
    expect(r.forecastHours).toBe(5)
    expect(r.remainingWorkingDays).toBe(0)
    expect(r.delivered.tiers.every((t) => t.requiredPerDay === 0)).toBe(true)
    expect(r.goalEstimated).toBe(true)
    expect(r.goalHours).toBe(22 * 8)
  })

  it('lists tasks skipped for breaking a rule', async () => {
    const invalid = [{ title: 'X', url: 'https://notion.so/x', reason: 'Horas inválidas na task "X": -1' }]
    expect((await run({}, { invalid })).invalidTasks).toEqual(invalid)
    expect((await run({})).invalidTasks).toEqual([])
  })

  it('zero working days does not divide by zero', async () => {
    const r = await run({}, { days: { '2026-11': 0 } })
    expect(r.goalHours).toBe(0)
    expect(r.delivered.tiers.every((t) => t.requiredPerDay === 0)).toBe(true)
    expect(r.dailyCumulative.every((p) => p.ideal.every((i) => Number.isFinite(i.hours)))).toBe(true)
    expect(r.delivered.tiers.every((t) => Number.isFinite(t.expectedHours) && !t.reached)).toBe(true)
  })

  it('builds the daily cumulative series', async () => {
    const r = await run({})
    expect(r.dailyCumulative).toHaveLength(30)
    expect(r.dailyCumulative.find((p) => p.date === '2026-11-02')!.doneHours).toBe(0)
    expect(r.dailyCumulative.find((p) => p.date === '2026-11-03')!.doneHours).toBe(3)
    expect(r.dailyCumulative.at(-1)!.doneHours).toBe(5)
    expect(r.dailyCumulative.at(-1)!.ideal).toEqual([
      { percent: 100, hours: 152 },
      { percent: 125, hours: 190 },
    ])
    expect(r.dailyCumulative.find((p) => p.date === '2026-11-03')!.ideal[1]!.hours).toBeCloseTo((190 * 2) / 21)
  })

  it('breaks down hours by type, developer (test tasks) and requester', async () => {
    const r = await run({})
    expect(r.hoursByType).toEqual([
      { type: 'TESTE', hours: 3 },
      { type: 'PROGRAMAÇÂO', hours: 2 },
    ])
    expect(r.hoursByDeveloper).toEqual([{ developer: 'Guidolin', hours: 3 }]) // A é TESTE
    expect(r.hoursByRequester).toEqual([])
    const withRequest = await run({}, {
      tasks: [makeTask({ title: 'Relatório [Mauro]', type: 'PROGRAMAÇÂO', hours: 4, endDate: new Date('2026-11-03T15:00:00Z') })],
    })
    expect(withRequest.hoursByRequester).toEqual([{ requester: 'Mauro', hours: 4 }])
    expect(withRequest.hoursByDeveloper).toEqual([])
    expect(r.doneTaskCount).toBe(2)
    expect(r.averageHoursPerTask).toBe(2.5)
    expect(r.undatedTasks.map((t) => t.title)).toEqual(['E'])
  })

  it('lists the month tasks split into development and test, open first', async () => {
    const r = await run({})
    expect(r.tasks).toEqual([
      { title: 'D', status: 'Aguardando', hours: 6, url: expect.any(String), done: false, kind: 'development', date: null, week: '2026-11-01', statusColor: null },
      { title: 'B', status: 'Concluido', hours: 2, url: expect.any(String), done: true, kind: 'development', date: '2026-11-04', week: '2026-11-01', statusColor: null },
      { title: 'A [Guidolin]', status: 'Concluido', hours: 3, url: expect.any(String), done: true, kind: 'test', date: '2026-11-03', week: '2026-11-01', statusColor: null },
    ])
  })

  it('passes the Notion status color through to the task list', async () => {
    const tasks = [makeTask({ title: 'P', status: 'Programando', statusColor: 'orange' })]
    expect((await run({}, { tasks })).tasks).toEqual([expect.objectContaining({ status: 'Programando', statusColor: 'orange' })])
  })

  it('lists the weeks (Sunday to Saturday) of the month, with the part inside it', async () => {
    const r = await run({})
    expect(r.weeks.map((w) => [w.start, w.end, w.inMonthStart, w.inMonthEnd, w.isCurrent])).toEqual([
      ['2026-11-01', '2026-11-07', '2026-11-01', '2026-11-07', true],
      ['2026-11-08', '2026-11-14', '2026-11-08', '2026-11-14', false],
      ['2026-11-15', '2026-11-21', '2026-11-15', '2026-11-21', false],
      ['2026-11-22', '2026-11-28', '2026-11-22', '2026-11-28', false],
      ['2026-11-29', '2026-12-05', '2026-11-29', '2026-11-30', false],
    ])
    const oct = await run({ month: '2026-10' })
    // 01/10 é quinta: a semana começa no domingo 27/09
    expect(oct.weeks[0]).toEqual({ start: '2026-09-27', end: '2026-10-03', inMonthStart: '2026-10-01', inMonthEnd: '2026-10-03', isCurrent: false })
    expect(oct.weeks.at(-1)).toMatchObject({ start: '2026-10-25', end: '2026-10-31' })
    expect(oct.tasks.map((t) => [t.title, t.week])).toEqual([['C', '2026-10-25']])
  })

  it('reports month tiers and whether it is on track', async () => {
    const r = await run({})
    expect(r.delivered.tiers[0]).toMatchObject({ percent: 100, goalHours: 152, reached: false, onTrack: false })
    expect(r.delivered.tiers[0]!.expectedHours).toBeCloseTo((152 * 4) / 21) // seg 02 a qui 05, hoje incluso
    expect(r.delivered.tiers[0]!.deltaHours).toBeCloseTo(5 - (152 * 4) / 21)
    expect(r.delivered.tiers[1]).toMatchObject({ percent: 125, goalHours: 190 })
    expect((await run({ month: '2026-10' })).delivered.tiers[0]!.expectedHours).toBe(176)
  })

  it('reports today against the daily tiers', async () => {
    const tasks = [
      ...novemberTasks(),
      makeTask({ title: 'F', hours: 8, endDate: new Date('2026-11-05T13:00:00Z') }),
      makeTask({ title: 'G', hours: 2, endDate: new Date('2026-11-05T14:00:00Z') }),
    ]
    const r = await run({}, { tasks })
    expect(r.today).toEqual({
      date: '2026-11-05',
      isWorkingDay: true,
      isHoliday: false,
      holidayName: null,
      doneHours: 10,
      openHours: 6,
      goalHours: 8,
      delivered: {
        hours: 10,
        tiers: [
          { percent: 100, hours: 8, reached: true, remainingHours: 0 },
          { percent: 125, hours: 10, reached: true, remainingHours: 0 },
        ],
      },
      forecast: {
        hours: 16,
        tiers: [
          { percent: 100, hours: 8, reached: true, remainingHours: 0 },
          { percent: 125, hours: 10, reached: true, remainingHours: 0 },
        ],
      },
    })
    const early = await run({})
    expect(early.today!.delivered).toEqual({
      hours: 0,
      tiers: [
        { percent: 100, hours: 8, reached: false, remainingHours: 8 },
        { percent: 125, hours: 10, reached: false, remainingHours: 10 },
      ],
    })
    expect(early.today!.forecast.hours).toBe(6) // D (6h) em aberto
    expect(early.today!.forecast.tiers[0]).toMatchObject({ reached: false, remainingHours: 2 })
    expect((await run({ month: '2026-10' }, { tasks })).today).toBeNull()

    const saturday = await run({}, { now: '2026-11-07T15:00:00Z' })
    expect(saturday.today).toMatchObject({ date: '2026-11-07', isWorkingDay: false, goalHours: 0 })
    expect(saturday.today!.delivered.tiers.every((t) => !t.reached && t.remainingHours === 0)).toBe(true)
    expect(saturday.today!.forecast.tiers.every((t) => !t.reached)).toBe(true)
  })

  describe('with HOLIDAYS (02/11 e 20/11)', () => {
    const holidays = { '2026-11-02': 'Finados', '2026-11-20': 'Consciência Negra' }

    it('derives the month goal from weekdays minus holidays', async () => {
      const r = await run({}, { days: {}, holidays })
      expect(r.workingDays).toBe(19)
      expect(r.goalHours).toBe(152)
      expect(r.goalEstimated).toBe(false)
      expect(r.remainingWorkingDays).toBe(17) // 05..30 seg–sex = 18, menos 20/11
      expect(r.delivered.tiers[0]!.expectedHours).toBeCloseTo((152 * 3) / 19) // 03, 04 e hoje (05)
      expect(r.dailyCumulative.find((p) => p.date === '2026-11-02')!.ideal.map((i) => i.hours)).toEqual([0, 0])
    })

    it('a holiday today has no daily goal', async () => {
      const r = await run({}, { holidays, now: '2026-11-02T15:00:00Z' })
      expect(r.today).toMatchObject({ isWorkingDay: false, isHoliday: true, holidayName: 'Finados', goalHours: 0 })
      const weekday = await run({}, { holidays })
      expect(weekday.today).toMatchObject({ isWorkingDay: true, isHoliday: false, holidayName: null })
    })
  })

  it('builds the month calendar: workday, weekend, holiday and vacation, with the hours of each day', async () => {
    const r = await run({}, { days: {}, holidays: { '2026-11-02': 'Finados' }, vacations: { '2026-11-20': 'Férias' } })
    const day = (d: string) => r.calendar.find((c) => c.date === `2026-11-${d}`)
    expect(r.calendar).toHaveLength(30)
    expect(day('01')).toEqual({ date: '2026-11-01', kind: 'weekend', name: null, doneHours: 0 }) // domingo
    expect(day('02')).toEqual({ date: '2026-11-02', kind: 'holiday', name: 'Finados', doneHours: 0 })
    expect(day('03')).toEqual({ date: '2026-11-03', kind: 'workday', name: null, doneHours: 3 })
    expect(day('20')).toEqual({ date: '2026-11-20', kind: 'vacation', name: 'Férias', doneHours: 0 })
    expect(r.calendar.filter((c) => c.kind === 'workday')).toHaveLength(r.workingDays)
  })

  it('tells whether the month is past, current or future (I2)', async () => {
    expect((await run({})).period).toBe('current')
    expect((await run({ month: '2026-10' })).period).toBe('past')
    expect((await run({ month: '2026-12' })).period).toBe('future')
  })

  it('rejects an invalid month', async () => {
    await expect(run({ month: 'x' })).rejects.toThrow(DomainError)
  })
})

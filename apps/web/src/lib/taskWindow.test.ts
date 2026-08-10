import { describe, it, expect } from 'vitest'
import { taskWindow, inTaskWindow, type WindowTask } from './taskWindow'

const base: WindowTask = { status: 'inprogress', startDate: '2026-08-10T00:00:00.000Z', deadline: null, doneAt: null }

describe('taskWindow / inTaskWindow — модель «окно» [startDate, deadline]', () => {
  it('без дедлайна — окно в один день (startDate)', () => {
    expect(taskWindow(base)).toEqual({ start: '2026-08-10', end: '2026-08-10' })
    expect(inTaskWindow(base, '2026-08-10')).toBe(true)
    expect(inTaskWindow(base, '2026-08-11')).toBe(false)
  })

  it('inprogress с дедлайном — видна каждый день окна включительно', () => {
    const t: WindowTask = { ...base, deadline: '2026-08-13T00:00:00.000Z' }
    expect(inTaskWindow(t, '2026-08-10')).toBe(true)
    expect(inTaskWindow(t, '2026-08-11')).toBe(true)
    expect(inTaskWindow(t, '2026-08-13')).toBe(true)
    expect(inTaskWindow(t, '2026-08-14')).toBe(false) // просрочка — окно само не тянется вперёд
    expect(inTaskWindow(t, '2026-08-09')).toBe(false)
  })

  it('done — окно до дня закрытия (doneAt), а не до дедлайна', () => {
    const t: WindowTask = { status: 'done', startDate: '2026-08-10T00:00:00.000Z', deadline: '2026-08-20T00:00:00.000Z', doneAt: '2026-08-12T00:00:00.000Z' }
    expect(inTaskWindow(t, '2026-08-10')).toBe(true)
    expect(inTaskWindow(t, '2026-08-12')).toBe(true)
    expect(inTaskWindow(t, '2026-08-13')).toBe(false) // после закрытия — не показываем, хотя дедлайн ещё далеко
  })

  it('done без doneAt (данные-аномалия) — окно схлопывается до startDate, а не падает', () => {
    const t: WindowTask = { status: 'done', startDate: '2026-08-10T00:00:00.000Z', deadline: '2026-08-20T00:00:00.000Z', doneAt: null }
    expect(taskWindow(t)).toEqual({ start: '2026-08-10', end: '2026-08-10' })
  })

  it('backlog не участвует в модели окна (фильтруется на уровне вызывающего кода по статусу)', () => {
    const t: WindowTask = { ...base, status: 'backlog' }
    // taskWindow не различает backlog от inprogress по границам — это ответственность фильтра статуса
    expect(taskWindow(t)).toEqual({ start: '2026-08-10', end: '2026-08-10' })
  })
})

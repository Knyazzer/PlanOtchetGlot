import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { WorkSchedule } from '../lib/workSchedule'

// HR-конфиг графика работы сотрудника (A 2/3): недельный паттерн типов дня + часы.
// Пишет через PUT /work-schedule/:userId (гейт admin/HR-модуль на бэке). Даёт «тип дня
// по умолчанию» в кабинете сотрудника (подсказка, НЕ факт).

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type Draft = Pick<WorkSchedule, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'workStart' | 'workEnd' | 'breakMin'>

const DAYS: Array<{ key: keyof Draft; label: string }> = [
  { key: 'mon', label: 'Пн' }, { key: 'tue', label: 'Вт' }, { key: 'wed', label: 'Ср' },
  { key: 'thu', label: 'Чт' }, { key: 'fri', label: 'Пт' }, { key: 'sat', label: 'Сб' }, { key: 'sun', label: 'Вс' },
]
const DEFAULTS: Draft = { mon: 'office', tue: 'office', wed: 'office', thu: 'office', fri: 'office', sat: 'dayoff', sun: 'dayoff', workStart: '10:00', workEnd: '18:30', breakMin: 0 }

export function WorkScheduleEditor({ userId }: { userId: string }) {
  const { data: formats = [] } = useQuery<DayFormat[]>({
    queryKey: ['day-formats'],
    queryFn: () => api.get('/day-entries/formats').then(r => r.data),
    staleTime: 1000 * 60 * 60,
  })
  const { data: schedule, isLoading } = useQuery<WorkSchedule | null>({
    queryKey: ['work-schedule', userId],
    queryFn: () => api.get(`/work-schedule/${userId}`).then(r => r.data),
  })
  if (isLoading) return null
  const init: Draft = schedule ? { mon: schedule.mon, tue: schedule.tue, wed: schedule.wed, thu: schedule.thu, fri: schedule.fri, sat: schedule.sat, sun: schedule.sun, workStart: schedule.workStart, workEnd: schedule.workEnd, breakMin: schedule.breakMin } : DEFAULTS
  return <Form key={schedule ? schedule.updatedAt : 'new'} userId={userId} init={init} isNew={!schedule} formats={formats} />
}

function Form({ userId, init, isNew, formats }: { userId: string; init: Draft; isNew: boolean; formats: DayFormat[] }) {
  const qc = useQueryClient()
  const [d, setD] = useState<Draft>(init)
  const [dirty, setDirty] = useState(false)
  const set = (patch: Partial<Draft>) => { setD(v => ({ ...v, ...patch })); setDirty(true) }

  const save = useMutation({
    mutationFn: () => api.put(`/work-schedule/${userId}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-schedule'] }) // и :userId, и 'me'
      setDirty(false)
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Не удалось сохранить график')
    },
  })

  const sel: React.CSSProperties = { background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 12, outline: 'none', appearance: 'none', cursor: 'pointer', width: '100%' }
  const timeInp: React.CSSProperties = { background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 12, outline: 'none', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>График работы</span>
        {isNew && !dirty && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>не задан (дефолт 5/2)</span>}
      </div>

      {/* Недельный паттерн: тип дня по дням недели */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '6px 8px', alignItems: 'center' }}>
        {DAYS.map(day => (
          <div key={day.key} style={{ display: 'contents' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: (day.key === 'sat' || day.key === 'sun') ? 'var(--text-muted)' : 'var(--text-2)' }}>{day.label}</span>
            <select value={d[day.key] as string} onChange={e => set({ [day.key]: e.target.value } as Partial<Draft>)} style={sel}>
              {formats.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Рабочие часы по умолчанию */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={lbl}>Начало</span>
          <input type="time" value={d.workStart} onChange={e => set({ workStart: e.target.value })} style={{ ...timeInp, marginTop: 4 }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={lbl}>Конец</span>
          <input type="time" value={d.workEnd} onChange={e => set({ workEnd: e.target.value })} style={{ ...timeInp, marginTop: 4 }} />
        </div>
        <div style={{ width: 70 }}>
          <span style={lbl}>Переры́в</span>
          <input type="number" min={0} step={15} value={d.breakMin} onChange={e => set({ breakMin: Number(e.target.value) || 0 })} style={{ ...timeInp, marginTop: 4 }} />
        </div>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending || !dirty}
        style={{ alignSelf: 'flex-start', background: dirty ? 'var(--accent, #2563eb)' : 'var(--surface-3)', color: dirty ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 7, padding: '7px 16px', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 700, cursor: dirty ? 'pointer' : 'default' }}
      >
        {save.isPending ? 'Сохранение…' : 'Сохранить график'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
        Даёт сотруднику «тип дня по умолчанию» — подсказку в кабинете. Факт (что было на самом деле) сотрудник отмечает сам; отчёт считает только его.
      </div>
    </div>
  )
}

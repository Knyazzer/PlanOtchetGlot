import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { Combobox } from '../ui-kit/components/Combobox'
import { TimePicker } from '../ui-kit/components/TimePicker'
import { X, Plus, Pencil, Trash2, Clock } from 'lucide-react'

// Правая НЕ-затемняющая панель шаблонов задач (пресетов). Клик по шаблону создаёт обычную Task на
// ВЫБРАННОМ дне через POST /tasks (те же гейты). Шаблон — не задача, а «штамп». Дедлайна/исполнителя
// на MVP нет — они задаются уже в созданной задаче (её карточка). Правило закрытия — mousedown+mouseup
// вне панели (как у попапов), Esc, смена дня/вкладки (снаружи через open=false).

type Template = { id: string; title: string; client: string | null; plannedMinutes: number | null; description: string }

const toHHMM = (min?: number | null) => (min ? `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` : '')
const toMinutes = (hhmm: string) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

export function TaskTemplatesPanel({ open, onClose, day, isToday, meId, onInstantiated }: {
  open: boolean; onClose: () => void
  day: string; isToday: boolean; meId?: string
  onInstantiated: () => void
}) {
  const qc = useQueryClient()
  const panelRef = useRef<HTMLDivElement>(null)
  const downOutside = useRef(false)

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['task-templates'], queryFn: () => api.get('/task-templates').then(r => r.data), enabled: open, staleTime: 60_000,
  })
  // Шаблонная задача = ОБЫЧНАЯ задача, добавляется по ТЕМ ЖЕ условиям, что и ручное «Добавить задачу»:
  // серверный вердикт canAddTask (день активен сегодня, не завершён, не залочен) — и СРАЗУ в работу
  // (inprogress) на выбранный день. День не активен → добавить нельзя (тост с причиной, как у ручного).
  const { data: dayPolicy } = useQuery<{ canAddTask: boolean; reason: string | null }>({
    queryKey: ['day-policy', day], queryFn: () => api.get('/day-entries/policy', { params: { date: day } }).then(r => r.data), enabled: open, staleTime: 20_000,
  })
  const canAdd = dayPolicy?.canAddTask ?? false
  const { data: clients = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['clients'], queryFn: () => api.get('/clients').then(r => r.data), staleTime: 300_000,
  })
  const clientOpts = clients.map(c => ({ value: c.name, label: c.name }))

  // Закрытие: mousedown И mouseup вне панели (не закрываем, если выделяли текст и увели мышь); Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { downOutside.current = !panelRef.current?.contains(e.target as Node) }
    const onUp = (e: MouseEvent) => {
      if (downOutside.current && !panelRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-radix-popper-content-wrapper]')) onClose()
      downOutside.current = false
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('mouseup', onUp); document.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  // Форма создания/правки шаблона
  const [form, setForm] = useState<{ id?: string; title: string; client: string; time: string } | null>(null)

  const saveTpl = useMutation({
    mutationFn: (f: { id?: string; title: string; client: string; time: string }) => {
      const body = { title: f.title.trim(), client: f.client || null, plannedMinutes: toMinutes(f.time) }
      return f.id ? api.patch(`/task-templates/${f.id}`, body) : api.post('/task-templates', body)
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ['task-templates'] }) },
    onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось сохранить шаблон', 'info'),
  })
  const delTpl = useMutation({
    mutationFn: (id: string) => api.delete(`/task-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-templates'] }),
    onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось удалить', 'info'),
  })

  // Инстанцирование: пресет → реальная Task на выбранном дне. Сегодня-активный → в работу, иначе backlog.
  const instantiate = useMutation({
    mutationFn: (t: Template) => api.post('/tasks', {
      title: t.title, assigneeId: meId, startDate: day, client: t.client || null,
      status: 'inprogress', actualMinutes: t.plannedMinutes ?? null,
    }),
    onSuccess: (_r, t) => { onInstantiated(); toast(`Добавлено: ${t.title}`) },
    onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось добавить задачу', 'info'),
  })
  const onRowClick = (t: Template) => {
    if (!meId) return
    if (!canAdd) { toast(dayPolicy?.reason ?? 'Добавление в этот день недоступно', 'info'); return }
    instantiate.mutate(t)
  }

  if (!open) return null

  const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }
  const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  return (
    <div ref={panelRef} style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 60,
      background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', boxShadow: '-14px 0 40px -12px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column', fontFamily: 'Inter,sans-serif',
    }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Шаблонные задачи</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>клик добавляет в работу на {isToday ? 'сегодня' : dayLabel}{canAdd ? '' : ' · недоступно (день не активен)'}</div>
        </div>
        <button onClick={onClose} title="Закрыть" style={iconBtn}><X size={18} /></button>
      </div>

      {/* Список шаблонов */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {templates.length === 0 && !form && (
          <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Шаблонов пока нет. Создайте первый ниже.</div>
        )}
        {templates.map(t => (
          <div key={t.id} onClick={() => onRowClick(t)}
            title={canAdd ? 'Добавить эту задачу в работу на выбранный день' : 'День не активен — задачу добавить нельзя'}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 6, cursor: canAdd ? 'pointer' : 'not-allowed', opacity: canAdd ? 1 : 0.55 }}
            onMouseEnter={e => { if (canAdd) e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {t.client && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.client}</span>}
                {t.plannedMinutes ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} />{toHHMM(t.plannedMinutes)}</span> : null}
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); setForm({ id: t.id, title: t.title, client: t.client ?? '', time: toHHMM(t.plannedMinutes) }) }} title="Править шаблон" style={iconBtn}><Pencil size={14} /></button>
            <button onClick={e => { e.stopPropagation(); if (confirm(`Удалить шаблон «${t.title}»?`)) delTpl.mutate(t.id) }} title="Удалить шаблон" style={iconBtn}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {/* Форма создания/правки */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--surface-2)' }}>
        {form ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{form.id ? 'Правка шаблона' : 'Новый шаблон'}</div>
            <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f!, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && form.title.trim()) saveTpl.mutate(form); if (e.key === 'Escape') setForm(null) }}
              placeholder="Название задачи"
              style={{ height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', padding: '0 10px', fontSize: 14, color: 'var(--text-1)', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Combobox options={clientOpts} value={form.client || undefined} placeholder="Клиент" onChange={v => setForm(f => ({ ...f!, client: v }))} />
              </div>
              <div style={{ width: 110 }}>
                <TimePicker value={form.time} placeholder="00:00" onChange={v => setForm(f => ({ ...f!, time: v }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer' }}>Отмена</button>
              <button disabled={!form.title.trim()} onClick={() => saveTpl.mutate(form)}
                style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: form.title.trim() ? 'var(--accent)' : 'var(--surface-3)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: form.title.trim() ? 'pointer' : 'not-allowed' }}>Сохранить</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setForm({ title: '', client: '', time: '' })}
            style={{ width: '100%', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, border: '1px dashed var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={16} /> Новый шаблон
          </button>
        )}
      </div>
    </div>
  )
}

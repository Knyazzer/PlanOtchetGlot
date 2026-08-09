import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth'
import { api } from '../../lib/api'
import type { TaskModalProps, TaskLogEntry, TaskUser } from './types'
import { toDateStr, fmtD, addDays, parseD, inputStyle } from './utils'
import { Field } from './ui'
import { Combobox } from '../../ui-kit/components/Combobox'
import { DatePicker as KitDatePicker } from '../../ui-kit/components/DatePicker'
import { TimePicker } from '../../ui-kit/components/TimePicker'
import { toast } from '../../lib/toast'
import { LINK_META, linkIcon } from '../../lib/linkMeta'

// Конвертация минут ↔ ЧЧ:ММ для регламентированного ввода времени (TimePicker)
const minToHHMM = (min?: number | null) => min ? `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` : ''
const hhmmToMin = (hhmm: string) => { if (!hhmm) return ''; const [h, m] = hhmm.split(':').map(Number); return String((h || 0) * 60 + (m || 0)) }

// Кит-DatePicker (портуется, не режется модалкой) со строковым API 'YYYY-MM-DD'
function DateField({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <KitDatePicker
      value={value ? { from: parseD(value) } : undefined}
      onChange={(v) => onChange(v?.from ? fmtD(v.from) : '')}
      minDate={min ? parseD(min) : undefined}
      className="w-full"
    />
  )
}

// Связь задачи — ровно одна из: проект / стратегическая цель / трек
const LINK_TYPE_LABEL: Record<string, string> = { project: 'Проект', goal: 'Цель', track: 'Трек' }
// У стратегической цели нет клиента → подставляем компанию
const COMPANY_NAME = 'Мегаполис Медиа'
import { TaskHistory } from './TaskHistory'

export function TaskModal({ onClose, onDone, defaultDeadline, defaultStartDate, defaultTrackId, defaultStageId, editTask, onOpenChatWith }: TaskModalProps) {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const isEdit = !!editTask

  const [tab,          setTab]          = useState<'task' | 'history'>('task')
  const [title,        setTitle]        = useState(editTask?.title ?? '')
  const [description,  setDescription]  = useState(editTask?.description ?? '')
  const [assigneeId,   setAssigneeId]   = useState(editTask?.assignee.id ?? currentUser?.id ?? '')
  const [assigneeName, setAssigneeName] = useState(editTask?.assignee.name ?? currentUser?.name ?? '')
  const [deadline,     setDeadline]     = useState(editTask ? toDateStr(editTask.deadline) : (defaultDeadline ?? fmtD(addDays(new Date(), 3))))
  const [trackId,      setTrackId]      = useState<string | null>(editTask?.trackId ?? defaultTrackId ?? null)
  const [stageId,      setStageId]      = useState<string | null>(editTask?.stageId ?? defaultStageId ?? null)
  const [client,       setClient]       = useState(editTask?.client ?? '')
  const [actualMin,    setActualMin]    = useState<string>(editTask?.actualMinutes != null ? String(editTask.actualMinutes) : '')
  const [projectId,    setProjectId]    = useState<string | null>(editTask?.projectId ?? null)
  const [goalId,       setGoalId]       = useState<string | null>(editTask?.goalId ?? null)
  // Связь задачи — ровно одна из: проект / стратегическая цель / трек (взаимоисключающе)
  const initialLinkType: 'none' | 'project' | 'goal' | 'track' =
    editTask?.projectId ? 'project' : editTask?.goalId ? 'goal' : (editTask?.trackId ?? defaultTrackId) ? 'track' : 'none'
  const [linkType,     setLinkType]     = useState<'none' | 'project' | 'goal' | 'track'>(initialLinkType)
  const [repeatRule,   setRepeatRule]   = useState<string>('')   // только при создании
  const [repeatUntil,  setRepeatUntil]  = useState<string>('')
  const [members,      setMembers]      = useState<TaskUser[]>([])
  const [confirmDel,   setConfirmDel]   = useState(false)
  const mouseDownOnBackdrop = useRef(false)

  const { data: logEntries = [], isLoading: logLoading } = useQuery<TaskLogEntry[]>({
    queryKey: ['taskLog', editTask?.id],
    queryFn:  () => api.get(`/tasks/${editTask!.id}/log`).then(r => r.data),
    enabled:  isEdit && tab === 'history',
    staleTime: 0,
  })

  const assignedByName = isEdit ? editTask.assignedBy.name : (currentUser?.name ?? '—')
  const isCalendarTask = isEdit && !!editTask.calendarEventId
  const isReadOnly = isCalendarTask || (isEdit && editTask.assignedBy.id !== currentUser?.id && !currentUser?.isAdmin)
  const canChangeAssignee = !isEdit || editTask.assignedBy.id === currentUser?.id || !!currentUser?.isAdmin

  useEffect(() => {
    api.get('/users/members').then(r => setMembers(r.data)).catch(() => {})
  }, [])

  // подсказки клиентов (строки из справочника) и проекты — для полей планирования
  const { data: clientOptions = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const { data: projectOptions = [] } = useQuery<Array<{ id: string; title: string; client?: { id: string; name: string } | null }>>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  // Стратегические цели (текущий период) в охвате пользователя — для привязки задачи к цели
  const { data: goalOptions = [] } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['strategic-goals'],
    queryFn: () => api.get('/strategic-goals').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  })
  // Треки для привязки задачи (связь = трек)
  const { data: trackOptions = [] } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['tracks'],
    queryFn: () => api.get('/tracks').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  })

  // Связь взаимоисключающая: сохраняем только выбранный тип, остальные обнуляем.
  const planningPayload = () => ({
    client: client.trim() || null,
    projectId: linkType === 'project' ? projectId : null,
    goalId:    linkType === 'goal'    ? goalId    : null,
    trackId:   linkType === 'track'   ? trackId   : null,
    stageId:   linkType === 'track'   ? stageId   : null,
    actualMinutes: actualMin !== '' ? Number(actualMin) : null,
  })
  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? api.patch(`/tasks/${editTask.id}`, { title: title.trim(), description, assigneeId, deadline: deadline || null, ...planningPayload() })
      : api.post('/tasks', {
          title: title.trim(), description, assigneeId, deadline: deadline || undefined,
          ...(defaultStartDate ? { startDate: defaultStartDate } : {}),
          ...planningPayload(),
          ...(repeatRule && repeatUntil ? { repeatRule, repeatUntil } : {}),
        }),
    onSuccess: () => {
      onDone()
      // Тост: объясняем неочевидное (задача ушла другому исполнителю) + подтверждаем сохранение
      const sentToOther = assigneeId !== currentUser?.id
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['taskLog', editTask.id] })
        const reassigned = assigneeId !== editTask.assignee.id
        if (reassigned && sentToOther) toast(`Задача отправлена: ${assigneeName}`, 'sent')
        else toast('Сохранено')
      } else {
        if (sentToOther) toast(`Задача отправлена: ${assigneeName}`, 'sent')
        else toast('Задача создана')
      }
      onClose() // сохранение закрывает модал (и при создании, и при редактировании)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${editTask!.id}`),
    onSuccess: () => { onDone(); toast('Задача удалена', 'info'); onClose() },
  })

  function submit() {
    if (!title.trim() || !assigneeId) return
    saveMutation.mutate()
  }

  const memberOptions = members.map(m => ({ value: m.id, label: m.name }))

  // Компактная кнопка «Открыть в чате» под полем создателя/исполнителя
  const chatBtn = (targetId: string) => (isEdit && onOpenChatWith) ? (
    <button
      onClick={() => {
        onClose()
        onOpenChatWith(targetId, { id: editTask!.id, title: editTask!.title, assigneeId: editTask!.assignee.id, assignedById: editTask!.assignedBy.id }, targetId === currentUser?.id)
      }}
      style={{ marginTop:6, fontSize:11, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}
    >💬 Открыть в чате</button>
  ) : null

  // Связь — единый сгруппированный список (Треки / Стратегические задачи / Проекты).
  // Проекты фильтруются по клиенту; выбранный элемент всегда виден, даже если вне фильтра.
  const clientName = client.trim()
  let visibleProjects = clientName ? projectOptions.filter(p => (p.client?.name ?? '') === clientName) : projectOptions
  if (projectId && !visibleProjects.some(p => p.id === projectId)) {
    const sel = projectOptions.find(p => p.id === projectId)
    if (sel) visibleProjects = [sel, ...visibleProjects]
  }
  let visibleGoals: Array<{ id: string; title: string }> = goalOptions
  if (goalId && !visibleGoals.some(g => g.id === goalId)) visibleGoals = [{ id: goalId, title: 'Текущая цель (вне периода)' }, ...visibleGoals]

  const linkOptions = [
    { value: 'none', label: 'Без связи' },
    ...trackOptions.map(t => ({ value: `track:${t.id}`, label: t.title, group: LINK_META.track.group, icon: linkIcon('track') })),
    ...visibleGoals.map(g => ({ value: `goal:${g.id}`, label: g.title, group: LINK_META.goal.group, icon: linkIcon('goal') })),
    ...visibleProjects.map(p => ({ value: `project:${p.id}`, label: p.title, group: LINK_META.project.group, icon: linkIcon('project') })),
  ]
  const linkValue =
    linkType === 'project' && projectId ? `project:${projectId}`
    : linkType === 'goal' && goalId ? `goal:${goalId}`
    : linkType === 'track' && trackId ? `track:${trackId}`
    : 'none'
  const setLink = (v: string) => {
    const [type, id] = v.split(':')
    setLinkType((type === 'track' || type === 'goal' || type === 'project') ? type : 'none')
    setProjectId(type === 'project' ? id : null)
    setGoalId(type === 'goal' ? id : null)
    setTrackId(type === 'track' ? id : null)
    if (type !== 'track') setStageId(null)
    if (type === 'goal') setClient(COMPANY_NAME) // у стратегической цели клиента нет → компания
  }
  const linkReadonlyLabel =
    linkType === 'project' ? (editTask?.project?.title ?? projectOptions.find(p => p.id === projectId)?.title ?? '—')
    : linkType === 'goal'  ? (goalOptions.find(g => g.id === goalId)?.title ?? (goalId ? 'Цель' : '—'))
    : linkType === 'track' ? (editTask?.track?.title ?? trackOptions.find(t => t.id === trackId)?.title ?? '—')
    : '—'

  return (
    <>
    <div
      // Клик по фону закрывает карточку ТОЛЬКО если открытой выпадашки нет: первый клик снаружи
      // при открытом Combobox/Select/TimePicker/DatePicker закрывает выпадашку (её же обработчиком), а не карточку.
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget && !document.querySelector('[data-radix-popper-content-wrapper],[data-datepicker-open]') }}
      onMouseUp={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
    >
      <div style={{ background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:16, padding:'28px 28px 24px', width:'100%', maxWidth:560, maxHeight:'calc(100vh - 48px)', display:'flex', flexDirection:'column', gap:16, overflowY:'auto' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text-1)', display:'flex', alignItems:'center', gap:8 }}>
            {isCalendarTask && <span title="Задача из события">📅</span>}
            {isEdit ? (isReadOnly ? 'Просмотр задачи' : 'Редактировать задачу') : 'Новая задача'}
          </div>
          {isEdit && (
            <div style={{ display:'flex', background:'var(--surface-2)', borderRadius:8, padding:3, gap:2 }}>
              {(['task','history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer',
                  background: tab === t ? 'var(--surface-1)' : 'none',
                  color: tab === t ? 'var(--text-1)' : 'var(--text-muted)',
                  fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: tab === t ? 600 : 400,
                  boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                }}>
                  {t === 'task' ? 'Задача' : 'История'}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'history' && (
          <TaskHistory entries={logEntries} isLoading={logLoading} />
        )}

        {tab === 'task' && (<>
          <Field label="Название">
            {isReadOnly
              ? <div style={{ ...inputStyle, color:'var(--text-1)', userSelect:'text' }}>{title || '—'}</div>
              : <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit() }}
                  placeholder="Что нужно сделать?" style={inputStyle} />
            }
          </Field>

          <Field label="Описание">
            {isReadOnly
              ? <div style={{ ...inputStyle, minHeight:80, whiteSpace:'pre-wrap', wordBreak:'break-word', color: description ? 'var(--text-1)' : 'var(--text-muted)', userSelect:'text' }}>{description || 'Нет описания'}</div>
              : <textarea
                  ref={el => {
                    if (!el) return
                    el.style.height = 'auto'
                    const h = Math.min(el.scrollHeight, 300)
                    el.style.height = h + 'px'
                    el.style.overflowY = el.scrollHeight > 300 ? 'auto' : 'hidden'
                  }}
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value)
                    e.target.style.height = 'auto'
                    const h = Math.min(e.target.scrollHeight, 300)
                    e.target.style.height = h + 'px'
                    e.target.style.overflowY = e.target.scrollHeight > 300 ? 'auto' : 'hidden'
                  }}
                  placeholder="Подробности..."
                  style={{ ...inputStyle, resize:'none', fontFamily:'inherit', overflowY:'hidden', minHeight:80 }}
                />
            }
          </Field>

          {/* Клиент + Дедлайн — одна строка (над создателем/исполнителем) */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'flex-start' }}>
            <Field label="Клиент" hint="Необязательно. Используется в Аналитике и при фильтрации задач по клиенту.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{client || '—'}</div>
                : <>
                    <input value={client} onChange={e => setClient(e.target.value)} list="task-client-options"
                      placeholder="ММ, Пятёрочка…" style={inputStyle} />
                    <datalist id="task-client-options">
                      {clientOptions.map(c => <option key={c.id} value={c.name} />)}
                    </datalist>
                  </>
              }
            </Field>
            <Field label="Дедлайн" hint="Срок выполнения. Просроченные задачи выделяются красным в ленте.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none' }}>{deadline ? deadline : '—'}</div>
                : <DateField value={deadline} onChange={setDeadline} min={isEdit ? toDateStr(editTask.startDate) : fmtD(new Date())} />
              }
            </Field>
          </div>

          {/* Создатель + Исполнитель — одна строка */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'flex-start' }}>
            <Field label="Создатель">
              <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assignedByName}</div>
              {isEdit && chatBtn(editTask.assignedBy.id)}
            </Field>
            <Field label="Исполнитель" hint="Кто выполняет задачу. Исполнитель получит уведомление о назначении. По умолчанию — вы сами.">
              {(!isReadOnly && canChangeAssignee)
                ? <Combobox options={memberOptions} value={assigneeId || undefined} placeholder="Выберите…" className="w-full"
                    onChange={v => { setAssigneeId(v); setAssigneeName(members.find(m => m.id === v)?.name ?? '') }} />
                : <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assigneeName}</div>
              }
              {isEdit && chatBtn(editTask.assignee.id)}
            </Field>
          </div>

          <Field label="Связь" hint="Задачу можно связать ровно с одним: треком, стратегической целью или проектом. Список сгруппирован; проекты фильтруются по выбранному клиенту.">
            {isReadOnly
              ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{linkType === 'none' ? '—' : `${LINK_TYPE_LABEL[linkType]}: ${linkReadonlyLabel}`}</div>
              : <Combobox options={linkOptions} value={linkValue} placeholder="Без связи" className="w-full" onChange={setLink} />
            }
          </Field>

          <Field label="Время" hint="Фактически затраченное время на задачу.">
            {isReadOnly
              ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{actualMin ? minToHHMM(Number(actualMin)) : '—'}</div>
              : <div style={{ maxWidth:160 }}>
                  <TimePicker value={minToHHMM(actualMin ? Number(actualMin) : null)} className="w-full"
                    onChange={v => setActualMin(hhmmToMin(v))} />
                </div>
            }
          </Field>

          {!isEdit && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Повторять" hint="Создаёт отдельные копии задачи на каждый день по правилу. Каждая копия независима и помечается иконкой ↻.">
                <select value={repeatRule} onChange={e => setRepeatRule(e.target.value)} style={{ ...inputStyle, width:'100%' }}>
                  <option value="">Не повторять</option>
                  <option value="daily">Ежедневно</option>
                  <option value="weekdays">По будням</option>
                </select>
              </Field>
              {repeatRule && (
                <Field label="До даты">
                  <DateField value={repeatUntil} onChange={setRepeatUntil} min={fmtD(new Date())} />
                </Field>
              )}
            </div>
          )}
          {isEdit && editTask?.repeatRule && (
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>
              ↻ Серия: {editTask.repeatRule === 'daily' ? 'ежедневно' : 'по будням'} до {toDateStr(editTask.repeatUntil)}
            </div>
          )}
        </>)}

        <div style={{ display:'flex', alignItems:'center', justifyContent: (isEdit && !isReadOnly) ? 'space-between' : 'flex-end', marginTop:4 }}>
          {isEdit && !isReadOnly && (
            !confirmDel ? (
              <button onClick={() => setConfirmDel(true)} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(232,25,75,0.3)', background:'none', color:'var(--danger)', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer' }}>
                Удалить
              </button>
            ) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:12, color:'var(--text-3)' }}>Точно удалить?</span>
                <button onClick={() => deleteMutation.mutate()} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'var(--danger)', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer', fontWeight:600 }}>Да</button>
                <button onClick={() => setConfirmDel(false)} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer' }}>Нет</button>
              </div>
            )
          )}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:14, cursor:'pointer' }}>{isReadOnly ? 'Закрыть' : 'Отмена'}</button>
            {!isReadOnly && (
              <button onClick={submit} disabled={!title.trim() || saveMutation.isPending} style={{ padding:'8px 20px', borderRadius:8, border:'none', background: title.trim() ? '#7B61FF' : 'rgba(255,255,255,0.08)', color: title.trim() ? '#fff' : 'var(--text-muted)', fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:600, cursor: title.trim() ? 'pointer' : 'default' }}>
                {saveMutation.isPending ? '...' : isEdit ? 'Сохранить' : 'Создать'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    </>
  )
}
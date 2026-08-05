import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth'
import { api } from '../../lib/api'
import { TASK_TYPE_OPTIONS } from '../../lib/taskMeta'
import type { TaskModalProps, TaskLogEntry, TaskUser } from './types'
import { toDateStr, fmtD, addDays, inputStyle } from './utils'
import { Field, DatePicker } from './ui'
import { TaskHistory } from './TaskHistory'

export function TaskModal({ onClose, onDone, defaultDeadline, defaultStartDate, defaultTrackId, defaultTrackTitle, defaultStageId, editTask, onOpenChatWith }: TaskModalProps) {
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
  const [taskType,     setTaskType]     = useState(editTask?.type ?? 'task')
  const [client,       setClient]       = useState(editTask?.client ?? '')
  const [plannedMin,   setPlannedMin]   = useState<string>(editTask?.plannedMinutes != null ? String(editTask.plannedMinutes) : '')
  const [actualMin,    setActualMin]    = useState<string>(editTask?.actualMinutes != null ? String(editTask.actualMinutes) : '')
  const [projectId,    setProjectId]    = useState<string | null>(editTask?.projectId ?? null)
  const [repeatRule,   setRepeatRule]   = useState<string>('')   // только при создании
  const [repeatUntil,  setRepeatUntil]  = useState<string>('')
  const [members,      setMembers]      = useState<TaskUser[]>([])
  const [showPicker,   setShowPicker]   = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [confirmDel,   setConfirmDel]   = useState(false)
  const mouseDownOnBackdrop = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const trackTitle = editTask?.track?.title ?? defaultTrackTitle ?? null

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
  const { data: projectOptions = [] } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (!showPicker) return
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        closePicker()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const planningPayload = () => ({
    type: taskType,
    client: client.trim() || null,
    projectId,
    plannedMinutes: plannedMin !== '' ? Number(plannedMin) : null,
    actualMinutes: actualMin !== '' ? Number(actualMin) : null,
  })
  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? api.patch(`/tasks/${editTask.id}`, { title: title.trim(), description, assigneeId, deadline: deadline || null, trackId, stageId, ...planningPayload() })
      : api.post('/tasks', {
          title: title.trim(), description, assigneeId, deadline: deadline || undefined, trackId, stageId,
          ...(defaultStartDate ? { startDate: defaultStartDate } : {}),
          ...planningPayload(),
          ...(repeatRule && repeatUntil ? { repeatRule, repeatUntil } : {}),
        }),
    onSuccess: () => {
      onDone()
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['taskLog', editTask.id] })
        setTab('history')
      } else {
        onClose()
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${editTask!.id}`),
    onSuccess: () => { onDone(); onClose() },
  })

  function submit() {
    if (!title.trim() || !assigneeId) return
    saveMutation.mutate()
  }

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  function openPicker() {
    setPickerSearch('')
    setShowPicker(true)
  }

  function closePicker() {
    setShowPicker(false)
    setPickerSearch('')
  }

  const Picker = (
    <div ref={pickerRef} style={{ position:'relative' }}>
      <div
        onClick={() => showPicker ? closePicker() : openPicker()}
        style={{ ...inputStyle, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{assigneeName || '—'}</span>
        <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:6, flexShrink:0 }}>{showPicker ? '▴' : '▾'}</span>
      </div>
      {showPicker && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:8, marginTop:4, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <input
              autoFocus
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Поиск..."
              onMouseDown={e => e.stopPropagation()}
              style={{ ...inputStyle, padding:'6px 8px', fontSize:12 }}
            />
          </div>
          <div style={{ maxHeight:180, overflowY:'auto' }}>
            {filteredMembers.length === 0 && (
              <div style={{ padding:'12px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>Не найдено</div>
            )}
            {filteredMembers.map(m => (
              <div key={m.id}
                onMouseDown={e => { e.preventDefault(); setAssigneeId(m.id); setAssigneeName(m.name); closePicker() }}
                style={{ padding:'9px 12px', fontSize:13, color:'var(--text-1)', cursor:'pointer', background: m.id === assigneeId ? 'rgba(255,107,53,0.12)' : 'transparent' }}
                onMouseEnter={e => { if (m.id !== assigneeId) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = m.id === assigneeId ? 'rgba(255,107,53,0.12)' : 'transparent' }}
              >{m.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
    >
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:16, padding:'28px 28px 24px', width:'100%', maxWidth:560, maxHeight:'calc(100vh - 48px)', display:'flex', flexDirection:'column', gap:16, overflowY:'auto' }}>

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

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'flex-end' }}>
              <Field label="Кто поставил">
                <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assignedByName}</div>
              </Field>
              <button
                disabled={!isEdit || !onOpenChatWith}
                onClick={() => {
                  if (!isEdit || !onOpenChatWith) return
                  const targetId = editTask.assignedBy.id
                  onClose()
                  onOpenChatWith(targetId, { id: editTask.id, title: editTask.title, assigneeId: editTask.assignee.id, assignedById: editTask.assignedBy.id }, targetId === currentUser?.id)
                }}
                style={{ height:36, padding:'0 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:12, cursor: (isEdit && onOpenChatWith) ? 'pointer' : 'default', whiteSpace:'nowrap', flexShrink:0, opacity: (isEdit && onOpenChatWith) ? 1 : 0.35 }}
              >Открыть в чате</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'flex-end' }}>
              <Field label="Исполнитель" hint="Кто выполняет задачу. Исполнитель получит уведомление о назначении. По умолчанию — вы сами.">
                {(!isReadOnly && canChangeAssignee)
                  ? Picker
                  : <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assigneeName}</div>
                }
              </Field>
              <button
                disabled={!isEdit || !onOpenChatWith}
                onClick={() => {
                  if (!isEdit || !onOpenChatWith) return
                  const targetId = editTask.assignee.id
                  onClose()
                  onOpenChatWith(targetId, { id: editTask.id, title: editTask.title, assigneeId: editTask.assignee.id, assignedById: editTask.assignedBy.id }, targetId === currentUser?.id)
                }}
                style={{ height:36, padding:'0 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:12, cursor: (isEdit && onOpenChatWith) ? 'pointer' : 'default', whiteSpace:'nowrap', flexShrink:0, opacity: (isEdit && onOpenChatWith) ? 1 : 0.35 }}
              >Открыть в чате</button>
            </div>
          </div>

          {/* — Планирование (поля донора: тип 94%, клиент 95%, минуты 83/80%) — */}
          <Field label="Тип" hint="Влияет на иконку в ленте и фильтры. «Встреча» автоматически создаёт событие в Календаре.">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {TASK_TYPE_OPTIONS.map(o => (
                <button key={o.value} disabled={isReadOnly}
                  onClick={() => !isReadOnly && setTaskType(o.value)}
                  style={{
                    padding:'5px 12px', borderRadius:14, fontFamily:'Inter,sans-serif', fontSize:12,
                    cursor: isReadOnly ? 'default' : 'pointer', fontWeight: taskType === o.value ? 700 : 400,
                    border: `1px solid ${taskType === o.value ? o.color : 'var(--border)'}`,
                    background: taskType === o.value ? `${o.color}22` : 'var(--surface-3)',
                    color: taskType === o.value ? o.color : 'var(--text-3)',
                  }}>{o.label}</button>
              ))}
            </div>
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
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
            <Field label="Проект" hint="Привязывает задачу к проекту компании. Задача появится в карточке этого проекта.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{editTask?.project?.title ?? '—'}</div>
                : <select value={projectId ?? ''} onChange={e => setProjectId(e.target.value || null)}
                    style={{ ...inputStyle, width:'100%' }}>
                    <option value="">—</option>
                    {projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
              }
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="План, мин" hint="Планируемое время на задачу в минутах. Учитывается в расчёте нагрузки сотрудника в Аналитике.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{plannedMin || '—'}</div>
                : <input type="number" min={0} step={15} value={plannedMin}
                    onChange={e => setPlannedMin(e.target.value)} placeholder="45" style={inputStyle} />
              }
            </Field>
            <Field label="Факт, мин" hint="Фактически затраченное время. Если при завершении задачи факт не указан — автоматически скопируется из плана.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{actualMin || '—'}</div>
                : <input type="number" min={0} step={15} value={actualMin}
                    onChange={e => setActualMin(e.target.value)}
                    placeholder={plannedMin ? `${plannedMin} (при завершении)` : ''} style={inputStyle} />
              }
            </Field>
          </div>

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
                  <DatePicker value={repeatUntil} onChange={setRepeatUntil} min={fmtD(new Date())} />
                </Field>
              )}
            </div>
          )}
          {isEdit && editTask?.repeatRule && (
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>
              ↻ Серия: {editTask.repeatRule === 'daily' ? 'ежедневно' : 'по будням'} до {toDateStr(editTask.repeatUntil)}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns: trackId ? '1fr 1fr' : '1fr', gap:12, marginTop:4 }}>
            {trackId && trackTitle && (
              <Field label="Трек">
                <div style={{ ...inputStyle, color:'var(--accent-s)', userSelect:'none', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:12, opacity:0.7 }}>◈</span> {trackTitle}
                  {(editTask?.stage?.title ?? null) && <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:4 }}>/ {editTask!.stage!.title}</span>}
                </div>
              </Field>
            )}
            <Field label="Дедлайн" hint="Срок выполнения. Просроченные задачи выделяются красным в ленте и попадают в блок дедлайнов на Главной.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none' }}>{deadline ? deadline : '—'}</div>
                : <DatePicker value={deadline} onChange={setDeadline} min={isEdit ? toDateStr(editTask.startDate) : fmtD(new Date())} />
              }
            </Field>
          </div>
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
            <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:13, cursor:'pointer' }}>{isReadOnly ? 'Закрыть' : 'Отмена'}</button>
            {!isReadOnly && (
              <button onClick={submit} disabled={!title.trim() || saveMutation.isPending} style={{ padding:'8px 20px', borderRadius:8, border:'none', background: title.trim() ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'rgba(255,255,255,0.08)', color: title.trim() ? '#fff' : 'var(--text-muted)', fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, cursor: title.trim() ? 'pointer' : 'default' }}>
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

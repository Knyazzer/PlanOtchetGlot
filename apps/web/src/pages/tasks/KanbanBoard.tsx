import React, { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { taskTypeMeta, fmtMinutes } from '../../lib/taskMeta'
import type { Task, TaskStatus, BoardGroupBy, BoardData } from './types'
import { COLS, COLOR_PALETTE, taskColor, toDateStr } from './utils'

// ── Kanban card ────────────────────────────────────────────────────────────────
function KanbanCard({ task, color, isDone, deadlineStr, dragId, onEdit, currentUserId }: {
  task:          Task
  color:         string
  isDone:        boolean
  deadlineStr:   string
  dragId:        React.MutableRefObject<string | null>
  onEdit:        (task: Task) => void
  currentUserId: string
}) {
  const isCalendar = !!task.calendarEventId
  const isOutgoing = !isCalendar && task.assignedBy.id === currentUserId && task.assignee.id !== currentUserId
  const isIncoming = !isCalendar && task.assignee.id === currentUserId && task.assignedBy.id !== currentUserId
  const isNew      = !task.seenAt && task.assignee.id === currentUserId

  return (
    <div
      draggable={!isCalendar}
      onDragStart={() => { if (!isCalendar) dragId.current = task.id }}
      onDragEnd={() => { dragId.current = null }}
      className={isNew ? 'task-new' : undefined}
      style={{
        background: 'var(--surface-2)',
        border: isNew ? '1px solid rgba(255,107,53,0.4)' : '1px solid var(--border)',
        borderRadius: 12, padding: '14px 16px', cursor: isCalendar ? 'default' : 'grab',
        opacity: isDone ? 0.55 : 1, position: 'relative',
      }}
    >
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit(task) }}
        title="Редактировать"
        style={{ position:'absolute', top:10, right:10, width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-muted)', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, opacity:0.7 }}
      >✎</button>

      <div style={{ paddingRight:32, marginBottom: task.description ? 8 : 10, display:'flex', alignItems:'baseline', gap:6 }}>
        {isCalendar && (
          <span title="Задача из события календаря" style={{ fontSize:15, lineHeight:1, cursor:'default', flexShrink:0 }}>📅</span>
        )}
        {(isOutgoing || isIncoming) && (
          <span
            title={isOutgoing ? `Поставлено вами → ${task.assignee.name}` : `Поставлено вам ← ${task.assignedBy.name}`}
            style={{ fontSize:18, lineHeight:1, fontWeight:700, color: isOutgoing ? '#0EA5E9' : '#F59E0B', cursor:'default', flexShrink:0 }}
          >
            {isOutgoing ? '↑' : '↓'}
          </span>
        )}
        <span style={{ fontSize:14, fontWeight:600, color:'var(--text-1)', lineHeight:1.45, textDecoration: isDone ? 'line-through' : 'none' }}>
          {task.title}
        </span>
      </div>

      {task.description && (
        <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:10, lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{task.description}</div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* клиент · проект — главная мета карточки (95%/40% заполняемости донора) */}
        {(task.client || task.project) && (
          <span style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>
            {task.client}{task.client && task.project ? ' · ' : ''}{task.project?.title ?? ''}
          </span>
        )}
        {task.type !== 'task' && taskTypeMeta(task.type) && (
          <span style={{ fontSize:12, fontWeight:600, padding:'2px 8px', borderRadius:20,
            background: taskTypeMeta(task.type)!.color + '22', color: taskTypeMeta(task.type)!.color }}>
            {taskTypeMeta(task.type)!.label}
          </span>
        )}
        {(task.actualMinutes ?? task.plannedMinutes) != null && (
          <span style={{ fontSize:12, fontFamily:'monospace', color:'var(--text-3)', border:'1px solid var(--border)', borderRadius:20, padding:'1px 7px' }}>
            {fmtMinutes((task.actualMinutes ?? task.plannedMinutes)!)}
          </span>
        )}
        {task.recurringParentId || task.repeatRule ? (
          <span title="Серия повторов" style={{ fontSize:12, color:'var(--text-muted)' }}>↻</span>
        ) : null}
        {task.track && (
          <span style={{ fontSize:12, padding:'2px 8px', borderRadius:20, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', color:'var(--accent-s)', display:'inline-flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:12 }}>◈</span> {task.track.title}
          </span>
        )}
        {(isCalendar || isOutgoing || isIncoming) && (
          <span style={{ fontSize:12, fontWeight:600, padding:'2px 8px', borderRadius:20, background:color+'22', color }}>
            {(isIncoming || isCalendar) ? task.assignedBy.name : task.assignee.name}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Kanban board ───────────────────────────────────────────────────────────────
// Обобщённая доска: группировка статус / клиент / мои колонки (инсайт донора:
// люди группируют по клиентам и направлениям, не по статусному workflow).
export function KanbanBoard({ tasks, groupBy, onUpdate, onOpenCreate, onEdit, currentUserId, onToast }: {
  tasks: Task[]
  groupBy: BoardGroupBy
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onOpenCreate: (opts?: { deadline?: string; startDate?: string }) => void
  onEdit: (task: Task) => void
  currentUserId: string
  onToast: (msg: string) => void
}) {
  const dragId = useRef<string | null>(null)
  const qc = useQueryClient()
  const [newColName, setNewColName] = useState('')
  const [renamingCol, setRenamingCol] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { data: board } = useQuery<BoardData>({
    queryKey: ['board'],
    queryFn: () => api.get('/board').then(r => r.data),
    enabled: groupBy === 'custom',
  })

  const placeMutation = useMutation({
    mutationFn: (p: { taskId: string; columnId: string | null }) => api.put('/board/placements', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
    onError: (err: unknown) => onToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка'),
  })
  const addColMutation = useMutation({
    mutationFn: (name: string) => api.post('/board/columns', { name }),
    onSuccess: () => { setNewColName(''); qc.invalidateQueries({ queryKey: ['board'] }) },
  })
  const renameColMutation = useMutation({
    mutationFn: (p: { id: string; name: string }) => api.patch(`/board/columns/${p.id}`, { name: p.name }),
    onSuccess: () => { setRenamingCol(null); qc.invalidateQueries({ queryKey: ['board'] }) },
  })
  const delColMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/board/columns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  })

  // Колонки текущего режима: key → {label, color, taskFilter}
  type BoardCol = { key: string; label: string; color: string; tasks: Task[]; customId?: string; deletable?: boolean }
  let cols: BoardCol[] = []
  if (groupBy === 'status') {
    cols = COLS.map(c => ({ key: c.id, label: c.label, color: c.color, tasks: tasks.filter(t => t.status === c.id) }))
  } else if (groupBy === 'client') {
    const clients = [...new Set(tasks.map(t => t.client).filter(Boolean))] as string[]
    clients.sort((a, b) => a.localeCompare(b, 'ru'))
    cols = [
      ...clients.map((c, i) => ({
        key: `client:${c}`, label: c, color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        tasks: tasks.filter(t => t.client === c),
      })),
      { key: 'client:', label: 'Без клиента', color: '#464658', tasks: tasks.filter(t => !t.client) },
    ]
  } else {
    const placementByTask = new Map((board?.placements ?? []).map(p => [p.taskId, p.columnId]))
    const customCols = board?.columns ?? []
    cols = [
      ...customCols.map((c, i) => ({
        key: `col:${c.id}`, label: c.name, color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        customId: c.id, deletable: true,
        tasks: tasks.filter(t => placementByTask.get(t.id) === c.id),
      })),
      { key: 'col:', label: 'Без колонки', color: '#464658', tasks: tasks.filter(t => !placementByTask.has(t.id)) },
    ]
  }

  function onDrop(col: BoardCol) {
    if (!dragId.current) return
    const id = dragId.current
    dragId.current = null
    const task = tasks.find(t => t.id === id)
    if (!task) return

    if (groupBy === 'status') {
      const status = col.key as TaskStatus
      if (task.calendarEventId) { onToast('Задача из события — статус меняется автоматически'); return }
      if (task.assignee.id !== currentUserId) { onToast('Статус задачи может менять только исполнитель'); return }
      if (task.status === status) return
      onUpdate(id, { status })
    } else if (groupBy === 'client') {
      const client = col.key === 'client:' ? null : col.label
      if (task.client === client) return
      onUpdate(id, { client })
    } else {
      placeMutation.mutate({ taskId: id, columnId: col.customId ?? null })
    }
  }

  return (
    <div style={{ flex:1, display:'flex', gap:16, padding:'24px 28px', overflowX:'auto', alignItems:'flex-start', justifyContent: cols.length <= 3 ? 'center' : 'flex-start' }}>
      {cols.map(col => {
        const colTasks = col.tasks
        return (
          <div key={col.key}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(col)}
            style={{ width:300, flexShrink:0, background:'var(--surface-1)', borderRadius:16, border:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ height:3, background:col.color }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 16px 10px' }}>
              {renamingCol === col.customId && col.customId ? (
                <input autoFocus value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && renameValue.trim()) renameColMutation.mutate({ id: col.customId!, name: renameValue.trim() })
                    if (e.key === 'Escape') setRenamingCol(null)
                  }}
                  onBlur={() => setRenamingCol(null)}
                  style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:700, outline:'none' }} />
              ) : (
                <span
                  onDoubleClick={() => { if (col.customId) { setRenamingCol(col.customId); setRenameValue(col.label) } }}
                  title={col.customId ? 'Двойной клик — переименовать' : undefined}
                  style={{ fontSize:14, fontWeight:700, letterSpacing:'0.3px', color:col.color, flex:1, cursor: col.customId ? 'text' : 'default' }}>
                  {col.label}
                </span>
              )}
              <span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'var(--surface-3)', color:'var(--text-3)' }}>{colTasks.length}</span>
              {col.deletable && (
                <button onClick={() => delColMutation.mutate(col.customId!)}
                  title="Удалить колонку (задачи останутся)"
                  style={{ width:20, height:20, borderRadius:5, border:'none', background:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer', opacity:0.6 }}>✕</button>
              )}
            </div>
            <div style={{ height:1, background:'var(--border)', margin:'0 0 6px' }} />
            <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'8px 12px 14px', minHeight:80 }}>
              {colTasks.length === 0 && (
                <div style={{ color:'var(--text-muted)', fontSize:12, textAlign:'center', padding:'16px 0', opacity:0.5 }}>
                  {groupBy === 'status' ? 'Нет задач' : 'Перетащите задачи сюда'}
                </div>
              )}
              {colTasks.map(task => {
                const color       = taskColor(task.id)
                const isDone      = task.status === 'done'
                const deadlineStr = toDateStr(task.deadline)
                return (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    color={color}
                    isDone={isDone}
                    deadlineStr={deadlineStr}
                    dragId={dragId}
                    onEdit={onEdit}
                    currentUserId={currentUserId}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      {groupBy === 'custom' && (
        <div style={{ width:260, flexShrink:0 }}>
          <input
            value={newColName}
            onChange={e => setNewColName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newColName.trim()) addColMutation.mutate(newColName.trim()) }}
            placeholder="+ Новая колонка (Enter)"
            style={{ width:'100%', boxSizing:'border-box', background:'none', border:'1.5px dashed var(--border)', borderRadius:12, padding:'12px 14px', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:14, outline:'none' }} />
        </div>
      )}
    </div>
  )
}
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

// Каскад назначения роли/места в оргструктуре (карточка «Персонала»).
// Спека: docs/superpowers/specs/2026-07-11-personnel-role-form-design.md

type AssignType = 'member' | 'head' | 'director'
type Row = { type: AssignType; deptId: string; divId: string; specialization: string }
type Dept = { id: string; name: string; divisions: { id: string; name: string }[] }
type Conflict = { slot: 'head' | 'director'; currentUserName?: string; name?: string }

const inp: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-1)', fontSize: 13, padding: '8px 10px',
  outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', display: 'block', marginBottom: 6,
}
const TYPES: { v: AssignType; l: string }[] = [
  { v: 'member', l: 'Сотрудник' }, { v: 'head', l: 'Руководитель' }, { v: 'director', l: 'Директор' },
]
const empty = (): Row => ({ type: 'member', deptId: '', divId: '', specialization: '' })

export function AssignmentsEditor({ userId, invalidateKey }: { userId: string; invalidateKey: string[] }) {
  const qc = useQueryClient()
  const { data: depts } = useQuery<Dept[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
  })
  const { data: loaded, isLoading } = useQuery<Row[]>({
    queryKey: ['assignments', userId],
    queryFn: () => api.get(`/users/${userId}/assignments`).then(r =>
      (r.data.assignments as any[]).map(a => ({
        type: a.type, deptId: a.deptId, divId: a.divId ?? '', specialization: a.specialization ?? '',
      }))),
  })

  const [rows, setRows] = useState<Row[] | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const eff: Row[] = rows ?? (loaded && loaded.length ? loaded : [empty()])

  const update = (i: number, patch: Partial<Row>) => setRows(eff.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const setType = (i: number, type: AssignType) =>
    update(i, { type, ...(type === 'director' ? { divId: '' } : {}), ...(type !== 'member' ? { specialization: '' } : {}) })
  const setDept = (i: number, deptId: string) => update(i, { deptId, divId: '' })

  const save = useMutation({
    mutationFn: (replace?: boolean) => api.put(`/users/${userId}/assignments`, {
      assignments: eff.map(r => ({
        type: r.type, deptId: r.deptId,
        ...(r.type !== 'director' && r.divId ? { divId: r.divId } : {}),
        ...(r.type === 'member' && r.specialization.trim() ? { specialization: r.specialization.trim() } : {}),
      })),
      replace,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey, refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['assignments', userId] })
      qc.invalidateQueries({ queryKey: ['structure'] })
      setRows(null); setConflict(null)
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) setConflict(err.response.data)
      else alert(err?.response?.data?.error ?? 'Не удалось сохранить назначение')
    },
  })

  const valid = eff.every(r => r.deptId && (r.type === 'director' || !!r.divId))

  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Загрузка назначений…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={lbl}>Должность и место в оргструктуре</label>

      {eff.map((r, i) => {
        const dept = depts?.find(d => d.id === r.deptId)
        return (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
            {eff.length > 1 && (
              <button onClick={() => setRows(eff.filter((_, j) => j !== i))} title="Убрать должность"
                style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15 }}>✕</button>
            )}
            <div>
              <label style={lbl}>Тип</label>
              <select value={r.type} onChange={e => setType(i, e.target.value as AssignType)} style={inp}>
                {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Департамент</label>
              <select value={r.deptId} onChange={e => setDept(i, e.target.value)} style={inp}>
                <option value="">— выбрать —</option>
                {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {r.type !== 'director' && (
              <div>
                <label style={lbl}>Отдел</label>
                <select value={r.divId} onChange={e => update(i, { divId: e.target.value })} style={{ ...inp, opacity: r.deptId ? 1 : 0.5 }} disabled={!r.deptId}>
                  <option value="">— выбрать —</option>
                  {dept?.divisions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            )}
            {r.type === 'member' && (
              <div>
                <label style={lbl}>Уточнение (специализация)</label>
                <input value={r.specialization} onChange={e => update(i, { specialization: e.target.value })} style={inp} placeholder="напр. Монтажёр" />
              </div>
            )}
          </div>
        )
      })}

      {eff.length < 2 && (
        <button onClick={() => setRows([...eff, empty()])}
          style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-2)', padding: 8, cursor: 'pointer', fontSize: 12 }}>
          + Добавить должность (совмещение)
        </button>
      )}

      <button onClick={() => save.mutate(undefined)} disabled={!valid || save.isPending}
        style={{ background: valid ? 'var(--accent, #2563eb)' : 'var(--surface-2)', color: valid ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 8, padding: 9, cursor: valid && !save.isPending ? 'pointer' : 'default', fontSize: 13, fontWeight: 600 }}>
        {save.isPending ? 'Сохранение…' : 'Сохранить назначение'}
      </button>

      {conflict && (
        <ConflictModal conflict={conflict} pending={save.isPending}
          onCancel={() => setConflict(null)} onReplace={() => save.mutate(true)} />
      )}
    </div>
  )
}

// Модалка замены слота — закрытие только mousedown+mouseup на оверлее (железное правило попапов).
function ConflictModal({ conflict, onCancel, onReplace, pending }: {
  conflict: Conflict; onCancel: () => void; onReplace: () => void; pending: boolean
}) {
  const md = useRef(false)
  const role = conflict.slot === 'head' ? 'руководитель' : 'директор'
  const noun = conflict.slot === 'head' ? 'Отдел' : 'Департамент'
  return (
    <div
      onMouseDown={e => { md.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (md.current && e.target === e.currentTarget) onCancel(); md.current = false }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Слот занят</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {noun} «{conflict.name}» уже имеет {role}{conflict.currentUserName ? ` — ${conflict.currentUserName}` : ''}.
          Заменить? Прежний {role} станет рядовым (членство в отделе сохранится).
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
          <button onClick={onReplace} disabled={pending} style={{ background: 'var(--danger, #dc2626)', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{pending ? '…' : 'Заменить'}</button>
        </div>
      </div>
    </div>
  )
}

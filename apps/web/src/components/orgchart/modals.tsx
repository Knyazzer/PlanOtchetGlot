import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { Department, Division, Membership, OrgUser, ProfileData } from './types'
import { BtnDanger, BtnPrimary, BtnSecondary, ColorPicker, Field, FieldInput, FieldSelect, Modal, UserSelect } from './ui'

// ─── Profile Modal ────────────────────────────────────────────────────────────

export function OrgProfileModal({ userId, deptColor, onClose }: {
  userId: string
  deptColor: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useQuery<ProfileData>({
    queryKey: ['user-profile', userId],
    queryFn: () => api.get(`/users/${userId}/profile`).then(r => r.data),
  })

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])

  const name = data ? formatName(data.name) : '…'
  const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div ref={ref} style={{
        background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '28px 32px', width: 300, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'relative',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1, padding: 4 }}>✕</button>
        <div style={{
          width: 68, height: 68, borderRadius: '50%', background: deptColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>{data ? initials(data.name) : '…'}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{name}</div>
          {data?.position && <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 5 }}>{data.position}</div>}
        </div>
        {data?.status && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', fontSize: 14, color: 'var(--text-2)', fontStyle: 'italic', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
            {data.status}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal forms ──────────────────────────────────────────────────────────────

export function EditDeptModal({ dept, users, onSave, onDelete, onAddDiv, onClose }: {
  dept: Department; users: OrgUser[]
  onSave: (d: { name: string; color: string; directorId: string | null }) => void
  onDelete: () => void; onAddDiv: () => void; onClose: () => void
}) {
  const [name, setName]         = useState(dept.name)
  const [color, setColor]       = useState(dept.color)
  const [directorId, setDirectorId] = useState(dept.directorId ?? '')
  return (
    <Modal title="Редактировать департамент" onClose={onClose} footer={<>
      <BtnDanger onClick={onDelete}>Удалить</BtnDanger>
      <BtnSecondary onClick={onClose}>Отмена</BtnSecondary>
      <BtnPrimary onClick={() => onSave({ name, color, directorId: directorId || null })}>Сохранить</BtnPrimary>
    </>}>
      <Field label="Название"><FieldInput value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Директор"><UserSelect users={users} value={directorId} onChange={setDirectorId} /></Field>
      <Field label="Цвет"><ColorPicker value={color} onChange={setColor} /></Field>
      <div style={{ borderTop:'1px solid var(--border)',paddingTop:12 }}>
        <BtnSecondary onClick={onAddDiv} style={{ width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:6,color:'var(--text-2)' }}>
          <span style={{ fontSize:15 }}>＋</span> Новый отдел
        </BtnSecondary>
      </div>
    </Modal>
  )
}

export function AddDeptModal({ users, defaultColor, onSave, onClose }: {
  users: OrgUser[]; defaultColor: string
  onSave: (d: { name: string; color: string; directorId: string | null }) => void
  onClose: () => void
}) {
  const [name, setName]         = useState('')
  const [color, setColor]       = useState(defaultColor)
  const [directorId, setDirectorId] = useState('')
  return (
    <Modal title="Новый департамент" onClose={onClose} footer={<>
      <BtnSecondary onClick={onClose}>Отмена</BtnSecondary>
      <BtnPrimary onClick={() => { if (name) onSave({ name, color, directorId: directorId || null }) }}>Создать</BtnPrimary>
    </>}>
      <Field label="Название"><FieldInput value={name} onChange={e => setName(e.target.value)} placeholder="Например: HR департамент" /></Field>
      <Field label="Директор"><UserSelect users={users} value={directorId} onChange={setDirectorId} /></Field>
      <Field label="Цвет"><ColorPicker value={color} onChange={setColor} /></Field>
    </Modal>
  )
}

export function AddDivModal({ users, onSave, onClose }: {
  users: OrgUser[]
  onSave: (d: { name: string; headId: string | null }) => void
  onClose: () => void
}) {
  const [name, setName]   = useState('')
  const [headId, setHeadId] = useState('')
  return (
    <Modal title="Новый отдел" onClose={onClose} footer={<>
      <BtnSecondary onClick={onClose}>Отмена</BtnSecondary>
      <BtnPrimary onClick={() => { if (name) onSave({ name, headId: headId || null }) }}>Создать</BtnPrimary>
    </>}>
      <Field label="Название"><FieldInput value={name} onChange={e => setName(e.target.value)} placeholder="Например: Сценарный отдел" /></Field>
      <Field label="Руководитель"><UserSelect users={users} value={headId} onChange={setHeadId} /></Field>
    </Modal>
  )
}

export function EditDivModal({ div, users, onSave, onDelete, onClose }: {
  div: Division; users: OrgUser[]
  onSave: (d: { name: string; headId: string | null }) => void
  onDelete: () => void; onClose: () => void
}) {
  const [name, setName]     = useState(div.name)
  const [headId, setHeadId] = useState(div.headId ?? '')
  return (
    <Modal title="Редактировать отдел" onClose={onClose} footer={<>
      <BtnDanger onClick={onDelete}>Удалить</BtnDanger>
      <BtnSecondary onClick={onClose}>Отмена</BtnSecondary>
      <BtnPrimary onClick={() => onSave({ name, headId: headId || null })}>Сохранить</BtnPrimary>
    </>}>
      <Field label="Название"><FieldInput value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Руководитель"><UserSelect users={users} value={headId} onChange={setHeadId} /></Field>
    </Modal>
  )
}

export function AddMemberModal({ divId, users, departments, onSave, onClose }: {
  divId: string; users: OrgUser[]; departments: Department[]
  onSave: (d: { userId: string; divId: string; position: string }) => void
  onClose: () => void
}) {
  const [userId, setUserId] = useState('')
  const [position, setPosition] = useState('')
  const existing = departments.flatMap(d => d.divisions).find(d => d.id === divId)?.memberships.map(m => m.userId) ?? []
  const available = users.filter(u => !existing.includes(u.id))
  return (
    <Modal title="Добавить сотрудника" onClose={onClose} footer={<>
      <BtnSecondary onClick={onClose}>Отмена</BtnSecondary>
      <BtnPrimary onClick={() => { if (userId && position) onSave({ userId, divId, position }) }}>Добавить</BtnPrimary>
    </>}>
      <Field label="Сотрудник">
        <UserSelect users={available} value={userId} onChange={setUserId} placeholder="— выберите —" />
      </Field>
      <Field label="Должность в отделе">
        <FieldInput value={position} onChange={e => setPosition(e.target.value)} placeholder="Например: Видеоинженер" />
      </Field>
    </Modal>
  )
}

export function EditMemberModal({ membership, departments, onSave, onRemove, onClose }: {
  membership: Membership; departments: Department[]
  onSave: (d: { userId: string; divId: string; position: string; newDivId?: string }) => void
  onRemove: () => void; onClose: () => void
}) {
  const [position, setPosition] = useState(membership.position)
  const [newDivId, setNewDivId] = useState('')
  const allDivs = departments.flatMap(d => d.divisions.map(dv => ({ ...dv, deptName: d.name }))).filter(dv => dv.id !== membership.divId)
  return (
    <Modal title={membership.user.name} onClose={onClose} footer={<>
      <BtnDanger onClick={onRemove}>Убрать из отдела</BtnDanger>
      <BtnSecondary onClick={onClose}>Отмена</BtnSecondary>
      <BtnPrimary onClick={() => onSave({ userId: membership.userId, divId: membership.divId, position, ...(newDivId ? { newDivId } : {}) })}>Сохранить</BtnPrimary>
    </>}>
      <Field label="Должность в отделе">
        <FieldInput value={position} onChange={e => setPosition(e.target.value)} />
      </Field>
      <Field label="Переместить в другой отдел">
        <FieldSelect value={newDivId} onChange={setNewDivId}>
          <option value="">— оставить здесь —</option>
          {allDivs.map(dv => <option key={dv.id} value={dv.id}>{dv.deptName} → {dv.name}</option>)}
        </FieldSelect>
      </Field>
    </Modal>
  )
}

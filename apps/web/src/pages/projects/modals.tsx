import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Hint } from '../../components/Hint'
import type { Client } from './types'
import { labelStyle, inputStyle, cancelBtnStyle, submitBtnStyle, FORMATS, LOCATIONS } from './constants'

// ── ProjectFormModal ──────────────────────────────────────────────────────────

export function ProjectFormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle]   = useState('')
  const [clientId, setClientId] = useState('')
  const [brief, setBrief]   = useState('')
  const [kpLink, setKpLink] = useState('')

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn:  () => api.get('/clients').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: () => api.post('/projects', { title, clientId: clientId || undefined, brief: brief || undefined, kpLink: kpLink || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-1)', borderRadius: 14, padding: 28, width: 440,
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Новый проект</h3>

        <label style={labelStyle}>Название <span style={{ color: '#F43F5E' }}>*</span></label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название проекта"
          style={inputStyle} autoFocus />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Клиент <Hint text="Клиент проекта. Если нужного нет в списке — добавьте через Персонал → Клиенты." /></label>
        <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
          <option value="">— не выбрано —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Ссылка на КП <Hint text="Коммерческое предложение — ссылка на Google Docs, PDF или другой документ." /></label>
        <input value={kpLink} onChange={e => setKpLink(e.target.value)} placeholder="https://"
          style={inputStyle} />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Бриф <Hint text="Краткое описание: задача, цель, контекст." /></label>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} placeholder="Краткое описание проекта"
          rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Отмена</button>
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
            style={{ ...submitBtnStyle, opacity: title.trim() && !create.isPending ? 1 : 0.5 }}
          >{create.isPending ? 'Создание...' : 'Создать'}</button>
        </div>
      </div>
    </div>
  )
}

// ── WorkItemFormModal ─────────────────────────────────────────────────────────

export function WorkItemFormModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle]   = useState('')
  const [date,  setDate]    = useState('')
  const [format, setFormat] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/work-items`, {
      title, date: date || undefined, format: format || undefined,
      location: location || undefined, description: description || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-items', projectId] }); onClose() },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-1)', borderRadius: 14, padding: 28, width: 420,
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Новый Work Item</h3>

        <label style={labelStyle}>Название <span style={{ color: '#F43F5E' }}>*</span></label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Что нужно сделать"
          style={inputStyle} autoFocus />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Дата / период <Hint text="Дата или период съёмки, вводится в свободной форме." /></label>
        <input value={date} onChange={e => setDate(e.target.value)} placeholder="например: 15 июня" style={inputStyle} />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Формат <Hint text="Производственный формат съёмки. Влияет на фильтры и отчёты по проектам." /></label>
            <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Локация <Hint text="Место проведения съёмки из предустановленного списка площадок." /></label>
            <select value={location} onChange={e => setLocation(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <label style={labelStyle}>Описание</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Детали задачи"
          rows={2} style={{ ...inputStyle, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Отмена</button>
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
            style={{ ...submitBtnStyle, opacity: title.trim() && !create.isPending ? 1 : 0.5 }}
          >{create.isPending ? 'Создание...' : 'Добавить'}</button>
        </div>
      </div>
    </div>
  )
}
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Hint } from '../../components/Hint'
import { FORMATS, LOCATIONS, inputStyle } from './constants'

// ── WIFormModal ───────────────────────────────────────────────────────────────

export function WIFormModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [format, setFormat] = useState('')
  const [location, setLocation] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/work-items`, { title, date: date || undefined, format: format || undefined, location: location || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-items', projectId] }); onClose() },
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-1)', borderRadius: 14, padding: 24, width: 400, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Новый Work Item</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название *" style={inputStyle} autoFocus />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center' }}>
              Дата <Hint text="Дата съёмки или события. Отображается в карточке WI." />
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center' }}>
              Формат <Hint text="Производственный формат съёмки: ТВ, Радио и т.д. Влияет на фильтры по проектам." />
            </div>
            <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}><option value="">— Формат</option>{FORMATS.map(f => <option key={f} value={f}>{f}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center' }}>
              Локация <Hint text="Место проведения съёмки. Из предустановленного списка площадок компании." />
            </div>
            <select value={location} onChange={e => setLocation(e.target.value)} style={inputStyle}><option value="">— Локация</option>{LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}</select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ fontSize: 14, padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Отмена</button>
          <button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} style={{ fontSize: 14, padding: '7px 18px', borderRadius: 8, border: 'none', background: '#7B61FF', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: title.trim() && !create.isPending ? 1 : 0.5 }}>
            {create.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
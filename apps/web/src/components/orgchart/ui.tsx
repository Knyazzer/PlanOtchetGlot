import { useEffect, useMemo, useRef, useState } from 'react'
import { formatName } from '../../lib/utils'
import { DEPT_COLORS, inputStyle } from './constants'
import type { OrgUser } from './types'

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, footer }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const mdRef = useRef(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }}
    >
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-1)',border:'1px solid var(--border)',borderRadius:14,width:400,maxWidth:'95vw',boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ fontSize:15,fontWeight:700,color:'var(--text-1)' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-muted)',fontSize:16,cursor:'pointer',padding:'2px 6px',borderRadius:4 }}>✕</button>
        </div>
        <div style={{ padding:'18px 22px',display:'flex',flexDirection:'column',gap:14 }}>{children}</div>
        <div style={{ padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:8,justifyContent:'flex-end' }}>{footer}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6 }}>{label}</div>
      {children}
    </div>
  )
}

export function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input style={inputStyle} {...props} />
}

export function FieldSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, cursor:'pointer' }}
    >
      {children}
    </select>
  )
}

export function BtnPrimary({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize:13,padding:'8px 20px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#FF6B35,#E8194B)',color:'#fff',fontFamily:'Inter,sans-serif',fontWeight:600,cursor:'pointer' }}>
      {children}
    </button>
  )
}

export function BtnSecondary({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ fontSize:13,padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'none',color:'var(--text-3)',cursor:'pointer',fontFamily:'Inter,sans-serif',...style }}>
      {children}
    </button>
  )
}

export function BtnDanger({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize:12,padding:'7px 14px',borderRadius:8,border:'none',background:'rgba(232,25,75,0.15)',color:'var(--danger)',fontFamily:'Inter,sans-serif',cursor:'pointer',marginRight:'auto' }}>
      {children}
    </button>
  )
}

// ─── Color Picker ─────────────────────────────────────────────────────────────

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
      {DEPT_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            width:28,height:28,borderRadius:6,border:`2px solid ${c === value ? '#fff' : 'transparent'}`,
            background:c,cursor:'pointer',flexShrink:0,padding:0,
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width:28,height:28,borderRadius:6,border:'2px solid transparent',padding:0,cursor:'pointer',background:'none',flexShrink:0 }}
        title="Свой цвет"
      />
    </div>
  )
}

// ─── User Select (searchable combobox) ────────────────────────────────────────

export function UserSelect({ users, value, onChange, placeholder = '— не назначен —' }: {
  users: OrgUser[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = users.find(u => u.id === value) ?? null
  const displayName = selected ? formatName(selected.name) : ''

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return users
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      formatName(u.name).toLowerCase().includes(q) ||
      (u.tabNumber && u.tabNumber.toLowerCase().includes(q))
    )
  }, [users, q])

  const baseInput: React.CSSProperties = {
    width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)',
    fontFamily: 'inherit', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    cursor: 'pointer',
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {open ? (
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени или табельному…"
          style={{ ...baseInput, cursor: 'text' }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setSearch('') }
            if (e.key === 'Enter' && filtered.length === 1) {
              onChange(filtered[0].id)
              setOpen(false); setSearch('')
            }
          }}
        />
      ) : (
        <div
          onClick={() => setOpen(true)}
          style={{ ...baseInput, display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}
        >
          {selected ? (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              {selected.tabNumber && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{selected.tabNumber}</span>
              )}
              <span
                onMouseDown={e => { e.stopPropagation(); onChange(''); setSearch('') }}
                style={{ fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                title="Снять назначение"
              >✕</span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)', flex: 1 }}>{placeholder}</span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>▾</span>
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <div
            onMouseDown={() => { onChange(''); setOpen(false); setSearch('') }}
            style={{
              padding: '8px 12px', fontSize: 13, color: 'var(--text-muted)',
              cursor: 'pointer', borderBottom: '1px solid var(--border)',
              fontStyle: 'italic',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
          >
            {placeholder}
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>Не найдено</div>
          )}
          {filtered.map(u => (
            <div
              key={u.id}
              onMouseDown={() => { onChange(u.id); setOpen(false); setSearch('') }}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                background: u.id === value ? 'rgba(99,102,241,0.12)' : '',
                color: u.id === value ? 'var(--accent-s)' : 'var(--text-1)',
              }}
              onMouseEnter={e => { if (u.id !== value) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-3)' }}
              onMouseLeave={e => { if (u.id !== value) (e.currentTarget as HTMLDivElement).style.background = '' }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatName(u.name)}
              </span>
              {u.tabNumber && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{u.tabNumber}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Small action buttons ──────────────────────────────────────────────────────

export function ActionBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{ width:20,height:20,borderRadius:4,border:'1px solid var(--border)',background:'var(--surface-2)',color:danger?'rgba(255,100,100,0.8)':'var(--text-3)',fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif' }}
    >
      {children}
    </button>
  )
}

export function ZBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize:13,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'none',color:'var(--text-3)',cursor:'pointer',fontFamily:'Inter,sans-serif' }}>
      {children}
    </button>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatName } from '../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgUser {
  id: string
  name: string
  tabNumber: string | null
  position?: string | null
}

interface Membership {
  userId: string
  divId: string
  position: string
  user: OrgUser
}

interface Division {
  id: string
  name: string
  deptId: string
  headId: string | null
  head: OrgUser | null
  memberships: Membership[]
}

interface Department {
  id: string
  name: string
  color: string
  directorId: string | null
  director: OrgUser | null
  divisions: Division[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const shortName = formatName

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_COLORS = [
  '#1e40af','#065f46','#7c3aed','#9a3412',
  '#0f766e','#be185d','#b45309','#1d4ed8',
]

const LINE_COLOR = '#2e2e2e'
const R  = 10  // corner radius for lines
const CR = 4   // connector dot radius
const GAP = 1  // gap ring around dot

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, footer }: {
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
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(4px)' }}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',
  borderRadius:8,color:'var(--text-1)',fontFamily:'Inter,sans-serif',
  fontSize:13,padding:'8px 12px',outline:'none',boxSizing:'border-box',
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input style={inputStyle} {...props} />
}

function FieldSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
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

function BtnPrimary({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize:13,padding:'8px 20px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#FF6B35,#E8194B)',color:'#fff',fontFamily:'Inter,sans-serif',fontWeight:600,cursor:'pointer' }}>
      {children}
    </button>
  )
}

function BtnSecondary({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ fontSize:13,padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'none',color:'var(--text-3)',cursor:'pointer',fontFamily:'Inter,sans-serif',...style }}>
      {children}
    </button>
  )
}

function BtnDanger({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize:12,padding:'7px 14px',borderRadius:8,border:'none',background:'rgba(232,25,75,0.15)',color:'var(--danger)',fontFamily:'Inter,sans-serif',cursor:'pointer',marginRight:'auto' }}>
      {children}
    </button>
  )
}

// ─── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
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

function UserSelect({ users, value, onChange, placeholder = '— не назначен —' }: {
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

// ─── Profile Modal ────────────────────────────────────────────────────────────

type ProfileData = { id: string; name: string; position: string | null; status: string | null }

function OrgProfileModal({ userId, deptColor, onClose }: {
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
          {data?.position && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 5 }}>{data.position}</div>}
        </div>
        {data?.status && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
            {data.status}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Division Card ────────────────────────────────────────────────────────────

function DivCard({
  div, dept, cardRef, onEditDiv, onDeleteDiv, onAddMember, onEditMember, onRemoveMember, onUserClick,
}: {
  div: Division
  dept: Department
  cardRef?: (el: HTMLDivElement | null) => void
  onEditDiv: (div: Division) => void
  onDeleteDiv: (divId: string) => void
  onAddMember: (divId: string) => void
  onEditMember: (m: Membership) => void
  onRemoveMember: (userId: string, divId: string) => void
  onUserClick: (userId: string, deptColor: string) => void
}) {
  const [headHover, setHeadHover] = useState(false)

  return (
    <div ref={cardRef} style={{
      background:'var(--surface-1)',border:'1.5px solid var(--border)',
      borderTop:`3px solid ${dept.color}`,
      borderRadius:12,minWidth:210,width:'max-content',overflow:'visible',flexShrink:0,
      position:'relative',zIndex:2,transition:'border-color .15s',
    }}>
      {/* Division head */}
      <div
        style={{ padding:'12px 14px 10px',borderBottom:'1px solid var(--border)',position:'relative',background:'linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 100%)',borderRadius:'10px 10px 0 0',cursor:'default' }}
        onMouseEnter={() => setHeadHover(true)}
        onMouseLeave={() => setHeadHover(false)}
      >
        <div style={{ fontSize:13,fontWeight:700,color:'var(--text-1)',marginBottom:5,paddingRight:48,whiteSpace:'nowrap' }}>
          {div.name}
        </div>
        {div.head ? (
          <div
            data-interactive
            onClick={e => { e.stopPropagation(); onUserClick(div.head!.id, dept.color) }}
            style={{ display:'flex',alignItems:'center',gap:7,cursor:'pointer',borderRadius:6,marginTop:2,opacity:1,transition:'opacity .12s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity='0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity='1'}
          >
            <div style={{ width:26,height:26,borderRadius:'50%',background:`${dept.color}22`,border:`1.5px solid ${dept.color}66`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:dept.color,flexShrink:0 }}>
              {shortName(div.head.name).trim().split(/\s+/).slice(0,2).map((w:string)=>w[0]??'').join('').toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11,fontWeight:600,color:'var(--text-2)',whiteSpace:'nowrap' }}>{shortName(div.head.name)}</div>
              <div style={{ fontSize:9,fontWeight:600,letterSpacing:'0.3px',color:'var(--text-muted)',textTransform:'uppercase' }}>Руководитель</div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex',alignItems:'center',gap:5,marginTop:2 }}>
            <span style={{ fontSize:9,fontWeight:700,letterSpacing:'0.6px',textTransform:'uppercase',color:'var(--text-muted)' }}>Рук.</span>
            <span style={{ fontSize:11,color:'var(--text-muted)',fontStyle:'italic' }}>не назначен</span>
          </div>
        )}
        {headHover && (
          <div style={{ position:'absolute',top:8,right:8,display:'flex',gap:3 }}>
            <ActionBtn onClick={() => onEditDiv(div)}>✎</ActionBtn>
            <ActionBtn danger onClick={() => onDeleteDiv(div.id)}>✕</ActionBtn>
          </div>
        )}
      </div>

      {/* Members */}
      <div style={{ padding:'6px 0 4px' }}>
        {div.memberships.map(m => (
          <MemberRow
            key={m.userId}
            m={m}
            deptColor={dept.color}
            onEdit={() => onEditMember(m)}
            onRemove={() => onRemoveMember(m.userId, m.divId)}
            onProfile={() => onUserClick(m.userId, dept.color)}
          />
        ))}
        <button
          onClick={() => onAddMember(div.id)}
          style={{ width:'100%',padding:'6px 14px',background:'none',border:'none',color:'var(--text-muted)',fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:5,transition:'color .1s' }}
          onMouseEnter={e => (e.currentTarget.style.color='var(--text-2)')}
          onMouseLeave={e => (e.currentTarget.style.color='var(--text-muted)')}
        >
          <span style={{ fontSize:14 }}>＋</span> Добавить сотрудника
        </button>
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{ width:20,height:20,borderRadius:4,border:'1px solid var(--border)',background:'var(--surface-2)',color:danger?'rgba(255,100,100,0.8)':'var(--text-3)',fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif' }}
    >
      {children}
    </button>
  )
}

function MemberRow({ m, deptColor, onEdit, onRemove, onProfile }: { m: Membership; deptColor: string; onEdit: () => void; onRemove: () => void; onProfile: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      data-interactive
      style={{ padding:'5px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid var(--border)',cursor:'pointer',background:hover?'rgba(255,255,255,0.04)':'transparent',position:'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onProfile}
      onContextMenu={e => e.stopPropagation()}
    >
      <div style={{ width:24,height:24,borderRadius:'50%',background:`${deptColor}18`,border:`1.5px solid ${deptColor}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:deptColor,flexShrink:0 }}>
        {shortName(m.user.name).trim().split(/\s+/).slice(0,2).map((w:string)=>w[0]??'').join('').toUpperCase()}
      </div>
      <div style={{ flexShrink:0 }}>
        <div style={{ fontSize:12,fontWeight:500,color:'var(--text-2)',whiteSpace:'nowrap' }}>{shortName(m.user.name)}</div>
        {(m.position || m.user.position) && <div style={{ fontSize:10,color:'var(--text-muted)',whiteSpace:'nowrap' }}>{m.position || m.user.position}</div>}
      </div>
      <div style={{ display:'flex',gap:3,visibility:hover?'visible':'hidden',flexShrink:0,position:'absolute',right:14,top:'50%',transform:'translateY(-50%)' }} onClick={e => e.stopPropagation()}>
        <ActionBtn onClick={onEdit}>✎</ActionBtn>
        <ActionBtn danger onClick={onRemove}>✕</ActionBtn>
      </div>
    </div>
  )
}

// ─── Department Tree ──────────────────────────────────────────────────────────

function DeptTree({
  dept, allUsers,
  onEditDept, onDeleteDept,
  onAddDiv, onEditDiv, onDeleteDiv,
  onAddMember, onEditMember, onRemoveMember,
  onUserClick,
}: {
  dept: Department
  allUsers: OrgUser[]
  onEditDept: (dept: Department) => void
  onDeleteDept: (id: string) => void
  onAddDiv: (deptId: string) => void
  onEditDiv: (div: Division) => void
  onDeleteDiv: (divId: string) => void
  onAddMember: (divId: string) => void
  onEditMember: (m: Membership) => void
  onRemoveMember: (userId: string, divId: string) => void
  onUserClick: (userId: string, deptColor: string) => void
}) {
  const [deptHover, setDeptHover] = useState(false)
  const memberCount = useMemo(() => {
    const ids = new Set<string>()
    dept.divisions.forEach(dv => {
      dv.memberships.forEach(m => ids.add(m.userId))
      if (dv.headId) ids.add(dv.headId)
    })
    if (dept.directorId) ids.add(dept.directorId)
    return ids.size
  }, [dept])

  const rootRef  = useRef<HTMLDivElement>(null)
  const cardRef  = useRef<HTMLDivElement>(null)
  const rowRef   = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const svgRef   = useRef<SVGSVGElement>(null)

  // Redraw SVG lines after every render — coords are local to rootRef, scale-independent.
  useLayoutEffect(() => {
    const root = rootRef.current
    const card = cardRef.current
    const row  = rowRef.current
    const svg  = svgRef.current
    if (!root || !card || !row || !svg || dept.divisions.length === 0) return

    // All offsets relative to root (position:relative container).
    // offsetLeft/offsetTop walk up via offsetParent which stays within root.
    function off(el: HTMLElement) {
      let x = 0, y = 0, cur: HTMLElement | null = el
      while (cur && cur !== root) { x += cur.offsetLeft; y += cur.offsetTop; cur = cur.offsetParent as HTMLElement | null }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight }
    }

    const W = root.offsetWidth, H = root.offsetHeight
    svg.setAttribute('width', String(W))
    svg.setAttribute('height', String(H))
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const mkPath = (d: string) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg','path')
      p.setAttribute('d', d)
      p.setAttribute('stroke', LINE_COLOR)
      p.setAttribute('stroke-width', '1.5')
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke-linecap', 'round')
      p.setAttribute('stroke-linejoin', 'round')
      return p
    }

    const mkDot = (cx: number, cy: number) => {
      const outer = document.createElementNS('http://www.w3.org/2000/svg','circle')
      outer.setAttribute('cx', String(cx)); outer.setAttribute('cy', String(cy))
      outer.setAttribute('r', String(CR + GAP))
      outer.setAttribute('fill', 'var(--bg)')
      const inner = document.createElementNS('http://www.w3.org/2000/svg','circle')
      inner.setAttribute('cx', String(cx)); inner.setAttribute('cy', String(cy))
      inner.setAttribute('r', String(CR))
      inner.setAttribute('fill', dept.color)
      svg.appendChild(outer)
      svg.appendChild(inner)
    }

    const co = off(card)
    const rootX = co.x + co.w / 2
    const stemTopY = co.y + co.h

    const divOs = cardRefs.current.map(c => c ? off(c) : null)
    const validDivOs = divOs.filter(Boolean) as ReturnType<typeof off>[]
    if (validDivOs.length === 0) return

    const barY = stemTopY + 24

    const branchXs = validDivOs.map(d => d.x + d.w / 2)
    const cardTopY = validDivOs[0].y

    // Stem: card bottom → bar
    svg.appendChild(mkPath(`M ${rootX} ${stemTopY} L ${rootX} ${barY}`))
    mkDot(rootX, stemTopY)

    if (branchXs.length === 1) {
      svg.appendChild(mkPath(`M ${rootX} ${barY} L ${rootX} ${cardTopY}`))
    } else {
      const lx = branchXs[0], rx = branchXs[branchXs.length - 1]
      // Horizontal bar with rounded corners
      svg.appendChild(mkPath(
        `M ${lx} ${barY + R} Q ${lx} ${barY} ${lx + R} ${barY} L ${rx - R} ${barY} Q ${rx} ${barY} ${rx} ${barY + R}`
      ))
      branchXs.forEach((cx, i) => {
        const startY = (i === 0 || i === branchXs.length - 1) ? barY + R : barY
        svg.appendChild(mkPath(`M ${cx} ${startY} L ${cx} ${cardTopY}`))
      })
    }

    // Connector dots at div card tops
    branchXs.forEach(cx => mkDot(cx, cardTopY))
  })

  return (
    <div ref={rootRef} style={{ display:'flex',flexDirection:'column',alignItems:'center',position:'relative' }}>
      {/* SVG overlay — lives inside root, moves with it, overflow:visible handles any overflow */}
      <svg ref={svgRef} style={{ position:'absolute',top:0,left:0,overflow:'visible',pointerEvents:'none',zIndex:1 }} />

      {/* Dept card */}
      <div
        ref={cardRef}
        style={{
          borderRadius:14,padding:'14px 20px 12px',position:'relative',
          display:'inline-flex',flexDirection:'column',cursor:'pointer',
          minWidth:190,background:dept.color,zIndex:2,overflow:'visible',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),inset 0 -1px 0 rgba(0,0,0,0.2),0 8px 24px rgba(0,0,0,0.35)',
        }}
        onMouseEnter={() => setDeptHover(true)}
        onMouseLeave={() => setDeptHover(false)}
        onClick={() => onEditDept(dept)}
      >
        <div style={{ position:'absolute',inset:0,background:'linear-gradient(160deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0) 55%,rgba(0,0,0,0.12) 100%)',borderRadius:14,pointerEvents:'none' }} />
        <div style={{ fontSize:15,fontWeight:800,color:'#fff',letterSpacing:'0.1px',marginBottom:6,whiteSpace:'nowrap',textShadow:'0 1px 3px rgba(0,0,0,0.3)',zIndex:1 }}>
          {dept.name}
        </div>
        {dept.director ? (
          <div
            data-interactive
            onClick={e => { e.stopPropagation(); onUserClick(dept.director!.id, dept.color) }}
            style={{ display:'flex',alignItems:'center',gap:7,cursor:'pointer',zIndex:1,opacity:1,transition:'opacity .12s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity='0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity='1'}
          >
            <div style={{ width:26,height:26,borderRadius:'50%',background:'rgba(0,0,0,0.28)',border:'1.5px solid rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0 }}>
              {shortName(dept.director.name).trim().split(/\s+/).slice(0,2).map((w:string)=>w[0]??'').join('').toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#fff',whiteSpace:'nowrap',textShadow:'0 1px 2px rgba(0,0,0,0.3)' }}>{shortName(dept.director.name)}</div>
              <div style={{ fontSize:9,fontWeight:600,letterSpacing:'0.3px',color:'rgba(255,255,255,0.55)',textTransform:'uppercase' }}>Директор</div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex',alignItems:'center',gap:6,zIndex:1 }}>
            <span style={{ fontSize:9,fontWeight:700,letterSpacing:'0.8px',textTransform:'uppercase',color:'rgba(255,255,255,0.5)' }}>Директор</span>
            <span style={{ fontSize:11,color:'rgba(255,255,255,0.35)',fontStyle:'italic' }}>не назначен</span>
          </div>
        )}
        <div style={{ fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.45)',marginTop:8,paddingTop:7,borderTop:'1px solid rgba(255,255,255,0.12)',letterSpacing:'0.2px',zIndex:1 }}>
          {memberCount} чел.
        </div>
        {deptHover && (
          <div style={{ position:'absolute',top:8,right:8,display:'flex',gap:4,zIndex:11 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onEditDept(dept)} style={{ width:22,height:22,borderRadius:5,border:'1px solid rgba(255,255,255,0.2)',background:'rgba(0,0,0,0.3)',color:'rgba(255,255,255,0.7)',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif' }}>✎</button>
            <button onClick={() => onDeleteDept(dept.id)} style={{ width:22,height:22,borderRadius:5,border:'1px solid rgba(255,255,255,0.2)',background:'rgba(0,0,0,0.3)',color:'rgba(255,100,100,0.8)',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif' }}>✕</button>
          </div>
        )}
      </div>

      {dept.divisions.length > 0 && (
        <>
          {/* Spacer — gives room for the SVG connector lines */}
          <div style={{ height:48 }} />
          <div ref={rowRef} style={{ display:'flex',gap:16,alignItems:'flex-start',justifyContent:'center' }}>
            {dept.divisions.map((div, i) => (
              <DivCard
                key={div.id}
                div={div}
                dept={dept}
                cardRef={el => { cardRefs.current[i] = el }}
                onEditDiv={onEditDiv}
                onDeleteDiv={onDeleteDiv}
                onAddMember={onAddMember}
                onEditMember={onEditMember}
                onRemoveMember={onRemoveMember}
                onUserClick={onUserClick}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function CtxMenu({ x, y, onCreateDept, onClose }: { x: number; y: number; onCreateDept: () => void; onClose: () => void }) {
  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener('click', handler)
    document.addEventListener('keydown', e => { if (e.key === 'Escape') onClose() })
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div style={{
      position:'fixed',left:x,top:y,zIndex:200,
      background:'var(--surface-2)',border:'1px solid var(--border)',
      borderRadius:8,padding:4,minWidth:180,
      boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <button
        onClick={() => { onCreateDept(); onClose() }}
        style={{ width:'100%',padding:'8px 12px',background:'none',border:'none',color:'var(--text-2)',fontSize:13,fontFamily:'Inter,sans-serif',textAlign:'left',cursor:'pointer',borderRadius:5,display:'flex',alignItems:'center',gap:8 }}
        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background='none')}
      >
        <span style={{ fontSize:15 }}>＋</span> Новый департамент
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ModalState =
  | { type: 'editDept'; dept: Department }
  | { type: 'addDept' }
  | { type: 'addDiv'; deptId: string }
  | { type: 'editDiv'; div: Division }
  | { type: 'addMember'; divId: string }
  | { type: 'editMember'; membership: Membership }
  | null

export function OrgChartTab() {
  const qc = useQueryClient()
  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
    staleTime: 0,
  })
  const { data: allUsers = [] } = useQuery<OrgUser[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/users/staff').then(r => r.data),
    staleTime: 0,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['structure'] })

  const [migrating, setMigrating] = useState(false)
  const migrateFromSheets = async () => {
    if (!confirm('Импортировать структуру из данных Sheets (dept/subDept)? Существующие записи не будут перезаписаны.')) return
    setMigrating(true)
    try {
      await api.post('/structure/migrate-from-sheets')
      invalidate()
    } finally {
      setMigrating(false)
    }
  }

  // Mutations
  const createDept  = useMutation({ mutationFn: (d: any) => api.post('/structure/departments', d),   onSuccess: invalidate })
  const updateDept  = useMutation({ mutationFn: ({ id, ...d }: any) => api.patch(`/structure/departments/${id}`, d), onSuccess: invalidate })
  const deleteDept  = useMutation({ mutationFn: (id: string) => api.delete(`/structure/departments/${id}`), onSuccess: invalidate })
  const createDiv   = useMutation({ mutationFn: (d: any) => api.post('/structure/divisions', d),     onSuccess: invalidate })
  const updateDiv   = useMutation({ mutationFn: ({ id, ...d }: any) => api.patch(`/structure/divisions/${id}`, d), onSuccess: invalidate })
  const deleteDiv   = useMutation({ mutationFn: (id: string) => api.delete(`/structure/divisions/${id}`), onSuccess: invalidate })
  const createMember = useMutation({ mutationFn: (d: any) => api.post('/structure/memberships', d),  onSuccess: invalidate })
  const updateMember = useMutation({ mutationFn: (d: any) => api.patch('/structure/memberships', d), onSuccess: invalidate })
  const deleteMember = useMutation({ mutationFn: (d: any) => api.delete('/structure/memberships', { data: d }), onSuccess: invalidate })

  // Pan/zoom
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 60, y: 40 })
  const scaleRef  = useRef(scale)
  const offsetRef = useRef(offset)
  scaleRef.current  = scale
  offsetRef.current = offset
  const dragging   = useRef(false)
  const lastPos    = useRef({ x: 0, y: 0 })
  const blockedRef = useRef(false)  // true when modal or ctx menu is open
  const canvasRef  = useRef<HTMLDivElement>(null)
  const dotRef     = useRef<HTMLDivElement>(null)

  // Apply transform directly to DOM — bypasses React render for smooth panning
  const applyTransform = useCallback((s: number, ox: number, oy: number) => {
    const world = canvasRef.current?.querySelector<HTMLDivElement>('.org-world')
    if (world) world.style.transform = `translate(${ox}px,${oy}px) scale(${s})`
    const dl = dotRef.current
    if (dl) {
      const ds = 24 * s
      const dx = ((ox % ds) + ds) % ds
      const dy = ((oy % ds) + ds) % ds
      dl.style.backgroundSize = `${ds}px ${ds}px`
      dl.style.backgroundPosition = `${dx}px ${dy}px`
    }
  }, [])

  useEffect(() => { applyTransform(scale, offset.x, offset.y) }, [scale, offset, applyTransform])

  // Wheel — must be non-passive, so use native listener
  const setCanvasRef = useCallback((el: HTMLDivElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (blockedRef.current) return
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const s  = scaleRef.current, ox = offsetRef.current.x, oy = offsetRef.current.y
      const s1 = Math.max(0.25, Math.min(2.5, s + delta))
      const bx = (mx - ox) / s, by = (my - oy) / s
      setScale(s1); setOffset({ x: mx - bx * s1, y: my - by * s1 })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
  }, [])

  // Drag — React synthetic pointer events (simpler, no capture issues)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (blockedRef.current) return
    if ((e.target as HTMLElement).closest('button,[data-interactive]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    const nx = offsetRef.current.x + dx
    const ny = offsetRef.current.y + dy
    offsetRef.current = { x: nx, y: ny }
    applyTransform(scaleRef.current, nx, ny)
  }
  const onPointerUp = () => { dragging.current = false }

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const onContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,[data-interactive]')) return
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 200)
    const y = Math.min(e.clientY, window.innerHeight - 60)
    blockedRef.current = true
    setCtxMenu({ x, y })
  }

  // Modal state
  const [modal, setModal] = useState<ModalState>(null)
  const closeModal = () => setModal(null)

  // Profile popup
  const [profileState, setProfileState] = useState<{ userId: string; deptColor: string } | null>(null)
  const handleUserClick = useCallback((userId: string, deptColor: string) => {
    setProfileState({ userId, deptColor })
  }, [])

  // Keep blockedRef in sync with modal/ctxMenu/profile state each render
  blockedRef.current = !!(modal || ctxMenu || profileState)

  return (
    <div style={{ flex:1,overflow:'hidden',position:'relative',cursor:dragging.current?'grabbing':'grab',userSelect:'none',touchAction:'none' }}
      ref={setCanvasRef}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {isLoading && (
        <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:14,zIndex:20,background:'var(--bg)' }}>
          Загрузка...
        </div>
      )}
      {/* Dot pattern */}
      <div
        ref={dotRef}
        style={{
          position:'absolute',inset:0,pointerEvents:'none',
          backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.07) 1px,transparent 1px)',
          backgroundSize:'24px 24px',
        }}
      />

      {/* Empty state */}
      {departments.length === 0 && (
        <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,pointerEvents:'none' }}>
          <div style={{ fontSize:14,color:'var(--text-muted)',textAlign:'center' }}>Структура пуста</div>
          <button
            data-interactive
            onClick={migrateFromSheets}
            disabled={migrating}
            style={{ pointerEvents:'all',padding:'10px 24px',background:'#1e40af',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontFamily:'Inter,sans-serif',cursor:'pointer',display:'flex',alignItems:'center',gap:8,opacity:migrating?0.6:1 }}
          >
            {migrating ? 'Импорт...' : '↓ Импортировать структуру из Sheets'}
          </button>
          <button
            data-interactive
            onClick={() => setModal({ type:'addDept' })}
            style={{ pointerEvents:'all',padding:'8px 20px',background:'none',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-3)',fontSize:12,fontFamily:'Inter,sans-serif',cursor:'pointer',display:'flex',alignItems:'center',gap:8 }}
          >
            <span>＋</span> Создать вручную
          </button>
        </div>
      )}

      {/* World */}
      <div
        className="org-world"
        style={{ position:'absolute',transformOrigin:'0 0',padding:'60px 80px 120px',display:'flex',gap:48,alignItems:'flex-start' }}
      >
        {departments.map(dept => (
          <DeptTree
            key={dept.id}
            dept={dept}
            allUsers={allUsers}
            onEditDept={d => setModal({ type:'editDept', dept: d })}
            onDeleteDept={id => { if (confirm('Удалить департамент?')) deleteDept.mutate(id) }}
            onAddDiv={deptId => setModal({ type:'addDiv', deptId })}
            onEditDiv={div => setModal({ type:'editDiv', div })}
            onDeleteDiv={id => { if (confirm('Удалить отдел?')) deleteDiv.mutate(id) }}
            onAddMember={divId => setModal({ type:'addMember', divId })}
            onEditMember={m => setModal({ type:'editMember', membership: m })}
            onRemoveMember={(userId, divId) => deleteMember.mutate({ userId, divId })}
            onUserClick={handleUserClick}
          />
        ))}
      </div>

      {/* Zoom controls */}
      <div style={{ position:'absolute',top:16,right:16,display:'flex',alignItems:'center',gap:6,zIndex:10 }}>
        <ZBtn onClick={() => { const s = Math.min(2.5, scaleRef.current + 0.15); setScale(s) }}>＋</ZBtn>
        <span style={{ fontSize:12,color:'var(--text-muted)',minWidth:40,textAlign:'center' }}>{Math.round(scale*100)}%</span>
        <ZBtn onClick={() => { const s = Math.max(0.25, scaleRef.current - 0.15); setScale(s) }}>－</ZBtn>
        <ZBtn onClick={() => { setScale(1); setOffset({ x:60, y:40 }) }}>⊡</ZBtn>
      </div>

      {/* Hint */}
      <div style={{ position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',fontSize:11,color:'var(--text-muted)',display:'flex',gap:12,pointerEvents:'none' }}>
        <span>Колесо — зум</span>
        <span>Тащи — пан</span>
        <span>ПКМ — новый департамент</span>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CtxMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onCreateDept={() => setModal({ type:'addDept' })}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Profile popup */}
      {profileState && (
        <OrgProfileModal
          userId={profileState.userId}
          deptColor={profileState.deptColor}
          onClose={() => setProfileState(null)}
        />
      )}

      {/* Modals */}
      {modal?.type === 'editDept' && (
        <EditDeptModal
          dept={modal.dept}
          users={allUsers}
          onSave={data => { updateDept.mutate({ id: modal.dept.id, ...data }); closeModal() }}
          onDelete={() => { if (confirm('Удалить департамент?')) { deleteDept.mutate(modal.dept.id); closeModal() } }}
          onAddDiv={() => { closeModal(); setModal({ type:'addDiv', deptId: modal.dept.id }) }}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'addDept' && (
        <AddDeptModal
          users={allUsers}
          defaultColor={DEPT_COLORS[departments.length % DEPT_COLORS.length]}
          onSave={data => { createDept.mutate(data); closeModal() }}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'addDiv' && (
        <AddDivModal
          users={allUsers}
          onSave={data => { createDiv.mutate({ deptId: modal.deptId, ...data }); closeModal() }}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'editDiv' && (
        <EditDivModal
          div={modal.div}
          users={allUsers}
          onSave={data => { updateDiv.mutate({ id: modal.div.id, ...data }); closeModal() }}
          onDelete={() => { if (confirm('Удалить отдел?')) { deleteDiv.mutate(modal.div.id); closeModal() } }}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'addMember' && (
        <AddMemberModal
          divId={modal.divId}
          users={allUsers}
          departments={departments}
          onSave={data => { createMember.mutate(data); closeModal() }}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'editMember' && (
        <EditMemberModal
          membership={modal.membership}
          departments={departments}
          onSave={data => { updateMember.mutate(data); closeModal() }}
          onRemove={() => { deleteMember.mutate({ userId: modal.membership.userId, divId: modal.membership.divId }); closeModal() }}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

function ZBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize:13,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'none',color:'var(--text-3)',cursor:'pointer',fontFamily:'Inter,sans-serif' }}>
      {children}
    </button>
  )
}

// ─── Modal forms ──────────────────────────────────────────────────────────────

function EditDeptModal({ dept, users, onSave, onDelete, onAddDiv, onClose }: {
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

function AddDeptModal({ users, defaultColor, onSave, onClose }: {
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

function AddDivModal({ users, onSave, onClose }: {
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

function EditDivModal({ div, users, onSave, onDelete, onClose }: {
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

function AddMemberModal({ divId, users, departments, onSave, onClose }: {
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

function EditMemberModal({ membership, departments, onSave, onRemove, onClose }: {
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

// ─── Sheets Structure Tab (read-only snapshot) ────────────────────────────────

interface SheetUser {
  id: string; name: string; department: string | null; subDept: string | null; position: string | null; tabNumber: string | null
}

interface SheetsDeptCol {
  name: string; color: string
  subs: { name: string; members: { name: string; position: string }[] }[]
}

const SHEETS_COLORS = ['#1e40af','#065f46','#7c3aed','#9a3412','#0f766e','#be185d','#b45309','#374151']

export function SheetsStructureTab() {
  const { data: users = [], isLoading } = useQuery<SheetUser[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/users/staff').then(r => r.data),
    staleTime: 0,
  })

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 60, y: 40 })
  const scaleRef  = useRef(scale)
  const offsetRef = useRef(offset)
  scaleRef.current  = scale
  offsetRef.current = offset
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  const dotRef    = useRef<HTMLDivElement>(null)

  const applyTransform = useCallback((s: number, ox: number, oy: number) => {
    const world = canvasRef.current?.querySelector<HTMLDivElement>('.sheets-world')
    if (world) world.style.transform = `translate(${ox}px,${oy}px) scale(${s})`
    const dl = dotRef.current
    if (dl) {
      const ds = 24 * s
      dl.style.backgroundSize     = `${ds}px ${ds}px`
      dl.style.backgroundPosition = `${((ox % ds) + ds) % ds}px ${((oy % ds) + ds) % ds}px`
    }
  }, [])

  useEffect(() => { applyTransform(scale, offset.x, offset.y) }, [scale, offset, applyTransform])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect  = canvas.getBoundingClientRect()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const s  = scaleRef.current, ox = offsetRef.current.x, oy = offsetRef.current.y
      const s1 = Math.max(0.25, Math.min(2.5, s + delta))
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setScale(s1); setOffset({ x: mx - (mx - ox) / s * s1, y: my - (my - oy) / s * s1 })
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      dragging.current = true
      lastPos.current  = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      setOffset(o => ({ x: o.x + e.clientX - lastPos.current.x, y: o.y + e.clientY - lastPos.current.y }))
      lastPos.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => { dragging.current = false }

    canvas.addEventListener('wheel',        onWheel, { passive: false })
    canvas.addEventListener('pointerdown',  onDown)
    canvas.addEventListener('pointermove',  onMove)
    canvas.addEventListener('pointerup',    onUp)
    canvas.addEventListener('pointercancel',onUp)
    return () => {
      canvas.removeEventListener('wheel',        onWheel)
      canvas.removeEventListener('pointerdown',  onDown)
      canvas.removeEventListener('pointermove',  onMove)
      canvas.removeEventListener('pointerup',    onUp)
      canvas.removeEventListener('pointercancel',onUp)
    }
  }, [])

  const columns = useMemo<SheetsDeptCol[]>(() => {
    const active = users.filter(u => u.tabNumber && u.department)
    const deptNames = [...new Set(active.map(u => u.department!))].sort()
    return deptNames.map((deptName, i) => {
      const deptStaff = active.filter(u => u.department === deptName)
      const subNames  = [...new Set(deptStaff.map(u => u.subDept || ''))].sort()
      const subs = subNames.map(subName => ({
        name: subName,
        members: deptStaff
          .filter(u => (u.subDept || '') === subName)
          .map(u => ({ name: u.name, position: u.position ?? '' })),
      }))
      return { name: deptName, color: SHEETS_COLORS[i % SHEETS_COLORS.length], subs }
    })
  }, [users])

  if (isLoading) return (
    <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:14 }}>Загрузка...</div>
  )

  return (
    <div style={{ flex:1,overflow:'hidden',position:'relative',userSelect:'none',touchAction:'none' }}
      ref={canvasRef}
    >
      {/* Read-only badge */}
      <div style={{ position:'absolute',top:16,left:16,zIndex:10,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',fontSize:11,color:'var(--text-muted)',pointerEvents:'none' }}>
        Снимок из Google Sheets · только просмотр
      </div>

      {/* Dot pattern */}
      <div ref={dotRef} style={{ position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.07) 1px,transparent 1px)',backgroundSize:'24px 24px' }} />

      {/* World */}
      <div className="sheets-world" style={{ position:'absolute',transformOrigin:'0 0',padding:'60px 80px 120px',display:'flex',flexDirection:'row',gap:48,alignItems:'flex-start' }}>
        {columns.map(col => (
          <div key={col.name} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:24 }}>
            {/* Dept header card */}
            <div style={{ background:col.color,borderRadius:10,padding:'14px 20px 12px',minWidth:200,position:'relative',overflow:'hidden',boxShadow:`0 4px 24px ${col.color}44` }}>
              <div style={{ position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.1),transparent)',pointerEvents:'none' }} />
              <div style={{ fontSize:13,fontWeight:800,color:'#fff',letterSpacing:'0.02em' }}>{col.name}</div>
              <div style={{ fontSize:10,color:'rgba(255,255,255,0.6)',marginTop:3 }}>{col.subs.reduce((s,d)=>s+d.members.length,0)} чел.</div>
            </div>
            {/* Division cards row */}
            <div style={{ display:'flex',flexDirection:'row',gap:12,alignItems:'flex-start' }}>
              {col.subs.map((sub, si) => (
                <div key={si} style={{ minWidth:160,maxWidth:200,background:'var(--surface-1)',border:'1px solid var(--border)',borderTop:`3px solid ${col.color}`,borderRadius:8,overflow:'hidden' }}>
                  {sub.name && (
                    <div style={{ padding:'8px 12px 6px',borderBottom:'1px solid var(--border)',fontSize:11,fontWeight:700,color:'var(--text-2)' }}>{sub.name}</div>
                  )}
                  <div style={{ padding:'4px 12px 8px' }}>
                    {sub.members.map((m, mi) => (
                      <div key={mi} style={{ padding:'3px 0',borderBottom: mi < sub.members.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize:12,fontWeight:500,color:'var(--text-2)' }}>{shortName(m.name)}</div>
                        {m.position && <div style={{ fontSize:10,color:'var(--text-muted)' }}>{m.position}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Zoom controls */}
      <div style={{ position:'absolute',top:16,right:16,display:'flex',alignItems:'center',gap:6,zIndex:10 }}>
        <ZBtn onClick={() => { const s = Math.min(2.5, scaleRef.current+0.15); setScale(s) }}>＋</ZBtn>
        <span style={{ fontSize:12,color:'var(--text-muted)',minWidth:40,textAlign:'center' }}>{Math.round(scale*100)}%</span>
        <ZBtn onClick={() => { const s = Math.max(0.25, scaleRef.current-0.15); setScale(s) }}>－</ZBtn>
        <ZBtn onClick={() => { setScale(1); setOffset({ x:60, y:40 }) }}>⊡</ZBtn>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, MessageSquare, X } from 'lucide-react'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'
import { formatName } from '../lib/utils'
import { HeaderPortal } from '../components/HeaderPortal'

// Команда: mini-canvas с деревом выбранного департамента.
// Drag/zoom, dropdown для смены департамента, поиск с подсветкой.

type StructUser = { id: string; name: string; tabNumber: string | null; position?: string | null }
type Division = {
  id: string; name: string
  headId: string | null
  head: StructUser | null
  memberships: Array<{ position: string; user: StructUser }>
}
type Department = {
  id: string; name: string; color: string
  directorId: string | null
  director: StructUser | null
  divisions: Division[]
}
type ProfileData = {
  id: string; name: string; position: string | null; status: string | null; userType: string
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

const LINE_COLOR = 'rgba(255,255,255,0.12)'
const R  = 10
const CR = 4
const GAP = 1

// ── Profile popup ──────────────────────────────────────────────────────────────

function ProfilePopup({ userId, deptColor, isSelf, onClose, onDM }: {
  userId: string
  deptColor: string
  isSelf: boolean
  onClose: () => void
  onDM: (id: string) => void
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
      <div ref={ref} style={{
        background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 28, width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', gap: 16, position: 'relative',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
          <X size={16} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: deptColor || 'var(--primary, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff',
          }}>{data ? initials(data.name) : '…'}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{name}</div>
            {data?.position && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{data.position}</div>}
          </div>
        </div>
        {data?.status && (
          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '8px 12px', fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic', textAlign: 'center',
          }}>{data.status}</div>
        )}
        {!isSelf && (
          <button
            onClick={() => { onDM(userId); onClose() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: 'var(--primary, #4f46e5)', color: '#fff',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <MessageSquare size={15} />
            Написать в ЛС
          </button>
        )}
      </div>
    </div>
  )
}

// ── Context menu ───────────────────────────────────────────────────────────────

function CtxMenu({ x, y, isSelf, onProfile, onDM, onClose }: {
  x: number; y: number; isSelf: boolean
  onProfile: () => void; onDM: () => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])

  const top  = Math.min(y, window.innerHeight - 100)
  const left = Math.min(x, window.innerWidth  - 220)
  const item: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, width: '100%', textAlign: 'left',
  }
  return (
    <div ref={ref} style={{
      position: 'fixed', top, left, zIndex: 500,
      background: 'var(--surface-1)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: '4px 0', minWidth: 200,
    }}>
      <button style={item} onClick={() => { onProfile(); onClose() }}>Открыть профиль</button>
      {!isSelf && (
        <button style={item} onClick={() => { onDM(); onClose() }}>
          <MessageSquare size={13} />
          Написать в ЛС
        </button>
      )}
    </div>
  )
}

// ── Read-only DivCard ──────────────────────────────────────────────────────────

function DivCard({ div, dept, highlightIds, myId, cardRef, onPersonClick, onPersonCtx }: {
  div: Division
  dept: Department
  highlightIds: Set<string>
  myId: string | undefined
  cardRef?: (el: HTMLDivElement | null) => void
  onPersonClick: (userId: string) => void
  onPersonCtx: (e: React.MouseEvent, userId: string) => void
}) {
  return (
    <div ref={cardRef} style={{
      background: 'var(--surface-1)', border: '1.5px solid var(--border)',
      borderTop: `3px solid ${dept.color}`,
      borderRadius: 12, minWidth: 210, width: 'max-content', overflow: 'visible', flexShrink: 0,
      position: 'relative', zIndex: 2,
    }}>
      {/* Division header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', borderRadius: '10px 10px 0 0', background: 'linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 100%)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 5, whiteSpace: 'nowrap' }}>
          {div.name}
        </div>
        {div.head ? (
          <div
            data-interactive
            onClick={() => onPersonClick(div.head!.id)}
            onContextMenu={e => { e.preventDefault(); onPersonCtx(e, div.head!.id) }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', borderRadius: 6, marginTop: 2, opacity: 1, transition: 'opacity .12s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${dept.color}22`, border: `1.5px solid ${dept.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: dept.color, flexShrink: 0 }}>
              {formatName(div.head.name).trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatName(div.head.name)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Руководитель</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Рук.</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>не назначен</span>
          </div>
        )}
      </div>

      {/* Members */}
      <div style={{ padding: '6px 0 8px' }}>
        {div.memberships.map(m => {
          const isHighlighted = highlightIds.size > 0 && highlightIds.has(m.user.id)
          const isSelf = m.user.id === myId
          return (
            <div
              key={m.user.id}
              data-interactive
              onClick={() => onPersonClick(m.user.id)}
              onContextMenu={e => { e.preventDefault(); onPersonCtx(e, m.user.id) }}
              style={{
                padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: isHighlighted ? 'rgba(245,158,11,0.12)' : isSelf ? 'rgba(99,102,241,0.08)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!isHighlighted && !isSelf) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (!isHighlighted && !isSelf) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: isHighlighted ? '#F59E0B22' : isSelf ? 'rgba(99,102,241,0.15)' : `${dept.color}18`,
                border: `1.5px solid ${isHighlighted ? '#F59E0B88' : isSelf ? 'rgba(99,102,241,0.45)' : dept.color + '55'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                color: isHighlighted ? '#F59E0B' : isSelf ? 'rgba(99,102,241,0.9)' : dept.color,
              }}>
                {formatName(m.user.name).trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()}
              </div>
              <div style={{ flexShrink: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--text-2)',
                  whiteSpace: 'nowrap',
                  ...(isHighlighted ? { color: '#F59E0B', fontWeight: 700 } : {}),
                  ...(isSelf ? { color: 'rgba(99,102,241,0.9)' } : {}),
                }}>
                  {formatName(m.user.name)}
                  {isSelf && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: 'rgba(99,102,241,0.7)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 4, padding: '0 3px' }}>вы</span>}
                </div>
                {(m.position || m.user.position) && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.position || m.user.position}</div>}
              </div>
            </div>
          )
        })}
        {div.memberships.length === 0 && (
          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Нет сотрудников</div>
        )}
      </div>
    </div>
  )
}

// ── Read-only DeptTree ────────────────────────────────────────────────────────

function DeptTree({ dept, highlightIds, myId, onPersonClick, onPersonCtx }: {
  dept: Department
  highlightIds: Set<string>
  myId: string | undefined
  onPersonClick: (userId: string) => void
  onPersonCtx: (e: React.MouseEvent, userId: string) => void
}) {
  const rootRef  = useRef<HTMLDivElement>(null)
  const cardRef  = useRef<HTMLDivElement>(null)
  const rowRef   = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const svgRef   = useRef<SVGSVGElement>(null)

  const memberCount = useMemo(() => {
    const ids = new Set<string>()
    dept.divisions.forEach(dv => {
      dv.memberships.forEach(m => ids.add(m.user.id))
      if (dv.headId) ids.add(dv.headId)
    })
    if (dept.directorId) ids.add(dept.directorId)
    return ids.size
  }, [dept])

  useLayoutEffect(() => {
    const root = rootRef.current
    const card = cardRef.current
    const row  = rowRef.current
    const svg  = svgRef.current
    if (!root || !card || !row || !svg || dept.divisions.length === 0) return

    function off(el: HTMLElement) {
      let x = 0, y = 0, cur: HTMLElement | null = el
      while (cur && cur !== root) { x += cur.offsetLeft; y += cur.offsetTop; cur = cur.offsetParent as HTMLElement | null }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight }
    }

    const W = root.offsetWidth, H = root.offsetHeight
    svg.setAttribute('width', String(W))
    svg.setAttribute('height', String(H))
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const mkPath = (d: string) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('d', d)
      p.setAttribute('stroke', LINE_COLOR)
      p.setAttribute('stroke-width', '1.5')
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke-linecap', 'round')
      p.setAttribute('stroke-linejoin', 'round')
      return p
    }
    const mkDot = (cx: number, cy: number) => {
      const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      outer.setAttribute('cx', String(cx)); outer.setAttribute('cy', String(cy))
      outer.setAttribute('r', String(CR + GAP)); outer.setAttribute('fill', 'var(--bg)')
      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      inner.setAttribute('cx', String(cx)); inner.setAttribute('cy', String(cy))
      inner.setAttribute('r', String(CR)); inner.setAttribute('fill', dept.color)
      svg.appendChild(outer); svg.appendChild(inner)
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

    svg.appendChild(mkPath(`M ${rootX} ${stemTopY} L ${rootX} ${barY}`))
    mkDot(rootX, stemTopY)

    if (branchXs.length === 1) {
      svg.appendChild(mkPath(`M ${rootX} ${barY} L ${rootX} ${cardTopY}`))
    } else {
      const lx = branchXs[0], rx = branchXs[branchXs.length - 1]
      svg.appendChild(mkPath(
        `M ${lx} ${barY + R} Q ${lx} ${barY} ${lx + R} ${barY} L ${rx - R} ${barY} Q ${rx} ${barY} ${rx} ${barY + R}`
      ))
      branchXs.forEach((cx, i) => {
        const startY = (i === 0 || i === branchXs.length - 1) ? barY + R : barY
        svg.appendChild(mkPath(`M ${cx} ${startY} L ${cx} ${cardTopY}`))
      })
    }
    branchXs.forEach(cx => mkDot(cx, cardTopY))
  })

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }} />

      {/* Dept card */}
      <div ref={cardRef} style={{
        borderRadius: 14, padding: '14px 20px 12px', position: 'relative',
        display: 'inline-flex', flexDirection: 'column',
        minWidth: 190, background: dept.color, zIndex: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18),inset 0 -1px 0 rgba(0,0,0,0.2),0 8px 24px rgba(0,0,0,0.35)',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0) 55%,rgba(0,0,0,0.12) 100%)', borderRadius: 14, pointerEvents: 'none' }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '0.1px', marginBottom: 6, whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.3)', zIndex: 1 }}>
          {dept.name}
        </div>
        {dept.director ? (
          <div
            data-interactive
            onClick={() => onPersonClick(dept.director!.id)}
            onContextMenu={e => { e.preventDefault(); onPersonCtx(e, dept.director!.id) }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', zIndex: 1, opacity: 1, transition: 'opacity .12s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.28)', border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {formatName(dept.director.name).trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{formatName(dept.director.name)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>Директор</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, zIndex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Директор</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>не назначен</span>
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.12)', letterSpacing: '0.2px', zIndex: 1 }}>
          {memberCount} чел.
        </div>
      </div>

      {dept.divisions.length > 0 && (
        <>
          <div style={{ height: 48 }} />
          <div ref={rowRef} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'center' }}>
            {dept.divisions.map((div, i) => (
              <DivCard
                key={div.id}
                div={div}
                dept={dept}
                highlightIds={highlightIds}
                myId={myId}
                cardRef={el => { cardRefs.current[i] = el }}
                onPersonClick={onPersonClick}
                onPersonCtx={onPersonCtx}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function TeamPage({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  const me = useCurrentUser()
  const [search, setSearch] = useState('')
  const [selectedDeptId, setSelectedDeptId] = useState<string | 'all' | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; userId: string } | null>(null)

  const isAdmin = !!me?.isAdmin

  const { data: allDepts = [], isLoading } = useQuery<Department[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  // Departments the user is actually assigned to (from org membership)
  const myDepts = useMemo<Department[]>(() => {
    const accessDepts: Array<{ id: string }> = (me?.access as any)?.departments ?? []
    if (accessDepts.length === 0) return []
    const ids = new Set(accessDepts.map(d => d.id))
    return allDepts.filter(d => ids.has(d.id))
  }, [me?.access, allDepts])

  // Depts not in myDepts (for "Все" optgroup and admin flat list)
  const otherDepts = useMemo(
    () => allDepts.filter(d => !myDepts.some(m => m.id === d.id)),
    [allDepts, myDepts],
  )

  // Default selection: 'all' if user belongs to >1 dept, first dept otherwise
  useEffect(() => {
    if (selectedDeptId !== null) return
    if (myDepts.length > 1) { setSelectedDeptId('all'); return }
    if (myDepts.length === 1) { setSelectedDeptId(myDepts[0].id); return }
    if (isAdmin && allDepts.length > 0) { setSelectedDeptId(allDepts[0].id); return }
  }, [myDepts, allDepts, isAdmin, selectedDeptId])

  // Which depts are currently shown on canvas
  const selectedDepts = useMemo<Department[]>(() => {
    if (selectedDeptId === 'all') return myDepts
    const found = allDepts.find(d => d.id === selectedDeptId)
    return found ? [found] : []
  }, [selectedDeptId, myDepts, allDepts])

  // Find dept color for a given user (for profile popup)
  const getDeptColor = useCallback((userId: string): string => {
    for (const d of selectedDepts) {
      if (d.directorId === userId) return d.color
      for (const div of d.divisions) {
        if (div.headId === userId || div.memberships.some(m => m.user.id === userId)) return d.color
      }
    }
    return selectedDepts[0]?.color ?? '#4f46e5'
  }, [selectedDepts])

  // Search across all currently shown depts
  const q = search.trim().toLowerCase()
  const highlightIds = useMemo<Set<string>>(() => {
    if (!q) return new Set()
    const ids = new Set<string>()
    for (const dept of selectedDepts) {
      for (const div of dept.divisions)
        for (const m of div.memberships)
          if (m.user.name.toLowerCase().includes(q) || formatName(m.user.name).toLowerCase().includes(q))
            ids.add(m.user.id)
      if (dept.director && (dept.director.name.toLowerCase().includes(q) || formatName(dept.director.name).toLowerCase().includes(q)))
        ids.add(dept.director.id)
    }
    return ids
  }, [q, selectedDepts])

  // ── Canvas pan/zoom ──────────────────────────────────────────────────────────
  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 60, y: 40 })
  const scaleRef   = useRef(scale)
  const offsetRef  = useRef(offset)
  const minScaleRef = useRef(0.15)
  const animateNextRef = useRef(false)
  scaleRef.current  = scale
  offsetRef.current = offset
  const dragging   = useRef(false)
  const lastPos    = useRef({ x: 0, y: 0 })
  const canvasRef  = useRef<HTMLDivElement>(null)
  const dotRef     = useRef<HTMLDivElement>(null)
  const blockedRef = useRef(false)
  blockedRef.current = !!(profileId || ctx)

  const applyTransform = useCallback((s: number, ox: number, oy: number) => {
    const world = canvasRef.current?.querySelector<HTMLDivElement>('.team-world')
    if (world) {
      if (animateNextRef.current) {
        world.style.transition = 'transform 0.45s cubic-bezier(0.4,0,0.2,1)'
        animateNextRef.current = false
        setTimeout(() => { if (world) world.style.transition = '' }, 500)
      }
      world.style.transform = `translate(${ox}px,${oy}px) scale(${s})`
    }
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

  // Auto-fit: measure content at identity scale, then animate to fit
  const fitToContent = useCallback(() => {
    const canvas = canvasRef.current
    const world = canvas?.querySelector<HTMLDivElement>('.team-world')
    if (!canvas || !world) return

    // Measure at identity (suppress transition during measurement)
    const prevS = scaleRef.current, prevOx = offsetRef.current.x, prevOy = offsetRef.current.y
    world.style.transition = 'none'
    world.style.transform = 'translate(0px,0px) scale(1)'
    world.getBoundingClientRect() // force reflow

    const tw = world.offsetWidth
    const th = world.offsetHeight
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight

    // Restore current transform so animation starts from it
    world.style.transform = `translate(${prevOx}px,${prevOy}px) scale(${prevS})`

    if (tw === 0 || th === 0) return

    const PAD = 64
    const fitScale = Math.min((cw - PAD * 2) / tw, (ch - PAD * 2) / th, 1.1)
    const clampedScale = Math.max(0.15, fitScale)
    const fox = (cw - tw * clampedScale) / 2
    const foy = Math.max(PAD / 2, (ch - th * clampedScale) / 2)

    minScaleRef.current = Math.max(0.1, clampedScale * 0.6)

    animateNextRef.current = true
    scaleRef.current = clampedScale
    offsetRef.current = { x: fox, y: foy }
    setScale(clampedScale)
    setOffset({ x: fox, y: foy })
  }, [])

  // Fit after dept changes (double rAF to wait for DeptTree SVG layout)
  useEffect(() => {
    if (selectedDepts.length === 0) return
    let raf1: number, raf2: number
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => fitToContent())
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [selectedDeptId, fitToContent])

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const setCanvasRef = useCallback((el: HTMLDivElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (blockedRef.current) return
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const s = scaleRef.current, ox = offsetRef.current.x, oy = offsetRef.current.y
      const s1 = Math.max(minScaleRef.current, Math.min(2, s + delta))
      const bx = (mx - ox) / s, by = (my - oy) / s
      setScale(s1)
      setOffset({ x: mx - bx * s1, y: my - by * s1 })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (blockedRef.current) return
    if ((e.target as HTMLElement).closest('[data-interactive]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    const canvas = canvasRef.current
    const cw = canvas?.clientWidth ?? 800
    const ch = canvas?.clientHeight ?? 600
    const nx = clamp(offsetRef.current.x + dx, -2000, cw * 0.9)
    const ny = clamp(offsetRef.current.y + dy, -1500, ch * 0.9)
    offsetRef.current = { x: nx, y: ny }
    applyTransform(scaleRef.current, nx, ny)
  }
  const onPointerUp = () => { dragging.current = false }

  // ── Profile & ctx actions ────────────────────────────────────────────────────
  const handlePersonClick = useCallback((userId: string) => {
    setCtx(null)
    setProfileId(userId)
  }, [])

  const handlePersonCtx = useCallback((e: React.MouseEvent, userId: string) => {
    e.preventDefault()
    setProfileId(null)
    setCtx({ x: e.clientX, y: e.clientY, userId })
  }, [])

  // ── Dropdown label for 'all' option ─────────────────────────────────────────
  const allLabel = myDepts.length > 1
    ? `Мои: ${myDepts.map(d => d.name).join(', ')}`
    : ''

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-1)', fontFamily: 'inherit',
    fontSize: 13, padding: '6px 10px', cursor: 'pointer', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Контролы страницы — в китовую шапку (заголовок «Команда» даёт AppShell) */}
      <HeaderPortal>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Dept selector */}
          {myDepts.length === 1 && selectedDepts[0] && (
            <span style={{
              fontSize: 13, fontWeight: 700, color: selectedDepts[0].color,
              background: selectedDepts[0].color + '22', borderRadius: 6, padding: '4px 10px',
            }}>{selectedDepts[0].name}</span>
          )}

          {myDepts.length > 1 && (
            <select value={selectedDeptId ?? 'all'} onChange={e => setSelectedDeptId(e.target.value)} style={selectStyle}>
              <option value="all">{allLabel}</option>
              <optgroup label="Мои">
                {myDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </optgroup>
              {otherDepts.length > 0 && (
                <optgroup label="Все">
                  {otherDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
              )}
            </select>
          )}

          {/* Admin flat list (not assigned to any dept via org structure) */}
          {isAdmin && myDepts.length === 0 && allDepts.length > 0 && (
            <select value={selectedDeptId ?? ''} onChange={e => setSelectedDeptId(e.target.value)} style={selectStyle}>
              {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '5px 10px', minWidth: 200,
          }}>
            <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск сотрудника…"
              style={{ background: 'none', border: 'none', outline: 'none', flex: 1, color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                <X size={12} />
              </button>
            )}
          </div>
          {highlightIds.size > 0 && (
            <span style={{ fontSize: 12, color: '#F59E0B', flexShrink: 0 }}>{highlightIds.size} найд.</span>
          )}
          {q && highlightIds.size === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>Не найдено</span>
          )}
        </div>
      </HeaderPortal>

      {/* Canvas */}
      <div
        ref={setCanvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          cursor: dragging.current ? 'grabbing' : 'grab',
          userSelect: 'none', touchAction: 'none',
        }}
      >
        {/* Dot grid */}
        <div ref={dotRef} style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.06) 1px,transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Загрузка…
          </div>
        )}

        {!isLoading && selectedDepts.length === 0 && !isAdmin && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Вы не привязаны к департаменту
          </div>
        )}

        {/* World — flex row for multi-dept */}
        {selectedDepts.length > 0 && (
          <div className="team-world" style={{
            position: 'absolute', transformOrigin: '0 0',
            padding: '40px 60px 80px',
            display: 'inline-flex', gap: 80, alignItems: 'flex-start',
          }}>
            {selectedDepts.map(d => (
              <DeptTree
                key={d.id}
                dept={d}
                highlightIds={highlightIds}
                myId={me?.id}
                onPersonClick={handlePersonClick}
                onPersonCtx={handlePersonCtx}
              />
            ))}
          </div>
        )}

        {/* Zoom controls */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, zIndex: 10 }}>
          {[
            { label: '＋', action: () => { const s = Math.min(2, scaleRef.current + 0.15); setScale(s); setOffset({ ...offsetRef.current }) } },
            { label: '－', action: () => { const s = Math.max(minScaleRef.current, scaleRef.current - 0.15); setScale(s); setOffset({ ...offsetRef.current }) } },
            { label: '⊡', action: () => fitToContent() },
          ].map(b => (
            <button
              key={b.label}
              data-interactive
              onClick={b.action}
              style={{
                fontSize: 13, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--surface-1)',
                color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{b.label}</button>
          ))}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 36, textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Hint */}
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 14px', fontSize: 12, color: 'var(--text-muted)',
          display: 'flex', gap: 12, pointerEvents: 'none',
        }}>
          <span>Колесо — зум</span>
          <span>Тащи — пан</span>
          <span>Клик — профиль</span>
        </div>
      </div>

      {/* Profile popup */}
      {profileId && selectedDepts.length > 0 && (
        <ProfilePopup
          userId={profileId}
          deptColor={getDeptColor(profileId)}
          isSelf={profileId === me?.id}
          onClose={() => setProfileId(null)}
          onDM={id => { onOpenChat?.(id); setProfileId(null) }}
        />
      )}

      {/* Context menu */}
      {ctx && (
        <CtxMenu
          x={ctx.x} y={ctx.y}
          isSelf={ctx.userId === me?.id}
          onProfile={() => { setProfileId(ctx.userId); setCtx(null) }}
          onDM={() => { onOpenChat?.(ctx.userId); setCtx(null) }}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}

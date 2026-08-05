import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatName } from '../../lib/utils'
import { CR, GAP, LINE_COLOR, R } from './constants'
import type { Department, Division, Membership, OrgUser } from './types'
import { ActionBtn } from './ui'

const shortName = formatName

// ─── Division Card ────────────────────────────────────────────────────────────

export function DivCard({
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
        <div style={{ fontSize:14,fontWeight:700,color:'var(--text-1)',marginBottom:5,paddingRight:48,whiteSpace:'nowrap' }}>
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
            <div style={{ width:26,height:26,borderRadius:'50%',background:`${dept.color}22`,border:`1.5px solid ${dept.color}66`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:dept.color,flexShrink:0 }}>
              {shortName(div.head.name).trim().split(/\s+/).slice(0,2).map((w:string)=>w[0]??'').join('').toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12,fontWeight:600,color:'var(--text-2)',whiteSpace:'nowrap' }}>{shortName(div.head.name)}</div>
              <div style={{ fontSize:12,fontWeight:600,letterSpacing:'0.3px',color:'var(--text-muted)',textTransform:'uppercase' }}>Руководитель</div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex',alignItems:'center',gap:5,marginTop:2 }}>
            <span style={{ fontSize:12,fontWeight:700,letterSpacing:'0.6px',textTransform:'uppercase',color:'var(--text-muted)' }}>Рук.</span>
            <span style={{ fontSize:12,color:'var(--text-muted)',fontStyle:'italic' }}>не назначен</span>
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
          style={{ width:'100%',padding:'6px 14px',background:'none',border:'none',color:'var(--text-muted)',fontSize:12,cursor:'pointer',fontFamily:'Inter,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:5,transition:'color .1s' }}
          onMouseEnter={e => (e.currentTarget.style.color='var(--text-2)')}
          onMouseLeave={e => (e.currentTarget.style.color='var(--text-muted)')}
        >
          <span style={{ fontSize:14 }}>＋</span> Добавить сотрудника
        </button>
      </div>
    </div>
  )
}

export function MemberRow({ m, deptColor, onEdit, onRemove, onProfile }: { m: Membership; deptColor: string; onEdit: () => void; onRemove: () => void; onProfile: () => void }) {
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
      <div style={{ width:24,height:24,borderRadius:'50%',background:`${deptColor}18`,border:`1.5px solid ${deptColor}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:deptColor,flexShrink:0 }}>
        {shortName(m.user.name).trim().split(/\s+/).slice(0,2).map((w:string)=>w[0]??'').join('').toUpperCase()}
      </div>
      <div style={{ flexShrink:0 }}>
        <div style={{ fontSize:12,fontWeight:500,color:'var(--text-2)',whiteSpace:'nowrap' }}>{shortName(m.user.name)}</div>
        {(m.position || m.user.position) && <div style={{ fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap' }}>{m.position || m.user.position}</div>}
      </div>
      <div style={{ display:'flex',gap:3,visibility:hover?'visible':'hidden',flexShrink:0,position:'absolute',right:14,top:'50%',transform:'translateY(-50%)' }} onClick={e => e.stopPropagation()}>
        <ActionBtn onClick={onEdit}>✎</ActionBtn>
        <ActionBtn danger onClick={onRemove}>✕</ActionBtn>
      </div>
    </div>
  )
}

// ─── Department Tree ──────────────────────────────────────────────────────────

export function DeptTree({
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
            <div style={{ width:26,height:26,borderRadius:'50%',background:'rgba(0,0,0,0.28)',border:'1.5px solid rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0 }}>
              {shortName(dept.director.name).trim().split(/\s+/).slice(0,2).map((w:string)=>w[0]??'').join('').toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12,fontWeight:700,color:'#fff',whiteSpace:'nowrap',textShadow:'0 1px 2px rgba(0,0,0,0.3)' }}>{shortName(dept.director.name)}</div>
              <div style={{ fontSize:12,fontWeight:600,letterSpacing:'0.3px',color:'rgba(255,255,255,0.55)',textTransform:'uppercase' }}>Директор</div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex',alignItems:'center',gap:6,zIndex:1 }}>
            <span style={{ fontSize:12,fontWeight:700,letterSpacing:'0.8px',textTransform:'uppercase',color:'rgba(255,255,255,0.5)' }}>Директор</span>
            <span style={{ fontSize:12,color:'rgba(255,255,255,0.35)',fontStyle:'italic' }}>не назначен</span>
          </div>
        )}
        <div style={{ fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.45)',marginTop:8,paddingTop:7,borderTop:'1px solid rgba(255,255,255,0.12)',letterSpacing:'0.2px',zIndex:1 }}>
          {memberCount} чел.
        </div>
        {deptHover && (
          <div style={{ position:'absolute',top:8,right:8,display:'flex',gap:4,zIndex:11 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onEditDept(dept)} style={{ width:22,height:22,borderRadius:5,border:'1px solid rgba(255,255,255,0.2)',background:'rgba(0,0,0,0.3)',color:'rgba(255,255,255,0.7)',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif' }}>✎</button>
            <button onClick={() => onDeleteDept(dept.id)} style={{ width:22,height:22,borderRadius:5,border:'1px solid rgba(255,255,255,0.2)',background:'rgba(0,0,0,0.3)',color:'rgba(255,100,100,0.8)',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif' }}>✕</button>
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

export function CtxMenu({ x, y, onCreateDept, onClose }: { x: number; y: number; onCreateDept: () => void; onClose: () => void }) {
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
        style={{ width:'100%',padding:'8px 12px',background:'none',border:'none',color:'var(--text-2)',fontSize:14,fontFamily:'Inter,sans-serif',textAlign:'left',cursor:'pointer',borderRadius:5,display:'flex',alignItems:'center',gap:8 }}
        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background='none')}
      >
        <span style={{ fontSize:15 }}>＋</span> Новый департамент
      </button>
    </div>
  )
}

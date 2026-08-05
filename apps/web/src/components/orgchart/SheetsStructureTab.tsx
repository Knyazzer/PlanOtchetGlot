import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import { SHEETS_COLORS } from './constants'
import type { SheetUser, SheetsDeptCol } from './types'
import { ZBtn } from './ui'

const shortName = formatName

// ─── Sheets Structure Tab (read-only snapshot) ────────────────────────────────

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
      <div style={{ position:'absolute',top:16,left:16,zIndex:10,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',fontSize:12,color:'var(--text-muted)',pointerEvents:'none' }}>
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
              <div style={{ fontSize:14,fontWeight:800,color:'#fff',letterSpacing:'0.02em' }}>{col.name}</div>
              <div style={{ fontSize:12,color:'rgba(255,255,255,0.6)',marginTop:3 }}>{col.subs.reduce((s,d)=>s+d.members.length,0)} чел.</div>
            </div>
            {/* Division cards row */}
            <div style={{ display:'flex',flexDirection:'row',gap:12,alignItems:'flex-start' }}>
              {col.subs.map((sub, si) => (
                <div key={si} style={{ minWidth:160,maxWidth:200,background:'var(--surface-1)',border:'1px solid var(--border)',borderTop:`3px solid ${col.color}`,borderRadius:8,overflow:'hidden' }}>
                  {sub.name && (
                    <div style={{ padding:'8px 12px 6px',borderBottom:'1px solid var(--border)',fontSize:12,fontWeight:700,color:'var(--text-2)' }}>{sub.name}</div>
                  )}
                  <div style={{ padding:'4px 12px 8px' }}>
                    {sub.members.map((m, mi) => (
                      <div key={mi} style={{ padding:'3px 0',borderBottom: mi < sub.members.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize:12,fontWeight:500,color:'var(--text-2)' }}>{shortName(m.name)}</div>
                        {m.position && <div style={{ fontSize:12,color:'var(--text-muted)' }}>{m.position}</div>}
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

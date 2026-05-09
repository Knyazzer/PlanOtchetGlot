import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useIsAdmin } from '../hooks/useAuth'

interface StaffRow { tabNumber: string; name: string; position: string; dept: string; subDept: string }
interface DeptMember { userId: string; deptId: string; isHead: boolean; user: { id: string; fullName: string; tabNumber: string | null } }
interface Department { id: string; name: string; type: string; parentId: string | null; members: DeptMember[] }

// Visual sub-department card built from staff-import
interface SubCard { name: string; headName: string; persons: { name: string; position: string }[] }
// Visual department column built from staff-import
interface DeptColumn { name: string; color: string; dbDept?: Department; subs: SubCard[] }

const COLORS = ['#1e40af','#065f46','#7c3aed','#9a3412','#0f766e','#be185d','#b45309','#374151']
const HEAD_KEYWORDS = ['руководитель', 'директор', 'начальник', 'заведующий']

function isHeadPos(pos: string) { const p = (pos ?? '').toLowerCase(); return HEAD_KEYWORDS.some(k => p.includes(k)) }

export function OrgChartTab() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()

  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 60, y: 40 })
  const [syncConfirm, setSyncConfirm] = useState(false)
  const [headPickerModal, setHeadPickerModal] = useState<{
    dept: Department; subName: string
    candidates: { userId: string; fullName: string }[]
  } | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const worldRef  = useRef<HTMLDivElement>(null)
  const svgRef    = useRef<SVGSVGElement>(null)
  const chartRef  = useRef<HTMLDivElement>(null)
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })
  const scaleRef  = useRef(scale)
  const offsetRef = useRef(offset)
  scaleRef.current = scale
  offsetRef.current = offset

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: depts = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: staffImport, isLoading } = useQuery<{ rows: StaffRow[] }>({
    queryKey: ['staff-import'],
    queryFn: () => api.get('/users/staff-import').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: allUsers = [] } = useQuery<{ id: string; fullName: string; tabNumber: string | null }[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  })

  const staffRows  = staffImport?.rows ?? []
  const activeStaff = staffRows.filter(r => r.tabNumber)

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const patchMember = useMutation({
    mutationFn: ({ deptId, userId, isHead }: { deptId: string; userId: string; isHead: boolean }) =>
      api.patch(`/departments/${deptId}/members/${userId}`, { isHead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  const addMemberMut = useMutation({
    mutationFn: ({ deptId, userId, isHead }: { deptId: string; userId: string; isHead: boolean }) =>
      api.post(`/departments/${deptId}/members`, { userId, isHead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  // Assign all staff to departments based on import data
  const syncFromStaff = useMutation({
    mutationFn: async () => {
      const deptByName = new Map(depts.map(d => [d.name.toLowerCase().trim(), d]))
      const userByName = new Map(allUsers.map(u => [u.fullName.toLowerCase().trim(), u]))
      for (const row of activeStaff) {
        const name = row.name?.trim(); if (!name) continue
        const user = userByName.get(name.toLowerCase()); if (!user) continue
        const dept = deptByName.get(row.subDept?.toLowerCase().trim()) ?? deptByName.get(row.dept?.toLowerCase().trim())
        if (!dept) continue
        const isHead = isHeadPos(row.position ?? '')
        await api.patch(`/departments/${dept.id}/members/${user.id}`, { isHead })
          .catch(() => api.post(`/departments/${dept.id}/members`, { userId: user.id, isHead }))
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setSyncConfirm(false) },
  })

  // ── Build visual structure from staff-import ──────────────────────────────────
  const deptNames = [...new Set(activeStaff.map(r => r.dept).filter(Boolean))].sort()

  const columns: DeptColumn[] = deptNames.map((deptName, i) => {
    const dbDept = depts.find(d => d.name.toLowerCase().trim() === deptName.toLowerCase().trim())
    const deptStaff = activeStaff.filter(r => r.dept === deptName)
    const subNames = [...new Set(deptStaff.map(r => r.subDept).filter(Boolean))].sort()

    const subs: SubCard[] = subNames.map(subName => {
      const subStaff = deptStaff.filter(r => r.subDept === subName)
      // Head: prefer DB isHead, fallback to position keyword
      const dbSubDept = depts.find(d => d.name.toLowerCase().trim() === subName.toLowerCase().trim())
      const dbHead = dbSubDept?.members.find(m => m.isHead)
      const importHead = subStaff.find(r => isHeadPos(r.position))
      const headName = dbHead?.user.fullName ?? importHead?.name ?? ''
      const persons = subStaff
        .filter(r => r.name !== headName)
        .map(r => ({ name: r.name, position: r.position }))
      return { name: subName, headName, persons }
    })

    // If no subdepts, put all members directly into dept
    if (subNames.length === 0) {
      const dbHead = dbDept?.members.find(m => m.isHead)
      const importHead = deptStaff.find(r => isHeadPos(r.position))
      const headName = dbHead?.user.fullName ?? importHead?.name ?? ''
      const persons = deptStaff.filter(r => r.name !== headName).map(r => ({ name: r.name, position: r.position }))
      subs.push({ name: '', headName, persons })
    }

    return { name: deptName, color: COLORS[i % COLORS.length], dbDept, subs }
  })

  // ── Pan / Zoom ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY }; canvas.style.cursor = 'grabbing'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setOffset(o => ({ x: o.x + e.clientX - lastPos.current.x, y: o.y + e.clientY - lastPos.current.y }))
      lastPos.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = () => { dragging.current = false; canvas.style.cursor = 'grab' }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const s0 = scaleRef.current
      const s1 = Math.max(0.3, Math.min(2.5, s0 + delta))
      const bx = (mx - offsetRef.current.x) / s0, by = (my - offsetRef.current.y) / s0
      setScale(s1); setOffset({ x: mx - bx * s1, y: my - by * s1 })
    }
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  })

  // ── SVG connector lines ───────────────────────────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      const svg = svgRef.current; const chart = chartRef.current
      if (!svg || !chart) return
      const g = svg.querySelector('g')!; g.innerHTML = ''
      function worldPos(el: HTMLElement) {
        let x = 0, y = 0, cur: HTMLElement | null = el
        while (cur && cur !== worldRef.current) { x += cur.offsetLeft; y += cur.offsetTop; cur = cur.offsetParent as HTMLElement | null }
        return { x, y }
      }
      columns.forEach(col => {
        if (col.subs.length <= 1 && col.subs[0]?.name === '') return
        const dCard = chart.querySelector<HTMLElement>(`[data-dept="${col.name}"]`)
        const subsRow = chart.querySelector<HTMLElement>(`[data-subs="${col.name}"]`)
        if (!dCard || !subsRow) return
        const dp = worldPos(dCard)
        const dCx = dp.x + dCard.offsetWidth / 2, dBotY = dp.y + dCard.offsetHeight
        const sp = worldPos(subsRow), subTopY = sp.y, midY = dBotY + (subTopY - dBotY) / 2
        const subEls = subsRow.querySelectorAll<HTMLElement>('[data-sub-block]')
        const pts: { cx: number; topY: number }[] = []
        subEls.forEach(el => { const p = worldPos(el); pts.push({ cx: p.x + el.offsetWidth / 2, topY: p.y }) })
        if (!pts.length) return
        const mkLine = (x1: number, y1: number, x2: number, y2: number) => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          el.setAttribute('x1', String(x1)); el.setAttribute('y1', String(y1))
          el.setAttribute('x2', String(x2)); el.setAttribute('y2', String(y2))
          el.setAttribute('stroke', col.color); el.setAttribute('stroke-width', '2'); el.setAttribute('stroke-opacity', '0.45')
          g.appendChild(el)
        }
        mkLine(dCx, dBotY, dCx, midY)
        if (pts.length > 1) mkLine(pts[0].cx, midY, pts[pts.length - 1].cx, midY)
        pts.forEach(p => mkLine(p.cx, midY, p.cx, p.topY))
      })
      svg.setAttribute('width', String(chart.scrollWidth)); svg.setAttribute('height', String(chart.scrollHeight))
    })
  })

  const doZoom = useCallback((delta: number) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const s0 = scaleRef.current, s1 = Math.max(0.3, Math.min(2.5, s0 + delta))
    const bx = (cx - offsetRef.current.x) / s0, by = (cy - offsetRef.current.y) / s0
    setScale(s1); setOffset({ x: cx - bx * s1, y: cy - by * s1 })
  }, [])

  // ── Head picker: find users in this sub-dept from staff import ────────────────
  const openHeadPicker = (col: DeptColumn, sub: SubCard) => {
    if (!isAdmin) return
    const dept = col.dbDept ?? depts.find(d => d.name.toLowerCase().trim() === sub.name.toLowerCase().trim())
    if (!dept) return
    const subStaff = activeStaff.filter(r => sub.name ? r.subDept === sub.name : r.dept === col.name)
    const userByName = new Map(allUsers.map(u => [u.fullName.toLowerCase().trim(), u]))
    const candidates = subStaff
      .map(r => userByName.get(r.name?.toLowerCase().trim()))
      .filter(Boolean)
      .map(u => ({ userId: u!.id, fullName: u!.fullName }))
    if (!candidates.length) return
    setHeadPickerModal({ dept, subName: sub.name, candidates })
  }

  const assignHead = (userId: string) => {
    if (!headPickerModal) return
    const { dept, candidates } = headPickerModal
    // Remove isHead from current head, assign to new
    for (const c of candidates) {
      if (c.userId === userId) {
        patchMember.mutate({ deptId: dept.id, userId: c.userId, isHead: true })
      } else {
        const existing = dept.members.find(m => m.userId === c.userId && m.isHead)
        if (existing) patchMember.mutate({ deptId: dept.id, userId: c.userId, isHead: false })
      }
    }
    // Ensure all sub-staff are members
    for (const c of candidates) {
      if (!dept.members.find(m => m.userId === c.userId)) {
        addMemberMut.mutate({ deptId: dept.id, userId: c.userId, isHead: c.userId === userId })
      }
    }
    setHeadPickerModal(null)
  }

  if (isLoading) return <div style={{ padding: 40, color: '#94a3b8' }}>Загрузка структуры...</div>

  const noData = activeStaff.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', marginTop: 16 }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {isAdmin && (
          <button
            onClick={() => setSyncConfirm(true)}
            disabled={noData}
            style={{ ...btnSync, opacity: noData ? 0.45 : 1, cursor: noData ? 'default' : 'pointer' }}
            title="Назначить участников отделов на основе импорта персонала"
          >
            ⟳ Синхронизировать участников с БД
          </button>
        )}
        <div style={sep} />
        <button onClick={() => doZoom(0.15)}  style={btnGhost}>＋</button>
        <span style={{ fontSize: 12, color: '#64748b', minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => doZoom(-0.15)} style={btnGhost}>－</button>
        <button onClick={() => { setScale(1); setOffset({ x: 60, y: 40 }) }} style={btnGhost}>⊡</button>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>Колесо — зум · Тащи фон — пан</span>
        {noData && (
          <span style={{ fontSize: 12, color: '#f59e0b', marginLeft: 8 }}>
            Нет данных — обновите импорт персонала
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        style={{ flex: 1, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'grab', position: 'relative' }}
      >
        <div
          ref={worldRef}
          style={{ position: 'absolute', transformOrigin: '0 0', transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})` }}
        >
          <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}><g /></svg>

          <div ref={chartRef} style={{ position: 'relative', padding: '40px 60px 80px', display: 'flex', gap: 60, alignItems: 'flex-start' }}>
            {noData && (
              <div style={{ color: '#94a3b8', fontSize: 14, padding: '40px 0' }}>
                Нет данных. Обновите импорт персонала.
              </div>
            )}
            {columns.map(col => {
              const hasSubs = !(col.subs.length === 1 && col.subs[0].name === '')
              const inlineSub = !hasSubs ? col.subs[0] : null

              return (
                <div key={col.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                  {/* Dept header card */}
                  <div
                    data-dept={col.name}
                    style={{
                      background: col.color, color: '#fff', borderRadius: 10,
                      padding: '11px 20px 10px', fontSize: 14, fontWeight: 700,
                      textAlign: 'center', userSelect: 'none', minWidth: 180,
                    }}
                  >
                    <div>{col.name}</div>
                    {inlineSub ? (
                      <HeadLabel
                        headName={inlineSub.headName}
                        isAdmin={isAdmin}
                        onClick={() => openHeadPicker(col, inlineSub)}
                      />
                    ) : (
                      <div style={{ fontSize: 11, opacity: 0.45, marginTop: 3, fontStyle: 'italic' }}>
                        — группа отделов —
                      </div>
                    )}
                  </div>

                  {/* Inline members (no sub-departments) */}
                  {inlineSub && (
                    <div style={{ background: '#fff', border: `1px solid #e2e8f0`, borderTop: 'none', borderRadius: '0 0 8px 8px', minWidth: 180, padding: '6px 12px 4px' }}>
                      {inlineSub.persons.length === 0
                        ? <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic', padding: '4px 0' }}>Сотрудников нет</div>
                        : inlineSub.persons.map((p, i) => (
                          <PersonRow key={i} name={p.name} role={p.position} />
                        ))
                      }
                    </div>
                  )}

                  {/* Sub-departments row */}
                  {hasSubs && (
                    <div data-subs={col.name} style={{ display: 'flex', gap: 16, marginTop: 32, alignItems: 'flex-start', justifyContent: 'center' }}>
                      {col.subs.map((sub, si) => (
                        <div
                          key={sub.name || si}
                          data-sub-block
                          style={{
                            background: '#fff', border: `1.5px solid #e2e8f0`,
                            borderTop: `3px solid ${col.color}`,
                            borderRadius: 10, minWidth: 170, maxWidth: 210,
                            boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden',
                          }}
                        >
                          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{sub.name}</div>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', marginBottom: 2 }}>
                              Руководитель
                            </div>
                            <HeadLabel
                              headName={sub.headName}
                              isAdmin={isAdmin}
                              dark
                              onClick={() => openHeadPicker(col, sub)}
                            />
                          </div>
                          <div style={{ padding: '6px 14px 4px' }}>
                            {sub.persons.length === 0
                              ? <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic', padding: '4px 0' }}>Сотрудников нет</div>
                              : sub.persons.map((p, i) => <PersonRow key={i} name={p.name} role={p.position} />)
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Head picker modal */}
      {headPickerModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setHeadPickerModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Назначить руководителя</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              {headPickerModal.subName || headPickerModal.dept.name}
            </p>
            {headPickerModal.candidates.map(c => (
              <div
                key={c.userId}
                onClick={() => assignHead(c.userId)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4 }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f0f9ff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#4f46e5', flexShrink: 0 }}>
                  {c.fullName[0]}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{c.fullName}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setHeadPickerModal(null)} style={btnGhost}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Sync confirm modal */}
      {syncConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSyncConfirm(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Синхронизировать участников с БД</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Для каждого сотрудника из таблицы, у которого есть аккаунт, будет выставлен отдел и статус руководителя (по должности).
              Существующие назначения руководителей сохранятся.
            </p>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
              <span style={{ fontWeight: 600, color: '#166534' }}>Будет обработано: </span>
              <span style={{ color: '#15803d' }}>{activeStaff.length} сотрудников</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSyncConfirm(false)} style={btnGhost}>Отмена</button>
              <button
                onClick={() => syncFromStaff.mutate()}
                disabled={syncFromStaff.isPending}
                style={{ ...btnSync, opacity: syncFromStaff.isPending ? 0.5 : 1 }}
              >
                {syncFromStaff.isPending ? 'Синхронизация...' : 'Применить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function HeadLabel({ headName, isAdmin, dark, onClick }: { headName: string; isAdmin: boolean; dark?: boolean; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false)
  const hasHead = !!headName
  return (
    <div
      style={{
        fontSize: dark ? 12 : 11, fontWeight: dark ? 600 : 400,
        color: hasHead ? (dark ? '#2563eb' : 'rgba(255,255,255,0.9)') : (dark ? '#cbd5e1' : 'rgba(255,255,255,0.45)'),
        fontStyle: hasHead ? 'normal' : 'italic',
        marginTop: dark ? 0 : 4,
        cursor: isAdmin ? 'pointer' : 'default',
        textDecoration: isAdmin && hovered ? 'underline' : 'none',
        display: 'inline-block',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { if (isAdmin && onClick) { e.stopPropagation(); onClick() } }}
      title={isAdmin ? 'Нажмите чтобы назначить руководителя' : undefined}
    >
      {hasHead ? headName : '— не назначен —'}
    </div>
  )
}

function PersonRow({ name, role }: { name: string; role: string }) {
  return (
    <div style={{ padding: '3px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>{name}</div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{role}</div>
    </div>
  )
}

const btnGhost: React.CSSProperties = { background: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }
const btnSync: React.CSSProperties  = { background: '#0f766e', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }
const sep: React.CSSProperties      = { width: 1, height: 24, background: '#e2e8f0' }

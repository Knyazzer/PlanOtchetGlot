import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useIsAdmin } from '../hooks/useAuth'

interface StaffRow { tabNumber: string; name: string; position: string; dept: string; subDept: string }

interface DeptMemberUser { id: string; fullName: string; email: string; tabNumber: string | null }
interface DeptMember { userId: string; deptId: string; isHead: boolean; user: DeptMemberUser }
interface Department {
  id: string; name: string; type: string
  parentId: string | null
  parent: { id: string; name: string } | null
  children: { id: string; name: string; type: string }[]
  members: DeptMember[]
  _count: { members: number; wiLinks: number }
}

const COLORS = ['#1e40af','#065f46','#7c3aed','#9a3412','#0f766e','#be185d','#b45309','#374151']
const HEAD_KEYWORDS = ['руководитель', 'директор', 'начальник', 'заведующий']

function isHeadPosition(position: string): boolean {
  const p = (position ?? '').toLowerCase()
  return HEAD_KEYWORDS.some((k) => p.includes(k))
}

// Consistent color per department name
function deptColor(depts: Department[], deptId: string): string {
  const idx = depts.findIndex((d) => d.id === deptId)
  return COLORS[idx % COLORS.length]
}

// ── Component ─────────────────────────────────────────────────────────────────
export function OrgChartTab() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 60, y: 40 })
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number
    dept: Department; member?: DeptMember
  } | null>(null)
  const [addMemberModal, setAddMemberModal] = useState<{ dept: Department } | null>(null)
  const [addMemberSearch, setAddMemberSearch] = useState('')
  const [syncConfirm, setSyncConfirm] = useState(false)

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

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: depts = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: staffImport } = useQuery<{ rows: StaffRow[] }>({
    queryKey: ['staff-import'],
    queryFn: () => api.get('/users/staff-import').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: allUsers = [] } = useQuery<{ id: string; fullName: string; tabNumber: string | null }[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const staffRows = staffImport?.rows ?? []

  // ── Mutations ────────────────────────────────────────────────────────────────
  const patchMember = useMutation({
    mutationFn: ({ deptId, userId, isHead }: { deptId: string; userId: string; isHead: boolean }) =>
      api.patch(`/departments/${deptId}/members/${userId}`, { isHead }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }) },
  })

  const addMember = useMutation({
    mutationFn: ({ deptId, userId }: { deptId: string; userId: string }) =>
      api.post(`/departments/${deptId}/members`, { userId, isHead: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setAddMemberModal(null) },
  })

  const removeMember = useMutation({
    mutationFn: ({ deptId, userId }: { deptId: string; userId: string }) =>
      api.delete(`/departments/${deptId}/members/${userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }) },
  })

  // ── Sync from staff import → assign members ──────────────────────────────────
  const syncFromStaff = useMutation({
    mutationFn: async () => {
      const activeStaff = staffRows.filter(r => r.tabNumber)
      if (!activeStaff.length) return

      const deptByName = new Map(depts.map(d => [d.name.toLowerCase().trim(), d]))
      const userByName = new Map(allUsers.map(u => [u.fullName.toLowerCase().trim(), u]))

      for (const row of activeStaff) {
        const name = row.name?.trim()
        if (!name) continue
        const user = userByName.get(name.toLowerCase())
        if (!user) continue

        const dept =
          deptByName.get(row.subDept?.toLowerCase().trim()) ??
          deptByName.get(row.dept?.toLowerCase().trim())
        if (!dept) continue

        const isHead = isHeadPosition(row.position ?? '')
        await api.patch(`/departments/${dept.id}/members/${user.id}`, { isHead })
          .catch(() => api.post(`/departments/${dept.id}/members`, { userId: user.id, isHead }))
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setSyncConfirm(false) },
  })

  // ── Pan / Zoom ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging.current = true
      lastPos.current = { x: e.clientX, y: e.clientY }
      canvas.style.cursor = 'grabbing'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
    }
    const onMouseUp = () => { dragging.current = false; canvas.style.cursor = 'grab' }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const s0 = scaleRef.current
      const s1 = Math.max(0.3, Math.min(2.5, s0 + delta))
      const bx = (mx - offsetRef.current.x) / s0
      const by = (my - offsetRef.current.y) / s0
      setScale(s1)
      setOffset({ x: mx - bx * s1, y: my - by * s1 })
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
  }, [])

  useEffect(() => {
    const close = () => setCtxMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ── Draw SVG connector lines ─────────────────────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      const svg = svgRef.current
      const chart = chartRef.current
      if (!svg || !chart) return

      const g = svg.querySelector('g')!
      g.innerHTML = ''

      function worldPos(el: HTMLElement): { x: number; y: number } {
        let x = 0, y = 0, cur: HTMLElement | null = el
        while (cur && cur !== worldRef.current) {
          x += cur.offsetLeft; y += cur.offsetTop
          cur = cur.offsetParent as HTMLElement | null
        }
        return { x, y }
      }

      // Draw connections from parent depts to their children
      topLevelDepts.forEach((dept, _i) => {
        const color = deptColor(depts, dept.id)
        if (dept.children.length === 0) return
        const dCard = chart.querySelector<HTMLElement>(`[data-dept="${dept.id}"]`)
        const subsRow = chart.querySelector<HTMLElement>(`[data-children="${dept.id}"]`)
        if (!dCard || !subsRow) return

        const dp = worldPos(dCard)
        const dCx   = dp.x + dCard.offsetWidth / 2
        const dBotY = dp.y + dCard.offsetHeight

        const sp = worldPos(subsRow)
        const subTopY = sp.y
        const midY = dBotY + (subTopY - dBotY) / 2

        const subEls = subsRow.querySelectorAll<HTMLElement>('[data-child-block]')
        const pts: { cx: number; topY: number }[] = []
        subEls.forEach(el => {
          const p = worldPos(el)
          pts.push({ cx: p.x + el.offsetWidth / 2, topY: p.y })
        })
        if (pts.length === 0) return

        const mkLine = (x1: number, y1: number, x2: number, y2: number) => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          el.setAttribute('x1', String(x1)); el.setAttribute('y1', String(y1))
          el.setAttribute('x2', String(x2)); el.setAttribute('y2', String(y2))
          el.setAttribute('stroke', color)
          el.setAttribute('stroke-width', '2')
          el.setAttribute('stroke-opacity', '0.45')
          g.appendChild(el)
        }

        mkLine(dCx, dBotY, dCx, midY)
        if (pts.length > 1) mkLine(pts[0].cx, midY, pts[pts.length - 1].cx, midY)
        pts.forEach(p => mkLine(p.cx, midY, p.cx, p.topY))
      })

      svg.setAttribute('width',  String(chart.scrollWidth))
      svg.setAttribute('height', String(chart.scrollHeight))
    })
  })

  const doZoom = useCallback((delta: number) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const s0 = scaleRef.current
    const s1 = Math.max(0.3, Math.min(2.5, s0 + delta))
    const bx = (cx - offsetRef.current.x) / s0
    const by = (cy - offsetRef.current.y) / s0
    setScale(s1)
    setOffset({ x: cx - bx * s1, y: cy - by * s1 })
  }, [])

  // ── Department tree ──────────────────────────────────────────────────────────
  const topLevelDepts = depts.filter(d => !d.parentId)
  const childrenOf = (parentId: string) => depts.filter(d => d.parentId === parentId)

  // ── Add member search ────────────────────────────────────────────────────────
  const currentMemberIds = new Set(addMemberModal?.dept.members.map(m => m.userId) ?? [])
  const filteredUsers = allUsers
    .filter(u => !currentMemberIds.has(u.id))
    .filter(u => u.fullName.toLowerCase().includes(addMemberSearch.toLowerCase()))
    .slice(0, 20)

  const activeStaff = staffRows.filter(r => r.tabNumber)
  const syncPreview = depts.map(d => ({
    name: d.name,
    matches: activeStaff.filter(r =>
      r.subDept?.toLowerCase().trim() === d.name.toLowerCase().trim() ||
      r.dept?.toLowerCase().trim() === d.name.toLowerCase().trim()
    ).length,
  })).filter(d => d.matches > 0)

  if (isLoading) return <div style={{ padding: 40, color: '#94a3b8' }}>Загрузка структуры...</div>

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', marginTop: 16 }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {isAdmin && (
          <button
            onClick={() => setSyncConfirm(true)}
            disabled={activeStaff.length === 0}
            style={{ ...btnSync, opacity: activeStaff.length === 0 ? 0.45 : 1, cursor: activeStaff.length === 0 ? 'default' : 'pointer' }}
            title="Назначить участников отделов на основе импорта персонала"
          >
            ⟳ Синхронизировать участников
          </button>
        )}
        <div style={sep} />
        <button onClick={() => doZoom(0.15)}  style={btnGhost}>＋</button>
        <span style={{ fontSize: 12, color: '#64748b', minWidth: 40, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={() => doZoom(-0.15)} style={btnGhost}>－</button>
        <button onClick={() => { setScale(1); setOffset({ x: 60, y: 40 }) }} style={btnGhost}>⊡</button>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
          Колесо — зум · Тащи фон — пан
        </span>
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
          <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
            <g />
          </svg>

          <div ref={chartRef} style={{ position: 'relative', padding: '40px 60px 80px', display: 'flex', gap: 60, alignItems: 'flex-start' }}>
            {topLevelDepts.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 14, padding: '40px 0' }}>
                Отделы не найдены. Создайте их в разделе Управление отделами.
              </div>
            )}
            {topLevelDepts.map(dept => {
              const color = deptColor(depts, dept.id)
              const head = dept.members.find(m => m.isHead)
              const children = childrenOf(dept.id)

              return (
                <div key={dept.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                  {/* Dept card */}
                  <DeptCard
                    dept={dept}
                    color={color}
                    head={head}
                    isAdmin={isAdmin}
                    onCtx={(e) => {
                      e.preventDefault(); e.stopPropagation()
                      setCtxMenu({ x: e.clientX, y: e.clientY, dept })
                    }}
                    onMemberCtx={(e, member) => {
                      e.preventDefault(); e.stopPropagation()
                      setCtxMenu({ x: e.clientX, y: e.clientY, dept, member })
                    }}
                    onAddMember={() => { setAddMemberSearch(''); setAddMemberModal({ dept }) }}
                    onToggleHead={(member) => patchMember.mutate({ deptId: dept.id, userId: member.userId, isHead: !member.isHead })}
                    onRemoveMember={(member) => removeMember.mutate({ deptId: dept.id, userId: member.userId })}
                  />

                  {/* Children sub-departments */}
                  {children.length > 0 && (
                    <div data-children={dept.id} style={{ display: 'flex', gap: 16, marginTop: 32, alignItems: 'flex-start', justifyContent: 'center' }}>
                      {children.map(child => {
                        const childHead = child.members.find(m => m.isHead)
                        return (
                          <div
                            key={child.id}
                            data-child-block
                            style={{
                              background: '#fff', border: `1.5px solid #e2e8f0`,
                              borderTop: `3px solid ${color}`,
                              borderRadius: 10, minWidth: 170, maxWidth: 220,
                              boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden',
                            }}
                          >
                            {/* Child head */}
                            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f1f5f9' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{child.name}</div>
                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', marginBottom: 2 }}>
                                Руководитель
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: childHead ? '#2563eb' : '#cbd5e1', fontStyle: childHead ? 'normal' : 'italic' }}>
                                {childHead ? childHead.user.fullName : '— не назначен —'}
                              </div>
                            </div>

                            {/* Child members */}
                            <div style={{ padding: '6px 14px 4px' }}>
                              {child.members.filter(m => !m.isHead).length === 0
                                ? <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic', padding: '4px 0' }}>Сотрудников нет</div>
                                : child.members.filter(m => !m.isHead).map(m => (
                                  <MemberRow
                                    key={m.userId}
                                    member={m}
                                    isAdmin={isAdmin}
                                    onToggleHead={() => patchMember.mutate({ deptId: child.id, userId: m.userId, isHead: !m.isHead })}
                                    onRemove={() => removeMember.mutate({ deptId: child.id, userId: m.userId })}
                                  />
                                ))
                              }
                            </div>

                            {isAdmin && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setAddMemberSearch(''); setAddMemberModal({ dept: child }) }}
                                style={{ display: 'block', width: '100%', background: 'none', border: 'none', borderTop: '1px dashed #e2e8f0', padding: '6px 14px', fontSize: 11, color: '#94a3b8', textAlign: 'left', cursor: 'pointer' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.background = '#f8faff' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                              >
                                + добавить сотрудника
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 4, minWidth: 200,
          }}
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.member ? (
            <>
              <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                {ctxMenu.member.user.fullName}
              </div>
              <CtxItem onClick={() => {
                patchMember.mutate({ deptId: ctxMenu.dept.id, userId: ctxMenu.member!.userId, isHead: !ctxMenu.member!.isHead })
                setCtxMenu(null)
              }}>
                {ctxMenu.member.isHead ? '👤 Снять с руководства' : '⭐ Назначить руководителем'}
              </CtxItem>
              <CtxItem danger onClick={() => {
                removeMember.mutate({ deptId: ctxMenu.dept.id, userId: ctxMenu.member!.userId })
                setCtxMenu(null)
              }}>
                🗑 Удалить из отдела
              </CtxItem>
            </>
          ) : (
            <>
              <CtxItem onClick={() => {
                setAddMemberSearch(''); setAddMemberModal({ dept: ctxMenu.dept }); setCtxMenu(null)
              }}>
                👤 Добавить сотрудника
              </CtxItem>
            </>
          )}
        </div>
      )}

      {/* Add member modal */}
      {addMemberModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAddMemberModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              Добавить сотрудника в «{addMemberModal.dept.name}»
            </h3>
            <input
              autoFocus
              placeholder="Поиск по имени..."
              value={addMemberSearch}
              onChange={e => setAddMemberSearch(e.target.value)}
              style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 11px', fontSize: 14, outline: 'none', marginBottom: 12 }}
              onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px #dbeafe' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = '' }}
            />
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #f1f5f9', borderRadius: 8 }}>
              {filteredUsers.length === 0
                ? <div style={{ padding: '16px 12px', color: '#94a3b8', fontSize: 13 }}>Нет пользователей</div>
                : filteredUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => addMember.mutate({ deptId: addMemberModal.dept.id, userId: u.id })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f8faff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#4f46e5', flexShrink: 0 }}>
                      {u.fullName[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{u.fullName}</div>
                      {u.tabNumber && <div style={{ fontSize: 11, color: '#94a3b8' }}>#{u.tabNumber}</div>}
                    </div>
                  </div>
                ))
              }
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setAddMemberModal(null)} style={btnGhost}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* Sync from staff confirmation */}
      {syncConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSyncConfirm(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Синхронизировать участников</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Для каждого сотрудника из таблицы, у которого есть аккаунт, будет выставлен отдел и статус руководителя (по должности).
              Существующие участники не будут удалены.
            </p>
            {activeStaff.length === 0 ? (
              <div style={{ background: '#fef3c7', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
                Нет данных сотрудников. Обновите импорт персонала.
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
                <span style={{ fontWeight: 600, color: '#166534' }}>Будет обработано: </span>
                <span style={{ color: '#15803d' }}>
                  {activeStaff.length} сотрудников из таблицы, {syncPreview.length} отделов
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSyncConfirm(false)} style={btnGhost}>Отмена</button>
              <button
                onClick={() => syncFromStaff.mutate()}
                disabled={activeStaff.length === 0 || syncFromStaff.isPending}
                style={{ ...btnSync, opacity: (activeStaff.length === 0 || syncFromStaff.isPending) ? 0.5 : 1 }}
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

// ── DeptCard ──────────────────────────────────────────────────────────────────
function DeptCard({
  dept, color, head, isAdmin,
  onCtx, onMemberCtx, onAddMember, onToggleHead, onRemoveMember
}: {
  dept: Department; color: string; head?: DeptMember; isAdmin: boolean
  onCtx: (e: React.MouseEvent) => void
  onMemberCtx: (e: React.MouseEvent, m: DeptMember) => void
  onAddMember: () => void
  onToggleHead: (m: DeptMember) => void
  onRemoveMember: (m: DeptMember) => void
}) {
  const nonHeads = dept.members.filter(m => !m.isHead)

  return (
    <div style={{ minWidth: 200, maxWidth: 260 }}>
      {/* Header */}
      <div
        data-dept={dept.id}
        onContextMenu={onCtx}
        style={{
          background: color, color: '#fff', borderRadius: 10,
          padding: '11px 20px 10px', fontSize: 14, fontWeight: 700,
          cursor: isAdmin ? 'context-menu' : 'default',
          textAlign: 'center', userSelect: 'none',
        }}
      >
        <div>{dept.name}</div>
        {head
          ? <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 4 }}>{head.user.fullName}</div>
          : <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.45, marginTop: 4, fontStyle: 'italic' }}>— руководитель не назначен</div>
        }
      </div>

      {/* Members list */}
      {nonHeads.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '6px 12px 4px' }}>
          {nonHeads.map(m => (
            <MemberRow
              key={m.userId}
              member={m}
              isAdmin={isAdmin}
              onToggleHead={() => onToggleHead(m)}
              onRemove={() => onRemoveMember(m)}
            />
          ))}
        </div>
      )}

      {isAdmin && (
        <button
          onClick={onAddMember}
          style={{ display: 'block', width: '100%', background: 'none', border: '1px dashed #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '6px 12px', fontSize: 11, color: '#94a3b8', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.background = '#f8faff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          + добавить сотрудника
        </button>
      )}
    </div>
  )
}

// ── MemberRow ─────────────────────────────────────────────────────────────────
function MemberRow({ member, isAdmin, onToggleHead, onRemove }: {
  member: DeptMember; isAdmin: boolean
  onToggleHead: () => void; onRemove: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f8fafc', gap: 6 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>{member.user.fullName}</div>
        {member.user.tabNumber && <div style={{ fontSize: 11, color: '#94a3b8' }}>#{member.user.tabNumber}</div>}
      </div>
      {isAdmin && hovered && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={onToggleHead}
            title={member.isHead ? 'Снять с руководства' : 'Назначить руководителем'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', fontSize: 13, padding: '0 2px', transition: '.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#d97706')}
            onMouseLeave={e => (e.currentTarget.style.color = '#f59e0b')}
          >★</button>
          <button
            onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: '0 2px', transition: '.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
          >×</button>
        </div>
      )}
    </div>
  )
}

// ── CtxItem ───────────────────────────────────────────────────────────────────
function CtxItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 12px', fontSize: 13, borderRadius: 5, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        color: danger ? '#dc2626' : '#1e293b',
        background: hovered ? (danger ? '#fef2f2' : '#f1f5f9') : 'transparent',
      }}
    >
      {children}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }
const btnSync: React.CSSProperties  = { background: '#0f766e', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }
const sep: React.CSSProperties      = { width: 1, height: 24, background: '#e2e8f0' }

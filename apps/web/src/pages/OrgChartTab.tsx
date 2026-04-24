import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface StaffRow { tabNumber: string; name: string; position: string; dept: string; subDept: string }

// ── Types ─────────────────────────────────────────────────────────────────────
interface Person  { id: string; name: string; role: string }
interface SubDept { id: string; name: string; leader: string; persons: Person[] }
interface Dept    { id: string; name: string; color: string; leader: string; subs: SubDept[] }

type ModalMode = 'add-dept' | 'edit-dept' | 'add-sub' | 'edit-sub' | 'add-person' | null
interface ModalState { mode: ModalMode; dept?: Dept; sub?: SubDept }

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'tv-shifts-org-chart'
const COLORS = ['#1e40af','#065f46','#7c3aed','#9a3412','#0f766e','#be185d','#b45309','#374151']

const SAMPLE: Dept[] = [
  { id:'d1', name:'Производство', color:'#1e40af', leader:'Смирнов А.В.', subs:[
    { id:'s1', name:'Монтаж', leader:'Иванов И.И.',
      persons:[{ id:'p1', name:'Петрова А.С.', role:'Монтажёр' },{ id:'p2', name:'Сидоров П.В.', role:'Монтажёр' }] },
    { id:'s2', name:'Графика', leader:'Козлова М.Р.',
      persons:[{ id:'p3', name:'Новиков Д.А.', role:'Дизайнер' }] },
  ]},
  { id:'d2', name:'Редакция', color:'#065f46', leader:'', subs:[
    { id:'s3', name:'Сценарный отдел', leader:'Фёдоров К.В.',
      persons:[{ id:'p4', name:'Мишина О.В.', role:'Сценарист' }] },
  ]},
]

function uid() { return '_' + Math.random().toString(36).slice(2) }

function loadData(): Dept[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (!s) return SAMPLE
    const parsed: Dept[] = JSON.parse(s)
    // migrate old records that lack the leader field
    return parsed.map(d => ({ leader: '', ...d }))
  } catch { return SAMPLE }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function OrgChartTab() {
  const [data, setDataRaw] = useState<Dept[]>(loadData)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 60, y: 40 })
  const [modal, setModal] = useState<ModalState>({ mode: null })
  const [formName, setFormName] = useState('')
  const [formSub, setFormSub] = useState('')
  const [formColor, setFormColor] = useState(COLORS[0])
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: { type: 'dept' | 'sub'; dept: Dept; sub?: SubDept } } | null>(null)

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

  const setData = (d: Dept[] | ((prev: Dept[]) => Dept[])) => {
    setDataRaw(prev => {
      const next = typeof d === 'function' ? d(prev) : d
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  // ── Pan / Zoom ──────────────────────────────────────────────────────────────
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

  // Close context menu on click
  useEffect(() => {
    const close = () => setCtxMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ── Draw SVG lines after each render ────────────────────────────────────────
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

      data.forEach(dept => {
        if (dept.subs.length === 0) return
        const dCard = chart.querySelector<HTMLElement>(`[data-dept="${dept.id}"]`)
        const subsRow = chart.querySelector<HTMLElement>(`[data-subs="${dept.id}"]`)
        if (!dCard || !subsRow) return

        const dp = worldPos(dCard)
        const dCx   = dp.x + dCard.offsetWidth / 2
        const dBotY = dp.y + dCard.offsetHeight

        const sp = worldPos(subsRow)
        const subTopY = sp.y
        const midY = dBotY + (subTopY - dBotY) / 2

        const subEls = subsRow.querySelectorAll<HTMLElement>('[data-sub-block]')
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
          el.setAttribute('stroke', dept.color)
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

  // ── Staff import data ───────────────────────────────────────────────────────
  const { data: staffImport } = useQuery<{ rows: StaffRow[] }>({
    queryKey: ['staff-import'],
    queryFn: () => api.get('/users/staff-import').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const staffRows = staffImport?.rows ?? []

  // Only workers (have tab number) for org chart
  const activeStaff = staffRows.filter(r => r.tabNumber)

  const deptNames = [...new Set(activeStaff.map(r => r.dept).filter(Boolean))].sort()

  const subDeptNames = (deptName: string) =>
    [...new Set(activeStaff.filter(r => r.dept === deptName).map(r => r.subDept).filter(Boolean))].sort()

  const autoLeaderDept = (deptName: string) =>
    activeStaff.find(r => r.dept === deptName && r.position.startsWith('Директор'))?.name ?? ''

  const autoLeaderSub = (deptName: string, subName: string) =>
    activeStaff.find(r => r.dept === deptName && r.subDept === subName && r.position.startsWith('Руководитель'))?.name ?? ''

  const autoPersonsSub = (deptName: string, subName: string): Person[] =>
    activeStaff
      .filter(r => r.dept === deptName && r.subDept === subName && !r.position.startsWith('Руководитель') && !r.position.startsWith('Директор'))
      .map(r => ({ id: uid(), name: r.name, role: r.position }))

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

  // ── Modal helpers ───────────────────────────────────────────────────────────
  const openModal = (mode: ModalMode, dept?: Dept, sub?: SubDept) => {
    setModal({ mode, dept, sub })
    if (mode === 'edit-dept' && dept) { setFormName(dept.name); setFormColor(dept.color); setFormSub(dept.leader ?? '') }
    else if (mode === 'edit-sub' && sub) { setFormName(sub.name); setFormSub(sub.leader) }
    else { setFormName(''); setFormSub(''); setFormColor(COLORS[0]) }
    setCtxMenu(null)
  }

  const saveModal = () => {
    const name = formName.trim()
    if (!name) return
    const { mode, dept, sub } = modal

    if (mode === 'add-dept') {
      setData(d => [...d, { id: uid(), name, color: formColor, leader: autoLeaderDept(name), subs: [] }])
    } else if (mode === 'edit-dept' && dept) {
      setData(d => d.map(x => x.id === dept.id ? { ...x, name, color: formColor, leader: formSub.trim() } : x))
    } else if (mode === 'add-sub' && dept) {
      const leader  = autoLeaderSub(dept.name, name)
      const persons = autoPersonsSub(dept.name, name)
      setData(d => d.map(x => x.id === dept.id
        ? { ...x, subs: [...x.subs, { id: uid(), name, leader, persons }] }
        : x))
    } else if (mode === 'edit-sub' && dept && sub) {
      setData(d => d.map(x => x.id === dept.id
        ? { ...x, subs: x.subs.map(s => s.id === sub.id ? { ...s, name, leader: formSub.trim() } : s) }
        : x))
    } else if (mode === 'add-person' && dept && sub) {
      setData(d => d.map(x => x.id === dept.id
        ? { ...x, subs: x.subs.map(s => s.id === sub.id
            ? { ...s, persons: [...s.persons, { id: uid(), name, role: formSub.trim() || '—' }] }
            : s) }
        : x))
    }
    setModal({ mode: null })
  }

  const deletePerson = (deptId: string, subId: string, personId: string) => {
    setData(d => d.map(x => x.id === deptId
      ? { ...x, subs: x.subs.map(s => s.id === subId
          ? { ...s, persons: s.persons.filter(p => p.id !== personId) }
          : s) }
      : x))
  }

  const handleCtxAction = (action: string) => {
    if (!ctxMenu) return
    const { type, dept, sub } = ctxMenu.target
    setCtxMenu(null)
    if (action === 'edit') openModal(type === 'dept' ? 'edit-dept' : 'edit-sub', dept, sub)
    else if (action === 'add-sub') openModal('add-sub', dept)
    else if (action === 'add-person') openModal('add-person', dept, sub)
    else if (action === 'delete') {
      if (type === 'dept') setData(d => d.filter(x => x.id !== dept.id))
      else setData(d => d.map(x => x.id === dept.id
        ? { ...x, subs: x.subs.filter(s => s.id !== sub!.id) } : x))
    }
  }

  // ── Modal config ────────────────────────────────────────────────────────────
  const modalCfg: Record<string, { title: string; l1: string; l2?: string; color?: boolean }> = {
    'add-dept':   { title: 'Новый департамент',          l1: 'Название',         l2: 'Руководитель (ФИО)', color: true },
    'edit-dept':  { title: 'Редактировать департамент',  l1: 'Название',         l2: 'Руководитель (ФИО)', color: true },
    'add-sub':    { title: 'Новый отдел',                l1: 'Название отдела',  l2: 'Руководитель (ФИО)' },
    'edit-sub':   { title: 'Редактировать отдел',        l1: 'Название отдела',  l2: 'Руководитель (ФИО)' },
    'add-person': { title: 'Новый сотрудник',            l1: 'ФИО',              l2: 'Должность' },
  }
  const cfg = modal.mode ? modalCfg[modal.mode] : null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', marginTop: 16 }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => openModal('add-dept')} style={btnPrimary}>+ Департамент</button>
        <div style={sep} />
        <button onClick={() => doZoom(0.15)}  style={btnGhost}>＋</button>
        <span style={{ fontSize: 12, color: '#64748b', minWidth: 40, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={() => doZoom(-0.15)} style={btnGhost}>－</button>
        <button onClick={() => { setScale(1); setOffset({ x: 60, y: 40 }) }} style={btnGhost}>⊡</button>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
          Колесо — зум · Тащи фон — пан · 2×клик на департаменте — редактировать
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
            {data.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 14, padding: '40px 0' }}>
                Нажми «+ Департамент» чтобы начать
              </div>
            )}
            {data.map(dept => (
              <div key={dept.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                {/* Dept card */}
                <div
                  data-dept={dept.id}
                  onDoubleClick={e => { e.stopPropagation(); openModal('edit-dept', dept) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, target: { type: 'dept', dept } }) }}
                  style={{
                    background: dept.color, color: '#fff', borderRadius: 10,
                    padding: '11px 20px 10px', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', minWidth: 180, textAlign: 'center',
                    transition: 'box-shadow .15s, transform .1s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,.2)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = '' }}
                >
                  <div>{dept.name}</div>
                  {dept.leader
                    ? <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 4 }}>{dept.leader}</div>
                    : <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.45, marginTop: 4, fontStyle: 'italic' }}>— руководитель не назначен</div>
                  }
                </div>

                {/* Sub-departments */}
                {dept.subs.length > 0 && (
                  <div data-subs={dept.id} style={{ display: 'flex', gap: 16, marginTop: 32, alignItems: 'flex-start', justifyContent: 'center' }}>
                    {dept.subs.map(sub => (
                      <div
                        key={sub.id}
                        data-sub-block
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, target: { type: 'sub', dept, sub } }) }}
                        style={{
                          background: '#fff', border: `1.5px solid #e2e8f0`,
                          borderTop: `3px solid ${dept.color}`,
                          borderRadius: 10, minWidth: 170, maxWidth: 210,
                          boxShadow: '0 2px 8px rgba(0,0,0,.06)',
                          overflow: 'hidden', cursor: 'context-menu',
                        }}
                      >
                        {/* Head */}
                        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{sub.name}</div>
                          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', marginBottom: 2 }}>
                            Руководитель
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: sub.leader ? '#2563eb' : '#cbd5e1', fontStyle: sub.leader ? 'normal' : 'italic' }}>
                            {sub.leader || '— не назначен —'}
                          </div>
                        </div>

                        {/* People */}
                        <div style={{ padding: '6px 14px 4px' }}>
                          {sub.persons.length === 0
                            ? <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic', padding: '4px 0' }}>Сотрудников нет</div>
                            : sub.persons.map(p => (
                              <PersonRow
                                key={p.id}
                                person={p}
                                onDelete={() => deletePerson(dept.id, sub.id, p.id)}
                              />
                            ))
                          }
                        </div>

                        {/* Add person */}
                        <button
                          onClick={e => { e.stopPropagation(); openModal('add-person', dept, sub) }}
                          style={{ display: 'block', width: '100%', background: 'none', border: 'none', borderTop: '1px dashed #e2e8f0', padding: '6px 14px', fontSize: 11, color: '#94a3b8', textAlign: 'left', cursor: 'pointer' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.background = '#f8faff' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                        >
                          + добавить сотрудника
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add sub button */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: dept.subs.length > 0 ? 12 : 32 }}>
                  <button
                    onClick={() => openModal('add-sub', dept)}
                    style={{ background: 'none', border: '1.5px dashed #cbd5e1', color: '#94a3b8', borderRadius: 8, padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e1'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    + Отдел
                  </button>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 4, minWidth: 180,
          }}
          onClick={e => e.stopPropagation()}
        >
          <CtxItem onClick={() => handleCtxAction('edit')}>✏️ Редактировать</CtxItem>
          {ctxMenu.target.type === 'dept' && <CtxItem onClick={() => handleCtxAction('add-sub')}>📁 Добавить отдел</CtxItem>}
          {ctxMenu.target.type === 'sub'  && <CtxItem onClick={() => handleCtxAction('add-person')}>👤 Добавить сотрудника</CtxItem>}
          <CtxItem onClick={() => handleCtxAction('delete')} danger>🗑 Удалить</CtxItem>
        </div>
      )}

      {/* Modal */}
      {modal.mode && cfg && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal({ mode: null })}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') setModal({ mode: null }) }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{cfg.title}</h3>

            {/* add-dept: select from staff data */}
            {modal.mode === 'add-dept' && (() => {
              const preview = formName ? { leader: autoLeaderDept(formName) } : null
              return (
                <>
                  <div style={labelStyle}>Цвет</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {COLORS.map(c => (
                      <div key={c} onClick={() => setFormColor(c)}
                        style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: `2px solid ${c === formColor ? '#0f172a' : 'transparent'}`, transform: c === formColor ? 'scale(1.15)' : undefined, transition: '.15s' }} />
                    ))}
                  </div>
                  <div style={labelStyle}>Департамент</div>
                  <select
                    autoFocus
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 11px', fontSize: 14, marginBottom: 14, outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">— выберите —</option>
                    {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {preview && (
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Директор (авто)</div>
                      <div style={{ fontWeight: 600, color: preview.leader ? '#1e293b' : '#cbd5e1', fontStyle: preview.leader ? 'normal' : 'italic' }}>
                        {preview.leader || '— не найден в таблице'}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* add-sub: select subdept from staff data */}
            {modal.mode === 'add-sub' && (() => {
              const parentDept = modal.dept!
              const options = subDeptNames(parentDept.name)
              const leader  = formName ? autoLeaderSub(parentDept.name, formName) : ''
              const persons = formName ? autoPersonsSub(parentDept.name, formName) : []
              return (
                <>
                  <div style={labelStyle}>Отдел</div>
                  <select
                    autoFocus
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 11px', fontSize: 14, marginBottom: 14, outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">— выберите —</option>
                    {options.length === 0
                      ? <option disabled value="">Нет данных (обновите импорт)</option>
                      : options.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {formName && (
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Руководитель (авто)</div>
                      <div style={{ fontWeight: 600, color: leader ? '#1e293b' : '#cbd5e1', fontStyle: leader ? 'normal' : 'italic', marginBottom: 8 }}>
                        {leader || '— не найден в таблице'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Сотрудники (работают)</div>
                      <div style={{ color: persons.length ? '#1e293b' : '#cbd5e1', fontStyle: persons.length ? 'normal' : 'italic' }}>
                        {persons.length ? `${persons.length} чел.: ${persons.slice(0,3).map(p=>p.name).join(', ')}${persons.length > 3 ? '...' : ''}` : '— нет сотрудников'}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* edit-dept, edit-sub, add-person: manual inputs */}
            {(modal.mode === 'edit-dept' || modal.mode === 'edit-sub' || modal.mode === 'add-person') && (
              <>
                {cfg.color && (
                  <>
                    <div style={labelStyle}>Цвет</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                      {COLORS.map(c => (
                        <div key={c} onClick={() => setFormColor(c)}
                          style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: `2px solid ${c === formColor ? '#0f172a' : 'transparent'}`, transform: c === formColor ? 'scale(1.15)' : undefined, transition: '.15s' }} />
                      ))}
                    </div>
                  </>
                )}
                <ModalField label={cfg.l1} value={formName} onChange={setFormName} autoFocus />
                {cfg.l2 && <ModalField label={cfg.l2} value={formSub} onChange={setFormSub} />}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setModal({ mode: null })} style={btnGhost}>Отмена</button>
              <button onClick={saveModal} style={btnPrimary}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PersonRow({ person, onDelete }: { person: { name: string; role: string }; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f8fafc', gap: 6 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>{person.name}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{person.role}</div>
      </div>
      <button
        onClick={onDelete}
        style={{ opacity: hovered ? 1 : 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: '0 2px', transition: '.15s', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
        onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
      >×</button>
    </div>
  )
}

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

function ModalField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{label}</div>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 11px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px #dbeafe' }}
        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = '' }}
      />
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }
const btnGhost: React.CSSProperties  = { background: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }
const sep: React.CSSProperties       = { width: 1, height: 24, background: '#e2e8f0' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }

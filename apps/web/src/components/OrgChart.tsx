import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { DEPT_COLORS } from './orgchart/constants'
import { CtxMenu, DeptTree } from './orgchart/DeptTree'
import {
  AddDeptModal, AddDivModal, AddMemberModal, EditDeptModal, EditDivModal, EditMemberModal, OrgProfileModal,
} from './orgchart/modals'
import type { Department, ModalState, OrgUser } from './orgchart/types'
import { ZBtn } from './orgchart/ui'

export { SheetsStructureTab } from './orgchart/SheetsStructureTab'

// ─── Main Component ───────────────────────────────────────────────────────────

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
            style={{ pointerEvents:'all',padding:'10px 24px',background:'#1e40af',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontFamily:'Inter,sans-serif',cursor:'pointer',display:'flex',alignItems:'center',gap:8,opacity:migrating?0.6:1 }}
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
      <div style={{ position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',fontSize:12,color:'var(--text-muted)',display:'flex',gap:12,pointerEvents:'none' }}>
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
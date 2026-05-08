import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TaskDetailPanel } from './TaskDetailPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

type WfStatus = 'draft' | 'active' | 'done' | 'cancelled' | 'rejected'

type WfStage = WfStatus

interface StatusRow {
  id: string
  name: string
  client: string | null
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  date: string | null
  dateApproximate: string | null
  format: string | null
  location: string | null
  status: WfStatus
  source: string
  matrixRegistryId: string | null
  matrixRegistry: { id: string; name: string | null; matrixId: string } | null
}

interface KfpdData { columns: string[]; rows: string[][] }

// ── Stage / status mapping ────────────────────────────────────────────────────

const STAGE_STATUSES: Record<WfStage, WfStatus[]> = {
  draft:     ['draft'],
  active:    ['active'],
  done:      ['done'],
  rejected:  ['rejected'],
  cancelled: ['cancelled'],
}

const STATUS_LABELS: Record<WfStatus, string> = {
  draft: 'Заявка', active: 'Реализация', done: 'Сдан',
  rejected: 'Не согласован', cancelled: 'Отменён',
}

const STAGE_LABELS: Record<WfStage, string> = {
  draft: 'Заявка', active: 'Реализация', done: 'Сдан',
  rejected: 'Не согласован', cancelled: 'Отменён',
}

const STAGE_ORDER: WfStage[] = ['draft', 'active', 'done']
const EXIT_STAGES: WfStage[] = ['rejected', 'cancelled']

function statusToStage(s: WfStatus): WfStage {
  return s
}

function canMove(from: WfStage, to: WfStage): 'allowed' | 'exit' | 'blocked' | 'same' {
  if (from === to) return 'same'
  if (EXIT_STAGES.includes(to)) return 'exit'
  const fi = STAGE_ORDER.indexOf(from)
  const ti = STAGE_ORDER.indexOf(to)
  if (fi === -1 || ti === -1) return 'blocked'
  return ti === fi + 1 ? 'allowed' : 'blocked'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FORMATS   = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
const LOCATIONS = ['Знаменка крыша', 'Знаменка чёрная', 'Знаменка камин', 'Романов', 'Выезд']

// ── Smart date ────────────────────────────────────────────────────────────────

function smartDate(raw: string | null): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<WfStage, { bg: string; color: string; border: string; activeBg: string }> = {
  draft:     { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', activeBg: '#2563eb' },
  active:    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', activeBg: '#16a34a' },
  done:      { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe', activeBg: '#7c3aed' },
  rejected:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', activeBg: '#dc2626' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', activeBg: '#64748b' },
}

const STATUS_BADGE: Record<WfStatus, React.CSSProperties> = {
  draft:     { background: '#dbeafe', color: '#1d4ed8' },
  active:    { background: '#dcfce7', color: '#15803d' },
  done:      { background: '#f5f3ff', color: '#6d28d9' },
  rejected:  { background: '#fee2e2', color: '#b91c1c' },
  cancelled: { background: '#f1f5f9', color: '#64748b' },
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkflowPage() {
  const qc = useQueryClient()
  const [activeStage, setActiveStage] = useState<WfStage>('draft')
  const [showGSheets, setShowGSheets] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ rowId: string; targetStage: WfStage; label: string } | null>(null)
  const [connectModal, setConnectModal] = useState<{ rowId: string } | null>(null)
  const [createProjectModal, setCreateProjectModal] = useState<{ rowId: string; client: string | null } | null>(null)
  const [detailRowId, setDetailRowId] = useState<string | null>(null)
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: allRows = [], isLoading } = useQuery<StatusRow[]>({
    queryKey: ['workflow-rows'],
    queryFn: () => api.get('/work-items', { params: { source: 'manual', topLevelOnly: 'true' } }).then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: gsRows = [], isLoading: gsLoading } = useQuery<StatusRow[]>({
    queryKey: ['workflow-gs-rows'],
    queryFn: () => api.get('/work-items', { params: { source: 'sync', slim: 'true' } }).then((r) => r.data),
    staleTime: 60_000,
    enabled: showGSheets,
  })

  const { data: kfpdRaw } = useQuery<KfpdData>({
    queryKey: ['kfpd-preview'],
    queryFn: () => api.get('/database/preview/kfpd').then((r) => r.data),
    staleTime: 300_000,
  })

  const kfpdCol = (i: number) => kfpdRaw
    ? [...new Set(kfpdRaw.rows.map((r) => r[i] ?? '').filter(Boolean))]
    : []

  const clients   = kfpdCol(0)
  const producers = kfpdCol(2)

  // ── Mutations ──────────────────────────────────────────────────────────────

  const patchStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WfStatus }) =>
      api.patch(`/work-items/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rows'] }),
  })

  const createRow = useMutation({
    mutationFn: () => api.post('/work-items', { name: 'Новая задача', status: 'draft', source: 'manual' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rows'] }),
  })

  const patchField = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: unknown }) =>
      api.patch(`/work-items/${id}`, { [field]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rows'] }),
  })

  // ── Computed ───────────────────────────────────────────────────────────────

  const stageRows = allRows.filter((r) => statusToStage(r.status) === activeStage)

  function countForStage(stage: WfStage) {
    return allRows.filter((r) => statusToStage(r.status) === stage).length
  }

  // Dept keys for visible rows — batch fetch when stage rows change
  const stageRowIds = stageRows.map((r) => r.id).join(',')
  const { data: rowDepts = {} } = useQuery<Record<string, string[]>>({
    queryKey: ['workflow-children', stageRowIds],
    queryFn: () => api.get('/work-items/children-summary', { params: { parentIds: stageRowIds } }).then((r) => r.data),
    enabled: stageRows.length > 0,
    staleTime: 30_000,
  })

  // ── Drag state ─────────────────────────────────────────────────────────────

  const dragging = useRef<{ rowId: string; fromStage: WfStage } | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const stageRefs = useRef<Map<WfStage, HTMLElement>>(new Map())
  // Keep a ref to activeStage so onUp closure can restore correct styles
  const activeStageRef = useRef(activeStage)
  useEffect(() => { activeStageRef.current = activeStage }, [activeStage])

  const handleDragStart = useCallback((e: React.MouseEvent, row: StatusRow) => {
    e.preventDefault()
    const fromStage = statusToStage(row.status)
    dragging.current = { rowId: row.id, fromStage }
    setDraggingRowId(row.id)

    if (ghostRef.current) {
      ghostRef.current.textContent = `${row.client || '—'} · ${row.name}`
      ghostRef.current.style.opacity = '1'
      ghostRef.current.style.left = e.clientX + 14 + 'px'
      ghostRef.current.style.top = e.clientY - 18 + 'px'
    }

    const onMove = (ev: MouseEvent) => {
      if (!ghostRef.current) return
      ghostRef.current.style.left = ev.clientX + 14 + 'px'
      ghostRef.current.style.top = ev.clientY - 18 + 'px'
      stageRefs.current.forEach((el) => {
        const r = el.getBoundingClientRect()
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
        el.dataset.dragover = isOver ? '1' : '0'
        if (isOver) {
          el.style.background = '#fef3c7'
          el.style.borderColor = '#f59e0b'
          el.style.color = '#92400e'
          el.style.transform = 'scale(1.04)'
        } else {
          el.style.background = ''
          el.style.borderColor = ''
          el.style.color = ''
          el.style.transform = ''
        }
      })
    }

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (ghostRef.current) ghostRef.current.style.opacity = '0'
      setDraggingRowId(null)

      let targetStage: WfStage | null = null
      stageRefs.current.forEach((el, stage) => {
        el.dataset.dragover = '0'
        el.style.transform = ''
        // Restore React-managed colors (clearing to '' leaves element unstyled until next render)
        const c = STAGE_COLORS[stage]
        const isStageActive = stage === activeStageRef.current
        el.style.background = isStageActive ? c.activeBg : c.bg
        el.style.borderColor = isStageActive ? c.activeBg : c.border
        el.style.color = isStageActive ? '#fff' : c.color
        const r = el.getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          targetStage = stage
        }
      })

      if (!targetStage || !dragging.current) return
      const { rowId, fromStage } = dragging.current
      dragging.current = null
      const permission = canMove(fromStage, targetStage)

      if (permission === 'blocked') { showBlocked(fromStage, targetStage); return }
      if (permission === 'exit') { setConfirmModal({ rowId, targetStage, label: STAGE_LABELS[targetStage] }); return }

      const row = allRows.find((r) => r.id === rowId)
      if (fromStage === 'draft' && targetStage === 'active') {
        const hasDepts = (rowDepts[rowId] ?? []).length > 0
        if (!row?.matrixRegistryId || !row?.client || !hasDepts) {
          setConnectModal({ rowId })
          return
        }
      }
      doMove(rowId, targetStage)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [allRows, rowDepts])

  function doMove(rowId: string, targetStage: WfStage) {
    patchStatus.mutate({ id: rowId, status: STAGE_STATUSES[targetStage][0] })
  }

  function showBlocked(from: WfStage, to: WfStage) {
    const tip = document.createElement('div')
    Object.assign(tip.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      background: '#1e293b', color: '#fff', padding: '14px 22px', borderRadius: '10px',
      fontSize: '13px', zIndex: '9999', pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0,0,0,.3)', textAlign: 'center',
    })
    tip.innerHTML = `<b>Нельзя</b> перенести из «${STAGE_LABELS[from]}» в «${STAGE_LABELS[to]}»<br><span style="font-size:12px;color:#94a3b8">Этапы проходятся по порядку</span>`
    document.body.appendChild(tip)
    setTimeout(() => tip.remove(), 2000)
  }

  function showError(message: string) {
    const tip = document.createElement('div')
    Object.assign(tip.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      background: '#1e293b', color: '#fff', padding: '14px 22px', borderRadius: '10px',
      fontSize: '13px', zIndex: '9999', pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0,0,0,.3)', textAlign: 'center',
    })
    tip.innerHTML = `<b>Невозможно перевести в Производство</b><br><span style="font-size:12px;color:#fca5a5">${message}</span>`
    document.body.appendChild(tip)
    setTimeout(() => tip.remove(), 2500)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)', gap: 14 }}>
      {/* Ghost */}
      <div ref={ghostRef} style={{
        position: 'fixed', pointerEvents: 'none', zIndex: 9999, opacity: 0,
        background: '#fff', border: '2px solid #3b82f6', borderRadius: 8,
        padding: '10px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        fontSize: 13, maxWidth: 300, transition: 'opacity .08s',
      }} />

      {/* ── Pipeline bar ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {STAGE_ORDER.map((stage, i) => {
            const c = STAGE_COLORS[stage]
            const isActive = activeStage === stage
            return (
              <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  ref={(el) => { if (el) stageRefs.current.set(stage, el) }}
                  data-dragover="0"
                  onClick={() => setActiveStage(stage)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${isActive ? c.activeBg : c.border}`,
                    background: isActive ? c.activeBg : c.bg,
                    color: isActive ? '#fff' : c.color,
                    fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                    transition: 'all .15s',
                  }}
                >
                  <span>{STAGE_LABELS[stage]}</span>
                  <span style={{
                    background: isActive ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.08)',
                    borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                  }}>
                    {countForStage(stage)}
                  </span>
                </div>
                {i < STAGE_ORDER.length - 1 && (
                  <span style={{ color: '#cbd5e1', fontSize: 20, padding: '0 10px' }}>→</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Exit stages */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'center' }}>
          {EXIT_STAGES.map((stage) => {
            const c = STAGE_COLORS[stage]
            const isActive = activeStage === stage
            return (
              <div
                key={stage}
                ref={(el) => { if (el) stageRefs.current.set(stage, el) }}
                data-dragover="0"
                onClick={() => setActiveStage(stage)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 16px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${isActive ? c.activeBg : c.border}`,
                  background: isActive ? c.activeBg : c.bg,
                  color: isActive ? '#fff' : c.color,
                  fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
                  transition: 'all .15s',
                }}
              >
                {stage === 'rejected' ? '✕' : '○'} {STAGE_LABELS[stage]}
                <span style={{
                  background: isActive ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.08)',
                  borderRadius: 20, padding: '1px 6px', fontSize: 11, fontWeight: 700,
                }}>
                  {countForStage(stage)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{STAGE_LABELS[activeStage]}</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{stageRows.length} записей</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: activeStage === 'draft' ? 1000 : 1100 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={th}></th>
                <th style={th}>Статус</th>
                <th style={th}>Клиент</th>
                <th style={th}>Задача</th>
                <th style={th}>Исп. продюсер</th>
                <th style={th}>Лин. продюсер</th>
                <th style={th}>Аккаунт менеджер</th>
                <th style={th}>Дата</th>
                <th style={th}>Формат</th>
                <th style={th}>Локация</th>
                {activeStage !== 'draft' && <th style={th}>Проект</th>}
                <th style={th}>Отделы</th>
                <th style={{ ...th, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {stageRows.length === 0 && (
                <tr>
                  <td colSpan={activeStage === 'draft' ? 12 : 13} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    {activeStage === 'draft' ? 'Нажмите «+» ниже, чтобы добавить задачу.' : 'Нет задач в этом этапе.'}
                  </td>
                </tr>
              )}
              {stageRows.map((row) => (
                <WorkflowRow
                  key={row.id}
                  row={row}
                  onDragStart={handleDragStart}
                  onPatch={(field, value) => patchField.mutate({ id: row.id, field, value })}
                  activeStage={activeStage}
                  isDragging={draggingRowId === row.id}
                  deptKeys={rowDepts[row.id] ?? []}
                  onConnectProject={() => setConnectModal({ rowId: row.id })}
                  onInfo={() => setDetailRowId(row.id)}
                  onOpenDepts={() => setDetailRowId(row.id)}
                  clients={clients}
                  producers={producers}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* Add row inline button — only in request stage */}
        {activeStage === 'draft' && !isLoading && (
          <button
            onClick={() => createRow.mutate()}
            disabled={createRow.isPending}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 16px', border: 'none', background: 'transparent',
              color: '#94a3b8', fontSize: 13, cursor: createRow.isPending ? 'default' : 'pointer',
              borderTop: '1px dashed #e2e8f0', transition: 'all .12s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.background = '#f0f9ff' }}
            onMouseOut={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, fontWeight: 300 }}>+</span>
            <span>{createRow.isPending ? 'Создание...' : 'Новая задача'}</span>
          </button>
        )}
      </div>

      {/* ── Google Sheets tasks collapsible ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, flexShrink: 0 }}>
        <div
          onClick={() => setShowGSheets((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 13, transform: showGSheets ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▶</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Задачи из Google Таблиц</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>синхронизированные, только просмотр</span>
        </div>
        {showGSheets && (
          <div style={{ borderTop: '1px solid #e2e8f0', overflow: 'auto', maxHeight: 280 }}>
            {gsLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
            ) : gsRows.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Нет данных. Запустите синхронизацию.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Статус', 'Клиент', 'Задача', 'Продюсер', 'Дата', 'Формат', 'Локация'].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gsRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={td}><span style={{ ...STATUS_BADGE[row.status], ...badgeStyle }}>{STATUS_LABELS[row.status]}</span></td>
                      <td style={{ ...td, color: '#64748b' }}>{row.client || '—'}</td>
                      <td style={td}>{row.name}</td>
                      <td style={{ ...td, color: '#64748b' }}>{row.execProducer || '—'}</td>
                      <td style={{ ...td, color: '#64748b' }}>{smartDate(row.date) || row.dateApproximate || '—'}</td>
                      <td style={{ ...td, color: '#64748b' }}>{row.format || '—'}</td>
                      <td style={{ ...td, color: '#64748b' }}>{row.location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm exit modal ── */}
      {confirmModal && (
        <Modal onClose={() => setConfirmModal(null)}>
          <h3 style={mh3}>{confirmModal.label === 'Не согласован' ? '✕ Не согласован' : '○ Отменён'}</h3>
          <p style={mp}>Вы точно хотите перенести задачу в «{confirmModal.label}»?<br />Это действие можно будет отменить вручную.</p>
          <div style={mactions}>
            <button style={btnSecondary} onClick={() => setConfirmModal(null)}>Нет, оставить</button>
            <button
              style={{ ...btnPrimary, background: '#dc2626' }}
              onClick={() => { doMove(confirmModal.rowId, confirmModal.targetStage); setConfirmModal(null) }}
            >
              Да, перенести
            </button>
          </div>
        </Modal>
      )}

      {/* ── Connect project modal ── */}
      {connectModal && (
        <ConnectProjectModal
          rowId={connectModal.rowId}
          onClose={() => setConnectModal(null)}
          onProceed={() => { doMove(connectModal.rowId, 'active'); setConnectModal(null) }}
          onCreateProject={(client) => { setConnectModal(null); setCreateProjectModal({ rowId: connectModal.rowId, client }) }}
        />
      )}

      {/* ── Create project modal ── */}
      {createProjectModal && (
        <CreateProjectModal
          rowId={createProjectModal.rowId}
          client={createProjectModal.client}
          clients={clients}
          producers={producers}
          onClose={() => setCreateProjectModal(null)}
          onCreated={(rowId) => { setCreateProjectModal(null); doMove(rowId, 'active') }}
        />
      )}

      {/* ── Task detail modal ── */}
      {detailRowId && (
        <TaskDetailPanel
          rowId={detailRowId}
          onClose={() => setDetailRowId(null)}
        />
      )}
    </div>
  )
}

// ── WorkflowRow ───────────────────────────────────────────────────────────────

function WorkflowRow({
  row, onDragStart, onPatch, activeStage, isDragging, deptKeys, onConnectProject, onInfo, onOpenDepts, clients, producers,
}: {
  row: StatusRow
  onDragStart: (e: React.MouseEvent, row: StatusRow) => void
  onPatch: (field: string, value: unknown) => void
  activeStage: WfStage
  isDragging: boolean
  deptKeys: string[]
  onConnectProject: () => void
  onInfo: () => void
  onOpenDepts: () => void
  clients: string[]
  producers: string[]
}) {
  const statuses = STAGE_STATUSES[activeStage] ?? []
  const projectName = row.matrixRegistry?.name || (row.matrixRegistryId ? '✓ Подключён' : null)

  return (
    <tr
      style={{
        borderBottom: '1px solid #f1f5f9',
        opacity: isDragging ? 0.35 : 1,
        background: isDragging ? '#fef9c3' : undefined,
        boxShadow: isDragging ? 'inset 0 0 0 2px #f59e0b' : undefined,
        transition: 'opacity .12s',
        pointerEvents: isDragging ? 'none' : undefined,
      }}
      onMouseOver={(e) => { if (!isDragging) e.currentTarget.style.background = '#fafbff' }}
      onMouseOut={(e) => { if (!isDragging) e.currentTarget.style.background = '' }}
    >
      {/* Drag handle */}
      <td style={{ ...td, width: 28, paddingRight: 0 }}>
        <span
          onMouseDown={(e) => onDragStart(e, row)}
          style={{ cursor: 'grab', color: '#cbd5e1', fontSize: 15, padding: '3px 4px', borderRadius: 4, display: 'inline-block' }}
          title="Перетащить в другой этап"
        >⠿</span>
      </td>

      {/* Status */}
      <td style={td}>
        {statuses.length > 1 ? (
          <select
            value={row.status}
            onChange={(e) => onPatch('status', e.target.value)}
            style={cellSelect}
          >
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        ) : (
          <span style={{ ...STATUS_BADGE[row.status], ...badgeStyle }}>{STATUS_LABELS[row.status]}</span>
        )}
      </td>

      {/* Client */}
      <td style={{ ...td, minWidth: 120 }}>
        {clients.length > 0 ? (
          <select
            value={row.client ?? ''}
            onChange={(e) => onPatch('client', e.target.value || null)}
            style={cellSelect}
          >
            <option value="">—</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.client ?? ''}
            onBlur={(e) => { if (e.target.value !== (row.client ?? '')) onPatch('client', e.target.value || null) }}
            placeholder="Клиент"
            style={cellInput}
          />
        )}
      </td>

      {/* Name */}
      <td style={{ ...td, minWidth: 180 }}>
        <input
          defaultValue={row.name}
          onBlur={(e) => { if (e.target.value !== row.name) onPatch('name', e.target.value) }}
          placeholder="Название задачи"
          style={cellInput}
        />
      </td>

      {/* Exec producer */}
      <td style={{ ...td, minWidth: 130 }}>
        {producers.length > 0 ? (
          <select value={row.execProducer ?? ''} onChange={(e) => onPatch('execProducer', e.target.value || null)} style={cellSelect}>
            <option value="">—</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.execProducer ?? ''}
            onBlur={(e) => { if (e.target.value !== (row.execProducer ?? '')) onPatch('execProducer', e.target.value || null) }}
            placeholder="—" style={cellInput}
          />
        )}
      </td>

      {/* Line producer */}
      <td style={{ ...td, minWidth: 130 }}>
        {producers.length > 0 ? (
          <select value={row.lineProducer ?? ''} onChange={(e) => onPatch('lineProducer', e.target.value || null)} style={cellSelect}>
            <option value="">—</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.lineProducer ?? ''}
            onBlur={(e) => { if (e.target.value !== (row.lineProducer ?? '')) onPatch('lineProducer', e.target.value || null) }}
            placeholder="—" style={cellInput}
          />
        )}
      </td>

      {/* Account manager */}
      <td style={{ ...td, minWidth: 130 }}>
        {producers.length > 0 ? (
          <select value={row.accountManager ?? ''} onChange={(e) => onPatch('accountManager', e.target.value || null)} style={cellSelect}>
            <option value="">—</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.accountManager ?? ''}
            onBlur={(e) => { if (e.target.value !== (row.accountManager ?? '')) onPatch('accountManager', e.target.value || null) }}
            placeholder="—" style={cellInput}
          />
        )}
      </td>

      {/* Date — free text: one date, range, month, etc. */}
      <td style={{ ...td, minWidth: 110 }}>
        <input
          defaultValue={row.dateApproximate ?? (row.date ? smartDate(row.date) : '')}
          onBlur={(e) => {
            if (e.target.value !== (row.dateApproximate ?? ''))
              onPatch('dateApproximate', e.target.value || null)
          }}
          placeholder="дата / период"
          style={cellInput}
        />
      </td>

      {/* Format */}
      <td style={td}>
        <select value={row.format ?? ''} onChange={(e) => onPatch('format', e.target.value || null)} style={cellSelect}>
          <option value="">—</option>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </td>

      {/* Location */}
      <td style={td}>
        <select value={row.location ?? ''} onChange={(e) => onPatch('location', e.target.value || null)} style={cellSelect}>
          <option value="">—</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </td>

      {/* Project — only for non-request stages */}
      {activeStage !== 'draft' && (
        <td style={{ ...td, minWidth: 140 }}>
          {activeStage === 'draft' && !row.matrixRegistryId ? (
            <button
              onClick={onConnectProject}
              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
            >
              ⚠ Подключить
            </button>
          ) : projectName ? (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }} title={projectName}>
              {projectName.length > 18 ? projectName.slice(0, 18) + '…' : projectName}
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
          )}
        </td>
      )}

      {/* Departments cell — shows chips if depts selected, otherwise button */}
      <td style={{ ...td, minWidth: 110 }}>
        {deptKeys.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {deptKeys.slice(0, 3).map((k) => (
              <span
                key={k}
                style={{
                  padding: '2px 7px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                  whiteSpace: 'nowrap',
                }}
              >{k}</span>
            ))}
            {deptKeys.length > 3 && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>+{deptKeys.length - 3}</span>
            )}
            <button
              onClick={onOpenDepts}
              title="Управлять отделами"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#2563eb')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >✎</button>
          </div>
        ) : (
          <button
            onClick={onOpenDepts}
            title="Добавить отделы"
            style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#374151', fontSize: 12, cursor: 'pointer',
              fontWeight: 500, whiteSpace: 'nowrap',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; e.currentTarget.style.color = '#2563eb' }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#374151' }}
          >
            Отделы →
          </button>
        )}
      </td>

      {/* Info button */}
      <td style={{ ...td, width: 36, textAlign: 'center' }}>
        <button
          onClick={onInfo}
          title="Открыть карточку задачи"
          style={{
            background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
            color: '#64748b', cursor: 'pointer', fontSize: 13, padding: '3px 7px',
            lineHeight: 1,
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#2563eb' }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b' }}
        >
          ⓘ
        </button>
      </td>
    </tr>
  )
}

// ── ConnectProjectModal ───────────────────────────────────────────────────────

const DEPT_OPTIONS = ['ТВ', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Радио', 'Не профильный', 'Трансляция', 'Телерадио', 'Съемки']

function ConnectProjectModal({ rowId, onClose, onProceed, onCreateProject }: {
  rowId: string
  onClose: () => void
  onProceed: () => void
  onCreateProject: (client: string | null) => void
}) {
  const qc = useQueryClient()

  const { data: row } = useQuery<StatusRow>({
    queryKey: ['connect-modal-row', rowId],
    queryFn: () => api.get(`/work-items/${rowId}`).then((r) => r.data),
    staleTime: 5_000,
  })

  const { data: depts = [], refetch: refetchDepts } = useQuery<{ id: string; name: string; format: string | null }[]>({
    queryKey: ['connect-modal-depts', rowId],
    queryFn: () => api.get('/work-items', { params: { parentWiId: rowId } }).then((r) => r.data),
    staleTime: 5_000,
  })

  const { data: matrices = [] } = useQuery<{ id: string; name: string | null; matrixId: string; client: string | null }[]>({
    queryKey: ['matrix-registry-list'],
    queryFn: () => api.get('/sync/registry').then((r) => r.data).catch(() => []),
    staleTime: 60_000,
  })

  // ── Client ──
  const [clientDraft, setClientDraft] = useState(row?.client ?? '')
  useEffect(() => { if (row?.client) setClientDraft(row.client) }, [row?.client])

  const saveClient = useMutation({
    mutationFn: () => api.patch(`/work-items/${rowId}`, { client: clientDraft.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connect-modal-row', rowId] }),
  })

  // ── Matrix ──
  const [selectedId, setSelectedId] = useState('')
  const clientMatrices = row?.client
    ? matrices.filter((m) => m.client?.toLowerCase().includes((row.client ?? '').toLowerCase()))
    : matrices

  const linkMatrix = useMutation({
    mutationFn: () => api.patch(`/work-items/${rowId}`, { matrixRegistryId: selectedId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connect-modal-row', rowId] }); qc.invalidateQueries({ queryKey: ['workflow-rows'] }) },
  })

  // ── Depts ──
  const [newDept, setNewDept] = useState('')
  const addDept = useMutation({
    mutationFn: () => api.post('/work-items', { name: newDept, format: newDept, parentWiId: rowId, status: 'draft' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connect-modal-depts', rowId] })
      qc.invalidateQueries({ queryKey: ['workflow-children'] })
      setNewDept('')
      refetchDepts()
    },
  })
  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/work-items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connect-modal-depts', rowId] })
      qc.invalidateQueries({ queryKey: ['workflow-children'] })
    },
  })

  const hasClient = !!(row?.client)
  const hasMatrix = !!(row?.matrixRegistryId)
  const hasDepts = depts.length > 0
  const allDone = hasClient && hasMatrix && hasDepts

  const sectionS: React.CSSProperties = {
    border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 12,
  }
  const sectionTitle = (done: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: done ? '#16a34a' : '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
  })
  const check = (done: boolean) => (
    <span style={{
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
      background: done ? '#16a34a' : '#e2e8f0', color: done ? '#fff' : '#94a3b8',
    }}>{done ? '✓' : '!'}</span>
  )

  return (
    <Modal onClose={onClose}>
      <h3 style={{ ...mh3, marginBottom: 4 }}>Перевод в Реализацию</h3>
      <p style={{ ...mp, marginBottom: 16 }}>Заполните все условия для перевода задачи.</p>

      {/* ── Клиент ── */}
      <div style={sectionS}>
        <div style={sectionTitle(hasClient)}>{check(hasClient)} Клиент</div>
        {hasClient ? (
          <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{row?.client}</div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={clientDraft}
              onChange={(e) => setClientDraft(e.target.value)}
              placeholder="Введите клиента"
              style={{ ...mselect, flex: 1, margin: 0 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && clientDraft.trim()) saveClient.mutate() }}
            />
            <button
              style={{ ...btnPrimary, padding: '7px 14px' }}
              disabled={!clientDraft.trim() || saveClient.isPending}
              onClick={() => saveClient.mutate()}
            >Сохранить</button>
          </div>
        )}
      </div>

      {/* ── Подключение к проекту ── */}
      <div style={sectionS}>
        <div style={sectionTitle(hasMatrix)}>{check(hasMatrix)} Подключение к проекту</div>
        {hasMatrix ? (
          <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>
            {row?.matrixRegistry?.name || '✓ Проект подключён'}
          </div>
        ) : (
          <>
            {clientMatrices.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ ...mselect, flex: 1, margin: 0 }}>
                  <option value="">— выберите проект —</option>
                  {clientMatrices.map((m) => <option key={m.id} value={m.id}>{m.name || m.matrixId}{m.client ? ` (${m.client})` : ''}</option>)}
                </select>
                <button
                  style={{ ...btnPrimary, padding: '7px 14px' }}
                  disabled={!selectedId || linkMatrix.isPending}
                  onClick={() => linkMatrix.mutate()}
                >{linkMatrix.isPending ? '...' : 'Привязать'}</button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#b45309', marginBottom: 8 }}>Проектов в реестре нет.</div>
            )}
            <button
              style={{ ...btnSecondary, fontSize: 12, padding: '5px 12px', borderColor: '#fde68a', color: '#b45309' }}
              onClick={() => onCreateProject(row?.client ?? null)}
            >+ Создать новый проект</button>
          </>
        )}
      </div>

      {/* ── Отделы ── */}
      <div style={sectionS}>
        <div style={sectionTitle(hasDepts)}>{check(hasDepts)} Отделы</div>
        {depts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {depts.map((d) => (
              <span key={d.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px 3px 10px', borderRadius: 16, fontSize: 12,
                background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
              }}>
                {d.format || d.name}
                <button
                  onClick={() => deleteDept.mutate(d.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 14, lineHeight: 1, padding: '0 1px' }}
                >×</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={newDept} onChange={(e) => setNewDept(e.target.value)} style={{ ...mselect, flex: 1, margin: 0 }}>
            <option value="">— добавить отдел —</option>
            {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            style={{ ...btnPrimary, padding: '7px 14px' }}
            disabled={!newDept || addDept.isPending}
            onClick={() => addDept.mutate()}
          >{addDept.isPending ? '...' : 'Добавить'}</button>
        </div>
      </div>

      <div style={mactions}>
        <button style={btnSecondary} onClick={onClose}>Отмена</button>
        <button style={{ ...btnPrimary, opacity: allDone ? 1 : 0.4, cursor: allDone ? 'pointer' : 'not-allowed' }} disabled={!allDone} onClick={onProceed}>
          Перевести в Производство →
        </button>
      </div>
    </Modal>
  )
}

// ── CreateProjectModal ────────────────────────────────────────────────────────

function CreateProjectModal({ rowId, client, clients, producers, onClose, onCreated }: {
  rowId: string; client: string | null
  clients: string[]; producers: string[]
  onClose: () => void; onCreated: (rowId: string) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    projectName: '', client: client ?? '', format: '', date: '',
    producer: '', manager: '', kpLink: '', curator: '', brief: '',
  })
  const [error, setError] = useState('')

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const create = useMutation({
    mutationFn: () => api.post('/internal-matrix', {
      projectName: form.projectName || null,
      client: form.client || null,
      format: form.format || null,
      date: form.date ? new Date(form.date).toISOString() : null,
      producer: form.producer || null,
      manager: form.manager || null,
      kpLink: form.kpLink || null,
      curator: form.curator || null,
      brief: form.brief || null,
      source: 'internal',
    }),
    onSuccess: async (res) => {
      const matrixId = res.data?.id
      if (matrixId) {
        await api.patch(`/work-items/${rowId}`, { matrixRegistryId: matrixId })
        qc.invalidateQueries({ queryKey: ['workflow-rows'] })
        qc.invalidateQueries({ queryKey: ['matrix-registry-list'] })
        qc.invalidateQueries({ queryKey: ['sync-registry'] })
      }
      onCreated(rowId)
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка создания'),
  })

  const fs: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, outline: 'none', color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const ls: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
  }
  const fg = (label: string, key: string, placeholder?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={ls}>{label}</div>
      <input style={fs} value={(form as any)[key]} onChange={set(key)} placeholder={placeholder} />
    </div>
  )
  const fsel = (label: string, key: string, options: string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={ls}>{label}</div>
      <select style={fs} value={(form as any)[key]} onChange={set(key)}>
        <option value="">— не выбрано —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onMouseDown={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Новый проект</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={ls}>Статус</span>
            <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>Запрос</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fsel('Клиент', 'client', clients)}
            {fg('Название проекта', 'projectName', 'Название проекта')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fsel('Формат', 'format', FORMATS)}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={ls}>Дата</div>
              <input type="date" style={fs} value={form.date} onChange={set('date')} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fsel('Продюсер от ММ', 'producer', producers)}
            {fsel('Менеджер по продажам', 'manager', producers)}
          </div>
          {fg('Ссылка на КП', 'kpLink', 'https://')}
          {fg('Куратор от заказчика', 'curator', 'ФИО')}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={ls}>Бриф по проекту</div>
            <textarea style={{ ...fs, resize: 'vertical', minHeight: 60 }} value={form.brief} onChange={set('brief')} placeholder="Краткое описание проекта" />
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: 12 }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnSecondary} onClick={onClose}>Отмена</button>
          <button
            style={{ ...btnPrimary, opacity: create.isPending ? 0.7 : 1 }}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} onMouseDown={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 16px 48px rgba(0,0,0,.2)' }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #e2e8f0',
  whiteSpace: 'nowrap', position: 'sticky', top: 45, zIndex: 5,
}
const td: React.CSSProperties = { padding: '6px 10px', fontSize: 13, verticalAlign: 'middle' }
const badgeStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
  borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
}
const cellInput: React.CSSProperties = {
  border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, borderRadius: 6,
  fontFamily: 'inherit', color: 'inherit', outline: 'none', width: '100%',
  padding: '4px 8px', boxSizing: 'border-box',
}
const cellSelect: React.CSSProperties = {
  border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, borderRadius: 6,
  fontFamily: 'inherit', color: '#1e293b', outline: 'none', width: '100%',
  padding: '4px 6px', cursor: 'pointer',
}
const mh3: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 8 }
const mp: React.CSSProperties  = { fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }
const mactions: React.CSSProperties = { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }
const mselect: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }
const btnPrimary: React.CSSProperties = { padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#2563eb', color: '#fff' }
const btnSecondary: React.CSSProperties = { padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }

import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TaskDetailPanel } from './TaskDetailPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

type WfStatus =
  | 'request' | 'negotiation'
  | 'connecting'
  | 'preproduction' | 'production' | 'postproduction'
  | 'delivered' | 'rejected' | 'cancelled'

type WfStage = 'request' | 'connecting' | 'production' | 'delivered' | 'rejected' | 'cancelled'

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
  request:    ['request', 'negotiation'],
  connecting: ['connecting'],
  production: ['preproduction', 'production', 'postproduction'],
  delivered:  ['delivered'],
  rejected:   ['rejected'],
  cancelled:  ['cancelled'],
}

const STATUS_LABELS: Record<WfStatus, string> = {
  request: 'Запрос', negotiation: 'На согласовании', connecting: 'Подключение к проекту',
  preproduction: 'Pre-production', production: 'Production', postproduction: 'Post-production',
  delivered: 'Сдан', rejected: 'Не согласован', cancelled: 'Отменён',
}

const STAGE_LABELS: Record<WfStage, string> = {
  request: 'Запрос', connecting: 'Подключение к проекту',
  production: 'Производство', delivered: 'Сдан',
  rejected: 'Не согласован', cancelled: 'Отменён',
}

const STAGE_ORDER: WfStage[] = ['request', 'connecting', 'production', 'delivered']
const EXIT_STAGES: WfStage[] = ['rejected', 'cancelled']

function statusToStage(s: WfStatus): WfStage {
  for (const [stage, list] of Object.entries(STAGE_STATUSES)) {
    if ((list as WfStatus[]).includes(s)) return stage as WfStage
  }
  return 'request'
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
const LOCATIONS = ['Знаменка', 'Крыша Чёрный', 'Камин', 'Романов', 'Выезд']

// ── Smart date ────────────────────────────────────────────────────────────────

function smartDate(raw: string | null): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<WfStage, { bg: string; color: string; border: string; activeBg: string }> = {
  request:    { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', activeBg: '#2563eb' },
  connecting: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', activeBg: '#b45309' },
  production: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', activeBg: '#16a34a' },
  delivered:  { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe', activeBg: '#7c3aed' },
  rejected:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', activeBg: '#dc2626' },
  cancelled:  { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', activeBg: '#64748b' },
}

const STATUS_BADGE: Record<WfStatus, React.CSSProperties> = {
  request:       { background: '#dbeafe', color: '#1d4ed8' },
  negotiation:   { background: '#e0f2fe', color: '#0369a1' },
  connecting:    { background: '#fef3c7', color: '#92400e' },
  preproduction: { background: '#fef9c3', color: '#a16207' },
  production:    { background: '#dcfce7', color: '#15803d' },
  postproduction:{ background: '#f0fdf4', color: '#16a34a' },
  delivered:     { background: '#f5f3ff', color: '#6d28d9' },
  rejected:      { background: '#fee2e2', color: '#b91c1c' },
  cancelled:     { background: '#f1f5f9', color: '#64748b' },
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkflowPage() {
  const qc = useQueryClient()
  const [activeStage, setActiveStage] = useState<WfStage>('request')
  const [showGSheets, setShowGSheets] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ rowId: string; targetStage: WfStage; label: string } | null>(null)
  const [connectModal, setConnectModal] = useState<{ rowId: string; client: string | null } | null>(null)
  const [createProjectModal, setCreateProjectModal] = useState<{ rowId: string; client: string | null } | null>(null)
  const [detailRowId, setDetailRowId] = useState<string | null>(null)
  const [detailRowTab, setDetailRowTab] = useState<'info' | 'departments'>('info')
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: allRows = [], isLoading } = useQuery<StatusRow[]>({
    queryKey: ['workflow-rows'],
    queryFn: () => api.get('/status-rows', { params: { source: 'manual' } }).then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: gsRows = [], isLoading: gsLoading } = useQuery<StatusRow[]>({
    queryKey: ['workflow-gs-rows'],
    queryFn: () => api.get('/status-rows', { params: { source: 'projects_table', slim: 'true' } }).then((r) => r.data),
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
      api.patch(`/status-rows/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rows'] }),
  })

  const createRow = useMutation({
    mutationFn: () => api.post('/status-rows', { name: 'Новая задача', status: 'request', source: 'manual' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rows'] }),
  })

  const patchField = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: unknown }) =>
      api.patch(`/status-rows/${id}`, { [field]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rows'] }),
  })

  // ── Computed ───────────────────────────────────────────────────────────────

  const stageRows = allRows.filter((r) => statusToStage(r.status) === activeStage)

  function countForStage(stage: WfStage) {
    return allRows.filter((r) => statusToStage(r.status) === stage).length
  }

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
      if (fromStage === 'connecting' && targetStage === 'production' && !row?.matrixRegistryId) {
        setConnectModal({ rowId, client: row?.client ?? null })
        return
      }
      doMove(rowId, targetStage)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [allRows])

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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: activeStage === 'request' ? 1000 : 1100 }}>
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
                {activeStage !== 'request' && <th style={th}>Проект</th>}
                <th style={th}>Отделы</th>
                <th style={{ ...th, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {stageRows.length === 0 && (
                <tr>
                  <td colSpan={activeStage === 'request' ? 12 : 13} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    {activeStage === 'request' ? 'Нажмите «+» ниже, чтобы добавить задачу.' : 'Нет задач в этом этапе.'}
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
                  onConnectProject={() => setConnectModal({ rowId: row.id, client: row.client })}
                  onInfo={() => { setDetailRowId(row.id); setDetailRowTab('info') }}
                  onOpenDepts={() => { setDetailRowId(row.id); setDetailRowTab('departments') }}
                  clients={clients}
                  producers={producers}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* Add row inline button — only in request stage */}
        {activeStage === 'request' && !isLoading && (
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
          client={connectModal.client}
          onClose={() => setConnectModal(null)}
          onConnected={() => setConnectModal(null)}
          onCreateProject={() => { setConnectModal(null); setCreateProjectModal({ rowId: connectModal.rowId, client: connectModal.client }) }}
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
          onCreated={(rowId) => { setCreateProjectModal(null); doMove(rowId, 'production') }}
        />
      )}

      {/* ── Task detail modal ── */}
      {detailRowId && (
        <TaskDetailPanel
          rowId={detailRowId}
          onClose={() => setDetailRowId(null)}
          defaultTab={detailRowTab}
        />
      )}
    </div>
  )
}

// ── WorkflowRow ───────────────────────────────────────────────────────────────

function WorkflowRow({
  row, onDragStart, onPatch, activeStage, isDragging, onConnectProject, onInfo, onOpenDepts, clients, producers,
}: {
  row: StatusRow
  onDragStart: (e: React.MouseEvent, row: StatusRow) => void
  onPatch: (field: string, value: unknown) => void
  activeStage: WfStage
  isDragging: boolean
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
      {activeStage !== 'request' && (
        <td style={{ ...td, minWidth: 140 }}>
          {activeStage === 'connecting' && !row.matrixRegistryId ? (
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

      {/* Departments button */}
      <td style={{ ...td, minWidth: 90 }}>
        <button
          onClick={onOpenDepts}
          title="Отделы по задаче"
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

function ConnectProjectModal({ rowId, client, onClose, onConnected, onCreateProject }: {
  rowId: string; client: string | null
  onClose: () => void; onConnected: () => void; onCreateProject: () => void
}) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const { data: matrices = [] } = useQuery<{ id: string; name: string | null; matrixId: string; client: string | null }[]>({
    queryKey: ['matrix-registry-list'],
    queryFn: () => api.get('/sync/registry').then((r) => r.data).catch(() => []),
    staleTime: 60_000,
  })
  const link = useMutation({
    mutationFn: () => api.patch(`/status-rows/${rowId}`, { matrixRegistryId: selectedId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-rows'] }); onConnected() },
  })
  const clientMatrices = client ? matrices.filter((m) => m.client?.toLowerCase().includes(client.toLowerCase())) : matrices

  return (
    <Modal onClose={onClose}>
      <h3 style={mh3}>Подключить к проекту</h3>
      <p style={mp}>Выберите проект из реестра или создайте новый.</p>
      {clientMatrices.length > 0 ? (
        <>
          <label style={mlabel}>Выберите проект{client ? ` клиента «${client}»` : ''}</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={mselect}>
            <option value="">— выберите —</option>
            {clientMatrices.map((m) => <option key={m.id} value={m.id}>{m.name || m.matrixId}{m.client ? ` (${m.client})` : ''}</option>)}
          </select>
          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', margin: '4px 0 12px' }}>— или —</p>
        </>
      ) : (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b45309' }}>
          {client ? `У клиента «${client}» нет проектов в реестре.` : 'Проектов в реестре нет.'}
        </div>
      )}
      <div style={mactions}>
        <button style={btnSecondary} onClick={onClose}>Отмена</button>
        <button style={{ ...btnSecondary, borderColor: '#fde68a', color: '#b45309' }} onClick={onCreateProject}>+ Создать проект</button>
        {clientMatrices.length > 0 && (
          <button style={btnPrimary} disabled={!selectedId || link.isPending} onClick={() => link.mutate()}>
            {link.isPending ? 'Привязка...' : 'Привязать'}
          </button>
        )}
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
        await api.patch(`/status-rows/${rowId}`, { matrixRegistryId: matrixId })
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
const mlabel: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }
const mselect: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }
const btnPrimary: React.CSSProperties = { padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#2563eb', color: '#fff' }
const btnSecondary: React.CSSProperties = { padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }

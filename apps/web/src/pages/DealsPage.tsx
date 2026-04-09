import { useState, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useIsAdmin } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusRow {
  id: string
  name: string
  client: string | null
  date: string
  sheetMatrixId: string | null
  source: string
  // поля для применения фильтров из Таблиц
  status: string | null
  format: string | null
  location: string | null
}

interface MatrixRegistry {
  id: string
  matrixId: string
  name: string
  client: string | null
  status: string | null
  unit: string | null
  format: string | null
}

type DealStatus = 'preliminary' | 'in_progress' | 'completed'

interface Deal {
  id: string
  name: string | null
  client: string | null
  status: DealStatus
  createdAt: string
  statusRows: StatusRow[]
  matrices: MatrixRegistry[]
}

interface PotentialGroup {
  matrix: MatrixRegistry
  rows: StatusRow[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DealStatus, string> = {
  preliminary: 'Предварительно',
  in_progress: 'На реализации',
  completed: 'Завершён',
}

const STATUS_COLORS: Record<DealStatus, { bg: string; text: string }> = {
  preliminary: { bg: '#fef3c7', text: '#b45309' },
  in_progress: { bg: '#dbeafe', text: '#1d4ed8' },
  completed: { bg: '#dcfce7', text: '#15803d' },
}

const LS_TAB_KEY = 'deals-tab'

// Те же метки статусов, что в SyncDataPage — нужны для сравнения с сохранёнными фильтрами
const ROW_STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согл.', preproduction: 'Препрод.',
  production: 'Продакшн', postproduction: 'Постпрод.', delivered: 'Сдан',
  rejected: 'Не согл.', cancelled: 'Отменён', manual: 'Ручной',
}

// Читаем активные фильтры из localStorage (установленные в Таблицах)
function readSyncFilters(): { primary: Record<string, string[]>; secondary: Record<string, string[]> } {
  function parse(key: string): Record<string, string[]> {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : {} } catch { return {} }
  }
  return { primary: parse('sync-primary-proj'), secondary: parse('sync-col-proj') }
}

// Возвращает display-значение поля строки (аналог getProjValue в SyncDataPage)
function getRowFilterValue(row: StatusRow, col: string): string {
  switch (col) {
    case 'status':   return ROW_STATUS_LABELS[row.status ?? ''] ?? (row.status ?? '')
    case 'client':   return row.client ?? ''
    case 'format':   return row.format ?? ''
    case 'location': return row.location ?? ''
    default:         return ''
  }
}

// Возвращает true если строка проходит оба фильтра (primary AND secondary)
function rowPassesSyncFilters(
  row: StatusRow,
  primary: Record<string, string[]>,
  secondary: Record<string, string[]>,
): boolean {
  // Первичный фильтр: AND по колонкам, OR по значениям
  for (const [col, sel] of Object.entries(primary)) {
    if (sel.length === 0) continue
    if (!sel.includes(getRowFilterValue(row, col))) return false
  }
  // Вторичный фильтр: то же самое + специальная обработка matrixId
  for (const [col, sel] of Object.entries(secondary)) {
    if (sel.length === 0) continue
    if (col === 'matrixId') {
      const hasId = !!row.sheetMatrixId
      const wantHas = sel.includes('Есть ID')
      const wantNot = sel.includes('Нет ID')
      if (wantHas && !wantNot && !hasId) return false
      if (!wantHas && wantNot && hasId) return false
      continue
    }
    if (!sel.includes(getRowFilterValue(row, col))) return false
  }
  return true
}

function countActiveSyncFilters(primary: Record<string, string[]>, secondary: Record<string, string[]>) {
  return (
    Object.values(primary).reduce((s, a) => s + a.length, 0) +
    Object.values(secondary).reduce((s, a) => s + a.length, 0)
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DealsPage() {
  const isAdmin = useIsAdmin()

  // Сохраняем активную вкладку в localStorage
  const [tab, setTab] = useState<'deals' | 'potential'>(() => {
    const saved = localStorage.getItem(LS_TAB_KEY)
    return saved === 'potential' ? 'potential' : 'deals'
  })

  // Поисковый запрос живёт на уровне страницы — не сбрасывается при переключении вкладок
  const [search, setSearch] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [prefill, setPrefill] = useState<Partial<DealFormData> | null>(null)

  function switchTab(t: 'deals' | 'potential') {
    setTab(t)
    localStorage.setItem(LS_TAB_KEY, t)
  }

  function openCreate(data?: Partial<DealFormData>) {
    setPrefill(data ?? null)
    setShowCreateModal(true)
  }

  const q = search.trim().toLowerCase()

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Проекты</h1>
        {isAdmin && tab === 'deals' && (
          <button
            onClick={() => openCreate()}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Создать проект
          </button>
        )}
      </div>

      {/* Search — общий для обеих вкладок, не сбрасывается при переключении */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по клиенту, названию, матрице..."
          style={{
            width: '100%',
            maxWidth: 420,
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 14,
            color: '#1e293b',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {(['deals', 'potential'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 20px',
              fontSize: 15,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'deals' ? 'Проекты' : 'Потенциальные'}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'deals' && <DealsTab isAdmin={isAdmin} search={q} />}
      {tab === 'potential' && (
        <PotentialTab isAdmin={isAdmin} search={q} onCreateDeal={openCreate} />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <DealFormModal
          prefill={prefill}
          onClose={() => { setShowCreateModal(false); setPrefill(null) }}
        />
      )}
    </div>
  )
}

// ─── Deals Tab ────────────────────────────────────────────────────────────────

function DealsTab({ isAdmin, search }: { isAdmin: boolean; search: string }) {
  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ['deals'],
    queryFn: () => api.get('/deals').then((r) => r.data),
  })

  const filtered = search
    ? deals.filter((d) => {
        const hay = [
          d.client,
          d.name,
          ...d.matrices.map((m) => m.name),
          ...d.matrices.map((m) => m.client),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(search)
      })
    : deals

  if (isLoading) return <LoadingState />
  if (deals.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: 16 }}>
        Проектов пока нет. Создайте первый или перейдите во вкладку «Потенциальные».
      </div>
    )
  }
  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: 16 }}>
        Ничего не найдено
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
      {filtered.map((deal) => (
        <DealCard key={deal.id} deal={deal} isAdmin={isAdmin} />
      ))}
    </div>
  )
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ deal, isAdmin }: { deal: Deal; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const qc = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/deals/${deal.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deals-potential'] })
    },
  })

  const st = STATUS_COLORS[deal.status]

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Card Header */}
      <div style={{ padding: '16px 20px', borderBottom: expanded ? '1px solid #f1f5f9' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
              {deal.client ?? deal.name ?? '—'}
            </div>
            {deal.matrices.length > 0 && (
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {deal.matrices.map((m) => m.name).join(', ')}
              </div>
            )}
          </div>
          <span style={{
            fontSize: 12,
            padding: '3px 10px',
            borderRadius: 10,
            background: st.bg,
            color: st.text,
            fontWeight: 600,
            flexShrink: 0,
            marginLeft: 8,
          }}>
            {STATUS_LABELS[deal.status]}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {deal.statusRows.length} {pluralShifts(deal.statusRows.length)}
            {deal.matrices.length > 0 && ` · ${deal.matrices.length} матриц`}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 13,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              {expanded ? 'Свернуть' : 'Подробнее'}
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowDelete(true)}
                style={{
                  background: '#fff5f5',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 13,
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
              >
                Удалить
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          {deal.matrices.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Матрицы</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deal.matrices.map((m) => (
                  <div key={m.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: '#f8fafc',
                    borderRadius: 6,
                    fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>{m.name}</span>
                    <span style={{ color: '#64748b' }}>
                      {[m.unit, m.format].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deal.statusRows.length > 0 && (
            <div>
              <div style={sectionLabel}>Строки расписания</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {deal.statusRows.map((row) => (
                  <div key={row.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '5px 10px',
                    background: '#f8fafc',
                    borderRadius: 6,
                    fontSize: 13,
                  }}>
                    <span style={{ color: '#1e293b' }}>{row.name || '—'}</span>
                    <span style={{ color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>
                      {format(new Date(row.date), 'd MMM yyyy', { locale: ru })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirm */}
      {showDelete && (
        <DeleteConfirm
          text={`Удалить проект «${deal.client ?? deal.name ?? '—'}»? Данные таблиц и матрицы не удаляются.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDelete(false)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}

// ─── Potential Tab ────────────────────────────────────────────────────────────

function PotentialTab({
  isAdmin,
  search,
  onCreateDeal,
}: {
  isAdmin: boolean
  search: string
  onCreateDeal: (prefill: Partial<DealFormData>) => void
}) {
  const { data: groups = [], isLoading } = useQuery<PotentialGroup[]>({
    queryKey: ['deals-potential'],
    queryFn: () => api.get('/deals/potential').then((r) => r.data),
    enabled: isAdmin,
  })

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: 16 }}>
        Только для администраторов
      </div>
    )
  }

  if (isLoading) return <LoadingState />

  // Читаем фильтры, настроенные в Таблицах
  const { primary, secondary } = readSyncFilters()
  const activeSyncFiltersCount = countActiveSyncFilters(primary, secondary)

  const filtered: { group: PotentialGroup; filteredRows: StatusRow[] }[] = groups
    .map((group) => {
      // 1. Применяем фильтры из Таблиц к строкам группы
      let rows = activeSyncFiltersCount > 0
        ? group.rows.filter((r) => rowPassesSyncFilters(r, primary, secondary))
        : group.rows

      // 2. Применяем текстовый поиск
      if (search) {
        const matrixMatch = [group.matrix.client, group.matrix.name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(search))

        const matchedRows = rows.filter((r) =>
          (r.name ?? '').toLowerCase().includes(search) ||
          (r.client ?? '').toLowerCase().includes(search)
        )

        if (!matrixMatch && matchedRows.length === 0) return null
        if (!matrixMatch) rows = matchedRows
      }

      if (rows.length === 0) return null

      return { group, filteredRows: rows }
    })
    .filter((x): x is { group: PotentialGroup; filteredRows: StatusRow[] } => x !== null)

  if (groups.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: 16 }}>
        Потенциальных совпадений не найдено
      </div>
    )
  }

  return (
    <>
      {/* Индикатор активных фильтров из Таблиц */}
      {activeSyncFiltersCount > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '8px 14px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          fontSize: 13,
          color: '#1d4ed8',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>Активны фильтры из «Таблиц»: {activeSyncFiltersCount}</span>
          <span style={{ color: '#64748b' }}>·</span>
          <span style={{ color: '#64748b' }}>
            {filtered.length} из {groups.length} групп
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: 16 }}>
          Ничего не найдено
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {filtered.map(({ group, filteredRows }) => (
            <PotentialCard
              key={group.matrix.id}
              group={group}
              filteredRows={filteredRows}
              onCreate={() =>
                onCreateDeal({
                  client: group.matrix.client ?? '',
                  matrixIds: [group.matrix.id],
                  statusRowIds: filteredRows.map((r) => r.id),
                })
              }
            />
          ))}
        </div>
      )}
    </>
  )
}

function PotentialCard({
  group,
  filteredRows,
  onCreate,
}: {
  group: PotentialGroup
  filteredRows: StatusRow[]
  onCreate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isFiltered = filteredRows.length !== group.rows.length

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: expanded ? '1px solid #f1f5f9' : 'none' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
          {group.matrix.client ?? group.matrix.name}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          {group.matrix.name}
          {[group.matrix.unit, group.matrix.format].filter(Boolean).length > 0 &&
            ` · ${[group.matrix.unit, group.matrix.format].filter(Boolean).join(' / ')}`}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>
            {filteredRows.length} {pluralShifts(filteredRows.length)}
            {isFiltered && (
              <span style={{ color: '#f59e0b', marginLeft: 4 }}>
                из {group.rows.length}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 13,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              {expanded ? 'Свернуть' : 'Показать'}
            </button>
            <button
              onClick={onCreate}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '4px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Создать проект
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {filteredRows.map((row) => (
            <div key={row.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '5px 10px',
              background: '#f8fafc',
              borderRadius: 6,
              fontSize: 13,
            }}>
              <span style={{ color: '#1e293b' }}>{row.name || '—'}</span>
              <span style={{ color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>
                {format(new Date(row.date), 'd MMM yyyy', { locale: ru })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Deal Form Modal ──────────────────────────────────────────────────────────

interface DealFormData {
  client: string
  name: string
  status: DealStatus
  matrixIds: string[]
  statusRowIds: string[]
}

function DealFormModal({
  prefill,
  onClose,
}: {
  prefill: Partial<DealFormData> | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<DealFormData>({
    client: prefill?.client ?? '',
    name: prefill?.name ?? '',
    status: prefill?.status ?? 'preliminary',
    matrixIds: prefill?.matrixIds ?? [],
    statusRowIds: prefill?.statusRowIds ?? [],
  })

  const { data: allRows = [] } = useQuery<StatusRow[]>({
    queryKey: ['status-rows-for-deal'],
    queryFn: () => api.get('/status-rows', { params: { withSeparators: false } }).then((r) => r.data),
  })

  const { data: matricesData = [] } = useQuery<MatrixRegistry[]>({
    queryKey: ['sync-registry'],
    queryFn: () => api.get('/sync/registry').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/deals', {
        client: data.client || null,
        name: data.name || null,
        status: data.status,
        matrixIds: data.matrixIds,
        statusRowIds: data.statusRowIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deals-potential'] })
      onClose()
    },
  })

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]

  const selectedMatrixIds = new Set(
    matricesData
      .filter((m) => form.matrixIds.includes(m.id))
      .map((m) => m.matrixId)
  )

  const filteredRows =
    form.matrixIds.length > 0
      ? allRows.filter((r) => r.sheetMatrixId && selectedMatrixIds.has(r.sheetMatrixId))
      : allRows

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 14,
        width: '100%',
        maxWidth: 640,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Создать проект</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={labelStyle}>Клиент</label>
            <input
              value={form.client}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
              placeholder="Название клиента"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Название проекта (необязательно)</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Оставьте пустым чтобы использовать имя клиента"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Статус</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DealStatus }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {(Object.entries(STATUS_LABELS) as [DealStatus, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {matricesData.length > 0 && (
            <div>
              <label style={labelStyle}>Матрицы ({form.matrixIds.length} выбрано)</label>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 160, overflowY: 'auto' }}>
                {matricesData.map((m) => (
                  <label key={m.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f8fafc',
                    background: form.matrixIds.includes(m.id) ? '#eff6ff' : '#fff',
                    fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={form.matrixIds.includes(m.id)}
                      onChange={() => setForm((f) => ({ ...f, matrixIds: toggle(f.matrixIds, m.id) }))}
                    />
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>{m.name}</span>
                    {m.client && <span style={{ color: '#64748b' }}>{m.client}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>
              Строки расписания ({form.statusRowIds.length} выбрано)
              {form.matrixIds.length > 0 && ' · отфильтровано по матрицам'}
            </label>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
              {filteredRows.length === 0 ? (
                <div style={{ padding: 16, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>Нет строк</div>
              ) : (
                filteredRows.map((row) => (
                  <label key={row.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f8fafc',
                    background: form.statusRowIds.includes(row.id) ? '#eff6ff' : '#fff',
                    fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={form.statusRowIds.includes(row.id)}
                      onChange={() => setForm((f) => ({ ...f, statusRowIds: toggle(f.statusRowIds, row.id) }))}
                    />
                    <span style={{ color: '#1e293b' }}>{row.name || '—'}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 'auto', flexShrink: 0 }}>
                      {format(new Date(row.date), 'd MMM yyyy', { locale: ru })}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#475569', cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending}
            style={{
              background: createMutation.isPending ? '#93c5fd' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 24px',
              fontSize: 14,
              fontWeight: 600,
              cursor: createMutation.isPending ? 'default' : 'pointer',
            }}
          >
            {createMutation.isPending ? 'Создаём...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({
  text,
  onConfirm,
  onCancel,
  loading,
}: {
  text: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div style={{ padding: '14px 20px', background: '#fff5f5', borderTop: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, color: '#7f1d1d' }}>{text}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          disabled={loading}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}
        >
          {loading ? 'Удаление...' : 'Удалить'}
        </button>
        <button
          onClick={onCancel}
          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 16px', fontSize: 13, color: '#475569', cursor: 'pointer' }}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

// ─── Loading State ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          background: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          height: 120,
        }} />
      ))}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pluralShifts(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return 'строка'
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'строки'
  return 'строк'
}

const sectionLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 8,
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 14,
  color: '#1e293b',
  outline: 'none',
  boxSizing: 'border-box',
}

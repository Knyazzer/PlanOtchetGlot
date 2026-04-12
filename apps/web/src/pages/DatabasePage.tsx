import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableConfig {
  key: string
  label: string
  description: string
  editable: boolean
  sheetUrl: string | null
  rowCount: number
  lastSyncedAt: string | null
}

interface PreviewData {
  columns: string[]
  rows: string[][]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ tableKey, label, onClose }: { tableKey: string; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = useQuery<PreviewData>({
    queryKey: ['db-preview', tableKey],
    queryFn: () => api.get(`/database/preview/${tableKey}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const isEmpty = !isLoading && !error && data && data.rows.length === 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '94vw', maxWidth: 960, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {data && <span style={{ fontSize: 12, color: '#94a3b8' }}>{data.rows.length} строк</span>}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}
              title="Закрыть (Esc)"
            >×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
          {isLoading && (
            <div style={{ color: '#64748b', fontSize: 14, padding: '24px 0' }}>Загрузка...</div>
          )}
          {error && (
            <div style={{ color: '#ef4444', fontSize: 14, padding: '24px 0' }}>
              Ошибка: {(error as any)?.response?.data?.error ?? (error as any)?.message}
            </div>
          )}
          {isEmpty && (

            <div style={{ color: '#94a3b8', fontSize: 14, padding: '24px 0' }}>
              Данные не загружены
            </div>
          )}
          {data && data.rows.length > 0 && (
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', marginTop: 4 }}>
              <thead>
                <tr>
                  {data.columns.map((col, i) => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                      {col || `Столбец ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9', color: cell ? '#1e293b' : '#cbd5e1', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cell || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Table Card ───────────────────────────────────────────────────────────────

function TableCard({ table, onPreview }: { table: TableConfig; onPreview: () => void }) {
  const qc = useQueryClient()
  const [urlDraft, setUrlDraft] = useState(table.sheetUrl ?? '')
  const [saved, setSaved] = useState(false)

  // Sync draft when server data changes
  useEffect(() => { setUrlDraft(table.sheetUrl ?? '') }, [table.sheetUrl])

  const saveUrl = useMutation({
    mutationFn: (sheetUrl: string | null) =>
      api.patch(`/database/config/${table.key}`, { sheetUrl }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['db-config'] })
      qc.invalidateQueries({ queryKey: ['db-preview', table.key] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const refresh = useMutation({
    mutationFn: () => api.post(`/database/refresh/${table.key}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['db-config'] })
      qc.invalidateQueries({ queryKey: ['db-preview', table.key] })
    },
  })

  const urlChanged = urlDraft !== (table.sheetUrl ?? '')
  const canRefresh = table.editable && !!table.sheetUrl && !urlChanged
  const refreshError = refresh.error
    ? ((refresh.error as any)?.response?.data?.error ?? (refresh.error as any)?.message ?? 'Ошибка')
    : null

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{table.label}</span>
            {table.rowCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#3b82f6', borderRadius: 8, padding: '2px 7px' }}>
                {table.rowCount}
              </span>
            )}
            {!table.editable && (
              <span style={{ fontSize: 10, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', borderRadius: 6, padding: '2px 6px', letterSpacing: '0.02em' }}>
                АВТО
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>{table.description}</div>
        </div>
      </div>

      {/* URL row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {table.editable ? (
          <>
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              style={{
                flex: 1, minWidth: 0, fontSize: 12, padding: '6px 10px',
                border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none',
                fontFamily: 'monospace', color: '#334155', background: '#f8fafc',
              }}
            />
            <button
              onClick={() => saveUrl.mutate(urlDraft.trim() || null)}
              disabled={!urlChanged || saveUrl.isPending}
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 6, border: 'none',
                background: urlChanged ? '#3b82f6' : '#f1f5f9',
                color: urlChanged ? '#fff' : '#94a3b8',
                cursor: urlChanged && !saveUrl.isPending ? 'pointer' : 'default',
                fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {saveUrl.isPending ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}
            </button>
          </>
        ) : (
          <a
            href={table.sheetUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'underline', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
          >
            {table.sheetUrl ?? '—'}
          </a>
        )}
      </div>

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {table.editable
            ? table.lastSyncedAt ? `Обновлено: ${fmtDate(table.lastSyncedAt)}` : 'Не загружалось'
            : 'Синхронизируется автоматически'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {table.editable && (
            <button
              onClick={() => refresh.mutate()}
              disabled={!canRefresh || refresh.isPending}
              title={!table.sheetUrl ? 'Сначала укажите URL таблицы' : undefined}
              style={{
                fontSize: 12, padding: '5px 10px', borderRadius: 6,
                border: '1px solid #e2e8f0', background: 'none',
                color: canRefresh ? '#475569' : '#cbd5e1',
                cursor: canRefresh && !refresh.isPending ? 'pointer' : 'default',
              }}
            >
              {refresh.isPending ? '...' : '↻ Обновить'}
            </button>
          )}
          <button
            onClick={onPreview}
            disabled={table.rowCount === 0 && table.editable}
            title={table.editable && table.rowCount === 0 ? 'Нет загруженных данных' : undefined}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 6,
              border: '1px solid #e2e8f0', background: 'none',
              color: (table.rowCount > 0 || !table.editable) ? '#475569' : '#cbd5e1',
              cursor: (table.rowCount > 0 || !table.editable) ? 'pointer' : 'default',
            }}
          >
            Просмотр →
          </button>
        </div>
      </div>

      {/* Refresh error */}
      {refreshError && (
        <div style={{ fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>
          {refreshError}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DatabasePage() {
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<{ tables: TableConfig[] }>({
    queryKey: ['db-config'],
    queryFn: () => api.get('/database/config').then((r) => r.data),
    staleTime: 30_000,
  })

  const previewTable = data?.tables.find((t) => t.key === previewKey)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Источники данных</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Настройка подключений к Google Sheets и ручная загрузка данных
        </div>
      </div>

      {isLoading && (
        <div style={{ color: '#64748b', fontSize: 14 }}>Загрузка...</div>
      )}
      {error && (
        <div style={{ color: '#ef4444', fontSize: 14 }}>
          Ошибка загрузки: {(error as any)?.response?.data?.error ?? (error as any)?.message}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Секция: Автосинк */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4, marginBottom: 2 }}>
            Автоматическая синхронизация
          </div>
          {data.tables.filter((t) => !t.editable).map((t) => (
            <TableCard key={t.key} table={t} onPreview={() => setPreviewKey(t.key)} />
          ))}

          {/* Секция: Ручная загрузка */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 12, marginBottom: 2 }}>
            Ручная загрузка
          </div>
          {data.tables.filter((t) => t.editable).map((t) => (
            <TableCard key={t.key} table={t} onPreview={() => setPreviewKey(t.key)} />
          ))}
        </div>
      )}

      {previewKey && previewTable && (
        <PreviewModal
          tableKey={previewKey}
          label={previewTable.label}
          onClose={() => setPreviewKey(null)}
        />
      )}
    </div>
  )
}

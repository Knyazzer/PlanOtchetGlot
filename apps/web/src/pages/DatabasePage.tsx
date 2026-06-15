import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableConfig {
  key: string
  label: string
  description: string
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
  const { data, isLoading, error } = useQuery<PreviewData>({
    queryKey: ['db-preview', tableKey],
    queryFn: () => api.get(`/database/preview/${tableKey}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const mdRef = useRef(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: 'fit-content', maxWidth: '96vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {data && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                {data.rows.length} строк
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                color: 'var(--text-3)', borderRadius: 6,
                width: 28, height: 28, cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 0 16px' }}>
          {isLoading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 24px' }}>Загрузка...</div>
          )}
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, padding: '32px 24px' }}>
              {(error as any)?.response?.data?.error ?? 'Ошибка загрузки'}
            </div>
          )}
          {data && data.rows.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 24px', textAlign: 'center' }}>
              Данные не загружены
            </div>
          )}
          {data && data.rows.length > 0 && (
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {data.columns.map((col, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        borderBottom: '1px solid var(--border)',
                        fontWeight: 700, fontSize: 11,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                        position: 'sticky', top: 0,
                        background: 'var(--surface-1)',
                      }}
                    >
                      {col || `Столбец ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '8px 16px',
                          borderBottom: '1px solid var(--border)',
                          color: cell ? 'var(--text-2)' : 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
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

  const importEndpoint = table.key === 'employees_buffer' ? '/users/bulk-import-staff'
    : table.key === 'freelancers' ? '/users/bulk-import-freelancers'
    : table.key === 'kfpd' ? '/clients/bulk-import'
    : null

  const bulkImport = useMutation({
    mutationFn: () => api.post(importEndpoint!),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['staff'],       refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['freelancers'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['clients'],     refetchType: 'all' })
      alert(`Импортировано: ${res.data.created}, пропущено (уже есть): ${res.data.skipped}`)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка импорта'),
  })

  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{table.label}</span>
        {table.rowCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px',
            background: 'rgba(255,107,53,0.12)', color: 'var(--accent-s)',
          }}>
            {table.rowCount}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>{table.description}</span>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {table.lastSyncedAt ? `Обновлено: ${fmtDate(table.lastSyncedAt)}` : 'Не загружалось'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {importEndpoint && (
            <button
              onClick={() => bulkImport.mutate()}
              disabled={table.rowCount === 0 || bulkImport.isPending}
              title={table.rowCount === 0 ? 'Сначала загрузите данные из Sheets' : 'Перенести данные из кэша в БД'}
              style={{
                fontSize: 12, padding: '6px 14px',
                borderRadius: 8, border: 'none',
                background: table.rowCount > 0 ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'rgba(255,255,255,0.05)',
                color: table.rowCount > 0 ? '#fff' : 'var(--text-muted)',
                fontFamily: 'Inter, sans-serif', fontWeight: 600,
                cursor: table.rowCount > 0 ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              {bulkImport.isPending ? 'Импорт...' : '⬆ Импортировать в БД'}
            </button>
          )}
          <button
            onClick={onPreview}
            disabled={table.rowCount === 0}
            style={{
              fontSize: 12, padding: '6px 14px',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'none', fontFamily: 'Inter, sans-serif',
              color: table.rowCount > 0 ? 'var(--text-2)' : 'var(--text-muted)',
              cursor: table.rowCount > 0 ? 'pointer' : 'default',
            }}
          >
            Просмотр →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DatabasePage ─────────────────────────────────────────────────────────────

export function DatabasePage() {
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<{ tables: TableConfig[] }>({
    queryKey: ['db-config'],
    queryFn: () => api.get('/database/config').then((r) => r.data),
    staleTime: 30_000,
  })

  const previewTable = data?.tables.find((t) => t.key === previewKey)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>
          База данных
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Импортированные данные из внешних источников. Нажмите «Импортировать в БД» чтобы перенести данные в базу.
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>
          Загрузка...
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 13 }}>
          {(error as any)?.response?.data?.error ?? 'Ошибка загрузки конфигурации'}
        </div>
      )}

      {/* Table cards */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.tables.map((table) => (
            <TableCard
              key={table.key}
              table={table}
              onPreview={() => setPreviewKey(table.key)}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
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

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixTemplate {
  id: string
  name: string
  sheet_url: string
  is_active: boolean
  created_at: string
}

interface TableConfig {
  key: string
  label: string
  description: string
  editable: boolean
  sheetUrl: string | null
  apiKey: string | null
  rowCount: number
  lastSyncedAt: string | null
}

interface DbConfigResponse {
  tables: TableConfig[]
  internalRegistry: { sheetUrl: string | null; apiKey: string | null }
  driveFolderId: string | null
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
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {data && <span style={{ fontSize: 12, color: '#94a3b8' }}>{data.rows.length} строк</span>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
          {isLoading && <div style={{ color: '#64748b', fontSize: 14, padding: '24px 0' }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', fontSize: 14, padding: '24px 0' }}>Ошибка: {(error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ?? (error as { message?: string })?.message}</div>}
          {isEmpty && <div style={{ color: '#94a3b8', fontSize: 14, padding: '24px 0' }}>Данные не загружены</div>}
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
  const [keyDraft, setKeyDraft] = useState(table.apiKey ?? '')
  const [urlSaved, setUrlSaved] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const urlSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keySavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (urlSavedTimer.current) clearTimeout(urlSavedTimer.current)
    if (keySavedTimer.current) clearTimeout(keySavedTimer.current)
  }, [])

  useEffect(() => { setUrlDraft(table.sheetUrl ?? '') }, [table.sheetUrl])
  useEffect(() => { setKeyDraft(table.apiKey ?? '') }, [table.apiKey])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['db-config'] })
    qc.invalidateQueries({ queryKey: ['db-preview', table.key] })
  }

  const saveUrl = useMutation({
    mutationFn: (sheetUrl: string | null) =>
      api.patch(`/database/config/${table.key}`, { sheetUrl }).then((r) => r.data),
    onSuccess: () => { invalidate(); setUrlSaved(true); urlSavedTimer.current = setTimeout(() => setUrlSaved(false), 2000) },
  })

  const saveKey = useMutation({
    mutationFn: (apiKey: string | null) =>
      api.patch(`/database/config/${table.key}`, { apiKey }).then((r) => r.data),
    onSuccess: () => { invalidate(); setKeySaved(true); keySavedTimer.current = setTimeout(() => setKeySaved(false), 2000) },
  })

  const refresh = useMutation({
    mutationFn: () => api.post(`/database/refresh/${table.key}`).then((r) => r.data),
    onSuccess: invalidate,
  })

  const urlChanged = urlDraft !== (table.sheetUrl ?? '')
  const keyChanged = keyDraft !== (table.apiKey ?? '')
  const canRefresh = table.editable && !!table.sheetUrl && !urlChanged
  const refreshError = refresh.error
    ? ((refresh.error as any)?.response?.data?.error ?? (refresh.error as any)?.message ?? 'Ошибка')
    : null

  const inputBase: React.CSSProperties = {
    flex: 1, minWidth: 0, fontSize: 12, padding: '6px 10px',
    border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none',
    fontFamily: 'monospace', color: '#334155', background: '#f8fafc',
  }

  const saveBtn = (changed: boolean, pending: boolean, saved: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '6px 12px', borderRadius: 6, border: 'none',
    background: changed ? '#3b82f6' : '#f1f5f9',
    color: changed ? '#fff' : '#94a3b8',
    cursor: changed && !pending ? 'pointer' : 'default',
    fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Title */}
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
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={inputBase}
        />
        <button
          onClick={() => saveUrl.mutate(urlDraft.trim() || null)}
          disabled={!urlChanged || saveUrl.isPending}
          style={saveBtn(urlChanged, saveUrl.isPending, urlSaved)}
        >
          {saveUrl.isPending ? 'Сохраняю...' : urlSaved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>

      {/* API Key row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>API ключ:</div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="AIza..."
            style={inputBase}
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            style={{ fontSize: 11, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#64748b', flexShrink: 0 }}
            title={showKey ? 'Скрыть' : 'Показать'}
          >
            {showKey ? '🙈' : '👁'}
          </button>
          <button
            onClick={() => saveKey.mutate(keyDraft.trim() || null)}
            disabled={!keyChanged || saveKey.isPending}
            style={saveBtn(keyChanged, saveKey.isPending, keySaved)}
          >
            {saveKey.isPending ? 'Сохраняю...' : keySaved ? '✓' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Footer */}
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

      {refreshError && (
        <div style={{ fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>
          {refreshError}
        </div>
      )}
    </div>
  )
}

// ─── Internal Registry Card ───────────────────────────────────────────────────

function InternalRegistryCard({ sheetUrl }: { sheetUrl: string | null }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(sheetUrl ?? '')
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setDraft(sheetUrl ?? '') }, [sheetUrl])
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  const save = useMutation({
    mutationFn: (url: string | null) =>
      api.patch('/database/config/internal_registry', { sheetUrl: url }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['db-config'] })
      setSaved(true)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    },
  })

  const changed = draft !== (sheetUrl ?? '')

  const inputBase: React.CSSProperties = {
    flex: 1, minWidth: 0, fontSize: 12, padding: '6px 10px',
    border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none',
    fontFamily: 'monospace', color: '#334155', background: '#f8fafc',
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Реестр матриц (выходная таблица)</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
          Google Sheet, куда записываются строки при создании новых внутренних матриц. Доступ через сервисный аккаунт.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={inputBase}
        />
        <button
          onClick={() => save.mutate(draft.trim() || null)}
          disabled={!changed || save.isPending}
          style={{
            fontSize: 12, padding: '6px 12px', borderRadius: 6, border: 'none',
            background: changed ? '#3b82f6' : '#f1f5f9',
            color: changed ? '#fff' : '#94a3b8',
            cursor: changed && !save.isPending ? 'pointer' : 'default',
            fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {save.isPending ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

// ─── Matrix Templates Section ─────────────────────────────────────────────────

function MatrixTemplatesSection() {
  const qc = useQueryClient()
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: templates = [] } = useQuery<MatrixTemplate[]>({
    queryKey: ['matrix-templates'],
    queryFn: () => api.get('/matrix-templates').then((r) => r.data),
    staleTime: 30_000,
  })

  const addTemplate = useMutation({
    mutationFn: () => api.post('/matrix-templates', { name: addName.trim(), sheetUrl: addUrl.trim() }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matrix-templates'] })
      setAddUrl(''); setAddName(''); setAdding(false); setError(null)
    },
    onError: (e: any) => setError(e?.response?.data?.error ?? e?.message ?? 'Ошибка'),
  })

  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/matrix-templates/${id}/activate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matrix-templates'] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/matrix-templates/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matrix-templates'] }),
  })

  const inputStyle: React.CSSProperties = {
    fontSize: 12, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
    outline: 'none', color: '#1e293b', background: '#f8fafc', fontFamily: 'monospace',
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Шаблоны матриц</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Ссылки на Google Sheets — шаблоны, по которым создаются новые матрицы</div>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
        >
          + Добавить
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Название шаблона"
            style={{ ...inputStyle, fontFamily: 'inherit' }}
          />
          <input
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            style={inputStyle}
          />
          {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (!addName.trim() || !addUrl.trim()) { setError('Заполните название и URL'); return } addTemplate.mutate() }}
              disabled={addTemplate.isPending}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
            >
              {addTemplate.isPending ? 'Сохраняю...' : 'Сохранить'}
            </button>
            <button onClick={() => { setAdding(false); setError(null) }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569' }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Шаблоны не добавлены</div>
      )}

      {templates.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.is_active ? '#eff6ff' : '#f8fafc', borderRadius: 8, border: t.is_active ? '1px solid #bfdbfe' : '1px solid #e2e8f0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.name}</span>
              {t.is_active && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#2563eb', color: '#fff', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.02em' }}>АКТИВНЫЙ</span>
              )}
            </div>
            <a
              href={t.sheet_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#3b82f6', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 480 }}
            >
              {t.sheet_url}
            </a>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {!t.is_active && (
              <button
                onClick={() => activate.mutate(t.id)}
                disabled={activate.isPending}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569' }}
              >
                Выбрать для создания
              </button>
            )}
            <button
              onClick={() => { if (window.confirm(`Удалить шаблон «${t.name}»?`)) remove.mutate(t.id) }}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: 'none', cursor: 'pointer', color: '#ef4444' }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Drive Folder Card ────────────────────────────────────────────────────────

function DriveFolderCard({ folderId }: { folderId: string | null }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(folderId ?? '')
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setDraft(folderId ?? '') }, [folderId])
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  const save = useMutation({
    mutationFn: (id: string | null) =>
      api.patch('/database/config/drive_folder', { sheetUrl: id }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['db-config'] })
      setSaved(true)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    },
  })

  const changed = draft !== (folderId ?? '')

  const inputBase: React.CSSProperties = {
    flex: 1, minWidth: 0, fontSize: 12, padding: '6px 10px',
    border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none',
    fontFamily: 'monospace', color: '#334155', background: '#f8fafc',
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Папка Google Drive</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
          ID или ссылка на папку Google Drive, куда копируются шаблоны при создании новых матриц. Сервисный аккаунт должен иметь доступ редактора к этой папке.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="ID папки или ссылка https://drive.google.com/drive/folders/..."
          style={inputBase}
        />
        <button
          onClick={() => save.mutate(draft.trim() || null)}
          disabled={!changed || save.isPending}
          style={{
            fontSize: 12, padding: '6px 12px', borderRadius: 6, border: 'none',
            background: changed ? '#3b82f6' : '#f1f5f9',
            color: changed ? '#fff' : '#94a3b8',
            cursor: changed && !save.isPending ? 'pointer' : 'default',
            fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {save.isPending ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>

      {folderId && (
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          Папка: <a
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', fontFamily: 'monospace' }}
          >
            {folderId}
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Section Label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8, marginBottom: 2 }}>
      {children}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'external' | 'internal'

export function DatabasePage() {
  const [tab, setTab] = useState<Tab>('external')
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<DbConfigResponse>({
    queryKey: ['db-config'],
    queryFn: () => api.get('/database/config').then((r) => r.data),
    staleTime: 30_000,
  })

  const previewTable = data?.tables.find((t) => t.key === previewKey)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 7,
    border: 'none', cursor: 'pointer',
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : '#64748b',
    transition: 'background 0.15s, color 0.15s',
  })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Источники данных</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Настройка подключений к Google Sheets и внутренние конфигурации
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 9, padding: 3, width: 'fit-content' }}>
        <button style={tabStyle(tab === 'external')} onClick={() => setTab('external')}>
          Внешние Google Sheets
        </button>
        <button style={tabStyle(tab === 'internal')} onClick={() => setTab('internal')}>
          Внутренние
        </button>
      </div>

      {isLoading && <div style={{ color: '#64748b', fontSize: 14 }}>Загрузка...</div>}
      {error && (
        <div style={{ color: '#ef4444', fontSize: 14 }}>
          Ошибка загрузки: {(error as any)?.response?.data?.error ?? (error as any)?.message}
        </div>
      )}

      {data && tab === 'external' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>Автоматическая синхронизация</SectionLabel>
          {data.tables.filter((t) => !t.editable).map((t) => (
            <TableCard key={t.key} table={t} onPreview={() => setPreviewKey(t.key)} />
          ))}

          <SectionLabel>Ручная загрузка</SectionLabel>
          {data.tables.filter((t) => t.editable).map((t) => (
            <TableCard key={t.key} table={t} onPreview={() => setPreviewKey(t.key)} />
          ))}
        </div>
      )}

      {data && tab === 'internal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>Google Drive</SectionLabel>
          <DriveFolderCard folderId={data.driveFolderId} />

          <SectionLabel>Реестр матриц</SectionLabel>
          <InternalRegistryCard sheetUrl={data.internalRegistry.sheetUrl} />

          <SectionLabel>Шаблоны матриц</SectionLabel>
          <MatrixTemplatesSection />
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

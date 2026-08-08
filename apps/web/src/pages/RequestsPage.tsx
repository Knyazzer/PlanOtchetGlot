import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileDown } from 'lucide-react'
import { api } from '../lib/api'
import { ROLE } from '../lib/roleColors'
import { DatePicker } from '../ui-kit/components/DatePicker'
import type { DateRange } from 'react-day-picker'
import { formatName } from '../lib/utils'

// «Заявки» (под-вкладка «Мой кабинет»): мои заявки + на согласование (для руководителя),
// оформление заявки (тип/период/коммент). Спека — docs/REQUESTS-MODULE.md.

interface ReqType { key: string; label: string; needsRange: boolean; hasDoc: boolean }
interface Req {
  id: string; userId: string; user: { id: string; name: string; position?: string | null }
  type: string; status: string; dateFrom: string; dateTo: string; comment?: string | null
  approver?: { id: string; name: string } | null; decidedAt?: string | null; decisionNote?: string | null; createdAt: string
}

const STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'На согласовании', color: ROLE.warning },
  approved: { label: 'Одобрено',        color: ROLE.success },
  rejected: { label: 'Отклонено',       color: ROLE.danger },
  canceled: { label: 'Отменено',        color: '#8a8f98' },
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function fmtRange(from: string, to: string) {
  const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return from === to ? f(from) : `${f(from)} — ${f(to)}`
}

export function RequestsPage() {
  const qc = useQueryClient()
  const { data: types = [] } = useQuery<ReqType[]>({ queryKey: ['requests', 'types'], queryFn: () => api.get('/requests/types').then(r => r.data), staleTime: 1000 * 60 * 60 })
  const { data: mine = [] } = useQuery<Req[]>({ queryKey: ['requests', 'mine'], queryFn: () => api.get('/requests?scope=mine').then(r => r.data), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const { data: inbox = [] } = useQuery<Req[]>({ queryKey: ['requests', 'inbox'], queryFn: () => api.get('/requests?scope=inbox').then(r => r.data), refetchInterval: 60_000, refetchIntervalInBackground: false })

  const [showCreate, setShowCreate] = useState(false)
  const typeLabel = (k: string) => types.find(t => t.key === k)?.label ?? k

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['requests', 'mine'] }); qc.invalidateQueries({ queryKey: ['requests', 'inbox'] }); qc.invalidateQueries({ queryKey: ['requests:unseen'] }); qc.invalidateQueries({ queryKey: ['notifications'] }) }

  // Открыли вкладку — помечаем ответы по заявкам просмотренными (снимаем badge «новый ответ»)
  useEffect(() => {
    localStorage.setItem('nexus:requests-answers-seen', new Date().toISOString())
    qc.invalidateQueries({ queryKey: ['requests:unseen'] })
  }, [qc])
  const decide = useMutation({ mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) => api.patch(`/requests/${id}/decision`, { decision }), onSuccess: invalidate })
  const cancel = useMutation({ mutationFn: (id: string) => api.patch(`/requests/${id}/cancel`), onSuccess: invalidate })

  const inboxPending = inbox.filter(r => r.status === 'pending')

  async function downloadDoc(id: string) {
    const res = await api.get(`/requests/${id}/document`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a'); a.href = url; a.download = 'zayavlenie-otpusk.docx'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '28px 32px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* На согласовании — только если есть входящие (руководитель) */}
        {inboxPending.length > 0 && (
          <section>
            <SectionTitle>На согласовании <Count n={inboxPending.length} color={ROLE.warning} /></SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inboxPending.map(r => (
                <div key={r.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <TypeBadge label={typeLabel(r.type)} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{formatName(r.user.name)}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{fmtRange(r.dateFrom, r.dateTo)}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => decide.mutate({ id: r.id, decision: 'approved' })} style={btn(ROLE.success)}>Одобрить</button>
                    <button onClick={() => decide.mutate({ id: r.id, decision: 'rejected' })} style={btnOutline(ROLE.danger)}>Отклонить</button>
                  </div>
                  {r.comment && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{r.comment}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Мои заявки */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <SectionTitle>Мои заявки</SectionTitle>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowCreate(true)} style={{ ...btn(ROLE.primary), display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Оформить заявку</button>
          </div>
          {mine.length === 0 ? (
            <div style={{ ...cardStyle, color: 'var(--text-muted)', fontSize: 14 }}>Заявок пока нет. Оформите первую — отпуск, больничный или отгул.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mine.map(r => {
                const st = STATUS[r.status] ?? { label: r.status, color: 'var(--text-muted)' }
                return (
                  <div key={r.id} style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <TypeBadge label={typeLabel(r.type)} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{fmtRange(r.dateFrom, r.dateTo)}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: st.color + '22', color: st.color }}>{st.label}</span>
                      <div style={{ flex: 1 }} />
                      {r.status === 'approved' && r.type === 'vacation' && (
                        <button onClick={() => downloadDoc(r.id)} style={{ ...btnOutline(ROLE.primary), display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileDown size={14} /> Скачать заявление</button>
                      )}
                      {r.status === 'pending' && <button onClick={() => cancel.mutate(r.id)} style={btnOutline('var(--text-muted)')}>Отменить</button>}
                    </div>
                    {r.comment && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{r.comment}</div>}
                    {(r.status === 'approved' || r.status === 'rejected') && r.approver && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                        {r.status === 'approved' ? 'Одобрил' : 'Отклонил'}: {formatName(r.approver.name)}{r.decisionNote ? ` · ${r.decisionNote}` : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {showCreate && <CreateRequestModal types={types} onClose={() => setShowCreate(false)} onCreated={invalidate} />}
    </div>
  )
}

function CreateRequestModal({ types, onClose, onCreated }: { types: ReqType[]; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState(types[0]?.key ?? 'vacation')
  const [range, setRange] = useState<DateRange | undefined>()
  const [comment, setComment] = useState('')
  const down = useState({ v: false })[0]

  const create = useMutation({
    mutationFn: () => {
      const from = range?.from ? toYMD(range.from) : ''
      const to = range?.to ? toYMD(range.to) : from
      return api.post('/requests', { type, dateFrom: from, dateTo: to, comment: comment.trim() || undefined })
    },
    onSuccess: () => { onCreated(); onClose() },
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; alert(err?.response?.data?.error ?? 'Не удалось создать заявку') },
  })
  const canSubmit = !!range?.from

  return (
    <div onMouseDown={e => { down.v = e.target === e.currentTarget }} onMouseUp={e => { if (down.v && e.target === e.currentTarget) onClose(); down.v = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Оформить заявку</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <Label>Тип</Label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {types.map(t => {
            const sel = t.key === type
            return <button key={t.key} onClick={() => setType(t.key)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${sel ? ROLE.primary : 'var(--border)'}`, background: sel ? ROLE.primary + '1f' : 'none', color: sel ? ROLE.primary : 'var(--text-2)', fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{t.label}</button>
          })}
        </div>

        <Label>Период</Label>
        <div style={{ marginBottom: 16 }}>
          <DatePicker allowRange value={range} onChange={setRange} placeholder="Выбрать даты" />
        </div>

        <Label>Комментарий (необязательно)</Label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Причина, детали…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', resize: 'vertical', marginBottom: 20 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, ...btnOutline('var(--text-2)') }}>Отмена</button>
          <button onClick={() => canSubmit && create.mutate()} disabled={!canSubmit || create.isPending}
            style={{ flex: 2, ...btn(ROLE.primary), opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'default' }}>
            {create.isPending ? '…' : 'Отправить на согласование'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── мелкие презентационные хелперы ──
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
}
function Count({ n, color }: { n: number; color: string }) {
  return <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: color + '26', color }}>{n}</span>
}
function TypeBadge({ label }: { label: string }) {
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 6, background: ROLE.info + '1c', color: ROLE.info }}>{label}</span>
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 7 }}>{children}</div>
}

const cardStyle: React.CSSProperties = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 16px' }
function btn(color: string): React.CSSProperties {
  return { background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
}
function btnOutline(color: string): React.CSSProperties {
  return { background: 'none', color, border: `1px solid ${color === 'var(--text-muted)' || color === 'var(--text-2)' ? 'var(--border)' : color}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
}

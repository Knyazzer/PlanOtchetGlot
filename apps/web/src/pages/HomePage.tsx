import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pin, Trash2, Users, Search, MessageSquare, Send, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { formatName } from '../lib/utils'
import { ROLE } from '../lib/roleColors'

const pad2 = (n: number) => String(n).padStart(2, '0')
const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
// ISO номер недели
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
}

interface Post { id: string; title: string; body: string; pinned: boolean; createdAt: string; author: { id: string; name: string } }
interface Feed { posts: Post[]; canPost: boolean }
type PresenceState = 'working' | 'finished' | 'absent' | 'expected' | 'off'
interface PresenceItem { userId: string; name: string; position?: string | null; department?: string | null; state: PresenceState; label: string; dayType: string | null }
const STATE_COLOR: Record<PresenceState, string> = { working: '#46b884', finished: '#8a8f98', absent: '#f59e0b', expected: '#6b7280', off: '#5b6068' }

function fmtWhen(iso: string) { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

export function HomePage({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  return (
    <div style={{ padding: '20px 24px', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: '100%', maxWidth: 1120, margin: '0 auto', flexWrap: 'wrap' }}>
        <div style={{ flex: '1.4 1 440px', minWidth: 0, display: 'flex', minHeight: 0 }}>
          <NewsChat />
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 290, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflowY: 'auto' }}>
          <ProductionMonthCard />
          <WhoWorks onOpenChat={onOpenChat} />
        </div>
      </div>
    </div>
  )
}

// ── Новости — формат чата: сообщения без автора, скролл вверх, писать могут только с правом ──────
function NewsChat() {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { data } = useQuery<Feed>({ queryKey: ['posts'], queryFn: () => api.get('/posts').then(r => r.data), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const canPost = data?.canPost ?? false
  // API отдаёт закреплённые+новые сверху; для чата разворачиваем «старые сверху, новые снизу»
  const ordered = [...(data?.posts ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const canEdit = (p: Post) => !!currentUser?.isAdmin || p.author.id === currentUser?.id

  const pinMut = useMutation({ mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.patch(`/posts/${id}`, { pinned }), onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }) })
  const delMut = useMutation({ mutationFn: (id: string) => api.delete(`/posts/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }) })

  const [body, setBody] = useState('')
  const publish = useMutation({ mutationFn: () => api.post('/posts', { body: body.trim() }), onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['posts'] }) } })

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [ordered.length])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>Новости компании</div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.length === 0 && <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>Пока нет новостей.</div>}
        {ordered.map(p => (
          <div key={p.id} style={{ position: 'relative', alignSelf: 'stretch', background: 'var(--surface-2)', border: `1px solid ${p.pinned ? 'var(--accent-line, var(--border))' : 'var(--border)'}`, borderRadius: 12, padding: '11px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {p.pinned && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: 'var(--accent-s)' }}><Pin size={10} /> Закреплено</span>}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{fmtWhen(p.createdAt)}</span>
              {canEdit(p) && (
                <span style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => pinMut.mutate({ id: p.id, pinned: !p.pinned })} title={p.pinned ? 'Открепить' : 'Закрепить'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.pinned ? 'var(--accent-s)' : 'var(--text-muted)', padding: 2, display: 'flex' }}><Pin size={13} /></button>
                  <button onClick={() => { if (confirm('Удалить новость?')) delMut.mutate(p.id) }} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}><Trash2 size={13} /></button>
                </span>
              )}
            </div>
            {p.title && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{p.title}</div>}
            <div style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.body}</div>
          </div>
        ))}
      </div>

      {canPost && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (body.trim()) publish.mutate() } }}
            placeholder="Написать новость…" rows={1}
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', resize: 'none', maxHeight: 120, lineHeight: 1.4 }} />
          <button onClick={() => { if (body.trim()) publish.mutate() }} disabled={!body.trim() || publish.isPending} title="Опубликовать"
            style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: '#7B61FF', color: '#fff', cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Send size={16} /></button>
        </div>
      )}
    </div>
  )
}

// ── Кто работает сегодня — поиск + фильтр присутствия + клик→детализация/написать в чат ─────────
// ── Производственный календарь месяца (общий, РФ): праздники, рабочие дни/часы ─────────────────
interface Production { year: number; month: number; daysInMonth: number; workingDays: number; weekendDays: number; holidays: Array<{ date: string; label: string }>; workingHours: number; quarter: number; quarterEnd: string; quarterDaysLeft: number; quarterWorkDaysLeft: number }
function ProductionMonthCard() {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), dayOfMonth = now.getDate()
  const mm = `${y}-${pad2(m + 1)}`
  const { data } = useQuery<Production>({ queryKey: ['production', mm], queryFn: () => api.get(`/day-entries/production?month=${mm}`).then(r => r.data), staleTime: 1000 * 60 * 60 })

  const daysInMonth = data?.daysInMonth ?? new Date(y, m + 1, 0).getDate()
  const monthPct = Math.min(1, dayOfMonth / daysInMonth)
  const week = isoWeek(now)

  // 4 квартала: пройденный=100%, текущий=% дней, будущий=0
  const todayMid = new Date(y, m, dayOfMonth)
  const quarters = [0, 1, 2, 3].map(qi => {
    const qs = new Date(y, qi * 3, 1), qe = new Date(y, qi * 3 + 3, 0)
    const total = Math.round((qe.getTime() - qs.getTime()) / 86_400_000) + 1
    let pct = 0, cur = false
    if (todayMid > qe) pct = 1
    else if (todayMid >= qs) { pct = Math.min(1, (Math.round((todayMid.getTime() - qs.getTime()) / 86_400_000) + 1) / total); cur = true }
    return { q: qi + 1, pct, cur }
  })

  // геометрия доната
  const R = 34, SW = 8, CIRC = 2 * Math.PI * R
  const dash = monthPct * CIRC

  const stat: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12 }
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Clock size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>{MONTHS_RU[m]} · производственный календарь</span>
      </div>
      {!data ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Круговая диаграмма месяца — % пройденных дней; центр: число дня + номер недели */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px', position: 'relative' }}>
            <svg width={96} height={96}>
              <circle cx={48} cy={48} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={SW} />
              <circle cx={48} cy={48} r={R} fill="none" stroke={ROLE.primary} strokeWidth={SW} strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} transform="rotate(-90 48 48)" />
            </svg>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{dayOfMonth}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>нед. {week}</span>
            </div>
          </div>

          <div style={stat}><span style={{ color: 'var(--text-muted)' }}>Рабочих дней</span><b style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{data.workingDays}</b></div>
          <div style={stat}><span style={{ color: 'var(--text-muted)' }}>Рабочих часов (норма)</span><b style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{data.workingHours} ч</b></div>
          <div style={stat}><span style={{ color: 'var(--text-muted)' }}>Выходных / праздников</span><span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{data.weekendDays} / {data.holidays.length}</span></div>

          {/* Кварталы — 4 блока: пройденные закрашены, текущий заполняется по % дней */}
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Кварталы</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}><b style={{ color: ROLE.highlight }}>Q{data.quarter}</b> · до конца {data.quarterDaysLeft} дн ({data.quarterWorkDaysLeft} раб.)</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {quarters.map(qq => (
                <div key={qq.q} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${qq.pct * 100}%`, height: '100%', background: qq.cur ? ROLE.highlight : ROLE.primary, borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: qq.cur ? 800 : 600, color: qq.cur ? ROLE.highlight : qq.pct >= 1 ? 'var(--text-2)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>Q{qq.q}</span>
                </div>
              ))}
            </div>
          </div>

          {data.holidays.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Праздники</span>
              {data.holidays.map(h => (
                <div key={h.date} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span style={{ color: ROLE.danger, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>{new Date(h.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                  <span style={{ color: 'var(--text-2)' }}>{h.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WhoWorks({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  const { data: people = [] } = useQuery<PresenceItem[]>({
    queryKey: ['work-schedule', 'presence'],
    queryFn: () => api.get('/work-schedule/presence').then(r => r.data),
    refetchInterval: 60_000, refetchIntervalInBackground: false,
  })
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'working' | 'office' | 'remote'>('all')
  const [sel, setSel] = useState<PresenceItem | null>(null)
  const down = useRef(false)

  const ql = q.trim().toLowerCase()
  const list = people
    .filter(m => m.name.toLowerCase().includes(ql))
    .filter(m => filter === 'all' ? true : filter === 'working' ? m.state === 'working' : m.dayType === filter)
  const workingNow = people.filter(m => m.state === 'working').length

  const chips: Array<[typeof filter, string]> = [['all', 'Все'], ['working', 'В работе'], ['office', 'Офис'], ['remote', 'Удалёнка']]

  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Users size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Кто работает сегодня</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#46b884', fontVariantNumeric: 'tabular-nums' }} title="Сейчас в работе">{workingNow}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', marginBottom: 8 }}>
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск сотрудника…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {chips.map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: `1px solid ${filter === v ? 'var(--accent-s)' : 'var(--border)'}`, background: filter === v ? 'rgba(123,97,255,0.14)' : 'none', color: filter === v ? 'var(--accent-s)' : 'var(--text-muted)', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
        {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 2px' }}>Никого не найдено</div>}
        {list.map(m => (
          <div key={m.userId} onClick={() => setSel(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'} onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'none'}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[m.state], flexShrink: 0, opacity: m.state === 'working' ? 1 : 0.75 }} />
            <span style={{ fontSize: 14, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(m.name)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Детализация сотрудника — мини-поповер по центру */}
      {sel && (
        <div onMouseDown={e => { e.stopPropagation(); down.current = e.target === e.currentTarget }} onMouseUp={e => { e.stopPropagation(); if (down.current && e.target === e.currentTarget) setSel(null); down.current = false }}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onMouseDown={e => e.stopPropagation()} style={{ width: 300, maxWidth: '86vw', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>{formatName(sel.name).slice(0, 1).toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{formatName(sel.name)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATE_COLOR[sel.state] }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sel.label} · сейчас</span>
                </div>
              </div>
            </div>
            {sel.position && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{sel.position}{sel.department ? ` · ${sel.department}` : ''}</div>}
            <button onClick={() => { onOpenChat?.(sel.userId); setSel(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--accent-soft, var(--surface-3))', color: 'var(--accent-s)', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <MessageSquare size={15} /> Написать в чат
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// «Стратегические задачи отдела» — убраны из Пульса (перенос в другое место); появятся с моделью целей отдела.
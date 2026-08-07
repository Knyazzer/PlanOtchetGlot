import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pin, Trash2, Users, Search, MessageSquare, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { formatName } from '../lib/utils'
import { ROLE } from '../lib/roleColors'
import { Tooltip } from '../components/Tooltip'
import { getWeekStart, toYMD } from './calendar/utils'
import type { ApiCalEntry } from './calendar/types'

const WD_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

// Категориальный цвет события недельной полосы (не семантические роли кнопок, а типы записей календаря).
// Пока запись одна (type='global') — различаем по ключевым словам; с моделью проектов подставится настоящий тип.
function eventCat(title: string): { color: string; label: string } {
  const t = title.toLowerCase()
  if (/(проект|съёмк|съемк|монтаж|продакшн)/.test(t)) return { color: ROLE.primary, label: 'Производство' } // фиолетовый
  if (/(знаменк|эфир|трансл|каминк|купол)/.test(t)) return { color: ROLE.info, label: 'Эфир' }             // голубой
  if (/(планёрк|планерк|сбор|ретро|встреч|созвон|митап)/.test(t)) return { color: ROLE.highlight, label: 'Встреча' } // оранжевый
  return { color: ROLE.info, label: 'Событие' }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
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
        <div style={{ flex: '1.4 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <WeekStripCard />
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}><NewsChat /></div>
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 290, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <ProductionMonthCard />
          <WhoWorks onOpenChat={onOpenChat} />
        </div>
      </div>
    </div>
  )
}

// ── Урезанный календарь недели (Пн–Вс): ключевые события компании (общий календарь), read-only.
//    Проекты и люди на них подставятся автоматически с функционалом проектов (сейчас — просмотр). ──
function WeekStripCard() {
  const today = new Date()
  const todayYMD = toYMD(today)
  const ws = getWeekStart(today)
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d })
  const from = toYMD(days[0]), to = toYMD(days[6])
  const { data: entries = [] } = useQuery<ApiCalEntry[]>({
    queryKey: ['calendar-entries', from, to],
    queryFn: () => api.get(`/calendar-entries?from=${from}&to=${to}`).then(r => r.data),
    staleTime: 60_000,
  })
  const byDate = new Map<string, ApiCalEntry[]>()
  for (const e of entries) { if (e.type !== 'global') continue; const k = e.date.slice(0, 10); const arr = byDate.get(k) ?? []; arr.push(e); byDate.set(k, arr) }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, flexShrink: 0 }}>
      {days.map((d, i) => {
        const ds = toYMD(d)
        const isToday = ds === todayYMD
        const weekend = i >= 5
        const items = (byDate.get(ds) ?? []).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
        return (
          // Блок дня — «кирпичик» на переднем плане: поверхность --surface (светлее фона в любой теме), крупнее и выше.
          <div key={ds} style={{
            minHeight: 148, borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 5,
            background: 'var(--surface)',
            border: `1px solid ${isToday ? ROLE.highlight : 'var(--border)'}`,
            boxShadow: isToday ? `0 0 0 1px ${ROLE.highlight}` : '0 1px 2px rgba(0,0,0,0.18)',
            opacity: weekend && !isToday ? 0.75 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? ROLE.highlight : 'var(--text-muted)', letterSpacing: '0.4px' }}>{WD_SHORT[i]}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: isToday ? ROLE.highlight : 'var(--text-1)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{d.getDate()}</span>
            </div>
            {items.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)', opacity: 0.35 }}>—</div>
            ) : items.slice(0, 3).map(e => {
              const cat = eventCat(e.title)
              return (
                // Цветной «кирпичик» события: тон по типу, название переносом (до 2 строк), полный текст — в тултипе.
                <Tooltip key={e.id} text={`${cat.label}: ${e.title}${e.startTime ? ` · ${e.startTime.slice(0, 5)}` : ''}`} width={200} style={{ display: 'block' }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.22,
                    background: cat.color + '26', borderLeft: `3px solid ${cat.color}`, borderRadius: 5, padding: '4px 6px',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{e.title}</div>
                </Tooltip>
              )
            })}
            {items.length > 3 && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>+{items.length - 3}</div>}
          </div>
        )
      })}
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'transparent', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>Новости компании</div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.length === 0 && <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>Пока нет новостей.</div>}
        {ordered.map(p => (
          <div key={p.id} style={{ position: 'relative', alignSelf: 'stretch', background: 'var(--surface)', border: `1px solid ${p.pinned ? 'var(--accent-line, var(--border))' : 'var(--border)'}`, borderRadius: 12, padding: '11px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.16)' }}>
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

  // геометрия доната (крупнее радиусом)
  const SIZE = 128, R = 50, SW = 12, C = SIZE / 2, CIRC = 2 * Math.PI * R
  const dash = monthPct * CIRC

  const stat: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12 }
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', flexShrink: 0 }}>
      {!data ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Донат слева (число дня + месяц) · таблица справа */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
              <svg width={SIZE} height={SIZE}>
                <circle cx={C} cy={C} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={SW} />
                <circle cx={C} cy={C} r={R} fill="none" stroke={ROLE.primary} strokeWidth={SW} strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} transform={`rotate(-90 ${C} ${C})`} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{dayOfMonth}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{MONTHS_GEN[m]}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>нед. {week}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={stat}><span style={{ color: 'var(--text-muted)' }}>Рабочих дней</span><b style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{data.workingDays}</b></div>
              <div style={stat}><span style={{ color: 'var(--text-muted)' }}>Рабочих часов</span><b style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{data.workingHours} ч</b></div>
              <div style={stat}><span style={{ color: 'var(--text-muted)' }}>Выходных / празд.</span><span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{data.weekendDays} / {data.holidays.length}</span></div>
            </div>
          </div>

          {/* Кварталы — 4 блока: пройденные закрашены, текущий по % дней; тултип — месяцы квартала */}
          <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Кварталы</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>до конца {data.quarterDaysLeft} дн ({data.quarterWorkDaysLeft} раб.)</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {quarters.map(qq => (
                <Tooltip key={qq.q} text={`${MONTHS_RU[(qq.q - 1) * 3]} – ${MONTHS_RU[(qq.q - 1) * 3 + 2]}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'help' }}>
                  <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${qq.pct * 100}%`, height: '100%', background: qq.cur ? ROLE.highlight : ROLE.primary, borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: qq.cur ? 800 : 600, color: qq.cur ? ROLE.highlight : qq.pct >= 1 ? 'var(--text-2)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>Q{qq.q}</span>
                </Tooltip>
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
  const [filter, setFilter] = useState<'all' | 'office' | 'remote' | 'sick' | 'vacation' | 'dayoff'>('all')
  const [sel, setSel] = useState<PresenceItem | null>(null)
  const down = useRef(false)

  const ql = q.trim().toLowerCase()
  const list = people
    .filter(m => m.name.toLowerCase().includes(ql))
    .filter(m => filter === 'all' ? true : m.dayType === filter)
  const workingNow = people.filter(m => m.state === 'working').length

  // Фильтр по типу дня (HR-статус). «На проекте» — отдельным блоком позже (с функционалом проектов).
  const chips: Array<[typeof filter, string]> = [['all', 'Все'], ['office', 'Офис'], ['remote', 'Удалёнка'], ['sick', 'Больничный'], ['vacation', 'Отпуск'], ['dayoff', 'Выходной']]

  return (
    <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <Users size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Кто работает сегодня</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#46b884', fontVariantNumeric: 'tabular-nums' }} title="Сейчас в работе">{workingNow}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', marginBottom: 8 }}>
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск сотрудника…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        {chips.map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${filter === v ? 'var(--accent-s)' : 'var(--border)'}`, background: filter === v ? 'rgba(123,97,255,0.14)' : 'none', color: filter === v ? 'var(--accent-s)' : 'var(--text-muted)', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 2px' }}>Никого не найдено</div>}
        {list.map(m => (
          <div key={m.userId} onClick={() => setSel(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'} onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'none'}>
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
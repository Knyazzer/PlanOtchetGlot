import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Users, Search, MessageSquare, Send, X, ChevronLeft, ChevronRight, Plus, Minus, Download, ArrowUp, Target, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { formatName } from '../lib/utils'
import { ROLE } from '../lib/roleColors'
import { Tooltip } from '../components/Tooltip'
import { getWeekStart, toYMD } from './calendar/utils'
import { useConfirm } from '../components/ConfirmModal'
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
interface PresenceItem { userId: string; name: string; position?: string | null; department?: string | null; state: PresenceState; label: string; dayType: string | null; place: string | null }
const STATE_COLOR: Record<PresenceState, string> = { working: '#46b884', finished: '#8a8f98', absent: '#f59e0b', expected: '#6b7280', off: '#5b6068' }

// Единый стиль карточки-секции дашборда (elevation уровня 1). Все сек+блоки одного визуального веса.
const CARD: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 12px 28px -22px rgba(0,0,0,0.6)',
}

// Разбор тела новости: изображения (markdown ![](url) или «голые» url картинок) отделяются от текста.
// Форматирование текста (жирный/курсив «как в телеграме») — задел на будущее; пока текст как есть.
function parsePost(body: string): { text: string; images: string[] } {
  const images: string[] = []
  let text = body.replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, (_m, u) => { images.push(u); return '' })
  text = text.replace(/(https?:\/\/[^\s]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s]*)?)/gi, (_m, u) => { images.push(u); return '' })
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), images }
}

function fmtWhen(iso: string) { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

export function HomePage({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  return (
    <div style={{ padding: '20px 24px', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: '100%', maxWidth: 1500, margin: '0 auto' }}>
        {/* Слева — узкая колонка: сводка месяца + кто сегодня на смене (компактные виджеты) */}
        <div style={{ flex: '1 1 300px', minWidth: 300, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <ProductionMonthCard />
          <CompanyGoalsCard />
          <WhoWorks onOpenChat={onOpenChat} />
        </div>
        {/* Справа — широкая колонка: неделя (7 дней) + лента новостей (первичный контент) */}
        <div style={{ flex: '1.6 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <WeekStripCard />
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}><NewsChat /></div>
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
            background: isToday ? ROLE.highlight + '12' : 'var(--surface)',
            border: `1px solid ${isToday ? ROLE.highlight : 'var(--border)'}`,
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
                // Плашка события: цвет по типу, название переносом (до 2 строк). Клик — открыть в календаре (заглушка).
                <div key={e.id} onClick={() => { /* TODO: открыть событие в календаре */ }} style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.22, cursor: 'pointer',
                  background: cat.color + '26', borderLeft: `3px solid ${cat.color}`, borderRadius: 5, padding: '4px 6px',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{e.title}</div>
              )
            })}
            {items.length > 3 && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>+{items.length - 3}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Новости компании — лента: новые сверху, старые снизу; только текст + изображения; писать по праву.
//    Закрепа и заголовков нет. Форматирование текста (жирный/курсив) — задел на будущее. ─────────────
function NewsChat() {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { data } = useQuery<Feed>({ queryKey: ['posts'], queryFn: () => api.get('/posts').then(r => r.data), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const canPost = data?.canPost ?? false
  const ordered = [...(data?.posts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // новые сверху
  const canEdit = (p: Post) => !!currentUser?.isAdmin || p.author.id === currentUser?.id
  const delMut = useMutation({ mutationFn: (id: string) => api.delete(`/posts/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }) })

  const [body, setBody] = useState('')
  const publish = useMutation({ mutationFn: () => api.post('/posts', { body: body.trim() }), onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['posts'] }) } })
  const { confirm, confirmUI } = useConfirm()

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const [showTop, setShowTop] = useState(false) // кнопка «наверх» появляется при прокрутке вниз

  return (
    <div style={{ ...CARD, position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>Новости компании</div>

      {/* Лента-таймлайн: новости идут потоком вдоль вертикальной линии с узлом-точкой — без плашек-карточек */}
      <div ref={laneRef} onScroll={e => setShowTop((e.currentTarget as HTMLDivElement).scrollTop > 240)}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', background: 'var(--bg)' }}>
        {ordered.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Пока нет новостей.</div>
          : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              {/* вертикальная линия таймлайна */}
              <div style={{ position: 'absolute', left: 6, top: 9, bottom: 9, width: 2, background: 'var(--border)' }} />
              {ordered.map(p => {
                const { text, images } = parsePost(p.body)
                return (
                  <article key={p.id} style={{ position: 'relative', padding: '2px 2px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {/* узел на линии */}
                    <span style={{ position: 'absolute', left: -17, top: 7, width: 9, height: 9, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--border-strong)' }} />
                    {text && <div style={{ fontSize: 14.5, color: 'var(--text-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>}
                    {images.length > 0 && <PostImages images={images} onOpen={i => setLightbox({ images, index: i })} />}
                    {/* Дата — в правом нижнем углу; кнопка удаления (если есть право) — слева */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      {canEdit(p)
                        ? <button onClick={() => confirm({ message: 'Удалить новость?', confirmLabel: 'Удалить', danger: true }).then(ok => ok && delMut.mutate(p.id))} title="Удалить"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><Trash2 size={14} /></button>
                        : <span />}
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtWhen(p.createdAt)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
      </div>

      {/* Кнопка «наверх» — по центру сверху ленты, к самой свежей новости */}
      {showTop && (
        <button onClick={() => laneRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} title="К свежим новостям"
          style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 5, width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.28)' }}>
          <ArrowUp size={17} />
        </button>
      )}

      {canPost && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, background: 'var(--surface)' }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (body.trim()) publish.mutate() } }}
            placeholder="Написать новость…" rows={1}
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', resize: 'none', maxHeight: 120, lineHeight: 1.4 }} />
          <button onClick={() => { if (body.trim()) publish.mutate() }} disabled={!body.trim() || publish.isPending} title="Опубликовать"
            style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: ROLE.primary, color: '#fff', cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Send size={16} /></button>
        </div>
      )}

      {lightbox && <NewsLightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} onIndex={i => setLightbox({ images: lightbox.images, index: i })} />}
      {confirmUI}
    </div>
  )
}

// Галерея новости: 1 картинка — целиком (по пропорции, до 460px высоты, без обрезки);
// 2+ — сетка превью 2 колонки (заполняют ячейку). Клик — открыть в лайтбоксе (просмотр на странице).
function PostImages({ images, onOpen }: { images: string[]; onOpen: (index: number) => void }) {
  const imgBtn: React.CSSProperties = { padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block' }
  if (images.length === 1) {
    return (
      <button type="button" onClick={() => onOpen(0)} style={imgBtn}>
        <img src={images[0]} alt="" loading="lazy"
          onError={e => { e.currentTarget.style.display = 'none' }}
          style={{ maxWidth: '100%', maxHeight: 460, width: 'auto', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 10, border: '1px solid var(--border)' }} />
      </button>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
      {images.map((src, i) => (
        <button type="button" key={i} onClick={() => onOpen(i)}
          style={{ ...imgBtn, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '4 / 3', width: '100%' }}>
          <img src={src} alt="" loading="lazy"
            onError={e => { e.currentTarget.style.display = 'none' }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
      ))}
    </div>
  )
}

// Лайтбокс: просмотр картинок новости на этой же странице — зум (колесо/кнопки/двойной клик),
// пан при увеличении, листание (←/→ и кнопки), Esc/крестик. Закрытие — по правилу попапов
// (и mousedown, и mouseup на самом оверлее).
function NewsLightbox({ images, index, onClose, onIndex }: { images: string[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const overlayDown = useRef(false)
  const src = images[index]
  const many = images.length > 1

  const reset = () => { setScale(1); setTx(0); setTy(0) }
  const go = (d: number) => { const n = index + d; if (n >= 0 && n < images.length) onIndex(n) }
  useEffect(() => { reset() }, [index])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [index, images.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (s: number) => Math.min(8, Math.max(1, s))
  const zoomBy = (f: number) => setScale(s => { const n = clamp(s * f); if (n === 1) { setTx(0); setTy(0) } return n })
  const imgDown = (e: React.MouseEvent) => { e.stopPropagation(); if (scale <= 1) return; drag.current = { x: e.clientX, y: e.clientY, tx, ty } }
  const move = (e: React.MouseEvent) => { if (!drag.current) return; setTx(drag.current.tx + (e.clientX - drag.current.x)); setTy(drag.current.ty + (e.clientY - drag.current.y)) }

  const tb: React.CSSProperties = { height: 32, minWidth: 32, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 13, cursor: 'pointer' }
  const nav: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.4)', color: '#fff', cursor: 'pointer' }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) overlayDown.current = true }}
      onMouseUp={e => { drag.current = null; if (overlayDown.current && e.target === e.currentTarget) onClose(); overlayDown.current = false }}
      onMouseMove={move}
      onWheel={e => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.82)', userSelect: 'none' }}>
      {/* тулбар (клики не закрывают оверлей) */}
      <div onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {many && <span style={{ marginRight: 4, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{index + 1} / {images.length}</span>}
        <button style={tb} onClick={() => zoomBy(1 / 1.3)} title="Уменьшить"><Minus size={16} /></button>
        <button style={tb} onClick={reset} title="Сбросить масштаб">{Math.round(scale * 100)}%</button>
        <button style={tb} onClick={() => zoomBy(1.3)} title="Увеличить"><Plus size={16} /></button>
        <a style={tb} href={src} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Открыть оригинал"><Download size={16} /></a>
        <button style={tb} onClick={onClose} title="Закрыть (Esc)"><X size={16} /></button>
      </div>

      {many && <>
        <button style={{ ...nav, left: 12, opacity: index === 0 ? 0.3 : 1 }} disabled={index === 0} onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onClick={() => go(-1)} title="Предыдущая (←)"><ChevronLeft size={22} /></button>
        <button style={{ ...nav, right: 12, opacity: index === images.length - 1 ? 0.3 : 1 }} disabled={index === images.length - 1} onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onClick={() => go(1)} title="Следующая (→)"><ChevronRight size={22} /></button>
      </>}

      <img src={src} alt="" draggable={false} onMouseDown={imgDown}
        onDoubleClick={e => { e.stopPropagation(); scale > 1 ? reset() : zoomBy(2) }}
        style={{ maxHeight: '90vh', maxWidth: '94vw', borderRadius: 6, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transition: drag.current ? 'none' : 'transform 0.12s ease', cursor: scale > 1 ? 'grab' : 'zoom-in', willChange: 'transform' }} />
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
    <div style={{ ...CARD, padding: '16px', flexShrink: 0 }}>
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

// ── Цели компании — микро-инфоблок (тезисы). Читают все; правит админ. ─────────────────────────
interface Goal { id: string; text: string }
function CompanyGoalsCard() {
  const isAdmin = useAuthStore(s => s.user?.isAdmin)
  const qc = useQueryClient()
  const { data: goals = [] } = useQuery<Goal[]>({ queryKey: ['company-goals'], queryFn: () => api.get('/company-goals').then(r => r.data), staleTime: 300_000 })
  const [edit, setEdit] = useState(false)
  const [detail, setDetail] = useState(false)
  const MAX = 4

  return (
    <div style={{ ...CARD, padding: '14px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: goals.length ? 10 : 0 }}>
        <Target size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Цели компании</span>
        {isAdmin && <button onClick={() => setEdit(true)} title="Изменить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><Pencil size={13} /></button>}
      </div>
      {goals.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>{isAdmin ? 'Задайте цели компании — кнопка ✎' : 'Цели пока не заданы'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {goals.slice(0, MAX).map(g => (
            <div key={g.id} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: ROLE.primary, marginTop: 6, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{g.text}</span>
            </div>
          ))}
          {goals.length > MAX && <button onClick={() => setDetail(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: ROLE.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 0', fontFamily: 'Inter,sans-serif' }}>Ещё {goals.length - MAX} →</button>}
        </div>
      )}
      {detail && <GoalsModal title="Цели компании" onClose={() => setDetail(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {goals.map(g => (
            <div key={g.id} style={{ display: 'flex', gap: 9, fontSize: 14, color: 'var(--text-1)', lineHeight: 1.45 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ROLE.primary, marginTop: 6, flexShrink: 0 }} />
              <span style={{ whiteSpace: 'pre-wrap' }}>{g.text}</span>
            </div>
          ))}
        </div>
      </GoalsModal>}
      {edit && <EditGoalsModal goals={goals} onClose={() => setEdit(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['company-goals'] })} />}
    </div>
  )
}

// Обёртка-модал (по правилу попапов, без блюра)
function GoalsModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const down = useRef(false)
  return (
    <div onMouseDown={e => { down.current = e.target === e.currentTarget }} onMouseUp={e => { if (down.current && e.target === e.currentTarget) onClose(); down.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EditGoalsModal({ goals, onClose, onSaved }: { goals: Goal[]; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(goals.map(g => g.text).join('\n'))
  const save = useMutation({
    mutationFn: () => api.put('/company-goals', { goals: text.split('\n').map(s => s.trim()).filter(Boolean) }),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; alert(err?.response?.data?.error ?? 'Не удалось сохранить') },
  })
  return (
    <GoalsModal title="Цели компании — редактирование" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Одна цель — одна строка.</div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
        placeholder={'Выйти на 1000+ пользователей\nЗапустить 3 новых продукта\n…'}
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Отмена</button>
        <button onClick={() => save.mutate()} disabled={save.isPending} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: ROLE.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{save.isPending ? '…' : 'Сохранить'}</button>
      </div>
    </GoalsModal>
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
    .filter(m => filter === 'all' ? true : (m.dayType === filter || m.place === filter))
  const workingNow = people.filter(m => m.state === 'working').length

  // Фильтр по типу дня (HR-статус). «На проекте» — отдельным блоком позже (с функционалом проектов).
  const chips: Array<[typeof filter, string]> = [['all', 'Все'], ['office', 'Офис'], ['remote', 'Удалёнка'], ['sick', 'Больничный'], ['vacation', 'Отпуск'], ['dayoff', 'Отгул']]

  return (
    <div style={{ ...CARD, padding: '14px 16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--tile)'} onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'none'}>
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
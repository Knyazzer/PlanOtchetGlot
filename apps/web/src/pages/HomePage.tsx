import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pin, Trash2, Users, Target, Search, MessageSquare, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { formatName } from '../lib/utils'

interface Post { id: string; title: string; body: string; pinned: boolean; createdAt: string; author: { id: string; name: string } }
interface Feed { posts: Post[]; canPost: boolean }
interface Member { id: string; name: string }
type Presence = 'office' | 'remote'
const PRESENCE_LABEL: Record<Presence, string> = { office: 'Офис', remote: 'Удалёнка' }

function fmtWhen(iso: string) { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
// присутствие пока превью (детерминированно из id) — заменится реальным по графику HR/статусам
function presenceOf(id: string): Presence { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return h % 3 === 0 ? 'remote' : 'office' }

export function HomePage({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  return (
    <div style={{ padding: '20px 24px', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: '100%', maxWidth: 1120, margin: '0 auto', flexWrap: 'wrap' }}>
        <div style={{ flex: '1.4 1 440px', minWidth: 0, display: 'flex', minHeight: 0 }}>
          <NewsChat />
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 290, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflowY: 'auto' }}>
          <WhoWorks onOpenChat={onOpenChat} />
          <DeptTasks />
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
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>Новости компании</div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.length === 0 && <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>Пока нет новостей.</div>}
        {ordered.map(p => (
          <div key={p.id} style={{ position: 'relative', alignSelf: 'stretch', background: 'var(--surface-2)', border: `1px solid ${p.pinned ? 'var(--accent-line, var(--border))' : 'var(--border)'}`, borderRadius: 12, padding: '11px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {p.pinned && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--accent-s)' }}><Pin size={10} /> Закреплено</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{fmtWhen(p.createdAt)}</span>
              {canEdit(p) && (
                <span style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => pinMut.mutate({ id: p.id, pinned: !p.pinned })} title={p.pinned ? 'Открепить' : 'Закрепить'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.pinned ? 'var(--accent-s)' : 'var(--text-muted)', padding: 2, display: 'flex' }}><Pin size={13} /></button>
                  <button onClick={() => { if (confirm('Удалить новость?')) delMut.mutate(p.id) }} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}><Trash2 size={13} /></button>
                </span>
              )}
            </div>
            {p.title && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{p.title}</div>}
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.body}</div>
          </div>
        ))}
      </div>

      {canPost && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (body.trim()) publish.mutate() } }}
            placeholder="Написать новость…" rows={1}
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', resize: 'none', maxHeight: 120, lineHeight: 1.4 }} />
          <button onClick={() => { if (body.trim()) publish.mutate() }} disabled={!body.trim() || publish.isPending} title="Опубликовать"
            style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Send size={16} /></button>
        </div>
      )}
    </div>
  )
}

// ── Кто работает сегодня — поиск + фильтр присутствия + клик→детализация/написать в чат ─────────
function WhoWorks({ onOpenChat }: { onOpenChat?: (userId: string) => void }) {
  const { data: members = [] } = useQuery<Member[]>({ queryKey: ['users:members'], queryFn: () => api.get('/users/members').then(r => r.data) })
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Presence>('all')
  const [sel, setSel] = useState<Member | null>(null)
  const down = useRef(false)

  const ql = q.trim().toLowerCase()
  const list = members
    .filter(m => m.name.toLowerCase().includes(ql))
    .filter(m => filter === 'all' || presenceOf(m.id) === filter)

  const chips: Array<['all' | Presence, string]> = [['all', 'Все'], ['office', 'Офис'], ['remote', 'Удалёнка']]

  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Users size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Кто работает сегодня</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{list.length}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', marginBottom: 8 }}>
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск сотрудника…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {chips.map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: `1px solid ${filter === v ? 'var(--accent-s)' : 'var(--border)'}`, background: filter === v ? 'rgba(123,97,255,0.14)' : 'none', color: filter === v ? 'var(--accent-s)' : 'var(--text-muted)', fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
        {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 2px' }}>Никого не найдено</div>}
        {list.map(m => (
          <div key={m.id} onClick={() => setSel(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'} onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'none'}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: presenceOf(m.id) === 'remote' ? '#43b2f2' : '#46b884', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(m.name)}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{PRESENCE_LABEL[presenceOf(m.id)]}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>Присутствие — превью; станет по графику HR + отметкам дня.</div>

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
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: presenceOf(sel.id) === 'remote' ? '#43b2f2' : '#46b884' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{PRESENCE_LABEL[presenceOf(sel.id)]} · сейчас</span>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>Детализация рабочего дня — по мере ввода графика/статусов.</div>
            <button onClick={() => { onOpenChat?.(sel.id); setSel(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--accent-soft, var(--surface-3))', color: 'var(--accent-s)', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <MessageSquare size={15} /> Написать в чат
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Стратегические задачи отдела — заглушка (нужна модель целей отдела) ──────────────────────────
function DeptTasks() {
  const dept = useAuthStore(s => s.user)?.access?.departments?.[0]?.name
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Target size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Стратегические задачи отдела</span>
      </div>
      {dept && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>{dept}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', border: '1px dashed var(--border)', borderRadius: 8, padding: '12px 14px' }}>
        Здесь появятся стратегические цели вашего отдела. Нужна модель целей отдела — на следующем этапе.
      </div>
    </div>
  )
}

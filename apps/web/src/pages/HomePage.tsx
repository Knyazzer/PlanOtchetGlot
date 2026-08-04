import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Pin, Trash2, Users, CalendarClock, ListTodo } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { formatName } from '../lib/utils'

interface Post { id: string; title: string; body: string; pinned: boolean; createdAt: string; author: { id: string; name: string } }
interface Feed { posts: Post[]; canPost: boolean }
interface Member { id: string; name: string }
interface Task { id: string; title: string; projectId?: string | null; deadline?: string | null; status: string }

function fmtWhen(iso: string) { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
function fmtDay(iso: string) { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }
function daysLeft(iso: string) { const t = new Date(); t.setHours(0, 0, 0, 0); const d = new Date(iso); d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - t.getTime()) / 86_400_000) }

export function HomePage() {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<Feed>({ queryKey: ['posts'], queryFn: () => api.get('/posts').then(r => r.data), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const posts = data?.posts ?? []
  const canPost = data?.canPost ?? false

  const pinMut = useMutation({ mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.patch(`/posts/${id}`, { pinned }), onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }) })
  const delMut = useMutation({ mutationFn: (id: string) => api.delete(`/posts/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }) })
  const canEdit = (p: Post) => !!currentUser?.isAdmin || p.author.id === currentUser?.id

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Zap size={20} style={{ color: 'var(--accent-s)' }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Пульс</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Новости, кто работает и важные дедлайны компании</div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Лента (главная колонка) ── */}
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          {canPost && <Composer />}
          {isLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Загрузка…</div>}
          {!isLoading && posts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', border: '1px dashed var(--border)', borderRadius: 12 }}>
              Пока нет постов{canPost ? ' — опубликуйте первый.' : '.'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(p => (
              <div key={p.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{formatName(p.author.name).slice(0, 1).toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{formatName(p.author.name)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtWhen(p.createdAt)}</div>
                  </div>
                  {p.pinned && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--accent-s)', background: 'rgba(123,97,255,0.14)', borderRadius: 20, padding: '2px 8px' }}><Pin size={10} /> Закреплено</span>}
                  {canEdit(p) && (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button onClick={() => pinMut.mutate({ id: p.id, pinned: !p.pinned })} title={p.pinned ? 'Открепить' : 'Закрепить'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.pinned ? 'var(--accent-s)' : 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 6 }}><Pin size={15} /></button>
                      <button onClick={() => { if (confirm('Удалить пост?')) delMut.mutate(p.id) }} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 6 }}><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
                {p.title && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{p.title}</div>}
                <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{p.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Правый рельс: блоки компании ── */}
        <div style={{ flex: '1 1 280px', minWidth: 280, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <WhoWorks />
          <Deadlines />
          <GlobalTasks />
        </div>
      </div>
    </div>
  )
}

// ── Каркас блока рельса ──────────────────────────────────────────────────────────
function RailCard({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>{title}</span>
        {count != null && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
      </div>
      {children}
    </div>
  )
}
const emptyRail: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }

// Кто работает сегодня — превью (присутствие пока плейсхолдер, до графика HR/статусов)
function WhoWorks() {
  const { data: members = [] } = useQuery<Member[]>({ queryKey: ['users:members'], queryFn: () => api.get('/users/members').then(r => r.data) })
  return (
    <RailCard icon={<Users size={15} />} title="Кто работает сегодня" count={members.length}>
      {members.length === 0 && <div style={emptyRail}>Нет данных</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {members.slice(0, 30).map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#46b884', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(m.name)}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic' }}>Присутствие — превью; станет по графику HR + отметкам дня.</div>
    </RailCard>
  )
}

function useTeamTasks() {
  return useQuery<Task[]>({ queryKey: ['tasks', 'team'], queryFn: () => api.get('/tasks', { params: { scope: 'team' } }).then(r => r.data) })
}

// Ближайшие дедлайны — задачи со сроком в ближайшие 14 дней
function Deadlines() {
  const { data: tasks = [] } = useTeamTasks()
  const items = tasks
    .filter(t => t.deadline && t.status !== 'done' && daysLeft(t.deadline) <= 14)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .slice(0, 6)
  return (
    <RailCard icon={<CalendarClock size={15} />} title="Ближайшие дедлайны" count={items.length}>
      {items.length === 0 && <div style={emptyRail}>Нет дедлайнов в ближайшие 14 дней</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map(t => {
          const dl = daysLeft(t.deadline!)
          const c = dl < 0 ? '#E8194B' : dl === 0 ? '#FF6B35' : dl <= 2 ? '#F59E0B' : 'var(--text-muted)'
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>{fmtDay(t.deadline!)}</span>
            </div>
          )
        })}
      </div>
    </RailCard>
  )
}

// Глобальные задачи — без привязки к проекту
function GlobalTasks() {
  const { data: tasks = [] } = useTeamTasks()
  const items = tasks.filter(t => !t.projectId && t.status !== 'done').slice(0, 6)
  return (
    <RailCard icon={<ListTodo size={15} />} title="Глобальные задачи" count={items.length}>
      {items.length === 0 && <div style={emptyRail}>Нет задач без проекта</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map(t => (
          <div key={t.id} style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
        ))}
      </div>
    </RailCard>
  )
}

// Редактор поста — для тех, у кого право публиковать (canPost).
function Composer() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const publish = useMutation({ mutationFn: () => api.post('/posts', { title: title.trim(), body: body.trim() }), onSuccess: () => { setTitle(''); setBody(''); qc.invalidateQueries({ queryKey: ['posts'] }) } })
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Заголовок (необязательно)" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Что рассказать команде…" rows={3} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={() => { if (body.trim()) publish.mutate() }} disabled={!body.trim() || publish.isPending} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() ? 1 : 0.5 }}>{publish.isPending ? 'Публикую…' : 'Опубликовать'}</button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Pin, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { formatName } from '../lib/utils'

interface Post {
  id: string; title: string; body: string; pinned: boolean; createdAt: string
  author: { id: string; name: string }
}
interface Feed { posts: Post[]; canPost: boolean }

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function HomePage() {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<Feed>({
    queryKey: ['posts'],
    queryFn: () => api.get('/posts').then(r => r.data),
    refetchInterval: 60_000, refetchIntervalInBackground: false,
  })
  const posts = data?.posts ?? []
  const canPost = data?.canPost ?? false

  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.patch(`/posts/${id}`, { pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })

  const canEdit = (p: Post) => !!currentUser?.isAdmin || p.author.id === currentUser?.id

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760, margin: '0 auto', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Zap size={20} style={{ color: 'var(--accent-s)' }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Пульс</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Новости и объявления компании</div>

      {canPost && <Composer />}

      {isLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Загрузка…</div>}

      {!isLoading && posts.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', border: '1px dashed var(--border)', borderRadius: 12 }}>
          Пока нет постов{canPost ? ' — опубликуйте первый.' : '.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.map(p => (
          <div key={p.id} style={{ background: 'var(--surface-1)', border: `1px solid ${p.pinned ? 'var(--accent-line, var(--border))' : 'var(--border)'}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>
                {formatName(p.author.name).slice(0, 1).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{formatName(p.author.name)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtWhen(p.createdAt)}</div>
              </div>
              {p.pinned && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--accent-s)', background: 'rgba(123,97,255,0.14)', borderRadius: 20, padding: '2px 8px' }}>
                  <Pin size={10} /> Закреплено
                </span>
              )}
              {canEdit(p) && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button onClick={() => pinMut.mutate({ id: p.id, pinned: !p.pinned })} title={p.pinned ? 'Открепить' : 'Закрепить'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.pinned ? 'var(--accent-s)' : 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 6 }}><Pin size={15} /></button>
                  <button onClick={() => { if (confirm('Удалить пост?')) delMut.mutate(p.id) }} title="Удалить"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 6 }}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
            {p.title && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{p.title}</div>}
            <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{p.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Редактор поста — для тех, у кого право публиковать (canPost).
function Composer() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const publish = useMutation({
    mutationFn: () => api.post('/posts', { title: title.trim(), body: body.trim() }),
    onSuccess: () => { setTitle(''); setBody(''); qc.invalidateQueries({ queryKey: ['posts'] }) },
  })
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Заголовок (необязательно)"
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Что рассказать команде…" rows={3}
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={() => { if (body.trim()) publish.mutate() }} disabled={!body.trim() || publish.isPending}
          style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() ? 1 : 0.5 }}>
          {publish.isPending ? 'Публикую…' : 'Опубликовать'}
        </button>
      </div>
    </div>
  )
}

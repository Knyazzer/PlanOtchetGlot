import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { ChatUser } from './types'
import { GROUP_COLORS } from './utils'
import { UserAvatar, GroupAvatar } from './avatars'

// ── Create Group Modal ─────────────────────────────────────────────────────────
export function CreateGroupModal({
  myId, allUsers, onClose, onCreated,
}: {
  myId:      string
  allUsers:  ChatUser[]
  onClose:   () => void
  onCreated: (chatId: string) => void
}) {
  const qc = useQueryClient()
  const [name,        setName]        = useState('')
  const [color,       setColor]       = useState('#3B82F6')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search,      setSearch]      = useState('')

  const filtered = allUsers.filter(u =>
    u.id !== myId && u.name.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/chats/group', { name: name.trim(), color, memberIds: [...selectedIds] }).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['chats'] }); onCreated(data.chatId); onClose() },
  })

  const canCreate = name.trim().length > 0 && selectedIds.size > 0

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)',
    fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ width: 420, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Новая группа</span>
          <button onMouseDown={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Preview + Name */}
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <GroupAvatar name={name || '?'} color={color} size={52} />
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Название группы"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          {/* Color picker */}
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Цвет аватарки</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {GROUP_COLORS.map(c => (
                <div
                  key={c}
                  onMouseDown={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
                    boxShadow: color === c ? `0 0 0 2px var(--surface-1), 0 0 0 4px ${c}` : 'none',
                    transition: 'box-shadow .12s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Members */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Участники {selectedIds.size > 0 && <span style={{ color: 'var(--accent-s)' }}>· {selectedIds.size} выбрано</span>}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              style={{ ...inputStyle, marginBottom: 8 }}
            />
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Ничего не найдено</div>
            )}
            {filtered.map(u => {
              const selected = selectedIds.has(u.id)
              return (
                <div
                  key={u.id}
                  onMouseDown={() => toggle(u.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', cursor: 'pointer', background: selected ? 'rgba(255,107,53,0.08)' : 'transparent', transition: 'background .1s' }}
                  onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = selected ? 'rgba(255,107,53,0.08)' : 'transparent' }}
                >
                  <UserAvatar name={u.name} size={34} />
                  <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1 }}>{formatName(u.name)}</span>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: selected ? 'none' : '2px solid var(--border)',
                    background: selected ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onMouseDown={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer' }}
          >Отмена</button>
          <button
            onMouseDown={() => canCreate && createMutation.mutate()}
            disabled={!canCreate || createMutation.isPending}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: canCreate ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'var(--surface-3)', color: canCreate ? '#fff' : 'var(--text-muted)', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, cursor: canCreate ? 'pointer' : 'default' }}
          >{createMutation.isPending ? 'Создаём...' : 'Создать'}</button>
        </div>
      </div>
    </div>
  )
}

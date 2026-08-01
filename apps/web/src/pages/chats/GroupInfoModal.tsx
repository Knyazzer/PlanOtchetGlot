import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { ChatUser, GroupInfo } from './types'
import { GROUP_COLORS } from './utils'
import { UserAvatar, GroupAvatar } from './avatars'

// ── Group Info Modal ───────────────────────────────────────────────────────────
export function GroupInfoModal({
  chatId, myId, onClose, onDeleted, onMembersChanged,
}: {
  chatId:           string
  myId:             string
  onClose:          () => void
  onDeleted:        () => void
  onMembersChanged: () => void
}) {
  const [showAddSearch, setShowAddSearch] = useState(false)
  const [addSearch,     setAddSearch]     = useState('')
  const [editName,      setEditName]      = useState<string | null>(null)
  const [editColor,     setEditColor]     = useState<string | null>(null)

  const { data: info, isLoading } = useQuery<GroupInfo>({
    queryKey: ['groupMembers', chatId],
    queryFn:  () => api.get(`/chats/${chatId}/members`).then(r => r.data),
  })

  const { data: allUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
    enabled:  showAddSearch,
    staleTime: 60_000,
  })

  const addMutation = useMutation({
    mutationFn: (memberIds: string[]) => api.post(`/chats/${chatId}/members`, { memberIds }),
    onSuccess: () => { onMembersChanged(); setShowAddSearch(false); setAddSearch('') },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/chats/${chatId}/members/${userId}`),
    onSuccess: () => onMembersChanged(),
  })

  const deleteGroupMutation = useMutation({
    mutationFn: () => api.delete(`/chats/${chatId}`),
    onSuccess: () => onDeleted(),
  })

  const updateGroupMutation = useMutation({
    mutationFn: (data: { name?: string; color?: string }) => api.patch(`/chats/${chatId}`, data),
    onSuccess: (_r, vars) => {
      // Sync local edit state so avatar preview stays correct after save
      if (vars.name !== undefined) setEditName(null)
      if (vars.color !== undefined) setEditColor(null)
      onMembersChanged()
    },
  })

  const memberIds = new Set(info?.members.map(m => m.id) ?? [])
  const addCandidates = allUsers.filter(u =>
    u.id !== myId && !memberIds.has(u.id) && u.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ width: 400, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Информация о группе</span>
          <button onMouseDown={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {isLoading || !info ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Avatar + name */}
            <div style={{ padding: '24px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
              <GroupAvatar name={(editName ?? info.name) ?? '?'} color={(editColor ?? info.color) ?? '#666'} size={72} />

              {info.myIsGroupAdmin ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  {/* Editable name */}
                  <input
                    value={editName ?? info.name ?? ''}
                    onChange={e => setEditName(e.target.value)}
                    style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text-1)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontFamily: 'Inter,sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  {/* Color picker */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {GROUP_COLORS.map(c => (
                      <div
                        key={c}
                        onMouseDown={() => setEditColor(c)}
                        style={{
                          width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
                          boxShadow: (editColor ?? info.color) === c ? `0 0 0 2px var(--surface-1), 0 0 0 4px ${c}` : 'none',
                          transition: 'box-shadow .12s',
                        }}
                      />
                    ))}
                  </div>
                  {/* Save button — only if something changed */}
                  {(editName !== null || editColor !== null) && (
                    <button
                      onMouseDown={() => updateGroupMutation.mutate({
                        ...(editName !== null ? { name: editName.trim() } : {}),
                        ...(editColor !== null ? { color: editColor } : {}),
                      })}
                      disabled={updateGroupMutation.isPending || (editName ?? '').trim().length === 0}
                      style={{ padding: '6px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {updateGroupMutation.isPending ? 'Сохраняем...' : 'Сохранить'}
                    </button>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{info.members.length} участн.</div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{info.name ?? 'Группа'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{info.members.length} участн.</div>
                </div>
              )}
            </div>

            {/* Members list */}
            <div style={{ padding: '12px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Участники
              </span>
              {info.myIsGroupAdmin && (
                <button
                  onMouseDown={() => setShowAddSearch(s => !s)}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-s)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                >
                  {showAddSearch ? 'Свернуть' : '+ Добавить'}
                </button>
              )}
            </div>

            {/* Add member search */}
            {showAddSearch && info.myIsGroupAdmin && (
              <div style={{ padding: '0 20px 8px' }}>
                <input
                  autoFocus
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Поиск сотрудника..."
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
                {addCandidates.length === 0 ? (
                  <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Нет подходящих сотрудников</div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                    {addCandidates.map(u => (
                      <div
                        key={u.id}
                        onMouseDown={() => addMutation.mutate([u.id])}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                      >
                        <UserAvatar name={u.name} size={30} />
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{formatName(u.name)}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-s)', fontWeight: 600 }}>Добавить</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Member rows */}
            <div style={{ paddingBottom: 8 }}>
              {info.members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px' }}>
                  <UserAvatar name={m.name} size={36} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{formatName(m.name)}</div>
                    {m.isGroupAdmin && (
                      <span style={{ fontSize: 10, color: '#FF6B35', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>Админ</span>
                    )}
                  </div>
                  {/* Remove button: admin can remove non-admin members that aren't themselves */}
                  {info.myIsGroupAdmin && !m.isGroupAdmin && m.id !== myId && (
                    <button
                      onMouseDown={() => removeMutation.mutate(m.id)}
                      disabled={removeMutation.isPending}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 4 }}
                      title="Удалить из группы"
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Delete group — only for group admins */}
            {info.myIsGroupAdmin && (
              <div style={{ padding: '8px 20px 16px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <button
                  onMouseDown={() => {
                    if (window.confirm('Удалить группу? Это действие нельзя отменить.')) {
                      deleteGroupMutation.mutate()
                    }
                  }}
                  disabled={deleteGroupMutation.isPending}
                  style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid var(--danger)', background: 'none', color: 'var(--danger)', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {deleteGroupMutation.isPending ? 'Удаление...' : 'Удалить группу'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

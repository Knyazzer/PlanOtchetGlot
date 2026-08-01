import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TaskModal } from './TasksPage'
import type { Task } from './TasksPage'
import { formatName } from '../lib/utils'
import type { ChatUser, ChatItem, Message, AttachedTask, ChatsPageProps, Folder, CtxMenu, MsgCtx } from './chats/types'
import { fmtTime, chatName, nameColor, PROJECTS_TREE } from './chats/utils'
import { UserAvatar, GroupAvatar } from './chats/avatars'
import { useChatWS } from './chats/chatWs'
import { GroupInfoModal } from './chats/GroupInfoModal'
import { CreateGroupModal } from './chats/CreateGroupModal'

export { disconnectWS } from './chats/chatWs'

// ── Main component ─────────────────────────────────────────────────────────────
export function ChatsPage({ initialUserId, isSelf, initialTask, compact = false }: ChatsPageProps = {}) {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const myId    = currentUser?.id ?? ''
  const isAdmin = !!(currentUser as any)?.isAdmin

  const [folder,        setFolder]        = useState<Folder>('favorites')
  const [activeChatId,  setActiveChatId]  = useState<string | null>(null)
  const [input,         setInput]         = useState('')
  const [ctxMenu,       setCtxMenu]       = useState<CtxMenu | null>(null)
  const [msgCtx,        setMsgCtx]        = useState<MsgCtx | null>(null)
  const [editingMsg,    setEditingMsg]     = useState<Message | null>(null)
  const [attachedTask,   setAttachedTask]   = useState<AttachedTask | null>(initialTask ?? null)
  const [viewingTaskId,  setViewingTaskId]  = useState<string | null>(null)
  const [groupInfoChatId, setGroupInfoChatId] = useState<string | null>(null)
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set(['РТВ Медиа']))
  const [showNewChat,     setShowNewChat]     = useState(false)
  const [newChatSearch,   setNewChatSearch]   = useState('')
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  const messagesEndRef    = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLTextAreaElement>(null)
  const activeChatIdRef   = useRef<string | null>(null)
  activeChatIdRef.current = activeChatId

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: chats = [] } = useQuery<ChatItem[]>({
    queryKey: ['chats'],
    queryFn:  () => api.get('/chats').then(r => r.data),
  })

  const { data: unread = {} } = useQuery<Record<string, number>>({
    queryKey: ['chats:unread'],
    queryFn:  () => api.get('/chats/unread').then(r => r.data),
    refetchInterval: 10_000,
  })

  const { data: allUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
    enabled:  showNewChat || showCreateGroup,
    staleTime: 60_000,
  })

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', activeChatId],
    queryFn:  () => activeChatId
      ? api.get(`/chats/${activeChatId}/messages`).then(r => r.data)
      : Promise.resolve([]),
    enabled:  !!activeChatId,
    staleTime: 0,
  })

  // ── Инициализация системных чатов при первом входе ───────────────────────────
  useEffect(() => {
    api.post('/chats/self', {}).then(() => qc.invalidateQueries({ queryKey: ['chats'] })).catch(() => {})
    api.post('/chats/support', {}).then(() => qc.invalidateQueries({ queryKey: ['chats'] })).catch(() => {})
  }, [])

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useChatWS(useCallback((event: any) => {
    if (event.type === 'message:new') {
      qc.setQueryData<Message[]>(['messages', event.chatId], (old = []) => {
        // Уже есть реальное сообщение с таким id — пропускаем
        if (old.some(m => m.id === event.message.id)) return old
        // Убираем оптимистичный temp (если onSuccess ещё не успел) и добавляем реальное
        const withoutTemp = old.filter(m => !m.id.startsWith('temp-'))
        return [...withoutTemp, event.message]
      })
      qc.invalidateQueries({ queryKey: ['chats'] })
      // Если этот чат сейчас открыт — сразу помечаем прочитанным
      if (activeChatIdRef.current === event.chatId) {
        api.post(`/chats/${event.chatId}/read`).then(() => {
          qc.invalidateQueries({ queryKey: ['chats:unread'] })
        })
      } else {
        qc.invalidateQueries({ queryKey: ['chats:unread'] })
      }
    }
    if (event.type === 'message:edited') {
      qc.setQueryData<Message[]>(['messages', event.chatId], (old = []) =>
        old.map(m => m.id === event.message.id ? { ...m, ...event.message } : m)
      )
    }
    if (event.type === 'message:deleted') {
      qc.setQueryData<Message[]>(['messages', event.chatId], (old = []) =>
        old.filter(m => m.id !== event.msgId)
      )
    }
    if (event.type === 'chat:read') {
      qc.invalidateQueries({ queryKey: ['chats:unread'] })
      qc.invalidateQueries({ queryKey: ['chats'] })
    }
  }, [qc]))

  // ── Авто-скролл вниз ─────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Пометить прочитанным при открытии чата ───────────────────────────────────
  useEffect(() => {
    if (!activeChatId) return
    api.post(`/chats/${activeChatId}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ['chats:unread'] })
    })
  }, [activeChatId])

  // ── Закрыть меню по клику вовне ──────────────────────────────────────────────
  useEffect(() => {
    if (!ctxMenu && !msgCtx) return
    const handler = () => { setCtxMenu(null); setMsgCtx(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu, msgCtx])

  // ── Mutations ────────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: ({ chatId, text, taskId, taskTitle }: { chatId: string; text: string; taskId?: string; taskTitle?: string }) =>
      api.post(`/chats/${chatId}/messages`, { text, ...(taskId && { taskId }), ...(taskTitle && { taskTitle }) }).then(r => r.data),
    // Оптимистичное добавление: не ждём WS, сразу показываем
    onMutate: ({ chatId, text, taskId, taskTitle }) => {
      const tempMsg: Message = {
        id: `temp-${Date.now()}`,
        text,
        senderId: myId,
        createdAt: new Date().toISOString(),
        editedAt: null,
        replyToId: null,
        isPinned: false,
        sender: { id: myId, name: currentUser?.name ?? '' },
        task: taskId ? attachedTask : null,
        taskTitle: taskTitle ?? null,
      }
      qc.setQueryData<Message[]>(['messages', chatId], old => [...(old ?? []), tempMsg])
      return { tempId: tempMsg.id }
    },
    onSuccess: (msg, { chatId }, ctx) => {
      // Заменяем временное сообщение настоящим (с реальным id/createdAt)
      qc.setQueryData<Message[]>(['messages', chatId], old =>
        old?.map(m => m.id === ctx?.tempId ? msg : m) ?? []
      )
      qc.invalidateQueries({ queryKey: ['chats'] })
    },
    onError: (_e, { chatId }, ctx) => {
      // Откатываем при ошибке
      qc.setQueryData<Message[]>(['messages', chatId], old =>
        old?.filter(m => m.id !== ctx?.tempId) ?? []
      )
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ chatId, msgId, text }: { chatId: string; msgId: string; text: string }) =>
      api.patch(`/chats/${chatId}/messages/${msgId}`, { text }),
    onSuccess: () => setEditingMsg(null),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ chatId, msgId }: { chatId: string; msgId: string }) =>
      api.delete(`/chats/${chatId}/messages/${msgId}`),
    onSuccess: (_d, { chatId, msgId }) => {
      qc.setQueryData<Message[]>(['messages', chatId], old => old?.filter(m => m.id !== msgId) ?? [])
    },
  })

  const memberMutation = useMutation({
    mutationFn: ({ chatId, patch }: { chatId: string; patch: object }) =>
      api.patch(`/chats/${chatId}/member`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chats'] }),
  })

  const openDirectChat = useMutation({
    mutationFn: (userId: string) => api.post(`/chats/direct/${userId}`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      setActiveChatId(data.chatId)
      setFolder('contacts')
    },
  })

  // ── Query для просмотра задачи по клику на карточку ──────────────────────────
  const { data: viewingTask } = useQuery<Task>({
    queryKey: ['task', viewingTaskId],
    queryFn:  () => api.get(`/tasks/${viewingTaskId}`).then(r => r.data),
    enabled:  !!viewingTaskId,
  })

  // ── Открытие чата при навигации из модалки задачи ────────────────────────────
  useEffect(() => {
    if (!initialUserId) return
    if (isSelf) {
      api.post('/chats/self', {}).then(r => {
        setActiveChatId(r.data.chatId)
        setFolder('favorites')
        qc.invalidateQueries({ queryKey: ['chats'] })
      }).catch(() => {})
    } else {
      openDirectChat.mutate(initialUserId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Send / edit ──────────────────────────────────────────────────────────────
  function send() {
    const text = input.trim()
    if (!text || !activeChatId) return
    if (editingMsg) {
      editMutation.mutate({ chatId: activeChatId, msgId: editingMsg.id, text })
    } else {
      sendMutation.mutate({ chatId: activeChatId, text, taskId: attachedTask?.id, taskTitle: attachedTask?.title })
      setAttachedTask(null)
    }
    setInput('')
    setEditingMsg(null)
  }

  // ── Фильтрация по папкам ─────────────────────────────────────────────────────
  const favoriteChats = chats.filter(c =>
    c.type === 'self' || c.type === 'support' || c.isFavorite
  )
  const contactChats  = chats.filter(c => c.type === 'direct')
  const groupChats    = chats.filter(c => c.type === 'group')
  const activeChat    = chats.find(c => c.chatId === activeChatId) ?? null

  // ── Итого непрочитанных по папкам ────────────────────────────────────────────
  function folderUnread(items: ChatItem[]) {
    return items.reduce((s, c) => s + (unread[c.chatId] ?? 0), 0)
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const folderBtn = (active: boolean): React.CSSProperties => ({
    width: 64, height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 4, border: 'none', borderRadius: 0, cursor: 'pointer',
    background: active ? 'rgba(255,107,53,0.12)' : 'transparent',
    borderLeft: active ? '3px solid #FF6B35' : '3px solid transparent',
    color: active ? 'var(--text-1)' : 'var(--text-muted)',
    transition: 'all .15s',
  })

  function ChatRow({ chat }: { chat: ChatItem }) {
    const name     = chatName(chat, myId, isAdmin)
    const isSystem = chat.type === 'self' || chat.type === 'support'
    const active   = activeChatId === chat.chatId
    const uCount   = unread[chat.chatId] ?? 0
    const last     = chat.lastMessage
    const otherName = chat.otherMembers[0]?.name ?? ''

    return (
      <div
        onMouseDown={() => { setActiveChatId(chat.chatId); setAttachedTask(null) }}
        onContextMenu={e => {
          if (isSystem) return
          e.preventDefault()
          const menuH = 90, menuW = 200
          const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX
          const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY
          setCtxMenu({ x, y, chatId: chat.chatId, isFavorite: chat.isFavorite, isPinned: chat.isPinned })
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', borderRadius: 8, margin: '2px 6px',
          background: active ? 'rgba(255,107,53,0.1)' : 'transparent',
          transition: 'background .1s',
        }}
      >
        {/* Avatar */}
        {chat.type === 'self'
          ? <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⭐</div>
          : chat.type === 'support'
            ? <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛠</div>
            : chat.type === 'group'
              ? <GroupAvatar name={chat.name ?? '?'} color={chat.color ?? '#666'} size={42} />
              : <UserAvatar name={otherName} size={42} />
        }

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent-s)' : 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
              {chat.isPinned && <span style={{ marginRight: 4, opacity: .5 }}>📌</span>}
              {name}
            </span>
            {last && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtTime(last.createdAt)}</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
              {last ? (last.senderId === myId ? 'Вы: ' : '') + last.text : ''}
            </span>
            {uCount > 0 && (
              <span style={{ background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>
                {uCount > 99 ? '99+' : uCount}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative', flexDirection: 'column' }} onMouseDown={() => { setCtxMenu(null); setMsgCtx(null) }}>

      {/* Компактные табы папок — всегда видны в sidebar-режиме */}
      {compact && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface-1)', height: 40 }}>
          {([['favorites','⭐'],['contacts','👥'],['groups','#'],['projects','📁']] as const).map(([id, icon]) => (
            <button
              key={id}
              onMouseDown={e => { e.stopPropagation(); setFolder(id); setActiveChatId(null) }}
              style={{ flex: 1, height: 40, border: 'none', borderBottom: folder === id ? '2px solid var(--accent-s)' : '2px solid transparent', background: 'none', color: folder === id ? 'var(--accent-s)' : 'var(--text-3)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
            >{icon}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* Колонка 1: папки */}
      <div style={{ width: 70, flexShrink: 0, borderRight: '1px solid var(--border)', display: compact ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--surface-1)', paddingTop: 8 }}>
        {([
          ['favorites', '⭐', 'Изб',   folderUnread(favoriteChats)],
          ['contacts',  '👥', 'ЛС',    folderUnread(contactChats)],
          ['groups',    '#',  'Стр-ра', folderUnread(groupChats)],
          ['projects',  '📁', 'Пр-ты', 0],
        ] as const).map(([id, icon, label, cnt]) => (
          <div key={id} style={{ position: 'relative', width: '100%' }}>
            <button onClick={() => setFolder(id)} style={folderBtn(folder === id)}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.3px' }}>{label}</span>
            </button>
            {cnt > 0 && (
              <span style={{ position: 'absolute', top: 8, right: 8, background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 4px', pointerEvents: 'none' }}>
                {cnt > 99 ? '99+' : cnt}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Колонка 2: список чатов / дерево проектов */}
      <div style={{ width: compact ? undefined : 270, flex: compact && !activeChatId ? 1 : undefined, flexShrink: 0, borderRight: compact ? 'none' : '1px solid var(--border)', display: compact && !!activeChatId ? 'none' : 'flex', flexDirection: 'column', background: 'var(--surface-1)', overflow: 'hidden' }}>
        <div style={{ padding: compact ? '8px 10px' : '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
            {folder === 'favorites' ? 'Избранное' : folder === 'contacts' ? 'Личные сообщения' : folder === 'groups' ? 'Структура' : 'Проекты'}
          </span>
          {folder === 'contacts' && (
            <button
              onClick={() => setShowNewChat(true)}
              style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              title="Новый чат"
            >+</button>
          )}
          {folder === 'groups' && (
            <button
              onClick={() => setShowCreateGroup(true)}
              style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              title="Новая группа"
            >+</button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {folder === 'favorites' && favoriteChats.map(c => <ChatRow key={c.chatId} chat={c} />)}

          {folder === 'contacts' && (
            contactChats.length === 0
              ? <div style={{ padding: '32px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Нет личных чатов.<br/>Нажмите <b>+</b> чтобы написать коллеге.</div>
              : contactChats.map(c => <ChatRow key={c.chatId} chat={c} />)
          )}

          {folder === 'groups' && (
            groupChats.length === 0
              ? <div style={{ padding: '32px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Нет групп.<br/>Нажмите <b>+</b> чтобы создать.</div>
              : groupChats.map(c => <ChatRow key={c.chatId} chat={c} />)
          )}

          {folder === 'projects' && (
            <div style={{ padding: '8px 0' }}>
              {PROJECTS_TREE.map(({ client, chats: pchats }) => (
                <div key={client}>
                  <div
                    onMouseDown={() => setExpandedClients(s => {
                      const n = new Set(s)
                      n.has(client) ? n.delete(client) : n.add(client)
                      return n
                    })}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform .15s', transform: expandedClients.has(client) ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{client}</span>
                  </div>
                  {expandedClients.has(client) && pchats.map(p => (
                    <div
                      key={p.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 32px', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, borderRadius: 6, margin: '1px 6px' }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                    >
                      <span style={{ fontSize: 14 }}>💬</span> {formatName(p.name)}
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-3)', borderRadius: 4, padding: '1px 5px' }}>скоро</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Колонка 3: переписка */}
      <div style={{ flex: 1, display: compact && !activeChatId ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {!activeChatId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Выберите чат
          </div>
        ) : (
          <>
            {/* Хедер чата */}
            <div style={{ height: 56, flexShrink: 0, padding: '0 12px 0 4px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
              {compact && (
                <button onClick={() => setActiveChatId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 20, padding: '4px 6px', lineHeight: 1, flexShrink: 0 }}>‹</button>
              )}
              {activeChat && (
                <>
                  {activeChat.type === 'self'
                    ? <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⭐</div>
                    : (activeChat.type === 'support' && !isAdmin)
                      ? <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛠</div>
                      : activeChat.type === 'group'
                        ? (
                          <div
                            onMouseDown={() => setGroupInfoChatId(activeChat.chatId)}
                            style={{ cursor: 'pointer', borderRadius: '50%', flexShrink: 0 }}
                            title="Информация о группе"
                          >
                            <GroupAvatar name={activeChat.name ?? '?'} color={activeChat.color ?? '#666'} size={34} />
                          </div>
                        )
                        : <UserAvatar name={activeChat.otherMembers.find(m => m.id !== myId)?.name ?? activeChat.otherMembers[0]?.name ?? ''} size={34} />
                  }
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{chatName(activeChat, myId, isAdmin)}</div>
                    {activeChat.type === 'direct' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>личный чат</div>}
                    {activeChat.type === 'support' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isAdmin ? 'обращение в поддержку' : 'техподдержка'}</div>}
                    {activeChat.type === 'group' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeChat.otherMembers.length + 1} участн.</div>}
                  </div>
                </>
              )}
            </div>

            {/* Сообщения */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messages.map((msg, i) => {
                const mine      = msg.senderId === myId
                const prevMsg   = messages[i - 1]
                const showName  = !mine && msg.senderId !== prevMsg?.senderId
                // В self-чате всегда прочитано (один участник — я сам)
                // В остальных — только когда собеседник открыл чат
                const isRead = activeChat?.type === 'self'
                  ? true
                  : !!(activeChat?.otherLastReadAt &&
                      new Date(msg.createdAt) <= new Date(activeChat.otherLastReadAt))

                const nextMsg = messages[i + 1]
                const isLast = mine && (nextMsg?.senderId !== myId || !nextMsg)

                const isGroupStart = msg.senderId !== prevMsg?.senderId
                const isGroupEnd   = msg.senderId !== nextMsg?.senderId

                return (
                  <div
                    key={msg.id}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginTop: isGroupStart ? 8 : 2, paddingRight: mine ? 4 : 38, paddingLeft: mine ? 38 : 4 }}
                    onContextMenu={e => {
                      e.preventDefault()
                      // Умное позиционирование: flip если не хватает места снизу или справа
                      const menuH = mine ? 100 : 50
                      const menuW = 180
                      const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX
                      const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY
                      setMsgCtx({ x, y, msg, mine })
                    }}
                  >
                    {/* Имя отправителя в группе */}
                    {showName && (
                      <div style={{ marginBottom: 3, marginLeft: 34 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: nameColor(msg.sender.name) }}>{formatName(msg.sender.name)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: mine ? 'row-reverse' : 'row' }}>
                      {/* Аватарка — только у последнего сообщения в группе собеседника */}
                      {!mine && (
                        <div style={{ width: 28, flexShrink: 0, alignSelf: 'flex-end' }}>
                          {isGroupEnd && <UserAvatar name={msg.sender.name} size={28} />}
                        </div>
                      )}
                      <div style={{
                        maxWidth: '78%', padding: '7px 11px',
                        ...(msg.task ? { minWidth: 260 } : {}),
                        background: mine ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'var(--surface-2)',
                        color: mine ? '#fff' : 'var(--text-1)',
                        borderRadius: mine
                          ? `14px 14px ${isGroupEnd ? '2px' : '14px'} 14px`
                          : `${isGroupStart ? '2px' : '14px'} 14px 14px ${isGroupEnd ? '2px' : '14px'}`,
                        fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                      }}>
                        {/* Карточка прикреплённой задачи */}
                        {(msg.task || msg.taskTitle) && (() => {
                          const isDeleted = !msg.task && !!msg.taskTitle
                          const title     = msg.task?.title ?? msg.taskTitle ?? ''
                          return (
                            <div
                              onMouseDown={isDeleted ? undefined : e => { e.stopPropagation(); setViewingTaskId(msg.task!.id) }}
                              style={{
                                display: 'flex', marginBottom: 6, borderRadius: 8, overflow: 'hidden',
                                cursor: isDeleted ? 'default' : 'pointer',
                                minWidth: 240,
                                background: mine ? 'rgba(0,0,0,0.18)' : 'var(--surface-1)',
                                border: `1px solid ${mine ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`,
                                opacity: isDeleted ? 0.6 : 1,
                              }}
                            >
                              <div style={{ width: 4, flexShrink: 0, background: isDeleted ? (mine ? 'rgba(255,255,255,0.3)' : 'var(--text-muted)') : (mine ? 'rgba(255,255,255,0.7)' : '#FF6B35') }} />
                              <div style={{ padding: '8px 10px', flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: mine ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                                  Задача
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: mine ? '#fff' : 'var(--text-1)', lineHeight: 1.3, marginBottom: 4, wordBreak: 'break-word' }}>
                                  {isDeleted ? <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Удалено</span> : title}
                                </div>
                                {!isDeleted && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.4)' : 'var(--text-muted)' }}>◈</span>
                                    <span style={{ fontSize: 11, color: mine ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}>Не выбран</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                        {/* Метаданные float-right — пузырь растягивается под них автоматически */}
                        <span style={{ float: 'right', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 10, marginBottom: -3, marginTop: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {msg.editedAt && <span style={{ fontSize: 10, opacity: .55 }}>ред.</span>}
                          <span style={{ fontSize: 10, opacity: .55 }}>{fmtTime(msg.createdAt)}</span>
                          {mine && (
                            <span style={{ position: 'relative', display: 'inline-flex', width: isRead ? 16 : 9, height: 11, flexShrink: 0 }}>
                              <span style={{ position: 'absolute', right: 0, fontSize: 10, opacity: .85, lineHeight: 1 }}>✓</span>
                              {isRead && <span style={{ position: 'absolute', right: 4, fontSize: 10, opacity: .85, lineHeight: 1 }}>✓</span>}
                            </span>
                          )}
                        </span>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Редактирование — плашка */}
            {editingMsg && (
              <div style={{ padding: '6px 20px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>✏️ Редактирование: {editingMsg.text.slice(0, 60)}{editingMsg.text.length > 60 ? '…' : ''}</span>
                <button onMouseDown={() => { setEditingMsg(null); setInput('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            )}

            {/* Прикреплённая задача — только если этот чат с участником задачи */}
            {attachedTask && !editingMsg && activeChat && (() => {
              if (activeChat.type === 'self') return true
              const taskParticipants = [attachedTask.assigneeId, attachedTask.assignedById]
              return activeChat.otherMembers.some(m => taskParticipants.includes(m.id))
            })() && (
              <div style={{ padding: '8px 16px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Task card */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                  <div style={{ width: 4, flexShrink: 0, background: '#FF6B35' }} />
                  <div style={{ padding: '8px 12px', minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Задача</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{attachedTask.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>◈</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Не выбран</span>
                    </div>
                  </div>
                </div>
                <button onMouseDown={() => setAttachedTask(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1, padding: '4px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                >✕</button>
              </div>
            )}

            {/* Инпут / замороженный баннер */}
            {activeChat?.type === 'direct' && activeChat.otherMembers.some(m => m.isActive === false) ? (
              <div style={{
                padding: '14px 20px', borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Сотрудник больше не работает в компании. Переписка сохранена, отправка сообщений недоступна.
                </span>
              </div>
            ) : (
              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--surface-1)' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Написать сообщение..."
                  rows={1}
                  style={{
                    flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 14px', color: 'var(--text-1)',
                    fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none',
                    resize: 'none', lineHeight: 1.5, overflowY: 'hidden',
                    height: 42,
                  }}
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.overflowY = 'hidden'
                    el.style.height = 'auto'
                    const next = Math.min(el.scrollHeight, 120)
                    el.style.height = next + 'px'
                    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
                  }}
                />
                <button
                  onMouseDown={send}
                  disabled={!input.trim()}
                  style={{
                    width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0,
                    background: input.trim() ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'var(--surface-3)',
                    color: input.trim() ? '#fff' : 'var(--text-muted)',
                    fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, cursor: input.trim() ? 'pointer' : 'default',
                    transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >→</button>
              </div>
            )}
          </>
        )}
      </div>
      </div>{/* end columns wrapper */}

      {/* Context menu — чат */}
      {ctxMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 500,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
            padding: 6, minWidth: 180,
          }}
        >
          {[
            {
              label: ctxMenu.isFavorite ? '★ Убрать из избранного' : '☆ В избранное',
              action: () => memberMutation.mutate({ chatId: ctxMenu.chatId, patch: { isFavorite: !ctxMenu.isFavorite } }),
            },
            {
              label: ctxMenu.isPinned ? '📌 Открепить' : '📌 Закрепить',
              action: () => memberMutation.mutate({ chatId: ctxMenu.chatId, patch: { isPinned: !ctxMenu.isPinned } }),
            },
          ].map(item => (
            <button key={item.label} onMouseDown={() => { item.action(); setCtxMenu(null) }}
              style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderRadius: 6, color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >{item.label}</button>
          ))}
        </div>
      )}

      {/* Context menu — сообщение */}
      {msgCtx && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: msgCtx.x, top: msgCtx.y, zIndex: 500,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
            padding: 6, minWidth: 160,
          }}
        >
          {msgCtx.mine && (
            <button onMouseDown={() => { setEditingMsg(msgCtx.msg); setInput(msgCtx.msg.text); setMsgCtx(null); setTimeout(() => inputRef.current?.focus(), 50) }}
              style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderRadius: 6, color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >✏️ Редактировать</button>
          )}
          {msgCtx.mine && (
            <button onMouseDown={() => { if (activeChatId) deleteMutation.mutate({ chatId: activeChatId, msgId: msgCtx.msg.id }); setMsgCtx(null) }}
              style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderRadius: 6, color: 'var(--danger)', fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >🗑 Удалить</button>
          )}
          {!msgCtx.mine && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Нет действий</div>
          )}
        </div>
      )}

      {/* Модал: новый личный чат */}
      {showNewChat && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={() => { setShowNewChat(false); setNewChatSearch('') }}
        >
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{ width: 360, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,.5)', overflow: 'hidden' }}
          >
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Новое сообщение</span>
              <button onMouseDown={() => { setShowNewChat(false); setNewChatSearch('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                value={newChatSearch}
                onChange={e => setNewChatSearch(e.target.value)}
                placeholder="Поиск коллеги..."
                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {allUsers
                .filter(u => u.id !== myId && u.name.toLowerCase().includes(newChatSearch.toLowerCase()))
                .map(u => (
                  <div
                    key={u.id}
                    onMouseDown={() => {
                      setAttachedTask(null)
                      openDirectChat.mutate(u.id)
                      setShowNewChat(false)
                      setNewChatSearch('')
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                  >
                    <UserAvatar name={u.name} size={36} />
                    <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{formatName(u.name)}</span>
                  </div>
                ))
              }
              {allUsers.filter(u => u.id !== myId && u.name.toLowerCase().includes(newChatSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Ничего не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модал просмотра/редактирования задачи из карточки сообщения */}
      {viewingTask && (
        <TaskModal
          editTask={viewingTask}
          onClose={() => setViewingTaskId(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['tasks'] }); setViewingTaskId(null) }}
        />
      )}

      {/* Модал создания группового чата */}
      {showCreateGroup && (
        <CreateGroupModal
          myId={myId}
          allUsers={allUsers}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(chatId) => {
            qc.invalidateQueries({ queryKey: ['chats'] })
            setActiveChatId(chatId)
            setFolder('groups')
          }}
        />
      )}

      {/* Модал информации о группе */}
      {groupInfoChatId && (
        <GroupInfoModal
          chatId={groupInfoChatId}
          myId={myId}
          onClose={() => setGroupInfoChatId(null)}
          onDeleted={() => {
            if (activeChatId === groupInfoChatId) setActiveChatId(null)
            qc.invalidateQueries({ queryKey: ['chats'] })
            setGroupInfoChatId(null)
          }}
          onMembersChanged={() => {
            qc.invalidateQueries({ queryKey: ['chats'] })
            qc.invalidateQueries({ queryKey: ['groupMembers', groupInfoChatId] })
          }}
        />
      )}
    </div>
  )
}

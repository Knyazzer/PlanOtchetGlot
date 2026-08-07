// ── Types ──────────────────────────────────────────────────────────────────────
export interface ChatUser { id: string; name: string; isActive?: boolean }

export interface LastMessage {
  id: string; text: string; senderId: string; createdAt: string
  editedAt: string | null; deletedAt: string | null
}

export interface ChatItem {
  chatId:          string
  type:            'direct' | 'self' | 'support' | 'project' | 'group'
  name:            string | null
  color:           string | null
  isFavorite:      boolean
  isPinned:        boolean
  lastReadAt:      string | null
  otherLastReadAt: string | null
  otherMembers:    ChatUser[]
  lastMessage:     LastMessage | null
  updatedAt:       string
}

export interface Message {
  id:        string
  text:      string
  senderId:  string
  createdAt: string
  editedAt:  string | null
  replyToId: string | null
  isPinned:  boolean
  sender:    ChatUser
  task?:     { id: string; title: string } | null
  taskTitle?: string | null
}

export interface AttachedTask { id: string; title: string; assigneeId: string; assignedById: string }

export interface ChatsPageProps {
  initialUserId?: string
  initialChatId?: string
  isSelf?: boolean
  initialTask?: AttachedTask
  compact?: boolean
}

export type Folder = 'favorites' | 'contacts' | 'groups' | 'projects'

// ── Context menu ───────────────────────────────────────────────────────────────
export interface CtxMenu { x: number; y: number; chatId: string; isFavorite: boolean; isPinned: boolean }
export interface MsgCtx  { x: number; y: number; msg: Message; mine: boolean }

// ── Group Info Modal ───────────────────────────────────────────────────────────
export interface GroupMember { id: string; name: string; isGroupAdmin: boolean; joinedAt: string }
export interface GroupInfo {
  chatId: string; name: string | null; color: string | null
  myIsGroupAdmin: boolean
  members: GroupMember[]
}
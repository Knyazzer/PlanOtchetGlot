// ── Types ──────────────────────────────────────────────────────────────────
export type CalView = 'month' | 'week' | 'day'
export type EventType = 'meeting' | 'task' | 'personal'
export type EntryType = 'global' | 'znamenka_kaminoka' | 'znamenka_chernaya' | 'znamenka_kupol' | 'hr_sick' | 'hr_vacation' | 'hr_unpaid' | 'hr_dayoff'

export interface ApiEvent {
  id: string; type: string; title: string; description: string
  date: string; startTime: string; endTime: string; location: string[]; status: string
  authorId: string; author: { id: string; name: string }
  participants: Array<{ userId: string; user: { id: string; name: string } }>
}

export interface ApiCalEntry {
  id: string; type: string; title: string; description: string
  date: string; startTime: string | null; endTime: string | null
  isAllDay: boolean; targetUserId: string | null
  targetUser: { id: string; name: string } | null
  createdById: string; createdBy: { id: string; name: string }
}

export interface ApiMember {
  id: string; name: string; position?: string
}

export interface CalEvent {
  id: string; title: string; date: string; start: string; end: string
  color: string; type: string; isAllDay: boolean; source: 'event' | 'entry'
  location?: string[]
}

export interface CatDef { id: string; label: string; color: string }

// ── Modal state ────────────────────────────────────────────────────────────
export interface ModalState {
  open: boolean; editId: string | null; source: 'event' | 'entry'
  type: EventType; date: string; start: string; end: string; title: string
  location: string[]; vyezdAddress: string; participantIds: string[]
  canEdit: boolean
}
export interface EntryModalState {
  open: boolean; editId: string | null
  type: EntryType; date: string; start: string; end: string
  isAllDay: boolean; title: string; targetUserId: string
}

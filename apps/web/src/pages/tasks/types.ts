// ── Types ──────────────────────────────────────────────────────────────────────
export interface TaskLogEntry {
  id:        string
  action:    string
  meta:      Record<string, string | null> | null
  createdAt: string
  user:      { id: string; name: string }
}

export type TaskStatus = 'backlog' | 'inprogress' | 'done'
export type View       = 'kanban' | 'table' | 'gantt'
export type TaskView   = 'mine' | 'sent'

export interface TaskUser { id: string; name: string }

export interface Task {
  id:               string
  title:            string
  description:      string
  status:           TaskStatus
  startDate:        string
  deadline:         string | null
  type:             string
  client:           string | null
  projectId:        string | null
  project:          { id: string; title: string } | null
  divisionId:       string | null
  plannedMinutes:   number | null
  actualMinutes:    number | null
  doneAt:           string | null
  archived:         boolean
  manualOrder:      number | null
  repeatRule:       string | null
  repeatUntil:      string | null
  recurringParentId: string | null
  seenAt:           string | null
  calendarEventId:  string | null
  calendarEventEnd: string | null
  trackId:          string | null
  track:            { id: string; title: string; type: string } | null
  stageId:          string | null
  stage:            { id: string; title: string } | null
  createdAt:        string
  updatedAt:        string
  assignedBy:       TaskUser
  assignee:         TaskUser
}

// ── Task Modal (create + edit) ─────────────────────────────────────────────────
export interface TaskModalProps {
  onClose:            () => void
  onDone:             () => void
  defaultDeadline?:   string
  defaultStartDate?:  string
  defaultTrackId?:    string
  defaultTrackTitle?: string
  defaultStageId?:    string
  editTask?:          Task
  onOpenChatWith?:    (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
}

// ── Task history ──────────────────────────────────────────────────────────────
export interface HistoryGroup {
  action:  string
  entries: TaskLogEntry[]
}

// ── Kanban board ───────────────────────────────────────────────────────────────
export type BoardGroupBy = 'status' | 'client' | 'custom'

export type BoardData = {
  columns: Array<{ id: string; name: string; order: number }>
  placements: Array<{ taskId: string; columnId: string; sort: number }>
}

// ── Calendar event modal (opened from Kanban/Gantt for calendar tasks) ─────────
export interface CalEventData {
  id: string; type: string; title: string; description: string
  date: string; startTime: string; endTime: string; location: string[]; status: string
  authorId: string; author: { id: string; name: string }
  participants: Array<{ userId: string; user: { id: string; name: string } }>
}

// ── Таблица задач (скелет Figma v2 TableView; наполнение — канон) ─────────────
export type SortKey = 'title' | 'status' | 'client' | 'project' | 'type' | 'minutes' | 'startDate' | 'deadline'
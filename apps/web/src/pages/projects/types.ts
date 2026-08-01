// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectStatus  = 'draft' | 'active' | 'done' | 'cancelled'
export type WorkItemStatus = 'request' | 'active' | 'done' | 'rejected' | 'cancelled'
export type ExpenseCategory = 'equipment' | 'transport' | 'fees' | 'postproduction' | 'other'

export interface Client   { id: string; name: string }
export interface UserRef  { id: string; name: string }
export interface DivisionRef { id: string; name: string; department: { id: string; name: string; color: string } }
export interface WIDepartment { division: DivisionRef }

export interface Project {
  id: string; title: string; status: ProjectStatus; brief?: string; kpLink?: string
  client?: Client; producer?: UserRef
  _count: { workItems: number }
  createdAt: string; updatedAt: string
}

export interface WorkItem {
  id: string; title: string; description?: string; status: WorkItemStatus
  date?: string; format?: string; location?: string; budget?: string | null
  execProducer?: UserRef; lineProducer?: UserRef; accountManager?: UserRef
  departments: WIDepartment[]
  _count: { tracks: number; expenses: number }
  project?: { id: string; title: string; client?: Client }
  createdAt: string; updatedAt: string
}

export interface TrackSummary {
  id: string; title: string; status: string; workItemId: string | null
  leader: UserRef
  tasks: { status: string }[]
  stages: { tasks: { status: string }[] }[]
}

export interface WorkItemDetail extends WorkItem {
  project: { id: string; title: string }
  tracks: TrackSummary[]
  expenses: Expense[]
}

export interface Expense {
  id: string; amount: string; category: ExpenseCategory; description: string; date?: string
  createdBy: UserRef; createdAt: string; updatedAt: string
}

export interface Department { id: string; name: string; color: string; divisions: DivisionRef[] }

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectsSubPage = 'registry' | 'workflow'

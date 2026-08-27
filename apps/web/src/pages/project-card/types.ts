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
  createdAt: string
}

export interface WorkItem {
  id: string; title: string; description?: string; status: WorkItemStatus
  date?: string; format?: string; location?: string; budget?: string | null
  execProducer?: UserRef; lineProducer?: UserRef; accountManager?: UserRef
  departments: WIDepartment[]
  _count: { tracks: number; expenses: number }
  createdAt: string
}

export interface Expense {
  id: string; amount: string; category: ExpenseCategory; description: string; date?: string
  createdBy: UserRef
}

export interface WorkItemDetail extends WorkItem {
  tracks: { id: string; title: string; status: string; tasks: { status: string }[]; stages: { tasks: { status: string }[] }[] }[]
  expenses: Expense[]
}

export interface Department {
  id: string; name: string; color: string
  divisions: DivisionRef[]
}

export type CardTab = 'info' | 'structure' | 'finance' | 'team' | 'roadmap'
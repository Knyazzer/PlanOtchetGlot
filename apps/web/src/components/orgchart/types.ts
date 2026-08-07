// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgUser {
  id: string
  name: string
  tabNumber: string | null
  position?: string | null
}

export interface Membership {
  userId: string
  divId: string
  position: string
  user: OrgUser
}

export interface Division {
  id: string
  name: string
  deptId: string
  headId: string | null
  head: OrgUser | null
  memberships: Membership[]
}

export interface Department {
  id: string
  name: string
  color: string
  directorId: string | null
  director: OrgUser | null
  divisions: Division[]
}

export type ProfileData = { id: string; name: string; position: string | null; status: string | null }

export type ModalState =
  | { type: 'editDept'; dept: Department }
  | { type: 'addDept' }
  | { type: 'addDiv'; deptId: string }
  | { type: 'editDiv'; div: Division }
  | { type: 'addMember'; divId: string }
  | { type: 'editMember'; membership: Membership }
  | null

export interface SheetUser {
  id: string; name: string; department: string | null; subDept: string | null; position: string | null; tabNumber: string | null
}

export interface SheetsDeptCol {
  name: string; color: string
  subs: { name: string; members: { name: string; position: string }[] }[]
}
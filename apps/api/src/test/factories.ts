/**
 * Test data factories. Each factory creates a real DB record and returns it.
 * Call the matching cleanup function in afterEach/afterAll to keep tests isolated.
 */
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@tv-shifts/db'

export const TEST_PASSWORD = 'testpassword123'

interface CreateUserOptions {
  email?: string
  fullName?: string
  role?: string   // creates an AppRole + UserAppRole so auth tests still work
  password?: string
  isActive?: boolean
}

export async function createTestUser(options: CreateUserOptions = {}) {
  const email    = options.email    ?? `test-${randomUUID()}@test.invalid`
  const password = options.password ?? TEST_PASSWORD
  const hash     = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      email,
      fullName:     options.fullName ?? 'Test User',
      passwordHash: hash,
      isActive:     options.isActive ?? true,
    },
  })

  if (options.role) {
    const appRole = await prisma.appRole.upsert({
      where:  { name: options.role },
      update: {},
      create: { name: options.role },
    })
    await prisma.userAppRole.upsert({
      where:  { userId_roleId: { userId: user.id, roleId: appRole.id } },
      update: {},
      create: { userId: user.id, roleId: appRole.id },
    })
  }

  return user
}

export async function cleanupTestUser(id: string) {
  // Удаляем связанные записи до удаления пользователя (FK constraints)
  await prisma.shiftEntry.deleteMany({ where: { userId: id } }).catch(() => {})
  await prisma.taskAssignment.deleteMany({ where: { userId: id } }).catch(() => {})
  await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {})
  await prisma.monthlySummary.deleteMany({ where: { userId: id } }).catch(() => {})
  // user_notification_reads удалится каскадно при удалении user (onDelete: Cascade)
  await prisma.user.delete({ where: { id } }).catch(() => {})
}

// ─── WorkItem ──────────────────────────────────────────────────────────────────

interface CreateWorkItemOptions {
  name?: string
  status?: 'draft' | 'active' | 'done' | 'cancelled' | 'rejected'
  date?: Date | null
}

export async function createTestWorkItem(options: CreateWorkItemOptions = {}) {
  return prisma.workItem.create({
    data: {
      name:   options.name   ?? `Test Project ${randomUUID().slice(0, 8)}`,
      status: (options.status ?? 'draft') as any,
      source: 'manual' as any,
      date:   options.date !== undefined ? options.date : null,
    },
  })
}

export async function cleanupTestWorkItem(id: string) {
  await prisma.workItem.delete({ where: { id } }).catch(() => {})
}

// ─── ProjectAssignment ────────────────────────────────────────────────────────

interface CreateAssignmentOptions {
  projectId: string
  userId?: string | null
}

export async function createTestAssignment(options: CreateAssignmentOptions) {
  return prisma.projectAssignment.create({
    data: {
      projectId:      options.projectId,
      userId:         options.userId ?? null,
      employmentType: 'staff',
    },
  })
}

// ─── ShiftEntry ───────────────────────────────────────────────────────────────

interface CreateShiftEntryOptions {
  assignmentId: string
  userId: string
  projectId: string
  date: Date
  shiftType?: 'zastroyka' | 'efir' | 'demontazh'
  confirmed?: boolean
}

export async function createTestShiftEntry(options: CreateShiftEntryOptions) {
  return prisma.shiftEntry.create({
    data: {
      assignmentId: options.assignmentId,
      userId:       options.userId,
      projectId:    options.projectId,
      date:         options.date,
      shiftType:    (options.shiftType ?? 'efir') as any,
      confirmed:    options.confirmed ?? false,
      source:       'manual' as any,
    },
  })
}

// ─── MonthlySummary ───────────────────────────────────────────────────────────

interface CreateMonthlySummaryOptions {
  userId: string
  year: number
  month: number
  workingDays?: number
  threshold?: number
  totalShifts?: number
  overtimeShifts?: number
  vacationDays?: number
}

export async function createTestMonthlySummary(options: CreateMonthlySummaryOptions) {
  const workingDays   = options.workingDays   ?? 22
  const threshold     = options.threshold     ?? 16
  const totalShifts   = options.totalShifts   ?? 0
  const overtimeShifts = options.overtimeShifts ?? Math.max(0, totalShifts - threshold)
  return prisma.monthlySummary.create({
    data: {
      userId:        options.userId,
      year:          options.year,
      month:         options.month,
      workingDays,
      threshold,
      totalShifts,
      overtimeShifts: options.overtimeShifts ?? overtimeShifts,
      vacationDays:  options.vacationDays ?? 0,
    },
  })
}

/**
 * Test data factories. Each factory creates a real DB record and returns it.
 * Call the matching cleanup function in afterEach/afterAll to keep tests isolated.
 */
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@tv-shifts/db'
import type { Role } from '@tv-shifts/db'

export const TEST_PASSWORD = 'testpassword123'

interface CreateUserOptions {
  email?: string
  fullName?: string
  role?: Role
  password?: string
  isActive?: boolean
}

export async function createTestUser(options: CreateUserOptions = {}) {
  const email    = options.email    ?? `test-${randomUUID()}@test.invalid`
  const password = options.password ?? TEST_PASSWORD
  const hash     = await bcrypt.hash(password, 10)

  return prisma.user.create({
    data: {
      email,
      fullName:     options.fullName ?? 'Test User',
      passwordHash: hash,
      role:         options.role     ?? 'employee',
      isActive:     options.isActive ?? true,
    },
  })
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

// ─── StatusRow ─────────────────────────────────────────────────────────────────

interface CreateStatusRowOptions {
  name?: string
  status?: 'request' | 'negotiation' | 'preproduction' | 'production' | 'postproduction' | 'delivered' | 'rejected' | 'cancelled' | 'manual'
  date?: Date | null
}

export async function createTestStatusRow(options: CreateStatusRowOptions = {}) {
  return prisma.statusRow.create({
    data: {
      name:   options.name   ?? `Test Project ${randomUUID().slice(0, 8)}`,
      status: (options.status ?? 'request') as any,
      source: 'manual' as any,
      date:   options.date !== undefined ? options.date : null,
    },
  })
}

export async function cleanupTestStatusRow(id: string) {
  // ShiftEntry → onDelete: Cascade через ProjectAssignment
  // ProjectDay → onDelete: Cascade через StatusRow
  await prisma.statusRow.delete({ where: { id } }).catch(() => {})
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

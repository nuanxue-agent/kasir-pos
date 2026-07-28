import { describe, it, expect } from 'vitest'
import {
  calcCompletionPct,
  calcDueDate,
  isTaskOverdue,
  getOverdueTasks,
  applyTemplateToRecord,
  type OnboardingTask,
} from '@/components/hr/OnboardingClient'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const START_DATE = '2024-01-01T00:00:00.000Z'

function makeTask(overrides: Partial<OnboardingTask> = {}): OnboardingTask {
  return {
    name: 'Test Task',
    description: 'A test task',
    dueInDays: 5,
    completed: false,
    completedAt: null,
    ...overrides,
  }
}

// ─── 1. Task completion tracking ─────────────────────────────────────────────

describe('Task completion tracking', () => {
  it('returns 0% when no tasks are completed', () => {
    const tasks = [makeTask(), makeTask(), makeTask()]
    expect(calcCompletionPct(tasks)).toBe(0)
  })

  it('returns 100% when all tasks are completed', () => {
    const tasks = [
      makeTask({ completed: true, completedAt: '2024-01-02T00:00:00.000Z' }),
      makeTask({ completed: true, completedAt: '2024-01-03T00:00:00.000Z' }),
    ]
    expect(calcCompletionPct(tasks)).toBe(100)
  })

  it('returns 0% for empty task list', () => {
    expect(calcCompletionPct([])).toBe(0)
  })
})

// ─── 2. Completion percentage ─────────────────────────────────────────────────

describe('Completion percentage', () => {
  it('calculates partial completion correctly', () => {
    const tasks = [
      makeTask({ completed: true }),
      makeTask({ completed: true }),
      makeTask({ completed: false }),
      makeTask({ completed: false }),
    ]
    expect(calcCompletionPct(tasks)).toBe(50)
  })

  it('rounds to nearest integer', () => {
    const tasks = [
      makeTask({ completed: true }),
      makeTask({ completed: false }),
      makeTask({ completed: false }),
    ]
    // 1/3 = 33.33... → rounds to 33
    expect(calcCompletionPct(tasks)).toBe(33)
  })
})

// ─── 3. Due date calculation ──────────────────────────────────────────────────

describe('Due date calculation', () => {
  it('calculates due date correctly for dueInDays=5', () => {
    const due = calcDueDate(START_DATE, 5)
    expect(due.toISOString().slice(0, 10)).toBe('2024-01-06')
  })

  it('returns start date for dueInDays=0 (same day)', () => {
    const due = calcDueDate(START_DATE, 0)
    expect(due.toISOString().slice(0, 10)).toBe('2024-01-01')
  })

  it('handles negative dueInDays (before start date, e.g. handover tasks)', () => {
    const due = calcDueDate(START_DATE, -3)
    expect(due.toISOString().slice(0, 10)).toBe('2023-12-29')
  })
})

// ─── 4. Overdue task detection ────────────────────────────────────────────────

describe('Overdue task detection', () => {
  it('detects an overdue incomplete task', () => {
    const task = makeTask({ dueInDays: 1, completed: false })
    // now = 2024-01-05, due = 2024-01-02
    const now = new Date('2024-01-05T00:00:00.000Z')
    expect(isTaskOverdue(task, START_DATE, now)).toBe(true)
  })

  it('completed tasks are never overdue', () => {
    const task = makeTask({ dueInDays: 1, completed: true, completedAt: '2024-01-10T00:00:00.000Z' })
    const now = new Date('2024-06-01T00:00:00.000Z')
    expect(isTaskOverdue(task, START_DATE, now)).toBe(false)
  })

  it('task not yet due is not overdue', () => {
    const task = makeTask({ dueInDays: 30, completed: false })
    const now = new Date('2024-01-05T00:00:00.000Z') // only 4 days in
    expect(isTaskOverdue(task, START_DATE, now)).toBe(false)
  })

  it('getOverdueTasks returns only overdue incomplete tasks', () => {
    const now = new Date('2024-01-15T00:00:00.000Z')
    const tasks = [
      makeTask({ name: 'T1', dueInDays: 1, completed: false }),   // overdue
      makeTask({ name: 'T2', dueInDays: 1, completed: true }),    // done, not overdue
      makeTask({ name: 'T3', dueInDays: 30, completed: false }),  // not yet due
      makeTask({ name: 'T4', dueInDays: 5, completed: false }),   // overdue
    ]
    const overdue = getOverdueTasks(tasks, START_DATE, now)
    expect(overdue).toHaveLength(2)
    expect(overdue.map(t => t.name)).toEqual(['T1', 'T4'])
  })
})

// ─── 5. Template application ──────────────────────────────────────────────────

describe('Template application', () => {
  const templateTasks = [
    { name: 'Kontrak', description: 'Isi kontrak', dueInDays: 1 },
    { name: 'Orientasi', description: 'Pengenalan tim', dueInDays: 3 },
    { name: 'Training', description: 'Pelatihan sistem', dueInDays: 7 },
  ]

  it('converts template tasks to onboarding tasks with completed=false', () => {
    const result = applyTemplateToRecord(templateTasks)
    expect(result).toHaveLength(3)
    result.forEach(t => {
      expect(t.completed).toBe(false)
      expect(t.completedAt).toBeNull()
    })
  })

  it('preserves task names and dueInDays from template', () => {
    const result = applyTemplateToRecord(templateTasks)
    expect(result[0].name).toBe('Kontrak')
    expect(result[1].dueInDays).toBe(3)
    expect(result[2].name).toBe('Training')
  })

  it('returns empty array for empty template', () => {
    expect(applyTemplateToRecord([])).toEqual([])
  })
})

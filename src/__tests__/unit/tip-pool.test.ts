import { describe, it, expect } from 'vitest'
import {
  calcEqualSplit,
  calcHoursSplit,
  calcRoleWeightSplit,
  distributeAmounts,
  type EmployeeInput,
} from '@/app/api/tip-pools/[id]/distribute/route'

const makeEmployees = (overrides: Partial<EmployeeInput>[] = []): EmployeeInput[] =>
  overrides.map((o, i) => ({
    employeeId: `emp${i + 1}`,
    role: 'STAFF',
    hoursWorked: 8,
    ...o,
  }))

describe('Tip Pool Distribution', () => {
  // ── Equal split ──────────────────────────────────────────────────────────

  describe('Equal split', () => {
    it('should split total evenly among all employees', () => {
      const emps = makeEmployees([{}, {}, {}])
      const amounts = calcEqualSplit(300000, emps)
      expect(amounts).toHaveLength(3)
      expect(amounts[0]).toBeCloseTo(100000, 1)
      expect(amounts[1]).toBeCloseTo(100000, 1)
      expect(amounts[2]).toBeCloseTo(100000, 1)
    })

    it('should assign full amount to sole employee', () => {
      const emps = makeEmployees([{}])
      const amounts = calcEqualSplit(50000, emps)
      expect(amounts).toHaveLength(1)
      expect(amounts[0]).toBeCloseTo(50000, 1)
    })

    it('should distribute total (equal) matching totalTips within rounding', () => {
      const emps = makeEmployees([{}, {}, {}])
      const total = 100000
      const amounts = calcEqualSplit(total, emps)
      const sum = amounts.reduce((s, a) => s + a, 0)
      expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.02)
    })

    it('should return empty array for empty employee list', () => {
      expect(calcEqualSplit(100000, [])).toEqual([])
    })
  })

  // ── Hours-based distribution ─────────────────────────────────────────────

  describe('Hours-based distribution', () => {
    it('should distribute proportionally by hours worked', () => {
      const emps = makeEmployees([
        { hoursWorked: 8 },
        { hoursWorked: 4 },
      ])
      const amounts = calcHoursSplit(120000, emps)
      expect(amounts).toHaveLength(2)
      // 8/12 = 2/3 → 80000, 4/12 = 1/3 → 40000
      expect(amounts[0]).toBeCloseTo(80000, 0)
      expect(amounts[1]).toBeCloseTo(40000, 0)
    })

    it('should fall back to equal split when all hours are zero', () => {
      const emps = makeEmployees([{ hoursWorked: 0 }, { hoursWorked: 0 }])
      const amounts = calcHoursSplit(100000, emps)
      expect(amounts[0]).toBeCloseTo(50000, 0)
      expect(amounts[1]).toBeCloseTo(50000, 0)
    })

    it('should distribute total (hours) matching totalTips within rounding', () => {
      const emps = makeEmployees([{ hoursWorked: 5 }, { hoursWorked: 3 }, { hoursWorked: 7 }])
      const total = 150000
      const amounts = calcHoursSplit(total, emps)
      const sum = amounts.reduce((s, a) => s + a, 0)
      expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.02)
    })
  })

  // ── Role-weighted distribution ───────────────────────────────────────────

  describe('Role-weighted distribution', () => {
    it('should give MANAGER more than STAFF', () => {
      const emps = makeEmployees([{ role: 'MANAGER' }, { role: 'STAFF' }])
      const amounts = calcRoleWeightSplit(100000, emps)
      expect(amounts[0]).toBeGreaterThan(amounts[1])
    })

    it('should weight MANAGER(2.0) SENIOR(1.5) STAFF(1.0) TRAINEE(0.5) correctly', () => {
      const emps = makeEmployees([
        { role: 'MANAGER' },   // 2.0
        { role: 'TRAINEE' },   // 0.5
      ])
      // total weight = 2.5; manager share = 2/2.5 = 0.8
      const amounts = calcRoleWeightSplit(50000, emps)
      expect(amounts[0]).toBeCloseTo(40000, 0)
      expect(amounts[1]).toBeCloseTo(10000, 0)
    })

    it('should distribute total (role-weight) matching totalTips within rounding', () => {
      const emps = makeEmployees([
        { role: 'MANAGER' },
        { role: 'SENIOR' },
        { role: 'STAFF' },
        { role: 'TRAINEE' },
      ])
      const total = 200000
      const amounts = calcRoleWeightSplit(total, emps)
      const sum = amounts.reduce((s, a) => s + a, 0)
      expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.02)
    })
  })

  // ── distributeAmounts dispatcher ─────────────────────────────────────────

  describe('distributeAmounts dispatcher', () => {
    it('should dispatch EQUAL method correctly', () => {
      const emps = makeEmployees([{}, {}])
      const amounts = distributeAmounts(100000, 'EQUAL', emps)
      expect(amounts[0]).toBeCloseTo(50000, 0)
      expect(amounts[1]).toBeCloseTo(50000, 0)
    })

    it('should dispatch HOURS method correctly', () => {
      const emps = makeEmployees([{ hoursWorked: 6 }, { hoursWorked: 2 }])
      const amounts = distributeAmounts(80000, 'HOURS', emps)
      expect(amounts[0]).toBeCloseTo(60000, 0)
      expect(amounts[1]).toBeCloseTo(20000, 0)
    })
  })

  // ── Pool closure validation ───────────────────────────────────────────────

  describe('Pool closure validation', () => {
    it('should confirm distribution totals match before close (within tolerance)', () => {
      const totalTips = 100000
      const emps = makeEmployees([{}, {}, {}])
      const amounts = calcEqualSplit(totalTips, emps)
      const sum = amounts.reduce((s, a) => s + a, 0)
      // Tolerance is 0.02 per route logic
      expect(Math.abs(sum - totalTips)).toBeLessThanOrEqual(0.02)
    })

    it('should detect when distribution total diverges from totalTips', () => {
      const totalTips = 100000
      const wrongAmounts = [60000, 30000] // sums to 90000, not 100000
      const sum = wrongAmounts.reduce((s, a) => s + a, 0)
      expect(Math.abs(sum - totalTips)).toBeGreaterThan(0.02)
    })
  })
})

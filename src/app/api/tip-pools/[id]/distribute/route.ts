// POST /api/tip-pools/[id]/distribute
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type DistributionMethod = 'EQUAL' | 'HOURS' | 'ROLE_WEIGHT'

export interface EmployeeInput {
  employeeId: string
  role: string
  hoursWorked: number
}

const ROLE_WEIGHTS: Record<string, number> = {
  MANAGER: 2.0,
  SENIOR: 1.5,
  STAFF: 1.0,
  TRAINEE: 0.5,
}

export function calcEqualSplit(totalTips: number, employees: EmployeeInput[]): number[] {
  if (employees.length === 0) return []
  const share = totalTips / employees.length
  // Distribute remainder to avoid floating point drift
  const base = Math.floor(share * 100) / 100
  const remainder = totalTips - base * employees.length
  return employees.map((_, i) => (i === 0 ? Math.round((base + remainder) * 100) / 100 : base))
}

export function calcHoursSplit(totalTips: number, employees: EmployeeInput[]): number[] {
  if (employees.length === 0) return []
  const totalHours = employees.reduce((s, e) => s + e.hoursWorked, 0)
  if (totalHours === 0) return calcEqualSplit(totalTips, employees)
  const amounts = employees.map(e => Math.floor((e.hoursWorked / totalHours) * totalTips * 100) / 100)
  const distributed = amounts.reduce((s, a) => s + a, 0)
  const remainder = Math.round((totalTips - distributed) * 100) / 100
  amounts[0] = Math.round((amounts[0] + remainder) * 100) / 100
  return amounts
}

export function calcRoleWeightSplit(totalTips: number, employees: EmployeeInput[]): number[] {
  if (employees.length === 0) return []
  const weights = employees.map(e => ROLE_WEIGHTS[e.role.toUpperCase()] ?? 1.0)
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight === 0) return calcEqualSplit(totalTips, employees)
  const amounts = weights.map(w => Math.floor((w / totalWeight) * totalTips * 100) / 100)
  const distributed = amounts.reduce((s, a) => s + a, 0)
  const remainder = Math.round((totalTips - distributed) * 100) / 100
  amounts[0] = Math.round((amounts[0] + remainder) * 100) / 100
  return amounts
}

export function distributeAmounts(
  totalTips: number,
  method: DistributionMethod,
  employees: EmployeeInput[]
): number[] {
  switch (method) {
    case 'EQUAL': return calcEqualSplit(totalTips, employees)
    case 'HOURS': return calcHoursSplit(totalTips, employees)
    case 'ROLE_WEIGHT': return calcRoleWeightSplit(totalTips, employees)
    default: return calcEqualSplit(totalTips, employees)
  }
}

// POST /api/tip-pools/[id]/distribute?storeId=
// Body: { method: 'EQUAL'|'HOURS'|'ROLE_WEIGHT', employees: [{ employeeId, role, hoursWorked }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const { id } = await params
    await ensureTables()

    const pool = await queryOne<{ id: string; storeId: string; totalTips: number; status: string }>(
      `SELECT id, storeId, totalTips, status FROM TipPool WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!pool) return err('Tip pool not found', 404)
    if (pool.status === 'CLOSED') return err('Cannot distribute from a closed tip pool')

    const b = (await req.json()) as any
    const method: DistributionMethod = b.method ?? 'EQUAL'
    if (!['EQUAL', 'HOURS', 'ROLE_WEIGHT'].includes(method)) {
      return err("method must be 'EQUAL', 'HOURS', or 'ROLE_WEIGHT'")
    }

    const employees: EmployeeInput[] = b.employees ?? []
    if (!Array.isArray(employees) || employees.length === 0) {
      return err('employees array is required and must not be empty')
    }
    for (const e of employees) {
      if (!e.employeeId) return err('Each employee must have an employeeId')
      if (!e.role) return err('Each employee must have a role')
      if (typeof e.hoursWorked !== 'number' || e.hoursWorked < 0) {
        return err('Each employee must have a non-negative hoursWorked')
      }
    }

    const amounts = distributeAmounts(pool.totalTips, method, employees)

    // Validate total equals pool totalTips (within rounding tolerance)
    const distribTotal = amounts.reduce((s, a) => s + a, 0)
    if (Math.abs(distribTotal - pool.totalTips) > 0.02) {
      return err(`Distribution total ${distribTotal} does not match pool totalTips ${pool.totalTips}`)
    }

    // Remove previous distributions for this pool
    await exec(`DELETE FROM TipDistribution WHERE poolId = ?`, [id])

    const now = nowISO()
    for (let i = 0; i < employees.length; i++) {
      const distId = newId()
      const emp = employees[i]
      await exec(
        `INSERT INTO TipDistribution (id, poolId, employeeId, storeId, amount, role, hoursWorked, distributedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [distId, id, emp.employeeId, storeId, amounts[i], emp.role, emp.hoursWorked, now]
      )
    }

    const distributions = await query(
      `SELECT * FROM TipDistribution WHERE poolId = ? ORDER BY amount DESC`,
      [id]
    )
    return ok({ distributions }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

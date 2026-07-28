import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureOrgPositionTable } from '../org-positions/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgNode {
  id: string
  storeId: string
  employeeId: string | null
  managerId: string | null
  title: string
  department: string
  level: number
  active: number
  employeeName: string | null
  employeeRole: string | null
  salary: number | null
  children: OrgNode[]
  spanOfControl: number
}

export interface DeptSummary {
  department: string
  headcount: number
  avgSalary: number
  openPositions: number
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

export function buildOrgTree(flat: any[]): OrgNode[] {
  const map = new Map<string, OrgNode>()

  for (const row of flat) {
    map.set(row.id, {
      id: row.id,
      storeId: row.storeId,
      employeeId: row.employeeId ?? null,
      managerId: row.managerId ?? null,
      title: row.title,
      department: row.department ?? '',
      level: Number(row.level ?? 0),
      active: Number(row.active ?? 1),
      employeeName: row.employeeName ?? null,
      employeeRole: row.employeeRole ?? null,
      salary: row.salary != null ? Number(row.salary) : null,
      children: [],
      spanOfControl: 0,
    })
  }

  const roots: OrgNode[] = []

  for (const node of map.values()) {
    if (node.managerId && map.has(node.managerId)) {
      map.get(node.managerId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Compute span of control (recursive)
  function computeSpan(node: OrgNode): void {
    node.spanOfControl = node.children.length
    for (const child of node.children) computeSpan(child)
  }
  for (const root of roots) computeSpan(root)

  return roots
}

export function buildDeptSummary(flat: any[]): DeptSummary[] {
  const deptMap = new Map<string, { salaries: number[]; open: number }>()

  for (const row of flat) {
    const dept = row.department ?? 'Umum'
    if (!deptMap.has(dept)) deptMap.set(dept, { salaries: [], open: 0 })
    const entry = deptMap.get(dept)!
    if (row.employeeId) {
      entry.salaries.push(row.salary != null ? Number(row.salary) : 0)
    } else {
      entry.open += 1
    }
  }

  return Array.from(deptMap.entries()).map(([department, d]) => ({
    department,
    headcount: d.salaries.length,
    avgSalary: d.salaries.length > 0 ? Math.round(d.salaries.reduce((s, v) => s + v, 0) / d.salaries.length) : 0,
    openPositions: d.open,
  }))
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureOrgPositionTable()

  const rows = await query(
    `SELECT op.*,
            e.name       AS employeeName,
            e.role       AS employeeRole,
            e.baseSalary AS salary
     FROM OrgPosition op
     LEFT JOIN Employee e ON op.employeeId = e.id
     WHERE op.storeId = ? AND op.active = 1
     ORDER BY op.level ASC, op.department ASC`,
    [storeId],
  )

  const flat = rows as any[]
  const tree = buildOrgTree(flat)
  const deptSummary = buildDeptSummary(flat)

  return NextResponse.json({ tree, deptSummary, total: flat.length })
}

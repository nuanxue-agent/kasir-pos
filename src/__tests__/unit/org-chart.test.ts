import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatPosition {
  id: string
  storeId: string
  employeeId: string | null
  managerId: string | null
  title: string
  department: string
  level: number
  active: number
  employeeName: string | null
  salary: number | null
}

interface OrgNode extends FlatPosition {
  children: OrgNode[]
  spanOfControl: number
}

interface DeptSummary {
  department: string
  headcount: number
  avgSalary: number
  openPositions: number
}

// ─── Pure functions (mirrors org-chart/route.ts logic) ────────────────────────

function buildOrgTree(flat: FlatPosition[]): OrgNode[] {
  const map = new Map<string, OrgNode>()

  for (const row of flat) {
    map.set(row.id, { ...row, children: [], spanOfControl: 0 })
  }

  const roots: OrgNode[] = []

  for (const node of map.values()) {
    if (node.managerId && map.has(node.managerId)) {
      map.get(node.managerId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function computeSpan(node: OrgNode): void {
    node.spanOfControl = node.children.length
    for (const child of node.children) computeSpan(child)
  }
  for (const root of roots) computeSpan(root)

  return roots
}

function calcSpanOfControl(nodes: OrgNode[]): Map<string, number> {
  const result = new Map<string, number>()
  function walk(node: OrgNode) {
    result.set(node.id, node.children.length)
    for (const child of node.children) walk(child)
  }
  for (const root of nodes) walk(root)
  return result
}

function calcDepthLevels(flat: FlatPosition[]): Map<string, number> {
  const parentMap = new Map<string, string | null>()
  for (const row of flat) parentMap.set(row.id, row.managerId)

  function depthOf(id: string, visited = new Set<string>()): number {
    if (visited.has(id)) return -1 // circular
    visited.add(id)
    const parent = parentMap.get(id)
    if (!parent || !parentMap.has(parent)) return 0
    const parentDepth = depthOf(parent, visited)
    if (parentDepth === -1) return -1
    return parentDepth + 1
  }

  const result = new Map<string, number>()
  for (const id of parentMap.keys()) result.set(id, depthOf(id))
  return result
}

function hasCircularReference(flat: FlatPosition[]): boolean {
  const parentMap = new Map<string, string | null>()
  for (const row of flat) parentMap.set(row.id, row.managerId)

  function hasCycle(id: string, visited = new Set<string>()): boolean {
    if (visited.has(id)) return true
    visited.add(id)
    const parent = parentMap.get(id)
    if (!parent || !parentMap.has(parent)) return false
    return hasCycle(parent, visited)
  }

  for (const id of parentMap.keys()) {
    if (hasCycle(id)) return true
  }
  return false
}

function buildDeptSummary(flat: FlatPosition[]): DeptSummary[] {
  const deptMap = new Map<string, { salaries: number[]; open: number }>()

  for (const row of flat) {
    const dept = row.department || 'Umum'
    if (!deptMap.has(dept)) deptMap.set(dept, { salaries: [], open: 0 })
    const entry = deptMap.get(dept)!
    if (row.employeeId) {
      entry.salaries.push(row.salary ?? 0)
    } else {
      entry.open += 1
    }
  }

  return Array.from(deptMap.entries()).map(([department, d]) => ({
    department,
    headcount: d.salaries.length,
    avgSalary:
      d.salaries.length > 0
        ? Math.round(d.salaries.reduce((s, v) => s + v, 0) / d.salaries.length)
        : 0,
    openPositions: d.open,
  }))
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePos(overrides: Partial<FlatPosition> & { id: string }): FlatPosition {
  return {
    storeId: 'store-1',
    employeeId: null,
    managerId: null,
    title: 'Staff',
    department: 'Operasional',
    level: 0,
    active: 1,
    employeeName: null,
    salary: null,
    ...overrides,
  }
}

const ceo    = makePos({ id: 'p1', title: 'CEO',    level: 0, managerId: null,  employeeId: 'e1', salary: 20_000_000 })
const coo    = makePos({ id: 'p2', title: 'COO',    level: 1, managerId: 'p1',  employeeId: 'e2', salary: 15_000_000 })
const cfo    = makePos({ id: 'p3', title: 'CFO',    level: 1, managerId: 'p1',  employeeId: 'e3', salary: 15_000_000, department: 'Keuangan' })
const mgr1   = makePos({ id: 'p4', title: 'Manajer Ops', level: 2, managerId: 'p2', employeeId: 'e4', salary: 10_000_000 })
const staff1 = makePos({ id: 'p5', title: 'Staff Ops 1', level: 3, managerId: 'p4', employeeId: null, salary: null })
const staff2 = makePos({ id: 'p6', title: 'Staff Ops 2', level: 3, managerId: 'p4', employeeId: 'e5', salary: 5_000_000 })

const flatList = [ceo, coo, cfo, mgr1, staff1, staff2]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Org Chart — buildOrgTree', () => {
  it('builds a tree from a flat list with a single root', () => {
    const tree = buildOrgTree(flatList)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('p1')
  })

  it('attaches direct children correctly', () => {
    const tree = buildOrgTree(flatList)
    const root = tree[0]
    expect(root.children).toHaveLength(2)
    const childIds = root.children.map((c) => c.id).sort()
    expect(childIds).toEqual(['p2', 'p3'])
  })

  it('builds a multi-level hierarchy', () => {
    const tree = buildOrgTree(flatList)
    const coo = tree[0].children.find((c) => c.id === 'p2')!
    expect(coo.children).toHaveLength(1)
    expect(coo.children[0].id).toBe('p4')
    expect(coo.children[0].children).toHaveLength(2)
  })

  it('treats dangling managerId as root node', () => {
    const orphan = makePos({ id: 'px', title: 'Orphan', managerId: 'nonexistent' })
    const tree = buildOrgTree([ceo, orphan])
    expect(tree).toHaveLength(2)
    const ids = tree.map((n) => n.id).sort()
    expect(ids).toContain('px')
  })

  it('handles an empty flat list', () => {
    expect(buildOrgTree([])).toEqual([])
  })
})

describe('Org Chart — spanOfControl', () => {
  it('calculates direct reports for each manager', () => {
    const tree = buildOrgTree(flatList)
    const spans = calcSpanOfControl(tree)
    expect(spans.get('p1')).toBe(2) // CEO → COO, CFO
    expect(spans.get('p2')).toBe(1) // COO → Mgr1
    expect(spans.get('p4')).toBe(2) // Mgr1 → Staff1, Staff2
    expect(spans.get('p5')).toBe(0) // leaf
  })

  it('returns 0 span for leaf nodes', () => {
    const tree = buildOrgTree([ceo])
    const spans = calcSpanOfControl(tree)
    expect(spans.get('p1')).toBe(0)
  })
})

describe('Org Chart — depthLevel', () => {
  it('assigns depth 0 to root nodes', () => {
    const depths = calcDepthLevels(flatList)
    expect(depths.get('p1')).toBe(0)
  })

  it('assigns correct depth to nested nodes', () => {
    const depths = calcDepthLevels(flatList)
    expect(depths.get('p2')).toBe(1)
    expect(depths.get('p4')).toBe(2)
    expect(depths.get('p5')).toBe(3)
  })
})

describe('Org Chart — circularReference', () => {
  it('returns false for a valid tree', () => {
    expect(hasCircularReference(flatList)).toBe(false)
  })

  it('detects a direct self-reference', () => {
    const selfRef = makePos({ id: 'px', managerId: 'px' })
    expect(hasCircularReference([selfRef])).toBe(true)
  })

  it('detects a two-node cycle', () => {
    const a = makePos({ id: 'a', managerId: 'b' })
    const b = makePos({ id: 'b', managerId: 'a' })
    expect(hasCircularReference([a, b])).toBe(true)
  })
})

describe('Org Chart — deptSummary', () => {
  it('aggregates headcount per department', () => {
    const summary = buildDeptSummary(flatList)
    const ops = summary.find((d) => d.department === 'Operasional')!
    // p1(CEO), p2(COO), p4(Mgr), p6(Staff2) have employeeId in Operasional; p5 is open
    expect(ops.headcount).toBe(4)
    expect(ops.openPositions).toBe(1)
  })

  it('calculates average salary correctly', () => {
    const summary = buildDeptSummary(flatList)
    const finance = summary.find((d) => d.department === 'Keuangan')!
    expect(finance.avgSalary).toBe(15_000_000)
    expect(finance.headcount).toBe(1)
    expect(finance.openPositions).toBe(0)
  })

  it('counts open positions (no employeeId) separately', () => {
    const summary = buildDeptSummary(flatList)
    const ops = summary.find((d) => d.department === 'Operasional')!
    expect(ops.openPositions).toBe(1) // staff1 has no employeeId
  })
})

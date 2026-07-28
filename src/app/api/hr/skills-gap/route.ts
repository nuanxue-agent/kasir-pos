import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureSkillsTables } from '../skills/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ─── Pure business logic (exported for unit tests) ─────────────────────────────

export const PROFICIENCY_RANK: Record<string, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  EXPERT: 4,
}

export function compareProficiency(actual: string, required: string): number {
  return (PROFICIENCY_RANK[actual] ?? 0) - (PROFICIENCY_RANK[required] ?? 0)
}

export function isSkillExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < now
}

export interface SkillGapItem {
  skillId: string
  skillName: string
  category: string
  requiredProficiency: string
  actualProficiency: string | null
  gap: number          // negative = below required, 0 = met, positive = exceeds
  expired: boolean
  missing: boolean     // employee has no record at all
}

export function calcSkillsGap(
  requirements: Array<{ skillId: string; skillName: string; category: string; requiredProficiency: string }>,
  employeeSkills: Array<{ skillId: string; proficiency: string; expiresAt: string | null }>,
): SkillGapItem[] {
  return requirements.map(req => {
    const found = employeeSkills.find(es => es.skillId === req.skillId)
    if (!found) {
      return {
        skillId: req.skillId,
        skillName: req.skillName,
        category: req.category,
        requiredProficiency: req.requiredProficiency,
        actualProficiency: null,
        gap: -(PROFICIENCY_RANK[req.requiredProficiency] ?? 1),
        expired: false,
        missing: true,
      }
    }
    const expired = isSkillExpired(found.expiresAt)
    return {
      skillId: req.skillId,
      skillName: req.skillName,
      category: req.category,
      requiredProficiency: req.requiredProficiency,
      actualProficiency: found.proficiency,
      gap: expired ? -(PROFICIENCY_RANK[req.requiredProficiency] ?? 1) : compareProficiency(found.proficiency, req.requiredProficiency),
      expired,
      missing: false,
    }
  })
}

export function calcCoveragePercent(gapItems: SkillGapItem[]): number {
  if (gapItems.length === 0) return 100
  const met = gapItems.filter(g => !g.missing && !g.expired && g.gap >= 0).length
  return Math.round((met / gapItems.length) * 100)
}

export function aggregateTeamSkills(
  allEmployeeSkills: Array<{ employeeId: string; skillId: string; proficiency: string; expiresAt: string | null }>,
): Record<string, { count: number; maxProficiency: string; proficiencyBreakdown: Record<string, number> }> {
  const result: Record<string, { count: number; maxProficiency: string; proficiencyBreakdown: Record<string, number> }> = {}
  for (const es of allEmployeeSkills) {
    if (isSkillExpired(es.expiresAt)) continue
    if (!result[es.skillId]) {
      result[es.skillId] = { count: 0, maxProficiency: 'BEGINNER', proficiencyBreakdown: {} }
    }
    const entry = result[es.skillId]
    entry.count++
    entry.proficiencyBreakdown[es.proficiency] = (entry.proficiencyBreakdown[es.proficiency] ?? 0) + 1
    if ((PROFICIENCY_RANK[es.proficiency] ?? 0) > (PROFICIENCY_RANK[entry.maxProficiency] ?? 0)) {
      entry.maxProficiency = es.proficiency
    }
  }
  return result
}

// ─── API handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await ensureSkillsTables()
    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const role = req.nextUrl.searchParams.get('role')
    const employeeId = req.nextUrl.searchParams.get('employeeId')

    // Get role requirements
    const reqRows = role
      ? await query(
          `SELECT rsr.*, s.name as skillName, s.category as category
           FROM RoleSkillRequirement rsr
           JOIN Skill s ON rsr.skillId = s.id
           WHERE rsr.storeId = ? AND rsr.role = ?`,
          [storeId, role],
        )
      : await query(
          `SELECT rsr.*, s.name as skillName, s.category as category
           FROM RoleSkillRequirement rsr
           JOIN Skill s ON rsr.skillId = s.id
           WHERE rsr.storeId = ?`,
          [storeId],
        )

    if (!employeeId) {
      // Return all role requirements without gap analysis
      return NextResponse.json({ requirements: reqRows, gaps: null, coveragePercent: null })
    }

    // Get employee skills
    const empSkillRows = await query(
      `SELECT skillId, proficiency, expiresAt FROM EmployeeSkill WHERE storeId = ? AND employeeId = ?`,
      [storeId, employeeId],
    )

    const reqs = (reqRows as any[]).map(r => ({
      skillId: r.skillId,
      skillName: r.skillName,
      category: r.category,
      requiredProficiency: r.requiredProficiency,
    }))

    const empSkills = (empSkillRows as any[]).map(r => ({
      skillId: r.skillId,
      proficiency: r.proficiency,
      expiresAt: r.expiresAt,
    }))

    const gaps = calcSkillsGap(reqs, empSkills)
    const coveragePercent = calcCoveragePercent(gaps)

    return NextResponse.json({ requirements: reqRows, gaps, coveragePercent })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSkillsTables()
    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const b = (await req.json()) as any
    if (!b.role || !b.skillId || !b.requiredProficiency) {
      return err('role, skillId, and requiredProficiency are required')
    }

    const VALID_PROFICIENCY = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']
    if (!VALID_PROFICIENCY.includes(b.requiredProficiency)) {
      return err(`requiredProficiency must be one of ${VALID_PROFICIENCY.join(', ')}`)
    }

    const existing = await query(
      `SELECT id FROM RoleSkillRequirement WHERE storeId = ? AND role = ? AND skillId = ?`,
      [storeId, b.role, b.skillId],
    )
    if (existing.length > 0) return err('Requirement already exists for this role and skill')

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO RoleSkillRequirement (id, storeId, role, skillId, requiredProficiency, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.role, b.skillId, b.requiredProficiency, t, t],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

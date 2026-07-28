import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureBenefitsTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BenefitPlan (
    id                   TEXT PRIMARY KEY,
    storeId              TEXT NOT NULL,
    name                 TEXT NOT NULL,
    type                 TEXT NOT NULL DEFAULT 'OTHER',
    employeeContribution REAL NOT NULL DEFAULT 0,
    employerContribution REAL NOT NULL DEFAULT 0,
    calculationBase      TEXT NOT NULL DEFAULT 'FIXED',
    active               INTEGER NOT NULL DEFAULT 1,
    createdAt            TEXT NOT NULL,
    updatedAt            TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS EmployeeBenefit (
    id          TEXT PRIMARY KEY,
    employeeId  TEXT NOT NULL,
    planId      TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    enrolledAt  TEXT NOT NULL,
    value       REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureBenefitsTables()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const rows = await query(
      `SELECT * FROM BenefitPlan WHERE storeId = ? ORDER BY type ASC, name ASC`,
      [storeId]
    )
    const data = (rows as any[]).map(r => ({ ...r, active: Boolean(r.active) }))
    return NextResponse.json({ data })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureBenefitsTables()
    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')
    if (!b.name) return err("Field 'name' is required")

    const VALID_TYPES = ['BPJS_KESEHATAN', 'BPJS_KETENAGAKERJAAN', 'HEALTH', 'MEAL', 'TRANSPORT', 'OTHER']
    const type = b.type ?? 'OTHER'
    if (!VALID_TYPES.includes(type)) return err(`type must be one of ${VALID_TYPES.join(', ')}`)

    const VALID_BASES = ['FIXED', 'PERCENTAGE_SALARY']
    const calculationBase = b.calculationBase ?? 'FIXED'
    if (!VALID_BASES.includes(calculationBase)) return err(`calculationBase must be FIXED or PERCENTAGE_SALARY`)

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO BenefitPlan (id, storeId, name, type, employeeContribution, employerContribution, calculationBase, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, b.storeId, b.name, type, b.employeeContribution ?? 0, b.employerContribution ?? 0, calculationBase, t, t]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

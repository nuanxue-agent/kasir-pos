import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureBPJSTables } from '../enrollments/route'
import { calcKesehatanContribution, calcKetenagakerjaanContribution, calcBPJSDueDate } from '@/lib/bpjs'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureBPJSTables()

    const period = sp.get('period')
    const status = sp.get('status')
    const enrollmentId = sp.get('enrollmentId')

    let sql = `SELECT c.*, e.employeeId, e.type as bpjsType, emp.name as employeeName
      FROM BPJSContribution c
      LEFT JOIN BPJSEnrollment e ON e.id = c.enrollmentId
      LEFT JOIN Employee emp ON emp.id = e.employeeId
      WHERE c.storeId = ?`
    const params: any[] = [storeId]

    if (period) { sql += ' AND c.period = ?'; params.push(period) }
    if (status) { sql += ' AND c.status = ?'; params.push(status) }
    if (enrollmentId) { sql += ' AND c.enrollmentId = ?'; params.push(enrollmentId) }

    sql += ' ORDER BY c.period DESC, emp.name ASC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureBPJSTables()

    const b = (await req.json()) as any

    // If baseSalary + period provided, auto-calculate for all active enrollments
    if (b.period && b.autoGenerate) {
      const enrollments = (await query(
        `SELECT e.*, emp.baseSalary
         FROM BPJSEnrollment e
         LEFT JOIN Employee emp ON emp.id = e.employeeId
         WHERE e.storeId = ? AND e.status = 'ACTIVE'`,
        [storeId],
      )) as any[]

      const t = nowISO()
      const dueDate = calcBPJSDueDate(b.period)
      const created: string[] = []

      for (const enroll of enrollments) {
        // Skip if already exists for this period
        const existing = (await query(
          `SELECT id FROM BPJSContribution WHERE enrollmentId = ? AND period = ?`,
          [enroll.id, b.period],
        )) as any[]
        if (existing.length > 0) continue

        const salary = Number(enroll.baseSalary ?? 0)
        const breakdown =
          enroll.type === 'KESEHATAN'
            ? calcKesehatanContribution(salary)
            : calcKetenagakerjaanContribution(salary)

        const id = newId()
        await exec(
          `INSERT INTO BPJSContribution
            (id, enrollmentId, storeId, period, employeeContribution, employerContribution, totalContribution, status, dueDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
          [
            id, enroll.id, storeId, b.period,
            breakdown.employeeContribution,
            breakdown.employerContribution,
            breakdown.totalContribution,
            dueDate, t, t,
          ],
        )
        created.push(id)
      }

      return NextResponse.json({ created: created.length, ids: created }, { status: 201 })
    }

    // Manual single contribution entry
    if (!b.enrollmentId) return err('enrollmentId required')
    if (!b.period) return err('period required (YYYY-MM)')
    if (b.employeeContribution == null || b.employerContribution == null) {
      return err('employeeContribution and employerContribution required')
    }

    const empC = Number(b.employeeContribution)
    const erC  = Number(b.employerContribution)
    const dueDate = b.dueDate ?? calcBPJSDueDate(b.period)
    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO BPJSContribution
        (id, enrollmentId, storeId, period, employeeContribution, employerContribution, totalContribution, status, dueDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, b.enrollmentId, storeId, b.period, empC, erC, empC + erC, dueDate, t, t],
    )

    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

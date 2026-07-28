import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureShiftScheduleTables } from '../shift-schedules/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureShiftScheduleTables()

  const status = sp.get('status')

  let sql = `
    SELECT ssr.*,
      er.name AS requesterName,
      et.name AS targetName
    FROM ShiftSwapRequest ssr
    LEFT JOIN Employee er ON er.id = ssr.requesterId
    LEFT JOIN Employee et ON et.id = ssr.targetId
    WHERE ssr.storeId = ?`
  const params: any[] = [storeId]

  if (status) {
    sql += ` AND ssr.status = ?`
    params.push(status)
  }

  sql += ` ORDER BY ssr.requestedAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureShiftScheduleTables()

  const b = (await req.json()) as any
  const { requesterId, targetId, scheduleId, reason = '' } = b

  if (!requesterId || !targetId || !scheduleId) {
    return err('requesterId, targetId, scheduleId are required')
  }

  if (requesterId === targetId) {
    return err('Cannot swap with yourself')
  }

  // Verify the schedule entry exists and belongs to requester
  const schedRows = (await query(
    `SELECT * FROM ShiftSchedule WHERE id = ? AND storeId = ?`,
    [scheduleId, storeId],
  )) as any[]

  if (schedRows.length === 0) {
    return err('Schedule entry not found', 404)
  }

  const sched = schedRows[0]
  if (sched.employeeId !== requesterId) {
    return err('Requester is not assigned to this shift')
  }

  if (['ABSENT', 'SWAPPED'].includes(sched.status)) {
    return err(`Cannot request swap for a shift with status ${sched.status}`)
  }

  // Check for duplicate pending request
  const existing = (await query(
    `SELECT id FROM ShiftSwapRequest WHERE scheduleId = ? AND requesterId = ? AND status = 'PENDING'`,
    [scheduleId, requesterId],
  )) as any[]

  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'A pending swap request already exists for this shift' },
      { status: 409 },
    )
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO ShiftSwapRequest (id, storeId, requesterId, targetId, scheduleId, reason, status, requestedAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, storeId, requesterId, targetId, scheduleId, reason, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}

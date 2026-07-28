import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureNPSTables } from '../../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureNPSTables()
    const { id: surveyId } = await params
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const channel = searchParams.get('channel')
    const from    = searchParams.get('from')
    const to      = searchParams.get('to')

    let sql = `SELECT * FROM NPSResponse WHERE surveyId = ? AND storeId = ?`
    const p: any[] = [surveyId, storeId]

    if (channel) { sql += ' AND channel = ?';       p.push(channel) }
    if (from)    { sql += ' AND respondedAt >= ?';  p.push(from) }
    if (to)      { sql += ' AND respondedAt <= ?';  p.push(to) }
    sql += ' ORDER BY respondedAt DESC'

    const rows = await query(sql, p)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureNPSTables()
    const { id: surveyId } = await params
    const body = await req.json() as any
    const {
      storeId, customerId = null,
      score, comment = null,
      channel = 'IN_APP',
    } = body

    if (!storeId || score === undefined) {
      return err('storeId and score required')
    }

    const scoreNum = Number(score)
    if (!Number.isInteger(scoreNum) || scoreNum < 0 || scoreNum > 10) {
      return err('score must be an integer between 0 and 10')
    }

    const VALID_CHANNELS = ['EMAIL', 'SMS', 'IN_APP']
    if (!VALID_CHANNELS.includes(channel)) {
      return err(`channel must be one of: ${VALID_CHANNELS.join(', ')}`)
    }

    const [survey] = await query(`SELECT * FROM NPSSurvey WHERE id = ?`, [surveyId])
    if (!survey) return err('Survey not found', 404)

    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO NPSResponse (id, surveyId, storeId, customerId, score, comment, channel, respondedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, surveyId, storeId, customerId, scoreNum, comment, channel, now],
    )

    const [row] = await query(`SELECT * FROM NPSResponse WHERE id = ?`, [id])
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

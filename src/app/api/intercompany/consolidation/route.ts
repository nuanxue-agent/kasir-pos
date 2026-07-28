import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureIntercompanyTable } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface EliminationEntry {
  fromStoreId: string
  toStoreId: string
  type: string
  grossAmount: number
  /** Amount eliminated (same as grossAmount for fully-settled, else 0 for pending) */
  eliminatedAmount: number
  netAmount: number
}

export interface ConsolidationReport {
  storeIds: string[]
  totalRevenue: number
  totalEliminations: number
  consolidatedRevenue: number
  eliminationEntries: EliminationEntry[]
  netPositionByStore: Record<string, number>
  generatedAt: string
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    // storeIds can be passed as ?storeId=x&storeId=y or comma-separated ?storeIds=x,y
    const rawIds = sp.getAll('storeId')
    const commaIds = (sp.get('storeIds') ?? '').split(',').filter(Boolean)
    const requestedIds = [...new Set([...rawIds, ...commaIds])]

    // Fall back to all stores the user belongs to
    const userStoreIds: string[] = (user.stores ?? []).map((s: { id: string }) => s.id)
    const storeIds = requestedIds.length
      ? requestedIds.filter(id => userStoreIds.includes(id))
      : userStoreIds

    if (!storeIds.length) return err('No accessible stores found', 403)

    await ensureIntercompanyTable()

    // All CONFIRMED or SETTLED transactions between these stores
    const placeholders = storeIds.map(() => '?').join(',')
    const txRows = await query(
      `SELECT * FROM IntercompanyTransaction
       WHERE fromStoreId IN (${placeholders})
         AND toStoreId   IN (${placeholders})
         AND status IN ('CONFIRMED','SETTLED')
       ORDER BY transactionDate DESC`,
      [...storeIds, ...storeIds],
    ) as any[]

    // Build elimination entries: intercompany transactions net to zero in consolidation
    const eliminationEntries: EliminationEntry[] = txRows.map(tx => ({
      fromStoreId: tx.fromStoreId,
      toStoreId: tx.toStoreId,
      type: tx.type,
      grossAmount: tx.amount,
      eliminatedAmount: tx.amount, // full elimination — both legs cancel
      netAmount: 0,
    }))

    const totalRevenue    = txRows.reduce((sum, tx) => sum + tx.amount, 0)
    const totalEliminations = eliminationEntries.reduce((sum, e) => sum + e.eliminatedAmount, 0)
    const consolidatedRevenue = totalRevenue - totalEliminations

    // Net position per store: positive = net receiver, negative = net payer
    const netPositionByStore: Record<string, number> = {}
    for (const id of storeIds) netPositionByStore[id] = 0
    for (const tx of txRows) {
      netPositionByStore[tx.fromStoreId] = (netPositionByStore[tx.fromStoreId] ?? 0) - tx.amount
      netPositionByStore[tx.toStoreId]   = (netPositionByStore[tx.toStoreId]   ?? 0) + tx.amount
    }

    const report: ConsolidationReport = {
      storeIds,
      totalRevenue,
      totalEliminations,
      consolidatedRevenue,
      eliminationEntries,
      netPositionByStore,
      generatedAt: new Date().toISOString(),
    }

    return ok(report)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

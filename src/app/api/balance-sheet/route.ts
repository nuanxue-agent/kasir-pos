// GET /api/balance-sheet?storeId=xxx&period=2025-01
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTables, BSAccount, BSCategory } from '../bs-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface BSAccountLine {
  accountId: string
  code: string
  name: string
  category: BSCategory
  parentId: string | null
  amount: number
}

export interface BSSection {
  category: BSCategory
  label: string
  accounts: BSAccountLine[]
  total: number
}

export interface BalanceSheetResult {
  period: string
  currentAssets: BSSection
  fixedAssets: BSSection
  totalAssets: number
  currentLiabilities: BSSection
  longTermLiabilities: BSSection
  totalLiabilities: number
  equity: BSSection
  totalEquity: number
  totalLiabilitiesAndEquity: number
  balanced: boolean
}

const CATEGORY_LABELS: Record<BSCategory, string> = {
  CURRENT_ASSET: 'Aset Lancar',
  FIXED_ASSET: 'Aset Tetap',
  CURRENT_LIABILITY: 'Liabilitas Jangka Pendek',
  LONG_TERM_LIABILITY: 'Liabilitas Jangka Panjang',
  EQUITY: 'Ekuitas',
}

function buildBSSection(
  category: BSCategory,
  accounts: BSAccount[],
  entries: { accountId: string; amount: number }[]
): BSSection {
  const catAccounts = accounts.filter(a => a.category === category && a.active === 1)

  const lines: BSAccountLine[] = catAccounts.map(a => ({
    accountId: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    parentId: a.parentId,
    amount: entries
      .filter(e => e.accountId === a.id)
      .reduce((s, e) => s + e.amount, 0),
  }))

  const total = lines.reduce((s, l) => s + l.amount, 0)
  return { category, label: CATEGORY_LABELS[category], accounts: lines, total }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const period = url.searchParams.get('period')
    if (!period) return err('period required (YYYY-MM)')
    if (!/^\d{4}-\d{2}$/.test(period)) return err('period must be YYYY-MM')

    await ensureTables()

    const accounts = await query<BSAccount>(
      `SELECT * FROM BSAccount WHERE storeId = ? ORDER BY category ASC, code ASC`,
      [storeId]
    )
    const entries = await query<{ accountId: string; amount: number }>(
      `SELECT accountId, amount FROM BSEntry WHERE storeId = ? AND period = ?`,
      [storeId, period]
    )

    const accs = accounts as BSAccount[]
    const ents = entries as { accountId: string; amount: number }[]

    const currentAssets = buildBSSection('CURRENT_ASSET', accs, ents)
    const fixedAssets = buildBSSection('FIXED_ASSET', accs, ents)
    const currentLiabilities = buildBSSection('CURRENT_LIABILITY', accs, ents)
    const longTermLiabilities = buildBSSection('LONG_TERM_LIABILITY', accs, ents)
    const equity = buildBSSection('EQUITY', accs, ents)

    const totalAssets = currentAssets.total + fixedAssets.total
    const totalLiabilities = currentLiabilities.total + longTermLiabilities.total
    const totalEquity = equity.total
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

    // Balance check: Assets = Liabilities + Equity (within rounding tolerance)
    const balanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01

    const result: BalanceSheetResult = {
      period,
      currentAssets,
      fixedAssets,
      totalAssets,
      currentLiabilities,
      longTermLiabilities,
      totalLiabilities,
      equity,
      totalEquity,
      totalLiabilitiesAndEquity,
      balanced,
    }

    return ok(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

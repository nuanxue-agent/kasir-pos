import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

// Default chart of accounts used when a store has no CoA set up
const DEFAULT_ACCOUNTS = [
  { code: '1100', name: 'Cash',               type: 'ASSET' },
  { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '4100', name: 'Sales Revenue',       type: 'REVENUE' },
  { code: '5100', name: 'Cost of Goods',       type: 'EXPENSE' },
  { code: '5200', name: 'Operating Expenses',  type: 'EXPENSE' },
]

function codePrefix(code: string): string {
  return code.charAt(0)
}

function typeFromCode(code: string): string {
  switch (codePrefix(code)) {
    case '1': return 'ASSET'
    case '2': return 'LIABILITY'
    case '3': return 'EQUITY'
    case '4': return 'REVENUE'
    case '5': return 'EXPENSE'
    default:  return 'ASSET'
  }
}

/**
 * Ensure default accounts exist for a store that has no CoA entries.
 * Only inserts rows that are missing — safe to call multiple times.
 */
async function ensureDefaultAccounts(storeId: string): Promise<void> {
  for (const acct of DEFAULT_ACCOUNTS) {
    const existing = await queryOne(
      `SELECT id FROM ChartOfAccounts WHERE storeId = ? AND code = ?`,
      [storeId, acct.code]
    )
    if (!existing) {
      await exec(
        `INSERT INTO ChartOfAccounts (id, storeId, code, name, type, balance) VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), storeId, acct.code, acct.name, acct.type, 0]
      )
    }
  }
}

/**
 * Look up a ChartOfAccounts row by code prefix.
 * Falls back to ensuring defaults exist and then retrying once.
 */
async function findAccount(
  storeId: string,
  code: string,
  retried = false
): Promise<{ id: string; code: string; name: string } | null> {
  // Exact code match first
  const exact = await queryOne<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM ChartOfAccounts WHERE storeId = ? AND code = ?`,
    [storeId, code]
  )
  if (exact) return exact

  // Prefix match (e.g. code '5' matches 5xxx accounts)
  const prefix = codePrefix(code)
  const byPrefix = await queryOne<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM ChartOfAccounts WHERE storeId = ? AND code LIKE ? ORDER BY code ASC LIMIT 1`,
    [storeId, `${prefix}%`]
  )
  if (byPrefix) return byPrefix

  // No CoA at all — seed defaults and retry once
  if (!retried) {
    await ensureDefaultAccounts(storeId)
    return findAccount(storeId, code, true)
  }

  return null
}

export interface JournalLine {
  accountCode: string
  debit: number
  credit: number
}

/**
 * Post a journal entry with the given lines.
 * Each line must specify accountCode (e.g. '1100'), debit amount, and credit amount.
 * Exactly one of debit/credit should be non-zero per line.
 *
 * Returns the new JournalEntry id, or null if accounts could not be resolved.
 */
export async function postJournalEntry(
  storeId: string,
  description: string,
  lines: JournalLine[]
): Promise<string | null> {
  try {
    const entryId = newId()
    const t = nowISO()

    // Resolve account IDs up front — bail out if any line can't be matched
    const resolvedLines: Array<{
      accountId: string
      accountCode: string
      debit: number
      credit: number
    }> = []

    for (const line of lines) {
      const account = await findAccount(storeId, line.accountCode)
      if (!account) {
        console.warn(`[accounting] Could not resolve account code ${line.accountCode} for store ${storeId}`)
        return null
      }
      resolvedLines.push({
        accountId: account.id,
        accountCode: account.code,
        debit: line.debit,
        credit: line.credit,
      })
    }

    // Insert JournalEntry
    await exec(
      `INSERT INTO JournalEntry (id, storeId, description, status, createdAt, updatedAt)
       VALUES (?, ?, ?, 'POSTED', ?, ?)`,
      [entryId, storeId, description, t, t]
    )

    // Insert JournalLine rows
    for (const line of resolvedLines) {
      await exec(
        `INSERT INTO JournalLine (id, entryId, accountId, debit, credit, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), entryId, line.accountId, line.debit, line.credit, t]
      )

      // Update running balance on the account:
      // Assets/Expenses increase with debit, decrease with credit
      // Liabilities/Equity/Revenue increase with credit, decrease with debit
      const balanceDelta = line.debit - line.credit
      const adjustedDelta =
        typeFromCode(line.accountCode) === 'ASSET' ||
        typeFromCode(line.accountCode) === 'EXPENSE'
          ? balanceDelta
          : -balanceDelta

      if (adjustedDelta !== 0) {
        await exec(
          `UPDATE ChartOfAccounts SET balance = balance + ? WHERE id = ?`,
          [adjustedDelta, line.accountId]
        )
      }
    }

    return entryId
  } catch (e) {
    // Journal entry is best-effort — log but don't fail the calling operation
    console.error('[accounting] postJournalEntry failed:', e)
    return null
  }
}

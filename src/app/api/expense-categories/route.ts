import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

interface ExpenseCategory {
  id: string
  name: string
  budget: number
  color: string
}

// Expense categories are stored as JSON inside Store.modules field
// under the key "expenseCategories" to avoid schema changes.

async function getCategories(storeId: string): Promise<ExpenseCategory[]> {
  const store = await queryOne<{ modules: string | null }>(
    `SELECT modules FROM Store WHERE id = ?`,
    [storeId]
  )
  if (!store?.modules) return []
  try {
    const parsed = JSON.parse(store.modules) as Record<string, unknown>
    return (parsed.expenseCategories as ExpenseCategory[]) ?? []
  } catch {
    return []
  }
}

async function saveCategories(storeId: string, categories: ExpenseCategory[]): Promise<void> {
  const store = await queryOne<{ modules: string | null }>(
    `SELECT modules FROM Store WHERE id = ?`,
    [storeId]
  )
  let existing: Record<string, unknown> = {}
  if (store?.modules) {
    try { existing = JSON.parse(store.modules) as Record<string, unknown> } catch { /* ignore */ }
  }
  existing.expenseCategories = categories
  await exec(
    `UPDATE Store SET modules = ?, updatedAt = ? WHERE id = ?`,
    [JSON.stringify(existing), nowISO(), storeId]
  )
}

// GET /api/expense-categories?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as { stores?: { id: string }[] }

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const categories = await getCategories(storeId)
    return ok(categories)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/expense-categories?storeId=xxx
// Body: { name: string, budget?: number, color?: string }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as { stores?: { id: string }[] }

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const body = await req.json() as { name?: string; budget?: number; color?: string }
    if (!body.name?.trim()) return err('name is required')

    const categories = await getCategories(storeId)

    // Prevent duplicate names (case-insensitive)
    const duplicate = categories.some(c => c.name.toLowerCase() === body.name!.toLowerCase())
    if (duplicate) return err('Category name already exists')

    const newCat: ExpenseCategory = {
      id: newId(),
      name: body.name.trim(),
      budget: Number(body.budget ?? 0),
      color: body.color ?? '#6b7280',
    }

    await saveCategories(storeId, [...categories, newCat])
    return ok(newCat, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// DELETE /api/expense-categories?storeId=xxx&id=yyy
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as { stores?: { id: string }[] }

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    const catId = url.searchParams.get('id')
    if (!storeId) return err('storeId required')
    if (!catId) return err('id required')

    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const categories = await getCategories(storeId)
    const updated = categories.filter(c => c.id !== catId)
    await saveCategories(storeId, updated)
    return ok({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// GET /api/accounts/tree — returns accounts as a hierarchical tree
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface AccountNode {
  id: string
  storeId: string
  code: string
  name: string
  type: string
  subtype: string | null
  parentId: string | null
  level: number
  active: number
  description: string | null
  isSystem: number
  balance: number
  createdAt: string
  updatedAt: string
  children: AccountNode[]
}

export function buildTree(accounts: AccountNode[]): AccountNode[] {
  const map = new Map<string, AccountNode>()
  for (const a of accounts) {
    map.set(a.id, { ...a, children: [] })
  }
  const roots: AccountNode[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // Sort each level by code
  const sortNodes = (nodes: AccountNode[]): AccountNode[] => {
    nodes.sort((a, b) => a.code.localeCompare(b.code))
    for (const n of nodes) n.children = sortNodes(n.children)
    return nodes
  }
  return sortNodes(roots)
}

// GET /api/accounts/tree?storeId=xxx
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

    await ensureTables()

    const accounts = await query<AccountNode>(
      `SELECT * FROM Account WHERE storeId = ? ORDER BY code ASC`,
      [storeId]
    )

    const tree = buildTree(accounts)
    return ok(tree)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

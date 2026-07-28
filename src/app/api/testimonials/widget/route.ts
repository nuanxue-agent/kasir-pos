import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureTestimonialTables } from '../route'

// Public widget endpoint — no auth required
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId')
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 })
  }

  const theme = sp.get('theme') ?? 'light'
  const max = Math.min(20, Math.max(1, parseInt(sp.get('max') ?? '5', 10)))
  const showRating = sp.get('showRating') !== 'false'

  await ensureTestimonialTables()

  const rows = (await query(
    `SELECT id, customerName, content, rating, source, createdAt
     FROM Testimonial
     WHERE storeId = ? AND status IN ('FEATURED', 'APPROVED')
     ORDER BY CASE status WHEN 'FEATURED' THEN 0 ELSE 1 END, rating DESC, createdAt DESC
     LIMIT ?`,
    [storeId, max],
  )) as any[]

  return NextResponse.json(
    { testimonials: rows, theme, showRating },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    },
  )
}

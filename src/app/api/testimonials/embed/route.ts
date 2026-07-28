import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureTestimonialTables } from '../route'

// Returns a self-contained JS widget snippet — no auth required
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId')
  if (!storeId) {
    return new NextResponse('// Error: storeId is required', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  const theme = sp.get('theme') ?? 'light'
  const max = Math.min(10, Math.max(1, parseInt(sp.get('max') ?? '3', 10)))

  await ensureTestimonialTables()

  const rows = (await query(
    `SELECT customerName, content, rating, source, createdAt
     FROM Testimonial
     WHERE storeId = ? AND status IN ('FEATURED', 'APPROVED')
     ORDER BY CASE status WHEN 'FEATURED' THEN 0 ELSE 1 END, rating DESC
     LIMIT ?`,
    [storeId, max],
  )) as any[]

  const isDark = theme === 'dark'
  const bg = isDark ? '#1f2937' : '#ffffff'
  const text = isDark ? '#f9fafb' : '#111827'
  const subtext = isDark ? '#9ca3af' : '#6b7280'
  const border = isDark ? '#374151' : '#e5e7eb'
  const star = '#fbbf24'

  const testimonialsJson = JSON.stringify(rows)

  const js = `(function() {
  var data = ${testimonialsJson};
  var container = document.getElementById('kasir-testimonials');
  if (!container) return;

  var style = document.createElement('style');
  style.textContent = '.kt-wrap{display:flex;flex-wrap:wrap;gap:16px;font-family:sans-serif}.kt-card{background:${bg};color:${text};border:1px solid ${border};border-radius:12px;padding:16px;flex:1;min-width:220px;max-width:320px}.kt-stars{color:${star};font-size:18px;margin-bottom:8px}.kt-content{font-size:14px;margin-bottom:12px;line-height:1.5}.kt-name{font-weight:600;font-size:13px}.kt-source{font-size:11px;color:${subtext};margin-top:2px}';
  document.head.appendChild(style);

  var wrap = document.createElement('div');
  wrap.className = 'kt-wrap';

  data.forEach(function(t) {
    var card = document.createElement('div');
    card.className = 'kt-card';
    var stars = '★'.repeat(Math.round(t.rating)) + '☆'.repeat(5 - Math.round(t.rating));
    card.innerHTML = '<div class="kt-stars">' + stars + '</div><div class="kt-content">"' + t.content.replace(/</g,'&lt;') + '"</div><div class="kt-name">' + t.customerName.replace(/</g,'&lt;') + '</div><div class="kt-source">' + t.source + '</div>';
    wrap.appendChild(card);
  });

  container.appendChild(wrap);
})();`

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  })
}

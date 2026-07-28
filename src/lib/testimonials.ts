// Pure business logic for testimonial management — no DB or Next.js deps

export type TestimonialSource = 'IN_APP' | 'GOOGLE' | 'TOKOPEDIA' | 'SHOPEE' | 'MANUAL'
export type TestimonialStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FEATURED'

export interface Testimonial {
  id: string
  storeId: string
  customerId?: string
  customerName: string
  content: string
  rating: number
  source: TestimonialSource
  status: TestimonialStatus
  mediaUrl?: string
  createdAt: string
}

// Status transition machine
const VALID_TRANSITIONS: Record<TestimonialStatus, TestimonialStatus[]> = {
  PENDING:  ['APPROVED', 'REJECTED'],
  APPROVED: ['FEATURED', 'REJECTED'],
  REJECTED: ['PENDING'],
  FEATURED: ['APPROVED', 'REJECTED'],
}

export function isValidStatusTransition(from: TestimonialStatus, to: TestimonialStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Rating aggregation
export interface RatingAggregation {
  average: number
  count: number
  distribution: Record<number, number> // 1-5 → count
}

export function aggregateRatings(testimonials: Pick<Testimonial, 'rating'>[]): RatingAggregation {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const t of testimonials) {
    const r = Math.min(5, Math.max(1, Math.round(t.rating)))
    dist[r] = (dist[r] ?? 0) + 1
    sum += r
  }
  const count = testimonials.length
  return {
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    count,
    distribution: dist,
  }
}

// Source filtering
export function filterBySource(
  testimonials: Testimonial[],
  source: TestimonialSource | 'ALL',
): Testimonial[] {
  if (source === 'ALL') return testimonials
  return testimonials.filter(t => t.source === source)
}

// Featured selection: pick top-N by rating (ties broken by recency)
export function selectFeatured(
  testimonials: Testimonial[],
  maxCount = 5,
): Testimonial[] {
  return [...testimonials]
    .filter(t => t.status === 'FEATURED' || t.status === 'APPROVED')
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, maxCount)
}

// Embed code generation
export interface EmbedOptions {
  storeId: string
  theme?: 'light' | 'dark'
  maxCount?: number
  showRating?: boolean
}

export function generateEmbedCode(baseUrl: string, options: EmbedOptions): string {
  const { storeId, theme = 'light', maxCount = 3, showRating = true } = options
  const widgetUrl = `${baseUrl}/api/testimonials/widget?storeId=${storeId}&theme=${theme}&max=${maxCount}&showRating=${showRating}`
  return `<div id="kasir-testimonials"></div>
<script src="${baseUrl}/api/testimonials/embed?storeId=${storeId}" defer></script>
<!-- Or use the iframe embed: -->
<!-- <iframe src="${widgetUrl}" width="100%" height="400" frameborder="0"></iframe> -->`
}

export function generateScriptTag(baseUrl: string, storeId: string): string {
  return `<script>
  (function() {
    var s = document.createElement('script');
    s.src = '${baseUrl}/api/testimonials/embed?storeId=${storeId}';
    s.async = true;
    document.head.appendChild(s);
  })();
</script>`
}

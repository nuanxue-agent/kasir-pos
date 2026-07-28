'use client'

/**
 * ProductReviewClient
 * Route: /dashboard/products/reviews
 *
 * Features:
 * - Star rating (1-5) display and submission
 * - Review list with verified-purchase badge
 * - Moderation: approve / reject (manager/owner only)
 * - Rating summary: avg + 1-5 distribution bar chart
 * - "Mark helpful" action
 */

import { useState, useEffect, useCallback } from 'react'
import { Star, ThumbsUp, CheckCircle, XCircle, Clock, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'approved' | 'rejected'

interface ProductReview {
  id: string
  storeId: string
  productId: string
  customerId: string
  orderId: string | null
  rating: number
  comment: string | null
  verified: boolean
  status: ReviewStatus
  helpful: number
  createdAt: string
}

interface RatingSummary {
  productId: string
  totalReviews: number
  averageRating: number
  distribution: Record<string, number>
}

interface Props {
  storeId: string
  productId?: string       // if set, filter to one product
  canModerate?: boolean    // manager/owner role
  customerId?: string      // current customer (for mark-helpful / submit)
}

// ─── Star display ──────────────────────────────────────────────────────────────

function StarRow({
  rating,
  interactive = false,
  onRate,
}: {
  rating: number
  interactive?: boolean
  onRate?: (n: number) => void
}) {
  const [hover, setHover] = useState(0)
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={16}
          className={cn(
            'transition-colors',
            (interactive ? (hover || rating) : rating) >= n
              ? 'fill-amber-400 text-amber-400'
              : 'text-gray-300',
            interactive && 'cursor-pointer',
          )}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onRate?.(n)}
        />
      ))}
    </span>
  )
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:  { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-800', icon: <Clock size={12} /> },
    approved: { label: 'Approved', cls: 'bg-green-100  text-green-800',  icon: <CheckCircle size={12} /> },
    rejected: { label: 'Rejected', cls: 'bg-red-100    text-red-800',    icon: <XCircle size={12} /> },
  }
  const { label, cls, icon } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      {icon}{label}
    </span>
  )
}

// ─── Rating summary panel ──────────────────────────────────────────────────────

function SummaryPanel({ summary }: { summary: RatingSummary }) {
  const max = Math.max(1, ...Object.values(summary.distribution))
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">Rating Summary</h2>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className="text-4xl font-bold text-gray-900">{summary.averageRating.toFixed(1)}</p>
          <StarRow rating={Math.round(summary.averageRating)} />
          <p className="mt-1 text-xs text-gray-500">{summary.totalReviews} review{summary.totalReviews !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 space-y-1">
          {([5, 4, 3, 2, 1] as const).map(star => {
            const count = summary.distribution[star] ?? 0
            const pct = Math.round((count / max) * 100)
            return (
              <div key={star} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-4 text-right">{star}</span>
                <Star size={11} className="fill-amber-400 text-amber-400" />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-5 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Submit review form ────────────────────────────────────────────────────────

function SubmitReviewForm({
  storeId,
  productId,
  customerId,
  onSubmitted,
}: {
  storeId: string
  productId: string
  customerId: string
  onSubmitted: () => void
}) {
  const [rating, setRating]   = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) { setError('Please select a star rating'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/product-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productId, customerId, rating, comment }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to submit review')
      }
      onSubmitted()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Write a Review</h3>
      <div className="mb-3">
        <p className="mb-1 text-xs text-gray-500">Your rating *</p>
        <StarRow rating={rating} interactive onRate={setRating} />
      </div>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Share your experience (optional)"
        rows={3}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  )
}

// ─── Single review card ────────────────────────────────────────────────────────

function ReviewCard({
  review,
  canModerate,
  onModerate,
  onHelpful,
}: {
  review: ProductReview
  canModerate: boolean
  onModerate: (id: string, approved: boolean) => void
  onHelpful: (id: string) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <StarRow rating={review.rating} />
          <div className="flex items-center gap-2">
            <StatusBadge status={review.status} />
            {review.verified && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <ShieldCheck size={12} /> Verified purchase
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400">
          {new Date(review.createdAt).toLocaleDateString('id-ID')}
        </p>
      </div>

      {review.comment && (
        <p className="mt-2 text-sm text-gray-700">{review.comment}</p>
      )}

      <div className="mt-3 flex items-center gap-3">
        {review.status === 'approved' && (
          <button
            onClick={() => onHelpful(review.id)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ThumbsUp size={12} />
            Helpful ({review.helpful})
          </button>
        )}

        {canModerate && review.status === 'pending' && (
          <>
            <button
              onClick={() => onModerate(review.id, true)}
              className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              <CheckCircle size={12} /> Approve
            </button>
            <button
              onClick={() => onModerate(review.id, false)}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <XCircle size={12} /> Reject
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ProductReviewClient({
  storeId,
  productId,
  canModerate = false,
  customerId,
}: Props) {
  const [reviews, setReviews]     = useState<ProductReview[]>([])
  const [summary, setSummary]     = useState<RatingSummary | null>(null)
  const [statusFilter, setFilter] = useState<string>('approved')
  const [loading, setLoading]     = useState(false)
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ storeId, status: statusFilter })
      if (productId) qs.set('productId', productId)
      const res = await fetch(`/api/product-reviews?${qs}`)
      if (res.ok) setReviews(await res.json())
    } finally {
      setLoading(false)
    }
  }, [storeId, productId, statusFilter])

  const loadSummary = useCallback(async () => {
    if (!productId) return
    const res = await fetch(`/api/products/${productId}/rating-summary`)
    if (res.ok) setSummary(await res.json())
  }, [productId])

  useEffect(() => { load(); loadSummary() }, [load, loadSummary])

  async function handleModerate(id: string, approved: boolean) {
    try {
      const res = await fetch(`/api/product-reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      if (!res.ok) throw new Error('Failed to update review')
      showToast(approved ? 'Review approved' : 'Review rejected')
      load()
      loadSummary()
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  async function handleHelpful(id: string) {
    try {
      const res = await fetch(`/api/product-reviews/${id}/helpful`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as any
      setReviews(prev => prev.map(r => r.id === id ? { ...r, helpful: data.helpful } : r))
    } catch {
      showToast('Could not mark helpful', 'error')
    }
  }

  return (
    <div className="space-y-6 p-4">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed right-4 top-4 z-50 rounded-lg px-4 py-2 text-sm text-white shadow-lg',
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600',
        )}>
          {toast.msg}
        </div>
      )}

      <h1 className="text-xl font-bold text-gray-900">Product Reviews</h1>

      {/* Rating summary */}
      {summary && <SummaryPanel summary={summary} />}

      {/* Submit form (customer only) */}
      {customerId && productId && (
        <SubmitReviewForm
          storeId={storeId}
          productId={productId}
          customerId={customerId}
          onSubmitted={() => { load(); loadSummary(); showToast('Review submitted — awaiting moderation') }}
        />
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['approved', 'pending', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Review list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          No {statusFilter} reviews yet.
        </p>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <ReviewCard
              key={r.id}
              review={r}
              canModerate={canModerate}
              onModerate={handleModerate}
              onHelpful={handleHelpful}
            />
          ))}
        </div>
      )}
    </div>
  )
}

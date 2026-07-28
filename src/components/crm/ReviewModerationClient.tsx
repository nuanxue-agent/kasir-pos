'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Flag,
  CheckSquare,
  Square,
  Loader2,
  Plus,
  Trash2,
  Star,
  RefreshCw,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// Re-export pure logic for unit tests
export {
  containsKeyword,
  applyAutoModRules,
  findAllMatchingRules,
  getPendingQueue,
  filterByStatus,
  sortQueue,
  aggregateBulkResults,
  validateBulkAction,
  isValidModerationAction,
  canModerate,
  actionToStatus,
  highestSeverityRule,
} from '@/lib/review-moderation'

export type { AutoModRule, PendingReview, ModerationAction, BulkActionResult, BulkActionSummary } from '@/lib/review-moderation'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ReviewModerationClientProps {
  storeId: string
  currency: string
}

type TabId = 'queue' | 'rules'
type StatusFilter = 'all' | 'pending' | 'flagged' | 'approved' | 'rejected'

// ─── Helpers ───────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={12}
          className={n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--border)]'}
        />
      ))}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-800',
    flagged:  'bg-red-100 text-red-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-gray-100 text-[var(--text-2)]',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', map[status] ?? 'bg-[var(--bg-card)] text-[var(--text-2)]')}>
      {status}
    </span>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ReviewModerationClient({ storeId, currency: _currency }: ReviewModerationClientProps) {
  const qc = useQueryClient()

  const [tab, setTab]               = useState<TabId>('queue')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [reasonMap, setReasonMap]   = useState<Record<string, string>>({})
  const [newKeyword, setNewKeyword] = useState('')
  const [newRuleAction, setNewRuleAction] = useState<'FLAG' | 'REJECT'>('FLAG')
  const [addingRule, setAddingRule] = useState(false)

  // ── Data queries ──────────────────────────────────────────────────────────

  const reviewsQuery = useQuery({
    queryKey: ['review-moderation', storeId, statusFilter],
    queryFn: async () => {
      const url = `/api/review-moderation?storeId=${storeId}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`
      const res = await fetch(url)
      return await res.json() as any[]
    },
  })

  const rulesQuery = useQuery({
    queryKey: ['auto-mod-rules', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/auto-mod-rules?storeId=${storeId}`)
      return await res.json() as any[]
    },
    enabled: tab === 'rules',
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const moderateMutation = useMutation({
    mutationFn: async ({ reviewId, action, reason }: { reviewId: string; action: string; reason?: string }) => {
      const res = await fetch(`/api/review-moderation?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, action, reason }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: (_data, vars) => {
      toast.success(`Review ${vars.action.toLowerCase()}d`)
      qc.invalidateQueries({ queryKey: ['review-moderation', storeId] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  })

  const bulkMutation = useMutation({
    mutationFn: async ({ reviewIds, action, reason }: { reviewIds: string[]; action: string; reason?: string }) => {
      const res = await fetch(`/api/review-moderation/bulk?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewIds, action, reason }),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      toast.success(`Bulk action: ${data.succeeded}/${data.total} succeeded`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['review-moderation', storeId] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Bulk action failed'),
  })

  const addRuleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/auto-mod-rules?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword, action: newRuleAction }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Rule added')
      setNewKeyword('')
      setAddingRule(false)
      qc.invalidateQueries({ queryKey: ['auto-mod-rules', storeId] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add rule'),
  })

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ ruleId, active }: { ruleId: string; active: boolean }) => {
      const res = await fetch(`/api/auto-mod-rules?storeId=${storeId}&id=${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-mod-rules', storeId] }),
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    const ids = (reviewsQuery.data ?? []).map((r: any) => r.id)
    setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }, [reviewsQuery.data])

  const reviews   = reviewsQuery.data ?? []
  const rules     = rulesQuery.data ?? []
  const allSelected = reviews.length > 0 && selected.size === reviews.length

  const pendingCount  = (reviewsQuery.data ?? []).filter((r: any) => r.status === 'pending').length
  const flaggedCount  = (reviewsQuery.data ?? []).filter((r: any) => r.status === 'flagged').length

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="text-[var(--primary)]" size={22} />
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Review Moderation</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
              {pendingCount} pending
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {flaggedCount} flagged
            </span>
          )}
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['review-moderation', storeId] })}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-card)]"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1 w-fit">
        {(['queue', 'rules'] as TabId[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'queue' ? 'Moderation Queue' : 'Auto-Mod Rules'}
          </button>
        ))}
      </div>

      {/* ── Moderation Queue ── */}
      {tab === 'queue' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'flagged', 'approved', 'rejected'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setSelected(new Set()) }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                  statusFilter === s
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                    : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--primary)] hover:text-[var(--primary)]',
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Bulk action toolbar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--bg-card)] px-4 py-2">
              <span className="text-sm font-medium text-[var(--text-1)]">
                {selected.size} selected
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => bulkMutation.mutate({ reviewIds: Array.from(selected), action: 'APPROVE' })}
                  disabled={bulkMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <ShieldCheck size={13} /> Approve All
                </button>
                <button
                  onClick={() => bulkMutation.mutate({ reviewIds: Array.from(selected), action: 'REJECT' })}
                  disabled={bulkMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <ShieldX size={13} /> Reject All
                </button>
                <button
                  onClick={() => bulkMutation.mutate({ reviewIds: Array.from(selected), action: 'FLAG' })}
                  disabled={bulkMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-1)]"
                >
                  <Flag size={13} /> Flag All
                </button>
              </div>
            </div>
          )}

          {/* Reviews list */}
          {reviewsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-[var(--primary)]" size={28} />
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 text-center text-[var(--text-3)]">
              <ShieldCheck size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No reviews to moderate</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              {/* Table header */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-1)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                <button onClick={toggleAll} className="shrink-0">
                  {allSelected
                    ? <CheckSquare size={15} className="text-[var(--primary)]" />
                    : <Square size={15} className="text-[var(--text-3)]" />}
                </button>
                <span className="flex-1">Review</span>
                <span className="w-24 text-center">Status</span>
                <span className="w-36 text-center">Actions</span>
              </div>

              {reviews.map((review: any) => (
                <div
                  key={review.id}
                  className={cn(
                    'flex items-start gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0',
                    selected.has(review.id) && 'bg-[var(--bg-1)]',
                  )}
                >
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(review.id)} className="mt-0.5 shrink-0">
                    {selected.has(review.id)
                      ? <CheckSquare size={15} className="text-[var(--primary)]" />
                      : <Square size={15} className="text-[var(--text-3)]" />}
                  </button>

                  {/* Review content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StarRating rating={review.rating} />
                      {review.verified && (
                        <span className="flex items-center gap-0.5 text-xs text-green-600">
                          <Check size={10} /> Verified
                        </span>
                      )}
                      {review.lastAction === 'FLAG' && (
                        <span className="flex items-center gap-0.5 text-xs text-red-600">
                          <AlertTriangle size={10} /> Auto-flagged
                        </span>
                      )}
                    </div>
                    {review.comment && (
                      <p className="text-sm text-[var(--text-1)] line-clamp-2">{review.comment}</p>
                    )}
                    <p className="text-xs text-[var(--text-3)]">
                      Product: {review.productId} &middot; {new Date(review.createdAt).toLocaleDateString('id-ID')}
                    </p>
                    {/* Reason input */}
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={reasonMap[review.id] ?? ''}
                      onChange={e => setReasonMap(p => ({ ...p, [review.id]: e.target.value }))}
                      className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1 text-xs text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                    />
                  </div>

                  {/* Status */}
                  <div className="w-24 flex justify-center pt-0.5">
                    <StatusBadge status={review.status} />
                  </div>

                  {/* Action buttons */}
                  <div className="w-36 flex items-center justify-end gap-1 shrink-0">
                    <button
                      onClick={() => moderateMutation.mutate({ reviewId: review.id, action: 'APPROVE', reason: reasonMap[review.id] })}
                      disabled={moderateMutation.isPending || !['pending', 'flagged'].includes(review.status)}
                      title="Approve"
                      className="rounded-md p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-30"
                    >
                      <ShieldCheck size={16} />
                    </button>
                    <button
                      onClick={() => moderateMutation.mutate({ reviewId: review.id, action: 'FLAG', reason: reasonMap[review.id] })}
                      disabled={moderateMutation.isPending || !['pending'].includes(review.status)}
                      title="Flag"
                      className="rounded-md p-1.5 text-yellow-600 hover:bg-yellow-50 disabled:opacity-30"
                    >
                      <Flag size={16} />
                    </button>
                    <button
                      onClick={() => moderateMutation.mutate({ reviewId: review.id, action: 'REJECT', reason: reasonMap[review.id] })}
                      disabled={moderateMutation.isPending || !['pending', 'flagged'].includes(review.status)}
                      title="Reject"
                      className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                    >
                      <ShieldX size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Auto-Mod Rules ── */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-2)]">
              Keywords that trigger automatic flagging or rejection of reviews.
            </p>
            <button
              onClick={() => setAddingRule(v => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={15} />
              Add Rule
            </button>
          </div>

          {/* Add rule form */}
          {addingRule && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="flex-1 min-w-40 space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Keyword</label>
                <input
                  type="text"
                  placeholder="e.g. spam, scam"
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Action</label>
                <select
                  value={newRuleAction}
                  onChange={e => setNewRuleAction(e.target.value as 'FLAG' | 'REJECT')}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="FLAG">Flag</option>
                  <option value="REJECT">Reject</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addRuleMutation.mutate()}
                  disabled={!newKeyword.trim() || addRuleMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90"
                >
                  {addRuleMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save
                </button>
                <button
                  onClick={() => setAddingRule(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-1)]"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rulesQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-[var(--primary)]" size={28} />
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 text-center text-[var(--text-3)]">
              <Shield size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No auto-mod rules yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden divide-y divide-[var(--border)]">
              {rules.map((rule: any) => (
                <div key={rule.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="flex-1 font-mono text-sm text-[var(--text-1)]">{rule.keyword}</span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    rule.action === 'REJECT'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-800',
                  )}>
                    {rule.action}
                  </span>
                  <button
                    onClick={() => toggleRuleMutation.mutate({ ruleId: rule.id, active: !rule.active })}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                      rule.active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-[var(--text-3)] hover:bg-gray-200',
                    )}
                  >
                    {rule.active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => toggleRuleMutation.mutate({ ruleId: rule.id, active: !rule.active })}
                    title={rule.active ? 'Disable' : 'Enable'}
                    className="rounded-md p-1 text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

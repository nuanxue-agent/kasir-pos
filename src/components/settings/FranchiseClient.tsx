'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Loader2, ChevronDown, ChevronUp, DollarSign, Store, AlertCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcRoyaltyAmount,
  isOverdue,
  isValidFranchiseTransition,
  isValidRoyaltyTransition,
  getBillingPeriod,
  generateBillingPeriods,
} from '@/lib/franchise'

export {
  calcRoyaltyAmount,
  isOverdue,
  isValidFranchiseTransition,
  isValidRoyaltyTransition,
  getBillingPeriod,
  generateBillingPeriods,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Franchise {
  id: string
  franchiseeStoreId: string
  franchisorStoreId: string
  royaltyRate: number
  royaltyType: 'PERCENTAGE' | 'FIXED'
  billingCycle: 'WEEKLY' | 'MONTHLY'
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED'
  startDate: string
  createdAt: string
  updatedAt: string
}

interface FranchiseRoyalty {
  id: string
  franchiseId: string
  storeId: string
  period: string
  amount: number
  status: 'PENDING' | 'PAID' | 'OVERDUE'
  dueDate: string
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

interface FranchiseClientProps {
  storeId: string
  currency: string
  initialFranchises: Franchise[]
  initialRoyalties: FranchiseRoyalty[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SUSPENDED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  TERMINATED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  PENDING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function Badge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800')}>
      {status}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FranchiseClient({ storeId, currency, initialFranchises, initialRoyalties }: FranchiseClientProps) {
  const [franchises, setFranchises] = useState<Franchise[]>(initialFranchises)
  const [royalties, setRoyalties] = useState<FranchiseRoyalty[]>(initialRoyalties)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    franchiseeStoreId: '',
    royaltyRate: '5',
    royaltyType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    billingCycle: 'MONTHLY' as 'WEEKLY' | 'MONTHLY',
    startDate: new Date().toISOString().split('T')[0],
  })

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const reload = async () => {
    setLoading(true)
    try {
      const [fr, rr] = await Promise.all([
        fetch(`/api/franchises?storeId=${storeId}`).then(r => r.json() as any),
        Promise.resolve(royalties), // royalties reloaded per-franchise below
      ])
      setFranchises(fr)
    } catch {
      toast.error('Failed to reload')
    } finally {
      setLoading(false)
    }
  }

  const loadRoyalties = async (franchiseId: string) => {
    const rows = await fetch(`/api/franchises/${franchiseId}/royalties`).then(r => r.json() as any)
    setRoyalties(prev => [...prev.filter(r => r.franchiseId !== franchiseId), ...rows])
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!form.franchiseeStoreId.trim()) { toast.error('Franchisee Store ID is required'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/franchises?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          franchiseeStoreId: form.franchiseeStoreId.trim(),
          royaltyRate: parseFloat(form.royaltyRate),
          royaltyType: form.royaltyType,
          billingCycle: form.billingCycle,
          startDate: form.startDate,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Franchise created')
      setShowAdd(false)
      setForm({ franchiseeStoreId: '', royaltyRate: '5', royaltyType: 'PERCENTAGE', billingCycle: 'MONTHLY', startDate: new Date().toISOString().split('T')[0] })
      await reload()
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (franchise: Franchise, newStatus: Franchise['status']) => {
    if (!isValidFranchiseTransition(franchise.status, newStatus)) {
      toast.error(`Cannot change status from ${franchise.status} to ${newStatus}`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/franchises/${franchise.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Status updated')
      setFranchises(prev => prev.map(f => f.id === franchise.id ? { ...f, status: newStatus } : f))
    } finally {
      setLoading(false)
    }
  }

  const handleBilling = async (franchise: Franchise) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/franchises/${franchise.id}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Royalty calculated: ${formatCurrency(json.amount, currency)} for ${json.period}`)
      await loadRoyalties(franchise.id)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkPaid = async (royalty: FranchiseRoyalty) => {
    if (!isValidRoyaltyTransition(royalty.status, 'PAID')) {
      toast.error('Cannot mark as paid')
      return
    }
    const res = await fetch(`/api/franchises/${royalty.franchiseId}/royalties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ royaltyId: royalty.id, status: 'PAID' }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Marked as paid')
    setRoyalties(prev => prev.map(r => r.id === royalty.id ? { ...r, status: 'PAID', paidAt: new Date().toISOString() } : r))
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalPending = royalties.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0)
  const totalOverdue = royalties.filter(r => r.status === 'OVERDUE').reduce((s, r) => s + r.amount, 0)
  const totalPaid = royalties.filter(r => r.status === 'PAID').reduce((s, r) => s + r.amount, 0)
  const activeCount = franchises.filter(f => f.status === 'ACTIVE').length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Franchise Management</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Manage franchisee stores and royalty billing</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reload}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            Add Franchise
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Active Franchises', value: String(activeCount), icon: Store, color: 'text-green-500' },
          { label: 'Pending Royalties', value: formatCurrency(totalPending, currency), icon: DollarSign, color: 'text-blue-500' },
          { label: 'Overdue', value: formatCurrency(totalOverdue, currency), icon: AlertCircle, color: 'text-red-500' },
          { label: 'Paid (All Time)', value: formatCurrency(totalPaid, currency), icon: DollarSign, color: 'text-green-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 text-[var(--text-3)] text-xs mb-1">
              <Icon size={14} className={color} />
              {label}
            </div>
            <p className="text-lg font-bold text-[var(--text-1)]">{value}</p>
          </div>
        ))}
      </div>

      {/* Add Franchise Form */}
      {showAdd && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-1)]">New Franchise Agreement</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Franchisee Store ID *</label>
              <input
                value={form.franchiseeStoreId}
                onChange={e => setForm(f => ({ ...f, franchiseeStoreId: e.target.value }))}
                placeholder="store_xxxx"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Royalty Type</label>
              <select
                value={form.royaltyType}
                onChange={e => setForm(f => ({ ...f, royaltyType: e.target.value as any }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value="PERCENTAGE">Percentage of Sales</option>
                <option value="FIXED">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                {form.royaltyType === 'PERCENTAGE' ? 'Royalty Rate (%)' : 'Fixed Amount (IDR)'}
              </label>
              <input
                type="number"
                min="0"
                max={form.royaltyType === 'PERCENTAGE' ? '100' : undefined}
                value={form.royaltyRate}
                onChange={e => setForm(f => ({ ...f, royaltyRate: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Billing Cycle</label>
              <select
                value={form.billingCycle}
                onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value as any }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Franchise
            </button>
          </div>
        </div>
      )}

      {/* Franchise List */}
      <div className="space-y-3">
        {franchises.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center text-[var(--text-3)]">
            No franchise agreements yet. Click "Add Franchise" to get started.
          </div>
        )}

        {franchises.map(franchise => {
          const fRoyalties = royalties.filter(r => r.franchiseId === franchise.id)
          const expanded = expandedId === franchise.id
          const pendingAmt = fRoyalties.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0)
          const overdueAmt = fRoyalties.filter(r => r.status === 'OVERDUE').reduce((s, r) => s + r.amount, 0)

          return (
            <div key={franchise.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              {/* Franchise header row */}
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--text-1)] text-sm truncate">{franchise.franchiseeStoreId}</span>
                    <Badge status={franchise.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-3)]">
                    <span>{franchise.royaltyType === 'PERCENTAGE' ? `${franchise.royaltyRate}% of sales` : `${formatCurrency(franchise.royaltyRate, currency)} fixed`}</span>
                    <span>·</span>
                    <span>{franchise.billingCycle === 'MONTHLY' ? 'Monthly' : 'Weekly'}</span>
                    <span>·</span>
                    <span>Since {franchise.startDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Quick royalty amounts */}
                  {overdueAmt > 0 && (
                    <span className="text-xs font-medium text-red-500">
                      {formatCurrency(overdueAmt, currency)} overdue
                    </span>
                  )}
                  {pendingAmt > 0 && (
                    <span className="text-xs font-medium text-blue-500">
                      {formatCurrency(pendingAmt, currency)} pending
                    </span>
                  )}

                  {/* Status actions */}
                  {franchise.status === 'ACTIVE' && (
                    <>
                      <button
                        onClick={() => handleBilling(franchise)}
                        disabled={loading}
                        className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
                      >
                        Calc Royalty
                      </button>
                      <button
                        onClick={() => handleStatusChange(franchise, 'SUSPENDED')}
                        disabled={loading}
                        className="rounded-lg border border-yellow-300 px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                      >
                        Suspend
                      </button>
                    </>
                  )}
                  {franchise.status === 'SUSPENDED' && (
                    <button
                      onClick={() => handleStatusChange(franchise, 'ACTIVE')}
                      disabled={loading}
                      className="rounded-lg border border-green-300 px-2 py-1 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    >
                      Reactivate
                    </button>
                  )}
                  {franchise.status !== 'TERMINATED' && (
                    <button
                      onClick={() => handleStatusChange(franchise, 'TERMINATED')}
                      disabled={loading}
                      className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Terminate
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (!expanded) loadRoyalties(franchise.id)
                      setExpandedId(expanded ? null : franchise.id)
                    }}
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* Royalties table */}
              {expanded && (
                <div className="border-t border-[var(--border)] bg-[var(--bg-1)]">
                  <div className="px-4 py-3">
                    <h3 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-3">Royalty History</h3>
                    {fRoyalties.length === 0 ? (
                      <p className="text-xs text-[var(--text-3)] py-2">No royalties yet. Click "Calc Royalty" to generate the current period.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--text-3)]">
                            <th className="text-left pb-2 font-medium">Period</th>
                            <th className="text-right pb-2 font-medium">Amount</th>
                            <th className="text-left pb-2 font-medium pl-3">Status</th>
                            <th className="text-left pb-2 font-medium">Due</th>
                            <th className="text-left pb-2 font-medium">Paid At</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {fRoyalties.map(r => (
                            <tr key={r.id} className="text-[var(--text-2)]">
                              <td className="py-2 font-mono">{r.period}</td>
                              <td className="py-2 text-right font-medium text-[var(--text-1)]">{formatCurrency(r.amount, currency)}</td>
                              <td className="py-2 pl-3"><Badge status={r.status} /></td>
                              <td className="py-2">{r.dueDate}</td>
                              <td className="py-2">{r.paidAt ? r.paidAt.slice(0, 10) : '—'}</td>
                              <td className="py-2 text-right">
                                {(r.status === 'PENDING' || r.status === 'OVERDUE') && (
                                  <button
                                    onClick={() => handleMarkPaid(r)}
                                    className="rounded border border-green-300 px-2 py-0.5 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                  >
                                    Mark Paid
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

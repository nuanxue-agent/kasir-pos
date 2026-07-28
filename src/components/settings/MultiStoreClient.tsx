'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Loader2, Save, X, Building2, TrendingUp, ArrowUpDown } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch {
  id: string
  parentStoreId: string
  name: string
  address: string
  phone: string
  managerId: string | null
  timezone: string
  currency: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface BranchPerformance {
  branchId: string
  range: number
  revenue: number
  orders: number
  avgTicket: number
  revenueGrowth: number
  ordersGrowth: number
  previousRevenue: number
  previousOrders: number
  daily: Array<{ date: string; revenue: number; orders: number }>
}

interface BranchComparison {
  storeId: string
  range: number
  sortBy: string
  consolidated: {
    revenue: number
    orders: number
    avgTicket: number
    branchCount: number
    activeBranches: number
  }
  branches: Array<{
    branchId: string
    name: string
    active: boolean
    revenue: number
    orders: number
    avgTicket: number
    revenueShare: number
  }>
}

interface MultiStoreClientProps {
  storeId: string
  currency: string
}

const TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Manila',
  'UTC',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function MultiStoreClient({ storeId, currency }: MultiStoreClientProps) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [comparison, setComparison] = useState<BranchComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'list' | 'performance'>('list')
  const [sortBy, setSortBy] = useState<'revenue' | 'orders' | 'avgTicket'>('revenue')
  const [range, setRange] = useState(30)

  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    timezone: 'Asia/Jakarta',
    currency: currency,
    active: true,
  })

  useEffect(() => {
    fetchAll()
  }, [storeId, sortBy, range])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [branchesRes, comparisonRes] = await Promise.all([
        fetch(`/api/branches?storeId=${storeId}`),
        fetch(`/api/branches/comparison?storeId=${storeId}&sortBy=${sortBy}&range=${range}`),
      ])

      const branchesData = (await branchesRes.json()) as any
      const comparisonData = (await comparisonRes.json()) as any

      if (branchesData.error) {
        toast.error(branchesData.error)
      } else {
        setBranches(branchesData)
      }

      if (comparisonData.error) {
        toast.error(comparisonData.error)
      } else {
        setComparison(comparisonData)
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Branch name is required')
      return
    }

    setSaving(true)
    try {
      if (editId) {
        const res = await fetch(`/api/branches/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = (await res.json()) as any
        if (data.error) {
          toast.error(data.error)
          return
        }
        toast.success('Branch updated')
      } else {
        const res = await fetch(`/api/branches?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = (await res.json()) as any
        if (data.error) {
          toast.error(data.error)
          return
        }
        toast.success('Branch created')
      }
      setShowForm(false)
      setEditId(null)
      setForm({ name: '', address: '', phone: '', timezone: 'Asia/Jakarta', currency: currency, active: true })
      fetchAll()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (branch: Branch) => {
    setEditId(branch.id)
    setForm({
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      timezone: branch.timezone,
      currency: branch.currency,
      active: branch.active,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', address: '', phone: '', timezone: 'Asia/Jakarta', currency: currency, active: true })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Multi-Location Management</h1>
          <p className="text-sm text-[var(--text-3)]">Manage multiple store branches under one account</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView(activeView === 'list' ? 'performance' : 'list')}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)]"
          >
            {activeView === 'list' ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <Building2 className="inline h-4 w-4 mr-1" />}
            {activeView === 'list' ? 'Performance View' : 'Branch List'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="inline h-4 w-4" /> Add Branch
          </button>
        </div>
      </div>

      {/* Consolidated Stats */}
      {comparison && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-3)]">Total Revenue</p>
            <p className="text-2xl font-bold text-[var(--text-1)]">{formatCurrency(comparison.consolidated.revenue, currency)}</p>
            <p className="text-xs text-[var(--text-3)] mt-1">Last {range} days</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-3)]">Total Orders</p>
            <p className="text-2xl font-bold text-[var(--text-1)]">{comparison.consolidated.orders.toLocaleString()}</p>
            <p className="text-xs text-[var(--text-3)] mt-1">Across all branches</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-3)]">Network Avg Ticket</p>
            <p className="text-2xl font-bold text-[var(--text-1)]">{formatCurrency(comparison.consolidated.avgTicket, currency)}</p>
            <p className="text-xs text-[var(--text-3)] mt-1">Per order</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-3)]">Branches</p>
            <p className="text-2xl font-bold text-[var(--text-1)]">{comparison.consolidated.activeBranches} / {comparison.consolidated.branchCount}</p>
            <p className="text-xs text-[var(--text-3)] mt-1">Active branches</p>
          </div>
        </div>
      )}

      {/* View Controls */}
      {activeView === 'performance' && (
        <div className="flex flex-wrap gap-4 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--text-2)]">Sort by:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1 text-sm text-[var(--text-1)]"
            >
              <option value="revenue">Revenue</option>
              <option value="orders">Orders</option>
              <option value="avgTicket">Avg Ticket</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--text-2)]">Period:</label>
            <select
              value={range}
              onChange={e => setRange(Number(e.target.value))}
              className="rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1 text-sm text-[var(--text-1)]"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-bold text-[var(--text-1)]">{editId ? 'Edit Branch' : 'New Branch'}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[var(--text-2)]">Branch Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="Downtown Branch"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--text-2)]">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="123 Main St"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--text-2)]">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="+62 21 1234567"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-[var(--text-2)]">Timezone</label>
                  <select
                    value={form.timezone}
                    onChange={e => setForm({ ...form, timezone: e.target.value })}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[var(--text-2)]">Currency</label>
                  <input
                    type="text"
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                    placeholder="IDR"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4"
                />
                <label className="text-sm text-[var(--text-2)]">Active</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)]"
              >
                <X className="inline h-4 w-4" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <Save className="inline h-4 w-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch List View */}
      {activeView === 'list' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-2)]">Branch</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-2)]">Address</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-2)]">Phone</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-2)]">Timezone</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-2)]">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-[var(--text-2)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">
                      No branches yet. Add your first branch to get started.
                    </td>
                  </tr>
                )}
                {branches.map(branch => (
                  <tr key={branch.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-1)]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-1)]">{branch.name}</div>
                      <div className="text-xs text-[var(--text-3)]">{branch.currency}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{branch.address || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{branch.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{branch.timezone}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                          branch.active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400'
                        )}
                      >
                        {branch.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(branch)}
                        className="rounded p-1 text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)]"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Comparison View */}
      {activeView === 'performance' && comparison && (
        <div className="space-y-4">
          {comparison.branches.map(branch => (
            <div key={branch.branchId} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-[var(--text-1)]">{branch.name}</h3>
                  <p className="text-xs text-[var(--text-3)]">{branch.active ? 'Active' : 'Inactive'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--text-3)]">Revenue Share</p>
                  <p className="text-lg font-bold text-[var(--primary)]">{branch.revenueShare.toFixed(1)}%</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-[var(--text-3)]">Revenue</p>
                  <p className="text-xl font-bold text-[var(--text-1)]">{formatCurrency(branch.revenue, currency)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-3)]">Orders</p>
                  <p className="text-xl font-bold text-[var(--text-1)]">{branch.orders.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-3)]">Avg Ticket</p>
                  <p className="text-xl font-bold text-[var(--text-1)]">{formatCurrency(branch.avgTicket, currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

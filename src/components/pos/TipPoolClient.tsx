'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  Users,
  Plus,
  Clock,
  Scale,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Trash2,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

type PoolStatus = 'OPEN' | 'CLOSED'
type DistributionMethod = 'EQUAL' | 'HOURS' | 'ROLE_WEIGHT'

interface TipPool {
  id: string
  storeId: string
  date: string
  totalTips: number
  status: PoolStatus
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

interface TipDistribution {
  id: string
  poolId: string
  employeeId: string
  storeId: string
  amount: number
  role: string
  hoursWorked: number
  distributedAt: string
}

interface EmployeeRow {
  employeeId: string
  name: string
  role: string
  hoursWorked: number
}

interface TipPoolClientProps {
  storeId: string
  currency: string
}

const ROLES = ['MANAGER', 'SENIOR', 'STAFF', 'TRAINEE']

const ROLE_WEIGHT: Record<string, number> = {
  MANAGER: 2.0,
  SENIOR: 1.5,
  STAFF: 1.0,
  TRAINEE: 0.5,
}

const METHOD_LABELS: Record<DistributionMethod, string> = {
  EQUAL: 'Equal Split',
  HOURS: 'By Hours Worked',
  ROLE_WEIGHT: 'By Role Weight',
}

const METHOD_ICONS: Record<DistributionMethod, React.ReactNode> = {
  EQUAL: <Scale className="w-4 h-4" />,
  HOURS: <Clock className="w-4 h-4" />,
  ROLE_WEIGHT: <BadgeCheck className="w-4 h-4" />,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TipPoolClient({ storeId, currency }: TipPoolClientProps) {
  const [pools, setPools] = useState<TipPool[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPool, setExpandedPool] = useState<string | null>(null)
  const [distributions, setDistributions] = useState<Record<string, TipDistribution[]>>({})

  // New pool form
  const [showNewPool, setShowNewPool] = useState(false)
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newTips, setNewTips] = useState('')
  const [creating, setCreating] = useState(false)

  // Distribution form state per pool
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [method, setMethod] = useState<DistributionMethod>('EQUAL')
  const [distributing, setDistributing] = useState(false)
  const [closing, setClosing] = useState(false)

  const fetchPools = useCallback(async () => {
    try {
      const res = await fetch(`/api/tip-pools?storeId=${storeId}`)
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      setPools(data as TipPool[])
    } catch {
      toast.error('Failed to load tip pools')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { fetchPools() }, [fetchPools])

  const fetchDistributions = useCallback(async (poolId: string) => {
    try {
      const res = await fetch(`/api/tip-pools/${poolId}/distribute?storeId=${storeId}`)
      if (!res.ok) return
      const data = await res.json() as any
      if (Array.isArray(data)) {
        setDistributions(prev => ({ ...prev, [poolId]: data }))
      }
    } catch { /* no-op */ }
  }, [storeId])

  const handleExpand = useCallback((poolId: string) => {
    setExpandedPool(prev => {
      if (prev === poolId) return null
      fetchDistributions(poolId)
      return poolId
    })
    // Reset employee form when switching pools
    setEmployees([{ employeeId: '', name: '', role: 'STAFF', hoursWorked: 8 }])
    setMethod('EQUAL')
  }, [fetchDistributions])

  const handleCreatePool = async () => {
    const tips = parseFloat(newTips)
    if (!newDate) { toast.error('Date is required'); return }
    if (isNaN(tips) || tips < 0) { toast.error('Enter a valid tip amount'); return }
    setCreating(true)
    try {
      const res = await fetch(`/api/tip-pools?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, totalTips: tips }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Tip pool created')
      setShowNewPool(false)
      setNewTips('')
      await fetchPools()
    } finally {
      setCreating(false)
    }
  }

  const addEmployee = () => {
    setEmployees(prev => [...prev, { employeeId: '', name: '', role: 'STAFF', hoursWorked: 8 }])
  }

  const removeEmployee = (idx: number) => {
    setEmployees(prev => prev.filter((_, i) => i !== idx))
  }

  const updateEmployee = (idx: number, field: keyof EmployeeRow, value: string | number) => {
    setEmployees(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const handleDistribute = async (pool: TipPool) => {
    const invalid = employees.some(e => !e.employeeId.trim() || !e.name.trim())
    if (invalid) { toast.error('All employees must have an ID and name'); return }
    if (employees.length === 0) { toast.error('Add at least one employee'); return }

    setDistributing(true)
    try {
      const payload = {
        method,
        employees: employees.map(e => ({
          employeeId: e.employeeId.trim(),
          role: e.role,
          hoursWorked: e.hoursWorked,
        })),
      }
      const res = await fetch(`/api/tip-pools/${pool.id}/distribute?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Tips distributed')
      setDistributions(prev => ({ ...prev, [pool.id]: data.distributions ?? [] }))
    } finally {
      setDistributing(false)
    }
  }

  const handleClose = async (pool: TipPool) => {
    if (!confirm(`Close tip pool for ${pool.date}? This cannot be undone.`)) return
    setClosing(true)
    try {
      const res = await fetch(`/api/tip-pools/${pool.id}/close?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Tip pool closed')
      await fetchPools()
    } finally {
      setClosing(false)
    }
  }

  // ─── Preview calculation ──────────────────────────────────────────────────

  const previewAmounts = useCallback((pool: TipPool): number[] => {
    if (employees.length === 0) return []
    const total = pool.totalTips
    if (method === 'EQUAL') {
      const share = total / employees.length
      return employees.map(() => Math.round(share * 100) / 100)
    }
    if (method === 'HOURS') {
      const totalHours = employees.reduce((s, e) => s + e.hoursWorked, 0)
      if (totalHours === 0) return employees.map(() => Math.round((total / employees.length) * 100) / 100)
      return employees.map(e => Math.round((e.hoursWorked / totalHours) * total * 100) / 100)
    }
    // ROLE_WEIGHT
    const weights = employees.map(e => ROLE_WEIGHT[e.role] ?? 1.0)
    const totalWeight = weights.reduce((s, w) => s + w, 0)
    if (totalWeight === 0) return employees.map(() => Math.round((total / employees.length) * 100) / 100)
    return weights.map(w => Math.round((w / totalWeight) * total * 100) / 100)
  }, [employees, method])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Tip Pool</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Collect and distribute tips to staff fairly
          </p>
        </div>
        <button
          onClick={() => setShowNewPool(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--primary)', color: '#fff' }}
        >
          <Plus className="w-4 h-4" />
          New Pool
        </button>
      </div>

      {/* New pool form */}
      {showNewPool && (
        <div className="rounded-xl border p-5 space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Create Tip Pool</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Total Tips</label>
              <input
                type="number"
                min="0"
                step="100"
                value={newTips}
                onChange={e => setNewTips(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNewPool(false)}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePool}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Pool list */}
      {pools.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tip pools yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pools.map(pool => {
            const isExpanded = expandedPool === pool.id
            const dists = distributions[pool.id] ?? []
            const preview = isExpanded && pool.status === 'OPEN' ? previewAmounts(pool) : []

            return (
              <div
                key={pool.id}
                className="rounded-xl border overflow-hidden"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                {/* Pool header row */}
                <button
                  onClick={() => handleExpand(pool.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--bg-2)' }}
                    >
                      <DollarSign className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                        {pool.date}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {formatCurrency(pool.totalTips, currency)} total
                        {pool.status === 'CLOSED' && pool.closedAt && (
                          <span> · Closed {new Date(pool.closedAt).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'text-xs px-2.5 py-0.5 rounded-full font-medium',
                        pool.status === 'OPEN'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-stone-100 text-stone-500'
                      )}
                    >
                      {pool.status}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-3)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-3)' }} />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t px-5 py-5 space-y-5" style={{ borderColor: 'var(--border)' }}>

                    {/* Existing distributions */}
                    {dists.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-3)' }}>
                          Current Distribution
                        </h3>
                        <div className="space-y-2">
                          {dists.map(d => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between rounded-lg px-3 py-2.5"
                              style={{ background: 'var(--bg-2)' }}
                            >
                              <div className="flex items-center gap-2">
                                <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                                <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                                  {d.employeeId}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-1)', color: 'var(--text-3)' }}>
                                  {d.role}
                                </span>
                                {d.hoursWorked > 0 && (
                                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{d.hoursWorked}h</span>
                                )}
                              </div>
                              <span className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                {formatCurrency(d.amount, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Distribution form — only for OPEN pools */}
                    {pool.status === 'OPEN' && (
                      <>
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-3)' }}>
                            Distribution Method
                          </h3>
                          <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(METHOD_LABELS) as DistributionMethod[]).map(m => (
                              <button
                                key={m}
                                onClick={() => setMethod(m)}
                                className={cn(
                                  'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all',
                                  method === m
                                    ? 'border-2'
                                    : 'opacity-60 hover:opacity-80'
                                )}
                                style={{
                                  borderColor: method === m ? 'var(--primary)' : 'var(--border)',
                                  background: method === m ? 'var(--bg-2)' : 'var(--bg-1)',
                                  color: method === m ? 'var(--primary)' : 'var(--text-2)',
                                }}
                              >
                                {METHOD_ICONS[m]}
                                {METHOD_LABELS[m]}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Employee rows */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                              Staff
                            </h3>
                            <button
                              onClick={addEmployee}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                              style={{ color: 'var(--primary)', background: 'var(--bg-2)' }}
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                          <div className="space-y-2">
                            {employees.map((emp, idx) => (
                              <div key={idx} className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr auto auto auto' }}>
                                <input
                                  value={emp.employeeId}
                                  onChange={e => updateEmployee(idx, 'employeeId', e.target.value)}
                                  placeholder="Employee ID"
                                  className="rounded-lg border px-2 py-1.5 text-xs"
                                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                                />
                                <input
                                  value={emp.name}
                                  onChange={e => updateEmployee(idx, 'name', e.target.value)}
                                  placeholder="Name"
                                  className="rounded-lg border px-2 py-1.5 text-xs"
                                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                                />
                                <select
                                  value={emp.role}
                                  onChange={e => updateEmployee(idx, 'role', e.target.value)}
                                  className="rounded-lg border px-2 py-1.5 text-xs"
                                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                                >
                                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={emp.hoursWorked}
                                  onChange={e => updateEmployee(idx, 'hoursWorked', parseFloat(e.target.value) || 0)}
                                  className="w-16 rounded-lg border px-2 py-1.5 text-xs"
                                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                                  title="Hours worked"
                                />
                                <button
                                  onClick={() => removeEmployee(idx)}
                                  disabled={employees.length === 1}
                                  className="p-1.5 rounded opacity-50 hover:opacity-100 disabled:opacity-20"
                                  style={{ color: 'var(--text-3)' }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Preview */}
                        {preview.length > 0 && (
                          <div className="rounded-lg p-3 space-y-1.5" style={{ background: 'var(--bg-2)' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-3)' }}>Preview</p>
                            {employees.map((emp, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span style={{ color: 'var(--text-2)' }}>{emp.name || emp.employeeId || `Staff ${idx + 1}`}</span>
                                <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                                  {formatCurrency(preview[idx] ?? 0, currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleDistribute(pool)}
                            disabled={distributing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                            style={{ background: 'var(--primary)', color: '#fff' }}
                          >
                            {distributing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                            Distribute
                          </button>
                          <button
                            onClick={() => handleClose(pool)}
                            disabled={closing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                          >
                            {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            Close Pool
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Zap, Plus, RefreshCw, History, Settings, ChevronUp, ChevronDown, Loader2, X } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// Re-export pure logic for unit tests
export {
  qualifiesForTier,
  findBestTier,
  evaluateCustomerTier,
  batchEvaluateTiers,
  calcPeriodSpend,
  calcPeriodVisits,
  getTierChangeDirection,
} from '@/lib/tier-automation'

interface TierRule {
  id: string
  storeId: string
  tierName: string
  minSpend: number
  minPoints: number
  minVisits: number
  periodDays: number
  benefits: Record<string, any>
  color: string
  icon: string
  active: boolean
}

interface TierHistory {
  id: string
  customerId: string
  customerName?: string
  storeId: string
  fromTier: string | null
  toTier: string | null
  reason: string
  changedAt: string
}

interface EvaluateResult {
  evaluated: number
  changed: number
  message: string
}

interface Props {
  storeId: string
  currency?: string
}

const ICON_MAP: Record<string, React.ReactNode> = {
  star: <Star className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  trophy: <Star className="h-4 w-4" />,
}

const DEFAULT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6']

function RuleForm({
  storeId,
  currency,
  initial,
  onClose,
}: {
  storeId: string
  currency: string
  initial?: TierRule | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [tierName, setTierName] = useState(initial?.tierName ?? '')
  const [minSpend, setMinSpend] = useState(String(initial?.minSpend ?? 0))
  const [minPoints, setMinPoints] = useState(String(initial?.minPoints ?? 0))
  const [minVisits, setMinVisits] = useState(String(initial?.minVisits ?? 0))
  const [periodDays, setPeriodDays] = useState(String(initial?.periodDays ?? 0))
  const [color, setColor] = useState(initial?.color ?? '#6366f1')
  const [icon, setIcon] = useState(initial?.icon ?? 'star')
  const [benefitKey, setBenefitKey] = useState('')
  const [benefitVal, setBenefitVal] = useState('')
  const [benefits, setBenefits] = useState<Record<string, string>>(
    initial?.benefits ? Object.fromEntries(Object.entries(initial.benefits).map(([k, v]) => [k, String(v)])) : {}
  )
  const [saving, setSaving] = useState(false)

  const addBenefit = () => {
    if (!benefitKey.trim()) return
    setBenefits(prev => ({ ...prev, [benefitKey.trim()]: benefitVal }))
    setBenefitKey('')
    setBenefitVal('')
  }

  const removeBenefit = (key: string) => {
    setBenefits(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  const handleSave = async () => {
    if (!tierName.trim()) { toast.error('Tier name is required'); return }
    setSaving(true)
    const body = {
      tierName: tierName.trim(),
      minSpend: parseFloat(minSpend) || 0,
      minPoints: parseFloat(minPoints) || 0,
      minVisits: parseInt(minVisits) || 0,
      periodDays: parseInt(periodDays) || 0,
      color,
      icon,
      benefits,
    }
    const url = initial
      ? `/api/tier-rules/${initial.id}`
      : `/api/tier-rules?storeId=${storeId}`
    const method = initial ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json() as any
    setSaving(false)
    if (json.error) { toast.error(json.error); return }
    toast.success(initial ? 'Rule updated' : 'Rule created')
    qc.invalidateQueries({ queryKey: ['tier-rules', storeId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">
            {initial ? 'Edit Tier Rule' : 'New Tier Rule'}
          </h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Tier Name</label>
            <input
              value={tierName}
              onChange={e => setTierName(e.target.value)}
              placeholder="e.g. Gold, Platinum, VIP"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                Min Spend ({currency})
              </label>
              <input
                type="number"
                min="0"
                value={minSpend}
                onChange={e => setMinSpend(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Min Points</label>
              <input
                type="number"
                min="0"
                value={minPoints}
                onChange={e => setMinPoints(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Min Visits</label>
              <input
                type="number"
                min="0"
                value={minVisits}
                onChange={e => setMinVisits(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Period (days, 0=all-time)</label>
              <input
                type="number"
                min="0"
                value={periodDays}
                onChange={e => setPeriodDays(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Badge Color</label>
            <div className="flex gap-2">
              {DEFAULT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    color === c ? 'border-[var(--text-1)] scale-110' : 'border-transparent',
                  )}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="h-7 w-7 rounded cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-2)]">Benefits</label>
            {Object.entries(benefits).length > 0 && (
              <div className="mb-2 space-y-1">
                {Object.entries(benefits).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded bg-[var(--bg-1)] px-3 py-1 text-sm">
                    <span className="text-[var(--text-1)]"><span className="font-medium">{k}:</span> {v}</span>
                    <button onClick={() => removeBenefit(k)} className="ml-2 text-[var(--text-3)] hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={benefitKey}
                onChange={e => setBenefitKey(e.target.value)}
                placeholder="Key (e.g. discount)"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none"
              />
              <input
                value={benefitVal}
                onChange={e => setBenefitVal(e.target.value)}
                placeholder="Value (e.g. 10%)"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none"
              />
              <button onClick={addBenefit} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white">
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-1)]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TierAutomationClient({ storeId, currency = 'IDR' }: Props) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules')
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<TierRule | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [lastResult, setLastResult] = useState<EvaluateResult | null>(null)

  const { data: rules = [], isLoading: rulesLoading } = useQuery<TierRule[]>({
    queryKey: ['tier-rules', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/tier-rules?storeId=${storeId}`)
      return await res.json() as any
    },
    staleTime: 30_000,
  })

  const { data: history = [], isLoading: historyLoading } = useQuery<TierHistory[]>({
    queryKey: ['tier-history', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/tier-history?storeId=${storeId}`)
      return await res.json() as any
    },
    staleTime: 30_000,
    enabled: activeTab === 'history',
  })

  const handleEvaluate = async () => {
    setEvaluating(true)
    setLastResult(null)
    const res = await fetch(`/api/tier-rules/evaluate?storeId=${storeId}`, { method: 'POST' })
    const json = await res.json() as any
    setEvaluating(false)
    if (json.error) { toast.error(json.error); return }
    setLastResult(json as EvaluateResult)
    toast.success(json.message)
    qc.invalidateQueries({ queryKey: ['tier-history', storeId] })
  }

  const handleToggleActive = async (rule: TierRule) => {
    const res = await fetch(`/api/tier-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !rule.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(rule.active ? 'Rule deactivated' : 'Rule activated')
    qc.invalidateQueries({ queryKey: ['tier-rules', storeId] })
  }

  const openEdit = (rule: TierRule) => { setEditingRule(rule); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingRule(null) }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Tier Automation</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Auto-upgrade and downgrade customer loyalty tiers based on spend, points, and visit thresholds.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-1)] disabled:opacity-50"
          >
            {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Evaluation
          </button>
          <button
            onClick={() => { setEditingRule(null); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Add Tier Rule
          </button>
        </div>
      </div>

      {/* Last evaluation result */}
      {lastResult && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10 text-green-500">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium text-[var(--text-1)]">Last Evaluation</p>
              <p className="text-sm text-[var(--text-3)]">{lastResult.message}</p>
            </div>
            <div className="ml-auto flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-[var(--text-1)]">{lastResult.evaluated}</p>
                <p className="text-xs text-[var(--text-3)]">Evaluated</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--primary)]">{lastResult.changed}</p>
                <p className="text-xs text-[var(--text-3)]">Changed</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-1">
        {([['rules', Settings, 'Tier Rules'], ['history', History, 'Change History']] as const).map(([tab, Icon, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
              activeTab === tab
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div>
          {rulesLoading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading rules…
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
              <Star className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
              <p className="font-medium text-[var(--text-2)]">No tier rules yet</p>
              <p className="mt-1 text-sm text-[var(--text-3)]">Create rules to automatically assign loyalty tiers based on customer activity.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" /> Add First Rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {[...rules].sort((a, b) => a.minSpend - b.minSpend).map((rule, idx) => (
                <div
                  key={rule.id}
                  className={cn(
                    'rounded-xl border bg-[var(--bg-card)] p-5 transition-all',
                    rule.active ? 'border-[var(--border)]' : 'border-dashed border-[var(--border)] opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                        style={{ background: rule.color }}
                      >
                        {ICON_MAP[rule.icon] ?? <Star className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text-1)]">{rule.tierName}</span>
                          {idx > 0 && <ChevronUp className="h-3 w-3 text-green-500" />}
                          {!rule.active && (
                            <span className="rounded bg-[var(--bg-1)] px-2 py-0.5 text-xs text-[var(--text-3)]">Inactive</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-3)]">
                          {rule.periodDays > 0 ? `Rolling ${rule.periodDays}-day window` : 'All-time'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-1)]"
                      >
                        {rule.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => openEdit(rule)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-1)]"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Thresholds */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { label: 'Min Spend', value: rule.minSpend > 0 ? formatCurrency(rule.minSpend, currency) : '—' },
                      { label: 'Min Points', value: rule.minPoints > 0 ? rule.minPoints.toLocaleString() : '—' },
                      { label: 'Min Visits', value: rule.minVisits > 0 ? rule.minVisits.toString() : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg bg-[var(--bg-1)] p-3">
                        <p className="text-xs text-[var(--text-3)]">{label}</p>
                        <p className="mt-0.5 font-semibold text-[var(--text-1)]">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Benefits */}
                  {Object.keys(rule.benefits).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(rule.benefits).map(([k, v]) => (
                        <span
                          key={k}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ background: rule.color }}
                        >
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading history…
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
              <History className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
              <p className="font-medium text-[var(--text-2)]">No tier changes yet</p>
              <p className="mt-1 text-sm text-[var(--text-3)]">Run an evaluation to see tier upgrade/downgrade history here.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                  <tr>
                    {['Customer', 'From', '', 'To', 'Reason', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {history.map(h => (
                    <tr key={h.id} className="hover:bg-[var(--bg-1)]">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{h.customerName ?? h.customerId.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-[var(--text-3)]">{h.fromTier ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-3)]">
                        {h.fromTier && h.toTier ? (
                          h.toTier > h.fromTier
                            ? <ChevronUp className="h-4 w-4 text-green-500" />
                            : <ChevronDown className="h-4 w-4 text-red-500" />
                        ) : '→'}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{h.toTier ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-3)]">{h.reason}</td>
                      <td className="px-4 py-3 text-[var(--text-3)]">
                        {new Date(h.changedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <RuleForm
          storeId={storeId}
          currency={currency}
          initial={editingRule}
          onClose={closeForm}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Clock, TrendingUp, Package, Globe, X, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type RuleType = 'TIME_BASED' | 'STOCK_BASED' | 'DEMAND_BASED' | 'COMPETITOR'
type ConditionOperator = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ'
type ActionType = 'INCREASE' | 'DECREASE' | 'SET'
type ActionUnit = 'PERCENT' | 'FIXED'

interface RuleCondition {
  field: string
  operator: ConditionOperator
  value: number
}

interface RuleAction {
  type: ActionType
  value: number
  unit: ActionUnit
}

interface PricingRule {
  id: string
  storeId: string
  name: string
  type: RuleType
  condition: RuleCondition
  action: RuleAction
  priority: number
  active: boolean
  validFrom: string | null
  validTo: string | null
}

interface PriceAdjustmentLog {
  id: string
  productId: string
  ruleId: string
  oldPrice: number
  newPrice: number
  appliedAt: string
  reason: string
  productName?: string
  ruleName?: string
}

interface Product {
  id: string
  name: string
  price: number
  stock?: number
}

interface DynamicPricingClientProps {
  storeId: string
  currency: string
  initialRules: PricingRule[]
  products: Product[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  TIME_BASED: 'Time-based',
  STOCK_BASED: 'Stock-based',
  DEMAND_BASED: 'Demand-based',
  COMPETITOR: 'Competitor',
}

const RULE_TYPE_ICONS: Record<RuleType, React.ReactNode> = {
  TIME_BASED: <Clock className="h-4 w-4" />,
  STOCK_BASED: <Package className="h-4 w-4" />,
  DEMAND_BASED: <TrendingUp className="h-4 w-4" />,
  COMPETITOR: <Globe className="h-4 w-4" />,
}

const FIELD_BY_TYPE: Record<RuleType, string> = {
  TIME_BASED: 'hour',
  STOCK_BASED: 'stock',
  DEMAND_BASED: 'demand_score',
  COMPETITOR: 'competitor_price',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function describeCondition(c: RuleCondition): string {
  const opMap: Record<string, string> = { GT: '>', GTE: '>=', LT: '<', LTE: '<=', EQ: '=' }
  return `${c.field} ${opMap[c.operator] ?? c.operator} ${c.value}`
}

function describeAction(a: RuleAction): string {
  const sign = a.type === 'INCREASE' ? '+' : a.type === 'DECREASE' ? '-' : '='
  return `${sign}${a.value}${a.unit === 'PERCENT' ? '%' : ' IDR'}`
}

// ── Rule Modal ────────────────────────────────────────────────────────────────

interface RuleModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (rule: Partial<PricingRule>) => void
  rule?: PricingRule
  products: Product[]
  currency: string
  storeId: string
}

function RuleModal({ isOpen, onClose, onSave, rule, products, currency, storeId }: RuleModalProps) {
  const [name, setName] = useState(rule?.name ?? '')
  const [type, setType] = useState<RuleType>(rule?.type ?? 'TIME_BASED')
  const [condOperator, setCondOperator] = useState<ConditionOperator>(rule?.condition?.operator ?? 'LT')
  const [condValue, setCondValue] = useState(String(rule?.condition?.value ?? 20))
  const [actionType, setActionType] = useState<ActionType>(rule?.action?.type ?? 'DECREASE')
  const [actionValue, setActionValue] = useState(String(rule?.action?.value ?? 10))
  const [actionUnit, setActionUnit] = useState<ActionUnit>(rule?.action?.unit ?? 'PERCENT')
  const [priority, setPriority] = useState(String(rule?.priority ?? 10))
  const [active, setActive] = useState(rule?.active ?? true)
  const [validFrom, setValidFrom] = useState(formatDateLocal(rule?.validFrom ?? null))
  const [validTo, setValidTo] = useState(formatDateLocal(rule?.validTo ?? null))
  const [previewProductId, setPreviewProductId] = useState(products[0]?.id ?? '')
  const [previewPrice, setPreviewPrice] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!rule) return
    setName(rule.name)
    setType(rule.type)
    setCondOperator(rule.condition?.operator ?? 'LT')
    setCondValue(String(rule.condition?.value ?? 20))
    setActionType(rule.action?.type ?? 'DECREASE')
    setActionValue(String(rule.action?.value ?? 10))
    setActionUnit(rule.action?.unit ?? 'PERCENT')
    setPriority(String(rule.priority))
    setActive(rule.active)
    setValidFrom(formatDateLocal(rule.validFrom ?? null))
    setValidTo(formatDateLocal(rule.validTo ?? null))
  }, [rule])

  const buildPayload = useCallback((): Partial<PricingRule> => ({
    id: rule?.id,
    name,
    type,
    condition: { field: FIELD_BY_TYPE[type], operator: condOperator, value: Number(condValue) },
    action: { type: actionType, value: Number(actionValue), unit: actionUnit },
    priority: Number(priority),
    active,
    validFrom: validFrom ? new Date(validFrom).toISOString() : null,
    validTo: validTo ? new Date(validTo).toISOString() : null,
  }), [rule, name, type, condOperator, condValue, actionType, actionValue, actionUnit, priority, active, validFrom, validTo])

  const handlePreview = async () => {
    if (!previewProductId) return
    setPreviewLoading(true)
    try {
      const product = products.find(p => p.id === previewProductId)
      const res = await fetch('/api/pricing-rules/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: previewProductId, currentPrice: product?.price ?? 0, storeId }),
      })
      const data = await res.json() as any
      if (data.error) toast.error(data.error)
      else setPreviewPrice(data.finalPrice)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  if (!isOpen) return null
  const selectedProduct = products.find(p => p.id === previewProductId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-[var(--bg-card)] p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute right-4 top-4 text-[var(--text-2)] hover:text-[var(--text-1)]">
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-6 text-xl font-semibold text-[var(--text-1)]">
          {rule ? 'Edit Pricing Rule' : 'New Pricing Rule'}
        </h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Rule Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
              placeholder="Happy Hour Discount" />
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Rule Type</label>
              <select value={type} onChange={e => setType(e.target.value as RuleType)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]">
                <option value="TIME_BASED">Time-based</option>
                <option value="STOCK_BASED">Stock-based</option>
                <option value="DEMAND_BASED">Demand-based</option>
                <option value="COMPETITOR">Competitor</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Priority</label>
              <input type="number" value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]" />
            </div>
          </div>

          {/* Condition */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
            <p className="text-sm font-medium text-[var(--text-2)]">Condition — when <span className="text-[var(--text-1)]">{FIELD_BY_TYPE[type]}</span> is:</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-2)]">Operator</label>
                <select value={condOperator} onChange={e => setCondOperator(e.target.value as ConditionOperator)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)]">
                  <option value="GT">Greater than (&gt;)</option>
                  <option value="GTE">Greater or equal (&gt;=)</option>
                  <option value="LT">Less than (&lt;)</option>
                  <option value="LTE">Less or equal (&lt;=)</option>
                  <option value="EQ">Equal (=)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-2)]">
                  Value {type === 'TIME_BASED' ? '(0–23 hour)' : type === 'STOCK_BASED' ? '(units)' : ''}
                </label>
                <input type="number" value={condValue} onChange={e => setCondValue(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)]" />
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
            <p className="text-sm font-medium text-[var(--text-2)]">Action — then:</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-2)]">Type</label>
                <select value={actionType} onChange={e => setActionType(e.target.value as ActionType)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)]">
                  <option value="INCREASE">Increase</option>
                  <option value="DECREASE">Decrease</option>
                  <option value="SET">Set to</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-2)]">Value</label>
                <input type="number" value={actionValue} onChange={e => setActionValue(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-2)]">Unit</label>
                <select value={actionUnit} onChange={e => setActionUnit(e.target.value as ActionUnit)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)]">
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FIXED">Fixed (IDR)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Validity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Valid From</label>
              <input type="datetime-local" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Valid To</label>
              <input type="datetime-local" value={validTo} onChange={e => setValidTo(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]" />
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setActive(v => !v)}
              className={cn('h-6 w-11 rounded-full transition-colors', active ? 'bg-blue-500' : 'bg-[var(--border)]')}
            >
              <div className={cn('h-5 w-5 m-0.5 rounded-full bg-white shadow transition-transform', active ? 'translate-x-5' : 'translate-x-0')} />
            </div>
            <span className="text-sm text-[var(--text-2)]">Active</span>
          </label>

          {/* Preview */}
          {products.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--text-2)]">Preview</p>
              <div className="flex gap-2">
                <select value={previewProductId} onChange={e => setPreviewProductId(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)]">
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button onClick={handlePreview} disabled={previewLoading}
                  className="rounded-lg bg-[var(--bg-card)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-1)] hover:bg-[var(--border)] disabled:opacity-50">
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Preview'}
                </button>
              </div>
              {previewPrice !== null && selectedProduct && (
                <p className="text-sm text-[var(--text-2)]">
                  {selectedProduct.name}: {formatCurrency(selectedProduct.price, currency)} →{' '}
                  <span className="font-semibold text-[var(--text-1)]">{formatCurrency(previewPrice, currency)}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-1)]">
            Cancel
          </button>
          <button onClick={() => { onSave(buildPayload()); onClose() }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Save Rule
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Logs Panel ────────────────────────────────────────────────────────────────

function LogsPanel({ storeId, currency }: { storeId: string; currency: string }) {
  const [logs, setLogs] = useState<PriceAdjustmentLog[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/price-adjustment-logs?storeId=${storeId}`)
      const data = await res.json() as any
      setLogs(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (open) fetchLogs()
  }, [open, fetchLogs])

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-[var(--bg-1)]"
      >
        <span className="font-medium text-[var(--text-1)]">Price Adjustment Log</span>
        {open ? <ChevronUp className="h-4 w-4 text-[var(--text-2)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-2)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--border)]">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-2)]" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-[var(--text-2)]">
              <AlertCircle className="h-8 w-8 opacity-40" />
              <p className="text-sm">No adjustments logged yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Product</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Rule</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">Old Price</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">New Price</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Applied At</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-1)]">
                      <td className="px-4 py-3 text-[var(--text-1)]">{log.productName ?? log.productId}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{log.ruleName ?? log.ruleId}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-2)]">{formatCurrency(log.oldPrice, currency)}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--text-1)]">{formatCurrency(log.newPrice, currency)}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{new Date(log.appliedAt).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DynamicPricingClient({
  storeId,
  currency,
  initialRules,
  products,
}: DynamicPricingClientProps) {
  const [rules, setRules] = useState<PricingRule[]>(initialRules)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<PricingRule | undefined>()
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSave = async (payload: Partial<PricingRule>) => {
    setSaving(true)
    try {
      const isEdit = Boolean(payload.id)
      const url = isEdit ? `/api/pricing-rules/${payload.id}` : '/api/pricing-rules'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, storeId }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Failed to save rule'); return }

      if (isEdit) {
        setRules(prev => prev.map(r => r.id === data.id ? data : r))
        toast.success('Rule updated')
      } else {
        setRules(prev => [data, ...prev])
        toast.success('Rule created')
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rule: PricingRule) => {
    try {
      const res = await fetch(`/api/pricing-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Failed to update'); return }
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pricing rule?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/pricing-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      })
      if (!res.ok) { toast.error('Failed to delete'); return }
      setRules(prev => prev.filter(r => r.id !== id))
      toast.success('Rule deleted')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Dynamic Pricing</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            Auto-adjust prices based on time, stock, demand, or competitor data.
          </p>
        </div>
        <button
          onClick={() => { setEditingRule(undefined); setModalOpen(true) }}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(['TIME_BASED', 'STOCK_BASED', 'DEMAND_BASED', 'COMPETITOR'] as RuleType[]).map(t => {
          const count = rules.filter(r => r.type === t).length
          const active = rules.filter(r => r.type === t && r.active).length
          return (
            <div key={t} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <div className="flex items-center gap-2 text-[var(--text-2)]">
                {RULE_TYPE_ICONS[t]}
                <span className="text-xs">{RULE_TYPE_LABELS[t]}</span>
              </div>
              <p className="mt-1 text-xl font-bold text-[var(--text-1)]">{count}</p>
              <p className="text-xs text-[var(--text-2)]">{active} active</p>
            </div>
          )
        })}
      </div>

      {/* Rules table */}
      {sortedRules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] py-16 text-[var(--text-2)]">
          <TrendingUp className="h-10 w-10 opacity-30" />
          <p className="text-sm">No pricing rules yet. Create one to get started.</p>
          <button
            onClick={() => { setEditingRule(undefined); setModalOpen(true) }}
            className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-1)]"
          >
            <Plus className="h-4 w-4" /> Add First Rule
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Name</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Type</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Condition</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Action</th>
                <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Priority</th>
                <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Active</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map(rule => (
                <tr key={rule.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-1)]">
                  <td className="px-4 py-3 font-medium text-[var(--text-1)]">{rule.name}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-[var(--text-2)]">
                      {RULE_TYPE_ICONS[rule.type]}
                      {RULE_TYPE_LABELS[rule.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-2)]">
                    {rule.condition ? describeCondition(rule.condition) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">
                    {rule.action ? describeAction(rule.action) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--text-2)]">{rule.priority}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={cn(
                        'inline-block h-5 w-9 rounded-full transition-colors',
                        rule.active ? 'bg-blue-500' : 'bg-[var(--border)]',
                      )}
                    >
                      <span className={cn(
                        'block h-4 w-4 mx-0.5 rounded-full bg-white shadow transition-transform',
                        rule.active ? 'translate-x-4' : 'translate-x-0',
                      )} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingRule(rule); setModalOpen(true) }}
                        className="rounded p-1 text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-1)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deletingId === rule.id}
                        className="rounded p-1 text-[var(--text-2)] hover:text-red-500 hover:bg-[var(--bg-1)] disabled:opacity-40"
                      >
                        {deletingId === rule.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Logs */}
      <LogsPanel storeId={storeId} currency={currency} />

      {/* Modal */}
      <RuleModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingRule(undefined) }}
        onSave={handleSave}
        rule={editingRule}
        products={products}
        currency={currency}
        storeId={storeId}
      />
    </div>
  )
}

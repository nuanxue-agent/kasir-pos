'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Clock, TrendingUp, Package, Zap, X, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type RuleType = 'TIME_BASED' | 'DEMAND_BASED' | 'STOCK_BASED' | 'SURGE'
type AdjustmentType = 'PERCENTAGE' | 'FIXED'

interface PricingRule {
  id: string
  storeId: string
  name: string
  ruleType: RuleType
  conditions: any
  adjustment: AdjustmentType
  value: number
  priority: number
  active: boolean
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyAdjustment(price: number, adjustment: AdjustmentType, value: number): number {
  if (adjustment === 'PERCENTAGE') {
    return Math.round(price * (1 + value / 100))
  }
  return Math.max(0, price + value)
}

function evaluateRule(rule: PricingRule, product: Product, now = new Date()): { applies: boolean; effectivePrice: number } {
  if (!rule.active) return { applies: false, effectivePrice: product.price }

  const cond = rule.conditions || {}
  let applies = false

  if (rule.ruleType === 'TIME_BASED') {
    const hour = now.getHours()
    const startHour = cond.startHour ?? 0
    const endHour = cond.endHour ?? 24
    applies = hour >= startHour && hour < endHour
  } else if (rule.ruleType === 'STOCK_BASED') {
    const stock = product.stock ?? 0
    const threshold = cond.threshold ?? 0
    const operator = cond.operator || 'GT' // GT | LT
    applies = operator === 'GT' ? stock > threshold : stock < threshold
  } else if (rule.ruleType === 'DEMAND_BASED' || rule.ruleType === 'SURGE') {
    applies = true // Simplified: always active for demo
  }

  const effectivePrice = applies ? applyAdjustment(product.price, rule.adjustment, rule.value) : product.price
  return { applies, effectivePrice }
}

function calcEffectivePrice(product: Product, rules: PricingRule[], now = new Date()): number {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  let price = product.price

  for (const rule of sorted) {
    const { applies, effectivePrice } = evaluateRule(rule, product, now)
    if (applies) {
      price = effectivePrice
    }
  }

  return price
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface RuleModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (rule: Partial<PricingRule>) => void
  rule?: PricingRule
  products: Product[]
  currency: string
}

function RuleModal({ isOpen, onClose, onSave, rule, products, currency }: RuleModalProps) {
  const [name, setName] = useState(rule?.name || '')
  const [ruleType, setRuleType] = useState<RuleType>(rule?.ruleType || 'TIME_BASED')
  const [adjustment, setAdjustment] = useState<AdjustmentType>(rule?.adjustment || 'PERCENTAGE')
  const [value, setValue] = useState(rule?.value?.toString() || '0')
  const [priority, setPriority] = useState(rule?.priority?.toString() || '10')
  const [active, setActive] = useState(rule?.active ?? true)

  const [startHour, setStartHour] = useState(rule?.conditions?.startHour?.toString() || '18')
  const [endHour, setEndHour] = useState(rule?.conditions?.endHour?.toString() || '21')
  const [threshold, setThreshold] = useState(rule?.conditions?.threshold?.toString() || '10')
  const [operator, setOperator] = useState(rule?.conditions?.operator || 'GT')

  const [previewProductId, setPreviewProductId] = useState(products[0]?.id || '')
  const [previewPrice, setPreviewPrice] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (rule) {
      setName(rule.name)
      setRuleType(rule.ruleType)
      setAdjustment(rule.adjustment)
      setValue(rule.value.toString())
      setPriority(rule.priority.toString())
      setActive(rule.active)
      setStartHour(rule.conditions?.startHour?.toString() || '18')
      setEndHour(rule.conditions?.endHour?.toString() || '21')
      setThreshold(rule.conditions?.threshold?.toString() || '10')
      setOperator(rule.conditions?.operator || 'GT')
    }
  }, [rule])

  const handleSave = () => {
    let conditions: any = {}
    if (ruleType === 'TIME_BASED') {
      conditions = { startHour: Number(startHour), endHour: Number(endHour) }
    } else if (ruleType === 'STOCK_BASED') {
      conditions = { threshold: Number(threshold), operator }
    }

    onSave({
      id: rule?.id,
      name,
      ruleType,
      conditions,
      adjustment,
      value: Number(value),
      priority: Number(priority),
      active,
    })
    onClose()
  }

  const handlePreview = async () => {
    if (!previewProductId) return
    setPreviewLoading(true)
    try {
      let conditions: any = {}
      if (ruleType === 'TIME_BASED') {
        conditions = { startHour: Number(startHour), endHour: Number(endHour) }
      } else if (ruleType === 'STOCK_BASED') {
        conditions = { threshold: Number(threshold), operator }
      }

      const res = await fetch('/api/pricing-rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: previewProductId,
          rule: { ruleType, conditions, adjustment, value: Number(value) },
        }),
      })
      const data = await res.json() as any
      if (data.error) {
        toast.error(data.error)
      } else {
        setPreviewPrice(data.effectivePrice)
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  if (!isOpen) return null

  const selectedProduct = products.find(p => p.id === previewProductId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-[var(--bg-card)] p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-6 text-xl font-semibold text-[var(--text-1)]">
          {rule ? 'Edit Pricing Rule' : 'New Pricing Rule'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
              placeholder="Happy Hour Discount"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Rule Type</label>
              <select
                value={ruleType}
                onChange={e => setRuleType(e.target.value as RuleType)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
              >
                <option value="TIME_BASED">Time-based</option>
                <option value="STOCK_BASED">Stock-based</option>
                <option value="DEMAND_BASED">Demand-based</option>
                <option value="SURGE">Surge Pricing</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
              />
            </div>
          </div>

          {ruleType === 'TIME_BASED' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Start Hour</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={startHour}
                  onChange={e => setStartHour(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">End Hour</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={endHour}
                  onChange={e => setEndHour(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
                />
              </div>
            </div>
          )}

          {ruleType === 'STOCK_BASED' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Operator</label>
                <select
                  value={operator}
                  onChange={e => setOperator(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
                >
                  <option value="GT">Greater than (&gt;)</option>
                  <option value="LT">Less than (&lt;)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Adjustment Type</label>
              <select
                value={adjustment}
                onChange={e => setAdjustment(e.target.value as AdjustmentType)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                Value {adjustment === 'PERCENTAGE' ? '(%)' : `(${currency})`}
              </label>
              <input
                type="number"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            <label htmlFor="active" className="text-sm text-[var(--text-2)]">
              Active
            </label>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-4">
            <h3 className="mb-3 text-sm font-medium text-[var(--text-1)]">Preview</h3>
            <div className="grid grid-cols-[1fr,auto] gap-2">
              <select
                value={previewProductId}
                onChange={e => {
                  setPreviewProductId(e.target.value)
                  setPreviewPrice(null)
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)]"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {formatCurrency(p.price, currency)}
                  </option>
                ))}
              </select>
              <button
                onClick={handlePreview}
                disabled={previewLoading}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calculate'}
              </button>
            </div>
            {previewPrice !== null && selectedProduct && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-[var(--text-2)]">Effective Price:</span>
                <span className="font-semibold text-[var(--text-1)]">
                  {formatCurrency(previewPrice, currency)}
                </span>
                {previewPrice !== selectedProduct.price && (
                  <span className={cn(
                    "text-xs",
                    previewPrice > selectedProduct.price ? "text-red-500" : "text-green-500"
                  )}>
                    ({previewPrice > selectedProduct.price ? '+' : ''}{previewPrice - selectedProduct.price})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {rule ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<PricingRule | undefined>()
  const [loading, setLoading] = useState(false)

  const handleSaveRule = async (ruleData: Partial<PricingRule>) => {
    setLoading(true)
    try {
      if (ruleData.id) {
        const res = await fetch(`/api/pricing-rules/${ruleData.id}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
        })
        const data = await res.json() as any
        if (data.error) {
          toast.error(data.error)
        } else {
          setRules(prev => prev.map(r => (r.id === ruleData.id ? { ...r, ...ruleData } : r)))
          toast.success('Rule updated')
        }
      } else {
        const res = await fetch(`/api/pricing-rules?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
        })
        const data = await res.json() as any
        if (data.error) {
          toast.error(data.error)
        } else {
          const newRule = { ...ruleData, id: data.id, storeId } as PricingRule
          setRules(prev => [...prev, newRule])
          toast.success('Rule created')
        }
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (rule: PricingRule) => {
    try {
      const res = await fetch(`/api/pricing-rules/${rule.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      })
      const data = await res.json() as any
      if (data.error) {
        toast.error(data.error)
      } else {
        setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, active: !r.active } : r)))
        toast.success(rule.active ? 'Rule deactivated' : 'Rule activated')
      }
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const getRuleIcon = (ruleType: RuleType) => {
    switch (ruleType) {
      case 'TIME_BASED':
        return <Clock className="h-5 w-5" />
      case 'STOCK_BASED':
        return <Package className="h-5 w-5" />
      case 'DEMAND_BASED':
        return <TrendingUp className="h-5 w-5" />
      case 'SURGE':
        return <Zap className="h-5 w-5" />
      default:
        return <TrendingUp className="h-5 w-5" />
    }
  }

  const getRuleDescription = (rule: PricingRule) => {
    const cond = rule.conditions || {}
    const adj = rule.adjustment === 'PERCENTAGE' ? `${rule.value}%` : `${currency}${rule.value}`

    if (rule.ruleType === 'TIME_BASED') {
      return `${cond.startHour || 0}:00 - ${cond.endHour || 24}:00 • ${adj} ${rule.value >= 0 ? 'surcharge' : 'discount'}`
    } else if (rule.ruleType === 'STOCK_BASED') {
      const op = cond.operator === 'GT' ? '>' : '<'
      return `Stock ${op} ${cond.threshold || 0} • ${adj} ${rule.value >= 0 ? 'increase' : 'decrease'}`
    } else if (rule.ruleType === 'SURGE') {
      return `Surge pricing • ${adj} increase`
    } else {
      return `Demand-based • ${adj} adjustment`
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Dynamic Pricing</h1>
          <p className="text-sm text-[var(--text-2)]">
            Automatically adjust prices based on time, stock, and demand
          </p>
        </div>
        <button
          onClick={() => {
            setEditingRule(undefined)
            setIsModalOpen(true)
          }}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </button>
      </div>

      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
            <TrendingUp className="mx-auto mb-3 h-12 w-12 text-[var(--text-3)]" />
            <p className="mb-1 font-medium text-[var(--text-2)]">No pricing rules yet</p>
            <p className="mb-4 text-sm text-[var(--text-3)]">
              Create your first dynamic pricing rule to optimize revenue
            </p>
            <button
              onClick={() => {
                setEditingRule(undefined)
                setIsModalOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Create Rule
            </button>
          </div>
        ) : (
          rules
            .sort((a, b) => b.priority - a.priority)
            .map(rule => (
              <div
                key={rule.id}
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  rule.active
                    ? "border-[var(--border)] bg-[var(--bg-card)]"
                    : "border-[var(--border)] bg-[var(--bg-1)] opacity-60"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "rounded-lg p-2",
                      rule.active ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "bg-[var(--bg-2)] text-[var(--text-3)]"
                    )}>
                      {getRuleIcon(rule.ruleType)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[var(--text-1)]">{rule.name}</h3>
                        <span className="rounded bg-[var(--bg-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]">
                          Priority {rule.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-2)]">
                        {getRuleDescription(rule)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                        rule.active
                          ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                          : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-3)]"
                      )}
                    >
                      {rule.active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingRule(rule)
                        setIsModalOpen(true)
                      }}
                      className="rounded-lg p-2 text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>

      <RuleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingRule(undefined)
        }}
        onSave={handleSaveRule}
        rule={editingRule}
        products={products}
        currency={currency}
      />
    </div>
  )
}

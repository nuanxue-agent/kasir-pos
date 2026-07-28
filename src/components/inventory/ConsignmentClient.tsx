'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Loader2, FileText, ChevronDown, ChevronUp, PackageCheck } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcCommission,
  calcVendorPayment,
  calcTotalCost,
  calcUnsoldQty,
  calcUnsettledQty,
  isContractActive,
  isValidTransition,
  periodLabel,
} from '@/lib/consignment'
import type {
  ConsignmentContract,
  ConsignmentItem,
  ConsignmentSettlement,
  ContractStatus,
  SettlementPeriod,
} from '@/lib/consignment'

// Re-export pure functions for unit tests
export {
  calcCommission,
  calcVendorPayment,
  calcTotalCost,
  calcUnsoldQty,
  calcUnsettledQty,
  isContractActive,
  isValidTransition,
  periodLabel,
} from '@/lib/consignment'
export type {
  ConsignmentContract,
  ConsignmentItem,
  ConsignmentSettlement,
  ContractStatus,
  SettlementPeriod,
} from '@/lib/consignment'

interface Vendor {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  price: number
}

interface ContractRow extends ConsignmentContract {
  vendorName?: string
}

interface Props {
  storeId: string
  currency: string
  initialContracts: ContractRow[]
  vendors: Vendor[]
  products: Product[]
}

const STATUS_COLORS: Record<ContractStatus, string> = {
  ACTIVE:     'bg-green-500/15 text-green-400 border border-green-500/30',
  TERMINATED: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30',
}

const SETTLEMENT_PERIOD_OPTIONS: SettlementPeriod[] = ['WEEKLY', 'MONTHLY']

function StatusBadge({ status }: { status: ContractStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLORS[status])}>
      {status}
    </span>
  )
}

export default function ConsignmentClient({
  storeId,
  currency,
  initialContracts,
  vendors,
  products,
}: Props) {
  const [contracts, setContracts] = useState<ContractRow[]>(initialContracts)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, ConsignmentItem[]>>({})
  const [loadingItems, setLoadingItems] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showItemForm, setShowItemForm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [settling, setSettling] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const [form, setForm] = useState({
    vendorId: '',
    commissionRate: '10',
    settlementPeriod: 'MONTHLY' as SettlementPeriod,
    startDate: '',
  })

  const [itemForm, setItemForm] = useState({
    productId: '',
    qty: '',
    costPrice: '',
  })

  const filtered = statusFilter === 'ALL'
    ? contracts
    : contracts.filter(c => c.status === statusFilter)

  const loadItems = useCallback(async (contractId: string) => {
    setLoadingItems(contractId)
    try {
      const res = await fetch(`/api/consignment-contracts/${contractId}/items?storeId=${storeId}`)
      const data = await res.json() as any
      if (res.ok) {
        setItems(prev => ({ ...prev, [contractId]: data }))
      } else {
        toast.error(data.error ?? 'Failed to load items')
      }
    } catch {
      toast.error('Failed to load items')
    } finally {
      setLoadingItems(null)
    }
  }, [storeId])

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => {
      const next = prev === id ? null : id
      if (next && !items[next]) loadItems(next)
      return next
    })
  }, [items, loadItems])

  const handleCreate = async () => {
    if (!form.vendorId) { toast.error('Vendor is required'); return }
    if (!form.startDate) { toast.error('Start date is required'); return }
    const rate = Number(form.commissionRate)
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error('Commission rate must be 0–100'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/consignment-contracts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: form.vendorId,
          commissionRate: rate,
          settlementPeriod: form.settlementPeriod,
          startDate: form.startDate,
        }),
      })
      const data = await res.json() as any
      if (res.ok) {
        const vendor = vendors.find(v => v.id === form.vendorId)
        const newContract: ContractRow = {
          id: data.id,
          storeId,
          vendorId: form.vendorId,
          vendorName: vendor?.name,
          commissionRate: rate,
          settlementPeriod: form.settlementPeriod,
          status: 'ACTIVE',
          startDate: form.startDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        setContracts(prev => [newContract, ...prev])
        setShowForm(false)
        setForm({ vendorId: '', commissionRate: '10', settlementPeriod: 'MONTHLY', startDate: '' })
        toast.success('Contract created')
      } else {
        toast.error(data.error ?? 'Failed to create contract')
      }
    } catch {
      toast.error('Failed to create contract')
    } finally {
      setSaving(false)
    }
  }

  const handleTerminate = async (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId)
    if (!contract) return
    if (!isValidTransition(contract.status, 'TERMINATED')) {
      toast.error('Cannot terminate this contract')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/consignment-contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'TERMINATED' }),
      })
      const data = await res.json() as any
      if (res.ok) {
        setContracts(prev => prev.map(c => c.id === contractId ? { ...c, status: 'TERMINATED' } : c))
        toast.success('Contract terminated')
      } else {
        toast.error(data.error ?? 'Failed to terminate contract')
      }
    } catch {
      toast.error('Failed to terminate contract')
    } finally {
      setSaving(false)
    }
  }

  const handleAddItem = async (contractId: string) => {
    if (!itemForm.productId) { toast.error('Product is required'); return }
    if (!itemForm.qty) { toast.error('Quantity is required'); return }
    if (!itemForm.costPrice) { toast.error('Cost price is required'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/consignment-contracts/${contractId}/items?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: itemForm.productId,
          qty: Number(itemForm.qty),
          costPrice: Number(itemForm.costPrice),
        }),
      })
      const data = await res.json() as any
      if (res.ok) {
        await loadItems(contractId)
        setShowItemForm(null)
        setItemForm({ productId: '', qty: '', costPrice: '' })
        toast.success('Item added')
      } else {
        toast.error(data.error ?? 'Failed to add item')
      }
    } catch {
      toast.error('Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  const handleSettle = async (contractId: string) => {
    setSettling(contractId)
    try {
      const res = await fetch(`/api/consignment-contracts/${contractId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const data = await res.json() as any
      if (res.ok) {
        await loadItems(contractId)
        toast.success(
          `Settlement created for ${data.period} — vendor payment: ${formatCurrency(data.vendorPayment, currency)}`,
        )
      } else {
        toast.error(data.error ?? 'Settlement failed')
      }
    } catch {
      toast.error('Settlement failed')
    } finally {
      setSettling(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Consignment Contracts</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Sell vendor stock and settle payments after sales
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Contract
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['ALL', 'ACTIVE', 'TERMINATED'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* New Contract Form */}
      {showForm && (
        <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">New Consignment Contract</h2>
            <button onClick={() => setShowForm(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">Vendor *</label>
              <select
                value={form.vendorId}
                onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
              >
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">Commission Rate (%) *</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.commissionRate}
                onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
                placeholder="10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">Settlement Period *</label>
              <select
                value={form.settlementPeriod}
                onChange={e => setForm(f => ({ ...f, settlementPeriod: e.target.value as SettlementPeriod }))}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
              >
                {SETTLEMENT_PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Contract
            </button>
          </div>
        </div>
      )}

      {/* Contract List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-text-muted)] text-sm">
          No consignment contracts found
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(contract => {
            const contractItems = items[contract.id] ?? []
            const totalUnsold = contractItems.reduce((sum, i) => sum + calcUnsoldQty(i), 0)
            const totalUnsettled = contractItems.reduce((sum, i) => sum + calcUnsettledQty(i), 0)
            const unsettledCost = contractItems.reduce((sum, i) => {
              return sum + calcTotalCost(calcUnsettledQty(i), i.costPrice)
            }, 0)
            const pendingVendorPayment = calcVendorPayment(unsettledCost, contract.commissionRate)

            return (
              <div
                key={contract.id}
                className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl overflow-hidden"
              >
                {/* Contract header */}
                <div className="p-4 flex items-center gap-3">
                  <button
                    onClick={() => toggleExpand(contract.id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    <FileText className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[var(--color-text-primary)] truncate">
                          {contract.vendorName ?? contract.vendorId}
                        </span>
                        <StatusBadge status={contract.status} />
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {contract.commissionRate}% commission · {contract.settlementPeriod} · started {contract.startDate}
                      </p>
                    </div>
                    {totalUnsettled > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-amber-400 font-medium">{totalUnsettled} units pending</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {formatCurrency(pendingVendorPayment, currency)} to vendor
                        </p>
                      </div>
                    )}
                    {expandedId === contract.id ? (
                      <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                    )}
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isContractActive(contract) && totalUnsettled > 0 && (
                      <button
                        onClick={() => handleSettle(contract.id)}
                        disabled={settling === contract.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 disabled:opacity-50"
                      >
                        {settling === contract.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <PackageCheck className="w-3.5 h-3.5" />}
                        Settle
                      </button>
                    )}
                    {isContractActive(contract) && (
                      <button
                        onClick={() => handleTerminate(contract.id)}
                        disabled={saving}
                        className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Terminate
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded items panel */}
                {expandedId === contract.id && (
                  <div className="border-t border-[var(--color-border)] p-4 space-y-3">
                    {loadingItems === contract.id ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading items…
                      </div>
                    ) : (
                      <>
                        {contractItems.length === 0 ? (
                          <p className="text-sm text-[var(--color-text-muted)]">No items yet</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                                  <th className="text-left py-2 pr-4 font-medium">Product</th>
                                  <th className="text-right py-2 px-4 font-medium">Stock</th>
                                  <th className="text-right py-2 px-4 font-medium">Sold</th>
                                  <th className="text-right py-2 px-4 font-medium">Unsold</th>
                                  <th className="text-right py-2 px-4 font-medium">Unsettled</th>
                                  <th className="text-right py-2 pl-4 font-medium">Cost Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {contractItems.map(item => (
                                  <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                                    <td className="py-2 pr-4 text-[var(--color-text-primary)]">
                                      {(item as any).productName ?? item.productId}
                                    </td>
                                    <td className="py-2 px-4 text-right text-[var(--color-text-primary)]">{item.qty}</td>
                                    <td className="py-2 px-4 text-right text-[var(--color-text-primary)]">{item.soldQty}</td>
                                    <td className="py-2 px-4 text-right">
                                      <span className={cn(
                                        calcUnsoldQty(item) > 0
                                          ? 'text-amber-400'
                                          : 'text-[var(--color-text-muted)]',
                                      )}>
                                        {calcUnsoldQty(item)}
                                      </span>
                                    </td>
                                    <td className="py-2 px-4 text-right">
                                      <span className={cn(
                                        calcUnsettledQty(item) > 0
                                          ? 'text-blue-400'
                                          : 'text-[var(--color-text-muted)]',
                                      )}>
                                        {calcUnsettledQty(item)}
                                      </span>
                                    </td>
                                    <td className="py-2 pl-4 text-right text-[var(--color-text-primary)]">
                                      {formatCurrency(item.costPrice, currency)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Add item form */}
                        {isContractActive(contract) && showItemForm === contract.id ? (
                          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 space-y-3 mt-2">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs text-[var(--color-text-muted)]">Product *</label>
                                <select
                                  value={itemForm.productId}
                                  onChange={e => setItemForm(f => ({ ...f, productId: e.target.value }))}
                                  className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-primary)]"
                                >
                                  <option value="">Select…</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-[var(--color-text-muted)]">Qty *</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={itemForm.qty}
                                  onChange={e => setItemForm(f => ({ ...f, qty: e.target.value }))}
                                  className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-primary)]"
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-[var(--color-text-muted)]">Cost Price *</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={itemForm.costPrice}
                                  onChange={e => setItemForm(f => ({ ...f, costPrice: e.target.value }))}
                                  className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-primary)]"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setShowItemForm(null); setItemForm({ productId: '', qty: '', costPrice: '' }) }}
                                className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleAddItem(contract.id)}
                                disabled={saving}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                              >
                                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                                Add Item
                              </button>
                            </div>
                          </div>
                        ) : isContractActive(contract) ? (
                          <button
                            onClick={() => setShowItemForm(contract.id)}
                            className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mt-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add item
                          </button>
                        ) : null}
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

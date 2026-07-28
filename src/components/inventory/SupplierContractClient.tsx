'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Loader2, FileText, AlertTriangle, ChevronDown, ChevronUp, Tag } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  isContractValid,
  isContractExpiringSoon,
  calcPriceSavings,
  deriveContractStatus,
} from '@/lib/supplier-contracts'
import type { SupplierContract, ContractPriceLine } from '@/lib/supplier-contracts'

// Re-export pure functions for unit tests
export {
  isContractValid,
  isContractExpiringSoon,
  calcPriceSavings,
  deriveContractStatus,
} from '@/lib/supplier-contracts'

export type { SupplierContract, ContractPriceLine } from '@/lib/supplier-contracts'

interface Vendor {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  price: number
}

interface Props {
  storeId: string
  currency: string
  initialContracts: SupplierContract[]
  vendors: Vendor[]
  products: Product[]
}

type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'DRAFT' | 'TERMINATED'

const STATUS_COLORS: Record<ContractStatus, string> = {
  ACTIVE:     'bg-green-500/15 text-green-400 border border-green-500/30',
  DRAFT:      'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  EXPIRED:    'bg-red-500/15 text-red-400 border border-red-500/30',
  TERMINATED: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30',
}

const PAYMENT_TERMS = ['NET7', 'NET14', 'NET30', 'NET60', 'NET90', 'COD', 'PREPAID']

function StatusBadge({ status }: { status: ContractStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLORS[status])}>
      {status}
    </span>
  )
}

export default function SupplierContractClient({
  storeId,
  currency,
  initialContracts,
  vendors,
  products,
}: Props) {
  const [contracts, setContracts] = useState<SupplierContract[]>(initialContracts)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [priceLines, setPriceLines] = useState<Record<string, ContractPriceLine[]>>({})
  const [loadingLines, setLoadingLines] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showLineForm, setShowLineForm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const [form, setForm] = useState({
    vendorId: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    paymentTerms: 'NET30',
    status: 'DRAFT' as ContractStatus,
    notes: '',
  })

  const [lineForm, setLineForm] = useState({
    productId: '',
    unitPrice: '',
    minOrderQty: '1',
    validFrom: '',
    validTo: '',
  })

  const now = new Date()
  const expiring = contracts.filter(c => isContractExpiringSoon(c, 30, now))

  const filtered = statusFilter === 'ALL'
    ? contracts
    : contracts.filter(c => c.status === statusFilter)

  const fetchContracts = useCallback(async () => {
    const res = await fetch(`/api/supplier-contracts?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) setContracts(data)
  }, [storeId])

  const fetchPriceLines = useCallback(async (contractId: string) => {
    setLoadingLines(contractId)
    const res = await fetch(`/api/supplier-contracts/${contractId}/price-lines?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) setPriceLines(prev => ({ ...prev, [contractId]: data }))
    setLoadingLines(null)
  }, [storeId])

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      if (!priceLines[id]) fetchPriceLines(id)
    }
  }

  const handleCreateContract = async () => {
    if (!form.vendorId || !form.contractNumber || !form.startDate || !form.endDate) {
      toast.error('Vendor, contract number, start date, and end date are required')
      return
    }
    setSaving(true)
    const res = await fetch(`/api/supplier-contracts?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Contract created')
    setShowForm(false)
    setForm({ vendorId: '', contractNumber: '', startDate: '', endDate: '', paymentTerms: 'NET30', status: 'DRAFT', notes: '' })
    fetchContracts()
  }

  const handleStatusChange = async (id: string, status: ContractStatus) => {
    const res = await fetch(`/api/supplier-contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    toast.success('Status updated')
    fetchContracts()
  }

  const handleAddPriceLine = async (contractId: string) => {
    if (!lineForm.productId || !lineForm.unitPrice || !lineForm.validFrom || !lineForm.validTo) {
      toast.error('Product, unit price, valid from, and valid to are required')
      return
    }
    setSaving(true)
    const res = await fetch(`/api/supplier-contracts/${contractId}/price-lines?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: lineForm.productId,
        unitPrice: Number(lineForm.unitPrice),
        minOrderQty: Number(lineForm.minOrderQty),
        validFrom: lineForm.validFrom,
        validTo: lineForm.validTo,
      }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Price line added')
    setShowLineForm(null)
    setLineForm({ productId: '', unitPrice: '', minOrderQty: '1', validFrom: '', validTo: '' })
    fetchPriceLines(contractId)
  }

  const vendorName = (vendorId: string) =>
    vendors.find(v => v.id === vendorId)?.name ?? vendorId

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
            Supplier Contracts
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Manage negotiated pricing agreements with suppliers
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <Plus size={16} /> New Contract
        </button>
      </div>

      {/* Expiry alerts */}
      {expiring.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
          <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-400">
              {expiring.length} contract{expiring.length > 1 ? 's' : ''} expiring within 30 days
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              {expiring.map(c => c.contractNumber).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['ALL', 'ACTIVE', 'DRAFT', 'EXPIRED', 'TERMINATED'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === s
                ? 'text-white'
                : 'border',
            )}
            style={statusFilter === s
              ? { background: 'var(--primary)' }
              : { borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }
            }
          >
            {s}
          </button>
        ))}
      </div>

      {/* Contract list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No contracts found</p>
          </div>
        )}
        {filtered.map(contract => {
          const lines = priceLines[contract.id] ?? []
          const isExpanded = expandedId === contract.id
          const expiringSoon = isContractExpiringSoon(contract, 30, now)

          return (
            <div
              key={contract.id}
              className="rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              {/* Contract row */}
              <div className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                      {contract.contractNumber}
                    </span>
                    <StatusBadge status={contract.status as ContractStatus} />
                    {expiringSoon && (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                        <AlertTriangle size={12} /> Expiring soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                    {contract.vendorName ?? vendorName(contract.vendorId)} ·{' '}
                    {contract.startDate} → {contract.endDate} · {contract.paymentTerms}
                  </p>
                </div>

                {/* Status change */}
                <select
                  value={contract.status}
                  onChange={e => handleStatusChange(contract.id, e.target.value as ContractStatus)}
                  className="text-xs rounded-lg px-2 py-1 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-2)' }}
                >
                  {(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'] as ContractStatus[]).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <button
                  onClick={() => toggleExpand(contract.id)}
                  className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                >
                  <Tag size={12} /> Price Lines
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Price lines panel */}
              {isExpanded && (
                <div
                  className="border-t px-4 py-4 space-y-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                      Contract Price Lines
                    </span>
                    <button
                      onClick={() => setShowLineForm(showLineForm === contract.id ? null : contract.id)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      <Plus size={12} /> Add Line
                    </button>
                  </div>

                  {loadingLines === contract.id && (
                    <div className="flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                    </div>
                  )}

                  {!loadingLines && lines.length === 0 && (
                    <p className="text-xs py-3 text-center" style={{ color: 'var(--text-3)' }}>
                      No price lines yet
                    </p>
                  )}

                  {lines.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ color: 'var(--text-3)' }}>
                            <th className="text-left py-1.5 pr-3">Product</th>
                            <th className="text-right py-1.5 pr-3">Contract Price</th>
                            <th className="text-right py-1.5 pr-3">Standard Price</th>
                            <th className="text-right py-1.5 pr-3">Savings</th>
                            <th className="text-right py-1.5 pr-3">Min Qty</th>
                            <th className="text-left py-1.5">Valid Period</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map(line => {
                            const std = Number((line as any).standardPrice ?? 0)
                            const { savings, savingsPct } = calcPriceSavings(line.unitPrice, std)
                            return (
                              <tr key={line.id} style={{ borderTop: '1px solid var(--border)' }}>
                                <td className="py-2 pr-3" style={{ color: 'var(--text-1)' }}>
                                  {(line as any).productName ?? line.productId}
                                </td>
                                <td className="py-2 pr-3 text-right font-medium text-green-400">
                                  {formatCurrency(line.unitPrice, currency)}
                                </td>
                                <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-3)' }}>
                                  {std > 0 ? formatCurrency(std, currency) : '—'}
                                </td>
                                <td className="py-2 pr-3 text-right">
                                  {std > 0 && savings > 0 ? (
                                    <span className="text-green-400">
                                      {savingsPct.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-3)' }}>—</span>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-2)' }}>
                                  {line.minOrderQty}
                                </td>
                                <td className="py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                                  {line.validFrom} → {line.validTo}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add price line form */}
                  {showLineForm === contract.id && (
                    <div
                      className="rounded-lg border p-3 space-y-3"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}
                    >
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                        New Price Line
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="col-span-2 sm:col-span-1">
                          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Product</label>
                          <select
                            value={lineForm.productId}
                            onChange={e => setLineForm(f => ({ ...f, productId: e.target.value }))}
                            className="w-full text-xs rounded-lg px-2 py-1.5 border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)' }}
                          >
                            <option value="">Select product</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Unit Price</label>
                          <input
                            type="number" min="0"
                            value={lineForm.unitPrice}
                            onChange={e => setLineForm(f => ({ ...f, unitPrice: e.target.value }))}
                            placeholder="0"
                            className="w-full text-xs rounded-lg px-2 py-1.5 border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)' }}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Min Qty</label>
                          <input
                            type="number" min="1"
                            value={lineForm.minOrderQty}
                            onChange={e => setLineForm(f => ({ ...f, minOrderQty: e.target.value }))}
                            className="w-full text-xs rounded-lg px-2 py-1.5 border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)' }}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Valid From</label>
                          <input
                            type="date"
                            value={lineForm.validFrom}
                            onChange={e => setLineForm(f => ({ ...f, validFrom: e.target.value }))}
                            className="w-full text-xs rounded-lg px-2 py-1.5 border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)' }}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Valid To</label>
                          <input
                            type="date"
                            value={lineForm.validTo}
                            onChange={e => setLineForm(f => ({ ...f, validTo: e.target.value }))}
                            className="w-full text-xs rounded-lg px-2 py-1.5 border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)' }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setShowLineForm(null)}
                          className="text-xs px-3 py-1.5 rounded-lg border"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddPriceLine(contract.id)}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 text-white"
                          style={{ background: 'var(--primary)' }}
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Save Line
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* New contract modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div
            className="w-full max-w-lg rounded-2xl border shadow-xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>New Supplier Contract</h2>
              <button onClick={() => setShowForm(false)}>
                <X size={18} style={{ color: 'var(--text-3)' }} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Vendor</label>
                <select
                  value={form.vendorId}
                  onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}
                  className="w-full text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                >
                  <option value="">Select vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Contract Number</label>
                <input
                  type="text"
                  value={form.contractNumber}
                  onChange={e => setForm(f => ({ ...f, contractNumber: e.target.value }))}
                  placeholder="e.g. CTR-2026-001"
                  className="w-full text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Payment Terms</label>
                <select
                  value={form.paymentTerms}
                  onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                >
                  {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as ContractStatus }))}
                  className="w-full text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full text-sm rounded-lg px-3 py-2 border resize-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateContract}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: 'var(--primary)' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Contract
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

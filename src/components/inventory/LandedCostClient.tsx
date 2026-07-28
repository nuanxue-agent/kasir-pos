'use client'

import { useState, useCallback } from 'react'
import { Plus, X, Send, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Pure exports for tests ────────────────────────────────────────────────────
export type LCType = 'FREIGHT' | 'DUTY' | 'INSURANCE' | 'OTHER'
export type LCStatus = 'DRAFT' | 'POSTED'
export type AllocationMethod = 'BY_VALUE' | 'BY_QTY' | 'BY_WEIGHT'

export interface LandedCostItem {
  productId: string
  productName?: string
  poItemId: string
  lineValue: number   // purchase value (for BY_VALUE)
  qty: number         // qty ordered (for BY_QTY)
  weight: number      // weight in grams (for BY_WEIGHT)
  unitCost: number    // existing unit cost before landed cost
}

export interface LandedCostAllocation {
  id: string
  landedCostId: string
  storeId: string
  productId: string
  productName?: string
  poItemId: string
  allocatedAmount: number
  newUnitCost: number
}

export interface LandedCost {
  id: string
  storeId: string
  poId: string
  poNumber?: string
  type: LCType
  amount: number
  currency: string
  allocationMethod: AllocationMethod
  status: LCStatus
  createdAt: string
  allocations?: LandedCostAllocation[]
}

// ── Pure allocation logic ─────────────────────────────────────────────────────

export function allocateByValue(
  totalCost: number,
  items: LandedCostItem[],
): Record<string, number> {
  const totalValue = items.reduce((s, i) => s + i.lineValue, 0)
  if (totalValue === 0) return Object.fromEntries(items.map(i => [i.productId, 0]))
  return Object.fromEntries(
    items.map(i => [i.productId, Math.round((i.lineValue / totalValue) * totalCost)]),
  )
}

export function allocateByQty(
  totalCost: number,
  items: LandedCostItem[],
): Record<string, number> {
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  if (totalQty === 0) return Object.fromEntries(items.map(i => [i.productId, 0]))
  return Object.fromEntries(
    items.map(i => [i.productId, Math.round((i.qty / totalQty) * totalCost)]),
  )
}

export function allocateByWeight(
  totalCost: number,
  items: LandedCostItem[],
): Record<string, number> {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  if (totalWeight === 0) return Object.fromEntries(items.map(i => [i.productId, 0]))
  return Object.fromEntries(
    items.map(i => [i.productId, Math.round((i.weight / totalWeight) * totalCost)]),
  )
}

export function calcNewUnitCost(
  existingUnitCost: number,
  qty: number,
  allocatedAmount: number,
): number {
  if (qty <= 0) return existingUnitCost
  return Math.round((existingUnitCost * qty + allocatedAmount) / qty)
}

export function calcTotalLandedCost(costs: { amount: number }[]): number {
  return costs.reduce((s, c) => s + c.amount, 0)
}

export function allocate(
  method: AllocationMethod,
  totalCost: number,
  items: LandedCostItem[],
): Record<string, number> {
  if (method === 'BY_VALUE') return allocateByValue(totalCost, items)
  if (method === 'BY_QTY') return allocateByQty(totalCost, items)
  return allocateByWeight(totalCost, items)
}

// ── Labels ────────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<LCType, string> = {
  FREIGHT: 'Ongkos Kirim',
  DUTY: 'Bea Masuk',
  INSURANCE: 'Asuransi',
  OTHER: 'Lainnya',
}

const METHOD_LABELS: Record<AllocationMethod, string> = {
  BY_VALUE: 'Per Nilai',
  BY_QTY: 'Per Qty',
  BY_WEIGHT: 'Per Berat',
}

const STATUS_COLORS: Record<LCStatus, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-700',
  POSTED: 'bg-green-100 text-green-700',
}

function StatusBadge({ status }: { status: LCStatus }) {
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[status])}>
      {status === 'DRAFT' ? 'Draft' : 'Diposting'}
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  storeId: string
  currency: string
  initialLandedCosts: LandedCost[]
  purchaseOrders: { id: string; poNumber: string }[]
}

export default function LandedCostClient({ storeId, currency, initialLandedCosts, purchaseOrders }: Props) {
  const [landedCosts, setLandedCosts] = useState<LandedCost[]>(initialLandedCosts)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [poId, setPoId] = useState('')
  const [type, setType] = useState<LCType>('FREIGHT')
  const [amount, setAmount] = useState('')
  const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>('BY_VALUE')

  const fetchLandedCosts = useCallback(async () => {
    const res = await fetch(`/api/landed-costs?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) setLandedCosts(data)
  }, [storeId])

  const resetForm = () => {
    setPoId(''); setType('FREIGHT'); setAmount(''); setAllocationMethod('BY_VALUE')
  }

  const handleCreate = async () => {
    if (!poId) { toast.error('Pilih Purchase Order'); return }
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.error('Jumlah harus lebih dari 0'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/landed-costs?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId, type, amount: amt, currency, allocationMethod }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Landed cost dibuat')
      resetForm(); setShowForm(false)
      await fetchLandedCosts()
    } finally {
      setLoading(false)
    }
  }

  const handlePost = async (lc: LandedCost) => {
    if (lc.status === 'POSTED') return
    setLoading(true)
    try {
      const res = await fetch(`/api/landed-costs/${lc.id}/post?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Landed cost diposting, biaya produk diperbarui')
      await fetchLandedCosts()
    } finally {
      setLoading(false)
    }
  }

  const loadAllocations = async (lc: LandedCost) => {
    const toggled = expandedId === lc.id ? null : lc.id
    setExpandedId(toggled)
    if (!toggled) return
    const res = await fetch(`/api/landed-costs/${lc.id}/allocations?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) {
      setLandedCosts(prev => prev.map(c => c.id === lc.id ? { ...c, allocations: data } : c))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Landed Costs</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Alokasikan biaya impor ke purchase order</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchLandedCosts}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-1)] text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Tambah Biaya
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text-1)]">Tambah Landed Cost</h2>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-[var(--text-3)]" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Purchase Order *</label>
              <select
                value={poId}
                onChange={e => setPoId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm"
              >
                <option value="">-- Pilih PO --</option>
                {purchaseOrders.map(po => (
                  <option key={po.id} value={po.id}>{po.poNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Jenis Biaya *</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as LCType)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm"
              >
                {(Object.keys(TYPE_LABELS) as LCType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Jumlah *</label>
              <input
                type="number" min="0" value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Metode Alokasi *</label>
              <select
                value={allocationMethod}
                onChange={e => setAllocationMethod(e.target.value as AllocationMethod)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm"
              >
                {(Object.keys(METHOD_LABELS) as AllocationMethod[]).map(m => (
                  <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] text-sm hover:bg-[var(--bg-1)]">
              Batal
            </button>
            <button onClick={handleCreate} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {landedCosts.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="text-[var(--text-3)]">Belum ada landed cost.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {landedCosts.map(lc => (
            <div key={lc.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-[var(--bg-1)]"
                onClick={() => loadAllocations(lc)}
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={lc.status} />
                  <span className="text-sm font-medium text-[var(--text-1)]">{TYPE_LABELS[lc.type]}</span>
                  {lc.poNumber && (
                    <span className="text-xs font-mono text-[var(--text-3)]">PO: {lc.poNumber}</span>
                  )}
                  <span className="text-xs text-[var(--text-3)] bg-[var(--bg-1)] px-2 py-0.5 rounded-full">
                    {METHOD_LABELS[lc.allocationMethod]}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-[var(--text-1)]">
                    {formatCurrency(lc.amount, lc.currency)}
                  </span>
                  <span className="text-xs text-[var(--text-3)]">{lc.createdAt?.slice(0, 10)}</span>
                  {lc.status === 'DRAFT' && (
                    <button
                      onClick={e => { e.stopPropagation(); handlePost(lc) }}
                      disabled={loading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs hover:opacity-90 disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" /> Posting
                    </button>
                  )}
                  {expandedId === lc.id
                    ? <ChevronUp className="w-4 h-4 text-[var(--text-3)]" />
                    : <ChevronDown className="w-4 h-4 text-[var(--text-3)]" />
                  }
                </div>
              </div>

              {expandedId === lc.id && (
                <div className="border-t border-[var(--border)] px-5 py-4">
                  <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Alokasi per Produk</h3>
                  {!lc.allocations || lc.allocations.length === 0 ? (
                    <p className="text-sm text-[var(--text-3)] italic">
                      Belum ada alokasi — posting terlebih dahulu untuk menghitung alokasi.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-3)] text-xs border-b border-[var(--border)]">
                            <th className="pb-2 pr-4 font-medium">Produk</th>
                            <th className="pb-2 pr-4 font-medium text-right">Alokasi</th>
                            <th className="pb-2 font-medium text-right">Biaya Satuan Baru</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {lc.allocations.map(alloc => (
                            <tr key={alloc.id}>
                              <td className="py-2 pr-4 text-[var(--text-1)]">
                                {alloc.productName ?? alloc.productId}
                              </td>
                              <td className="py-2 pr-4 text-right text-[var(--text-2)]">
                                {formatCurrency(alloc.allocatedAmount, currency)}
                              </td>
                              <td className="py-2 text-right font-medium text-[var(--text-1)]">
                                {formatCurrency(alloc.newUnitCost, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

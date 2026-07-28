'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, Factory, Package, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, Wrench, List
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Pure business logic exports (for unit tests) ──────────────────────────────

export type ProductionStatus = 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface BOMLine {
  materialId: string
  requiredQty: number
  unitCost?: number
}

export interface MaterialUsage {
  materialId: string
  requiredQty: number
  usedQty: number
}

/** Calculate total material requirements for N units given a BOM */
export function calcBOMRequirements(
  bom: BOMLine[],
  produceQty: number,
): Array<{ materialId: string; requiredQty: number }> {
  return bom.map(line => ({
    materialId: line.materialId,
    requiredQty: line.requiredQty * produceQty,
  }))
}

/** Validate status transition */
export function isValidStatusTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  const allowed: Record<ProductionStatus, ProductionStatus[]> = {
    DRAFT:       ['SCHEDULED', 'CANCELLED'],
    SCHEDULED:   ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED:   [],
    CANCELLED:   [],
  }
  return allowed[from]?.includes(to) ?? false
}

/** Detect material shortages given stock levels */
export function detectShortages(
  requirements: Array<{ materialId: string; requiredQty: number }>,
  stock: Record<string, number>,
): Array<{ materialId: string; required: number; available: number; shortage: number }> {
  return requirements
    .filter(r => (stock[r.materialId] ?? 0) < r.requiredQty)
    .map(r => ({
      materialId: r.materialId,
      required: r.requiredQty,
      available: stock[r.materialId] ?? 0,
      shortage: r.requiredQty - (stock[r.materialId] ?? 0),
    }))
}

/** Calculate total production cost from BOM lines */
export function calcProductionCost(bom: BOMLine[], produceQty: number): number {
  return bom.reduce((sum, line) => sum + (line.unitCost ?? 0) * line.requiredQty * produceQty, 0)
}

/** Calculate completion percentage based on used vs required quantities */
export function calcCompletionPct(materials: MaterialUsage[]): number {
  if (materials.length === 0) return 0
  const total = materials.reduce((sum, m) => sum + m.requiredQty, 0)
  if (total === 0) return 0
  const used = materials.reduce((sum, m) => sum + Math.min(m.usedQty, m.requiredQty), 0)
  return Math.round((used / total) * 100)
}

/** Max producible quantity given BOM and stock */
export function calcMaxProducible(
  bom: BOMLine[],
  stock: Record<string, number>,
): number {
  if (bom.length === 0) return 0
  return Math.floor(Math.min(...bom.map(line => (stock[line.materialId] ?? 0) / line.requiredQty)))
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku?: string
  stock?: number
  cost?: number
}

interface ProductionOrder {
  id: string
  storeId: string
  productId: string
  productName?: string
  qty: number
  status: ProductionStatus
  scheduledDate?: string
  completedDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

interface BOMEntry {
  id: string
  storeId: string
  productId: string
  materialId: string
  materialName?: string
  qty: number
  unit?: string
}

interface ProductionOrderClientProps {
  storeId: string
  currency?: string
  initialOrders?: ProductionOrder[]
  initialBOM?: BOMEntry[]
  products?: Product[]
}

type Tab = 'orders' | 'bom'

const STATUS_CONFIG: Record<ProductionStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:       { label: 'Draft',       color: 'text-gray-600 bg-gray-50 border-gray-200',     icon: <Clock className="h-3 w-3" /> },
  SCHEDULED:   { label: 'Scheduled',   color: 'text-blue-600 bg-blue-50 border-blue-200',     icon: <Clock className="h-3 w-3" /> },
  IN_PROGRESS: { label: 'In Progress', color: 'text-amber-600 bg-amber-50 border-amber-200',  icon: <Loader2 className="h-3 w-3" /> },
  COMPLETED:   { label: 'Completed',   color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  CANCELLED:   { label: 'Cancelled',   color: 'text-red-500 bg-red-50 border-red-200',        icon: <X className="h-3 w-3" /> },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductionOrderClient({
  storeId,
  currency = 'IDR',
  initialOrders = [],
  initialBOM = [],
  products = [],
}: ProductionOrderClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('orders')
  const [showCreateOrder, setShowCreateOrder] = useState(false)
  const [showCreateBOM, setShowCreateBOM] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // ── Orders ───────────────────────────────────────────────────────────────

  const { data: orders = initialOrders } = useQuery({
    queryKey: ['production-orders', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/production-orders?storeId=${storeId}`)
      return (await res.json()) as ProductionOrder[]
    },
    initialData: initialOrders,
    enabled: tab === 'orders',
  })

  const { data: bom = initialBOM } = useQuery({
    queryKey: ['bom', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/bom?storeId=${storeId}`)
      return (await res.json()) as BOMEntry[]
    },
    initialData: initialBOM,
    enabled: tab === 'bom',
  })

  const createOrderMutation = useMutation({
    mutationFn: async (payload: {
      productId: string
      qty: number
      scheduledDate?: string
      notes?: string
    }) => {
      const res = await fetch(`/api/production-orders?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal membuat pesanan produksi')
      return data
    },
    onSuccess: () => {
      toast.success('Pesanan produksi dibuat')
      qc.invalidateQueries({ queryKey: ['production-orders', storeId] })
      setShowCreateOrder(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const patchOrderMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status?: ProductionStatus; notes?: string }) => {
      const res = await fetch(`/api/production-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes, storeId }),
      })
      const data = (await res.json()) as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memperbarui')
      return data
    },
    onSuccess: () => {
      toast.success('Status diperbarui')
      qc.invalidateQueries({ queryKey: ['production-orders', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createBOMMutation = useMutation({
    mutationFn: async (payload: {
      productId: string
      materialId: string
      qty: number
      unit?: string
    }) => {
      const res = await fetch(`/api/bom?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal membuat BOM')
      return data
    },
    onSuccess: () => {
      toast.success('BOM ditambahkan')
      qc.invalidateQueries({ queryKey: ['bom', storeId] })
      setShowCreateBOM(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Factory className="h-6 w-6 text-[var(--color-primary)]" />
            Produksi
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Kelola pesanan produksi dan Bill of Materials
          </p>
        </div>
        <button
          onClick={() => tab === 'orders' ? setShowCreateOrder(true) : setShowCreateBOM(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus className="h-4 w-4" />
          {tab === 'orders' ? 'Pesanan Baru' : 'Tambah BOM'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {([['orders', 'Pesanan Produksi', <Wrench key="w" className="h-4 w-4" />],
           ['bom',    'Bill of Materials', <List key="l" className="h-4 w-4" />]] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center">
              <Factory className="mx-auto h-10 w-10 text-[var(--color-text-muted)] mb-3" />
              <p className="text-[var(--color-text-muted)]">Belum ada pesanan produksi</p>
            </div>
          ) : (
            orders.map(order => {
              const cfg = STATUS_CONFIG[order.status]
              const expanded = expandedOrder === order.id
              return (
                <div key={order.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
                    onClick={() => setExpandedOrder(expanded ? null : order.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-[var(--color-text-muted)]" />
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">
                          {order.productName ?? order.productId}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Qty: {order.qty} · {order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString('id-ID') : 'Tanpa jadwal'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
                        {cfg.icon}{cfg.label}
                      </span>
                      {expanded ? <ChevronUp className="h-4 w-4 text-[var(--color-text-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />}
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-[var(--color-border)] p-4 space-y-4">
                      {order.notes && (
                        <p className="text-sm text-[var(--color-text-muted)] italic">{order.notes}</p>
                      )}
                      {/* Status transitions */}
                      <div className="flex flex-wrap gap-2">
                        {(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as ProductionStatus[])
                          .filter(s => isValidStatusTransition(order.status, s))
                          .map(s => (
                            <button
                              key={s}
                              onClick={() => patchOrderMutation.mutate({ id: order.id, status: s })}
                              disabled={patchOrderMutation.isPending}
                              className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                STATUS_CONFIG[s].color,
                                'hover:opacity-80',
                              )}
                            >
                              → {STATUS_CONFIG[s].label}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* BOM tab */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {bom.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center">
              <List className="mx-auto h-10 w-10 text-[var(--color-text-muted)] mb-3" />
              <p className="text-[var(--color-text-muted)]">Belum ada Bill of Materials</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)]">
                  <tr>
                    {['Produk', 'Material', 'Qty', 'Unit'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bom.map(entry => (
                    <tr key={entry.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                      <td className="px-4 py-3 text-[var(--color-text-primary)]">{entry.productId}</td>
                      <td className="px-4 py-3 text-[var(--color-text-primary)]">{entry.materialName ?? entry.materialId}</td>
                      <td className="px-4 py-3 text-[var(--color-text-primary)]">{entry.qty}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{entry.unit ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Order Modal */}
      {showCreateOrder && (
        <CreateOrderModal
          products={products}
          onClose={() => setShowCreateOrder(false)}
          onSubmit={createOrderMutation.mutate}
          isPending={createOrderMutation.isPending}
        />
      )}

      {/* Create BOM Modal */}
      {showCreateBOM && (
        <CreateBOMModal
          products={products}
          onClose={() => setShowCreateBOM(false)}
          onSubmit={createBOMMutation.mutate}
          isPending={createBOMMutation.isPending}
        />
      )}
    </div>
  )
}

// ── Create Order Modal ────────────────────────────────────────────────────────

function CreateOrderModal({
  products,
  onClose,
  onSubmit,
  isPending,
}: {
  products: Product[]
  onClose: () => void
  onSubmit: (p: { productId: string; qty: number; scheduledDate?: string; notes?: string }) => void
  isPending: boolean
}) {
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState(1)
  const [scheduledDate, setScheduledDate] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) return toast.error('Pilih produk')
    if (qty <= 0) return toast.error('Qty harus lebih dari 0')
    onSubmit({ productId, qty, scheduledDate: scheduledDate || undefined, notes: notes || undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Buat Pesanan Produksi</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Produk *</label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">Pilih produk...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Jumlah *</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Tanggal Jadwal</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Catatan</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors">
              Batal
            </button>
            <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors">
              {isPending ? 'Menyimpan...' : 'Buat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Create BOM Modal ──────────────────────────────────────────────────────────

function CreateBOMModal({
  products,
  onClose,
  onSubmit,
  isPending,
}: {
  products: Product[]
  onClose: () => void
  onSubmit: (p: { productId: string; materialId: string; qty: number; unit?: string }) => void
  isPending: boolean
}) {
  const [productId, setProductId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) return toast.error('Pilih produk')
    if (!materialId) return toast.error('Pilih material')
    if (qty <= 0) return toast.error('Qty harus lebih dari 0')
    onSubmit({ productId, materialId, qty, unit: unit || undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Tambah Bill of Materials</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Produk Jadi *</label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">Pilih produk jadi...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Material *</label>
            <select
              value={materialId}
              onChange={e => setMaterialId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">Pilih material...</option>
              {products.filter(p => p.id !== productId).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Qty *</label>
              <input
                type="number"
                min={0.001}
                step={0.001}
                value={qty}
                onChange={e => setQty(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Unit</label>
              <input
                type="text"
                placeholder="pcs, kg, ltr..."
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors">
              Batal
            </button>
            <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors">
              {isPending ? 'Menyimpan...' : 'Tambah'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

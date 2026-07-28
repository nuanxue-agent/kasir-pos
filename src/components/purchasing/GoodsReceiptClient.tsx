'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package,
  Truck,
  CheckCircle2,
  ChevronRight,
  X,
  AlertTriangle,
  ClipboardList,
  ArrowLeft,
  Search,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface GoodsReceiptClientProps {
  storeId: string
  currency: string
}

type POStatus = 'SENT' | 'CONFIRMED'

interface POLine {
  id: string
  productId: string
  productName: string
  qty: number
  unitCost: number
  receivedQty: number
  subtotal: number
}

interface PendingPO {
  id: string
  number: string
  supplierName: string
  status: POStatus
  orderDate: string
  expectedDate: string | null
  total: number
}

interface ReceiveItem {
  productId: string
  lineId: string
  productName: string
  orderedQty: number
  unitCost: number
  receivedQty: number
  batchNumber: string
  expiryDate: string
}

interface Receipt {
  id: string
  poNumber: string
  supplierName: string
  receivedAt: string
  receivedBy: string
  status: string
  itemCount: number
  notes: string | null
}

// ─── Variance helpers ──────────────────────────────────────────────────────

export function calcVariance(orderedQty: number, receivedQty: number): number {
  return receivedQty - orderedQty
}

export function calcVariancePct(orderedQty: number, receivedQty: number): number {
  if (orderedQty === 0) return 0
  return ((receivedQty - orderedQty) / orderedQty) * 100
}

export function isPartialReceipt(items: ReceiveItem[]): boolean {
  return items.some(i => i.receivedQty < i.orderedQty && i.receivedQty >= 0)
}

export function calcTotalCost(items: ReceiveItem[]): number {
  return items.reduce((sum, i) => sum + i.receivedQty * i.unitCost, 0)
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    SENT: 'bg-blue-50 text-blue-600 border border-blue-200',
    CONFIRMED: 'bg-amber-50 text-amber-600 border border-amber-200',
    PARTIAL: 'bg-orange-50 text-orange-600 border border-orange-200',
    RECEIVED: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  }
  const label: Record<string, string> = {
    SENT: 'Terkirim',
    CONFIRMED: 'Dikonfirmasi',
    PARTIAL: 'Sebagian',
    RECEIVED: 'Diterima',
  }
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', map[status] ?? 'bg-stone-100 text-stone-500')}>
      {label[status] ?? status}
    </span>
  )
}

function VarianceBadge({ ordered, received }: { ordered: number; received: number }) {
  const v = calcVariance(ordered, received)
  if (v === 0) return <span className="text-xs text-[var(--text-3)]">—</span>
  return (
    <span className={cn('text-xs font-semibold', v > 0 ? 'text-emerald-600' : 'text-red-500')}>
      {v > 0 ? '+' : ''}{v}
    </span>
  )
}

// ─── Receive flow ──────────────────────────────────────────────────────────

function ReceiveFlow({
  po,
  storeId,
  currency,
  onDone,
  onBack,
}: {
  po: PendingPO
  storeId: string
  currency: string
  onDone: () => void
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [items, setItems] = useState<ReceiveItem[]>([])
  const [initialised, setInitialised] = useState(false)

  const { isLoading: linesLoading } = useQuery({
    queryKey: ['po-lines', po.id],
    queryFn: () =>
      fetch(`/api/purchase-orders/lines?storeId=${storeId}&orderId=${po.id}`).then(r => r.json()),
    select: (data: POLine[]) => data,
    onSuccess: (lines: POLine[]) => {
      if (!initialised) {
        setItems(
          lines.map(l => ({
            productId: l.productId,
            lineId: l.id,
            productName: l.productName,
            orderedQty: l.qty,
            unitCost: l.unitCost,
            receivedQty: l.qty - l.receivedQty, // default: remaining
            batchNumber: '',
            expiryDate: '',
          })),
        )
        setInitialised(true)
      }
    },
  } as any)

  const receiveMutation = useMutation({
    mutationFn: (payload: any) =>
      fetch(`/api/purchasing/receive?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async r => {
        const d = await r.json() as { error?: string }
        if (!r.ok) throw new Error(d.error ?? 'Gagal menerima barang')
        return d
      }),
    onSuccess: (d: any) => {
      toast.success(`Barang diterima — ${d.number}`)
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['goods-receipts'] })
      qc.invalidateQueries({ queryKey: ['pending-pos'] })
      onDone()
    },
    onError: (e: any) => toast.error(e.message),
  })

  function updateItem(idx: number, field: keyof ReceiveItem, value: string | number) {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  function handleConfirm() {
    for (const it of items) {
      if (it.receivedQty < 0) {
        toast.error(`Qty diterima tidak boleh negatif: ${it.productName}`)
        return
      }
    }
    const payload = {
      poId: po.id,
      notes: note || null,
      items: items
        .filter(i => i.receivedQty > 0)
        .map(i => ({
          productId: i.productId,
          lineId: i.lineId,
          receivedQty: Number(i.receivedQty),
          unitCost: Number(i.unitCost),
          batchNumber: i.batchNumber || null,
          expiryDate: i.expiryDate || null,
        })),
    }
    if (payload.items.length === 0) {
      toast.error('Minimal 1 item dengan qty > 0')
      return
    }
    receiveMutation.mutate(payload)
  }

  const isPartial = isPartialReceipt(items)
  const totalCost = calcTotalCost(items)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--text-2)]" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-1)]">Terima Barang</h2>
          <p className="text-sm text-[var(--text-3)]">
            {po.number} · {po.supplierName}
          </p>
        </div>
        <div className="ml-auto">
          <StatusPill status={po.status} />
        </div>
      </div>

      {linesLoading ? (
        <div className="py-12 text-center text-[var(--text-3)] text-sm">Memuat item…</div>
      ) : (
        <>
          {/* Items table */}
          <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--bg-muted)] text-[var(--text-3)] text-xs">
                    <th className="text-left px-4 py-3 font-medium">Produk</th>
                    <th className="text-right px-3 py-3 font-medium">Dipesan</th>
                    <th className="text-right px-3 py-3 font-medium">Diterima</th>
                    <th className="text-right px-3 py-3 font-medium">Selisih</th>
                    <th className="text-right px-3 py-3 font-medium">Harga/unit</th>
                    <th className="px-3 py-3 font-medium">No. Batch</th>
                    <th className="px-3 py-3 font-medium">Tgl. Kadaluarsa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {items.map((item, idx) => (
                    <tr key={item.lineId} className="bg-[var(--bg-card)]">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                        {item.productName}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--text-2)]">
                        {item.orderedQty}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={item.receivedQty}
                          onChange={e => updateItem(idx, 'receivedQty', Number(e.target.value))}
                          className="w-20 text-right border border-[var(--border)] rounded-lg px-2 py-1 text-sm bg-[var(--bg-input)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <VarianceBadge ordered={item.orderedQty} received={item.receivedQty} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={item.unitCost}
                          onChange={e => updateItem(idx, 'unitCost', Number(e.target.value))}
                          className="w-28 text-right border border-[var(--border)] rounded-lg px-2 py-1 text-sm bg-[var(--bg-input)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          placeholder="Opsional"
                          value={item.batchNumber}
                          onChange={e => updateItem(idx, 'batchNumber', e.target.value)}
                          className="w-28 border border-[var(--border)] rounded-lg px-2 py-1 text-sm bg-[var(--bg-input)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="date"
                          value={item.expiryDate}
                          onChange={e => updateItem(idx, 'expiryDate', e.target.value)}
                          className="w-36 border border-[var(--border)] rounded-lg px-2 py-1 text-sm bg-[var(--bg-input)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Partial receipt warning */}
          {isPartial && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Penerimaan sebagian — beberapa item diterima kurang dari jumlah pesanan. PO akan tetap terbuka.
              </span>
            </div>
          )}

          {/* Summary + notes */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Catatan (opsional)
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Kondisi barang, catatan pengiriman, dll."
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-1)] resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="rounded-xl bg-[var(--bg-muted)] border border-[var(--border)] p-4 space-y-2 text-sm">
              <div className="flex justify-between text-[var(--text-2)]">
                <span>Total item diterima</span>
                <span className="font-semibold text-[var(--text-1)]">
                  {items.reduce((s, i) => s + i.receivedQty, 0)}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-2)]">
                <span>Total nilai</span>
                <span className="font-semibold text-[var(--text-1)]">
                  {formatCurrency(totalCost, currency)}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-2)]">
                <span>Jenis penerimaan</span>
                <span
                  className={cn(
                    'font-semibold',
                    isPartial ? 'text-orange-500' : 'text-emerald-600',
                  )}
                >
                  {isPartial ? 'Sebagian' : 'Penuh'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-muted)] transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleConfirm}
              disabled={receiveMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {receiveMutation.isPending ? 'Menyimpan…' : 'Konfirmasi Penerimaan'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Receipts history tab ──────────────────────────────────────────────────

function ReceiptsHistory({ storeId, currency }: { storeId: string; currency: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['goods-receipts', storeId],
    queryFn: () =>
      fetch(`/api/purchasing/receipts?storeId=${storeId}`).then(r => r.json()),
  })

  const receipts: Receipt[] = (data as any)?.receipts ?? []

  if (isLoading) {
    return <div className="py-12 text-center text-[var(--text-3)] text-sm">Memuat riwayat…</div>
  }

  if (receipts.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-[var(--text-3)]">
        <ClipboardList className="w-10 h-10 opacity-30" />
        <p className="text-sm">Belum ada riwayat penerimaan barang</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {receipts.map(r => (
        <div
          key={r.id}
          className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-300 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[var(--text-1)] text-sm">{r.poNumber}</p>
            <p className="text-xs text-[var(--text-3)] truncate">
              {r.supplierName} · {r.itemCount} item
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-[var(--text-3)]">{formatDate(r.receivedAt)}</p>
            <StatusPill status={r.status} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export default function GoodsReceiptClient({ storeId, currency }: GoodsReceiptClientProps) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [selectedPO, setSelectedPO] = useState<PendingPO | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['pending-pos', storeId],
    queryFn: () =>
      fetch(`/api/purchasing/pending-pos?storeId=${storeId}`).then(r => r.json()),
    enabled: tab === 'pending' && !selectedPO,
  })

  const pendingPOs: PendingPO[] = ((data as any)?.orders ?? []).filter(
    (po: PendingPO) =>
      !search ||
      po.number.toLowerCase().includes(search.toLowerCase()) ||
      po.supplierName.toLowerCase().includes(search.toLowerCase()),
  )

  if (selectedPO) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 lg:pb-6">
        <ReceiveFlow
          po={selectedPO}
          storeId={storeId}
          currency={currency}
          onDone={() => setSelectedPO(null)}
          onBack={() => setSelectedPO(null)}
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Terima Barang</h1>
        <p className="text-[var(--text-3)] text-sm mt-0.5">
          Catat penerimaan barang dari supplier dan update stok
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--bg-muted)] rounded-xl w-fit border border-[var(--border)]">
        {[
          { key: 'pending', label: 'PO Menunggu' },
          { key: 'history', label: 'Riwayat' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-white text-[var(--text-1)] shadow-sm border border-[var(--border)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nomor PO atau supplier…"
              className="w-full pl-9 pr-4 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-input)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-[var(--text-3)] text-sm">Memuat PO…</div>
          ) : pendingPOs.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-[var(--text-3)]">
              <Truck className="w-10 h-10 opacity-30" />
              <p className="text-sm">
                {search ? 'Tidak ada PO yang cocok' : 'Tidak ada PO menunggu penerimaan'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingPOs.map(po => (
                <button
                  key={po.id}
                  onClick={() => setSelectedPO(po)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-1)] text-sm">{po.number}</p>
                    <p className="text-xs text-[var(--text-3)] truncate">{po.supplierName}</p>
                    {po.expectedDate && (
                      <p className="text-xs text-[var(--text-3)]">
                        Exp: {formatDate(po.expectedDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusPill status={po.status} />
                    <p className="text-sm font-semibold text-[var(--text-1)]">
                      {formatCurrency(po.total, currency)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && <ReceiptsHistory storeId={storeId} currency={currency} />}
    </div>
  )
}

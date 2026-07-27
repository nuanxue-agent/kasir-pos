'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Truck, CheckCircle2, Clock, Send, XCircle, Package, ChevronDown } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Props {
  po: any
  storeId: string
  currency: string
  onClose: () => void
  onUpdated: (updated: any) => void
}

type POStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED'

const STATUS_CONFIG: Record<POStatus, { label: string; pill: string }> = {
  DRAFT:     { label: 'Draft',        pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
  SENT:      { label: 'Terkirim',     pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
  CONFIRMED: { label: 'Dikonfirmasi', pill: 'bg-amber-50 text-amber-600 border border-amber-200' },
  RECEIVED:  { label: 'Diterima',     pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  CANCELLED: { label: 'Dibatalkan',   pill: 'bg-red-50 text-red-500 border border-red-200' },
}

const NEXT_STATUSES: Record<POStatus, POStatus[]> = {
  DRAFT:     ['SENT', 'CANCELLED'],
  SENT:      ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['RECEIVED'],
  RECEIVED:  [],
  CANCELLED: [],
}

export default function PODetailModal({ po, storeId, currency, onClose, onUpdated }: Props) {
  const [receiving, setReceiving] = useState(false)
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [receiptNote, setReceiptNote] = useState('')

  const { data: linesRaw, isLoading } = useQuery({
    queryKey: ['po-lines', po.id],
    queryFn: () => fetch(`/api/purchase-orders/lines?storeId=${storeId}&orderId=${po.id}`).then(r => r.json()),
  })
  const lines: any[] = (linesRaw as any) ?? []

  const cfg = STATUS_CONFIG[po.status as POStatus]
  const canReceive = ['SENT', 'CONFIRMED'].includes(po.status)
  const canChangeStatus = NEXT_STATUSES[po.status as POStatus]

  async function changeStatus(status: POStatus) {
    setSaving(true)
    const res = await fetch(`/api/purchase-orders/${po.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSaving(false)
    if (res.ok) onUpdated({ ...po, status })
  }

  async function submitReceipt() {
    const receive = Object.entries(receiveQtys)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => ({ lineId, qty }))
    if (receive.length === 0) return
    setSaving(true)
    const res = await fetch(`/api/purchase-orders/${po.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receive, note: receiptNote }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (res.ok) {
      setReceiving(false)
      setReceiveQtys({})
      onUpdated({ ...po, status: data.status ?? po.status })
    }
  }

  const totalProgress = lines.length === 0 ? 0
    : Math.min(100, Math.round(
        lines.reduce((s: number, l: any) => s + l.receivedQty, 0) /
        lines.reduce((s: number, l: any) => s + l.qty, 0) * 100
      ))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-stone-700">{po.number}</span>
              <span className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold', cfg.pill)}>{cfg.label}</span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-1">
              <Truck className="h-3 w-3" /> {po.supplierName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
            <X className="h-4 w-4 text-stone-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Progress */}
          {lines.length > 0 && (
            <div>
              <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                <span>Progress penerimaan</span>
                <span className="font-semibold">{totalProgress}%</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${totalProgress}%` }} />
              </div>
            </div>
          )}

          {/* Lines */}
          <div>
            <h3 className="text-xs font-semibold text-stone-500 mb-3">Item Pembelian</h3>
            {isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-stone-50 animate-pulse rounded-xl" />)}</div>
            ) : (
              <div className="space-y-2">
                {(lines as any[]).map((line: any) => {
                  const pct = line.qty > 0 ? Math.min(100, Math.round(line.receivedQty / line.qty * 100)) : 0
                  const lineStatus = line.receivedQty === 0 ? 'PENDING' : line.receivedQty >= line.qty ? 'RECEIVED' : 'PARTIAL'
                  return (
                    <div key={line.id} className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package className="h-4 w-4 text-stone-400 shrink-0" />
                          <span className="text-sm font-medium text-stone-700 truncate">{line.productName}</span>
                        </div>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0',
                          lineStatus === 'RECEIVED' ? 'bg-emerald-50 text-emerald-600' :
                          lineStatus === 'PARTIAL' ? 'bg-amber-50 text-amber-600' :
                          'bg-stone-100 text-stone-500'
                        )}>
                          {line.receivedQty}/{line.qty}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-stone-400">
                        <span>@ {formatCurrency(line.unitCost, currency)}</span>
                        <span className="font-semibold text-stone-600">{formatCurrency(line.subtotal, currency)}</span>
                      </div>
                      {receiving && lineStatus !== 'RECEIVED' && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-stone-500 shrink-0">Terima:</label>
                          <input type="number" min="0" max={line.qty - line.receivedQty}
                            value={receiveQtys[line.id] ?? 0}
                            onChange={e => setReceiveQtys(q => ({ ...q, [line.id]: Number(e.target.value) }))}
                            className="w-20 bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                          <span className="text-xs text-stone-400">dari {line.qty - line.receivedQty} sisa</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {receiving && (
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Catatan Penerimaan</label>
              <textarea value={receiptNote} onChange={e => setReceiptNote(e.target.value)} rows={2}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                placeholder="Catatan opsional…" />
            </div>
          )}

          {/* Totals */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatCurrency(po.subtotal, currency)}</span>
            </div>
            {po.taxAmt > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Pajak</span>
                <span>{formatCurrency(po.taxAmt, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-stone-800 pt-1 border-t border-stone-200">
              <span>Total</span>
              <span>{formatCurrency(po.total, currency)}</span>
            </div>
          </div>

          {po.note && (
            <p className="text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2">{po.note}</p>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-stone-100 p-4 space-y-2">
          {receiving ? (
            <div className="flex gap-3">
              <button onClick={() => setReceiving(false)} className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold hover:bg-stone-200 transition-colors">
                Batal
              </button>
              <button onClick={submitReceipt} disabled={saving || Object.values(receiveQtys).every(q => q === 0)}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Menyimpan…' : 'Konfirmasi Terima'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {canReceive && (
                <button onClick={() => setReceiving(true)}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all">
                  Terima Barang
                </button>
              )}
              {canChangeStatus.map(s => (
                <button key={s} onClick={() => changeStatus(s)} disabled={saving}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50',
                    s === 'CANCELLED' ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' :
                    'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  )}>
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
              {po.status === 'RECEIVED' && (
                <div className="w-full py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 text-sm font-semibold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Semua barang sudah diterima
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

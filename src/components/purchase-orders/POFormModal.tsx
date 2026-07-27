'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Plus, Trash2, Package, Truck, Calendar, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  storeId: string
  currency: string
  taxRate: number
  onClose: () => void
  onSaved: () => void
}

interface POLine {
  productId: string
  productName: string
  qty: number
  unitCost: number
}

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

export default function POFormModal({ storeId, currency, taxRate, onClose, onSaved }: Props) {
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<POLine[]>([{ productId: '', productName: '', qty: 1, unitCost: 0 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', storeId],
    queryFn: () => fetch(`/api/suppliers?storeId=${storeId}`).then(r => r.json()),
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products', storeId],
    queryFn: () => fetch(`/api/products?storeId=${storeId}&limit=500`).then(r => r.json()),
  })

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0)
  const taxAmt = Math.round(subtotal * taxRate)
  const total = subtotal + taxAmt

  function addLine() {
    setLines(l => [...l, { productId: '', productName: '', qty: 1, unitCost: 0 }])
  }

  function removeLine(i: number) {
    setLines(l => l.filter((_, idx) => idx !== i))
  }

  function updateLine(i: number, field: keyof POLine, value: any) {
    setLines(l => l.map((line, idx) => {
      if (idx !== i) return line
      if (field === 'productId') {
        const prod = (products as any[]).find((p: any) => p.id === value)
        return { ...line, productId: value, productName: prod?.name ?? '', unitCost: prod?.cost ?? prod?.price ?? 0 }
      }
      return { ...line, [field]: field === 'qty' || field === 'unitCost' ? Number(value) : value }
    }))
  }

  async function handleSubmit() {
    setError('')
    if (!supplierId) return setError('Pilih supplier')
    if (lines.some(l => !l.productId)) return setError('Semua baris harus pilih produk')
    if (lines.some(l => l.qty <= 0)) return setError('Jumlah harus lebih dari 0')
    setSaving(true)
    try {
      const res = await fetch(`/api/purchase-orders?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, expectedDate: expectedDate || null, note: note || null, lines, taxRate }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.error ?? 'Gagal membuat PO')
      onSaved()
    } catch {
      setError('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold text-stone-800">Buat Purchase Order</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
            <X className="h-4 w-4 text-stone-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              {error}
            </div>
          )}

          {/* Supplier + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Supplier *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputCls}>
                <option value="">Pilih supplier…</option>
                {(suppliers as any[]).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Tgl Ekspektasi</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                  className={inputCls + ' pl-9'} />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-stone-500">Item Pembelian</label>
              <button onClick={addLine} className="text-xs text-amber-500 font-semibold hover:text-amber-600 flex items-center gap-1">
                <Plus className="h-3 w-3" /> Tambah baris
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start bg-stone-50 rounded-xl p-3">
                  {/* Product */}
                  <div className="col-span-5">
                    <label className="text-xs text-stone-400 mb-1 block">Produk</label>
                    <select value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-lg px-2 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400">
                      <option value="">Pilih…</option>
                      {(products as any[]).map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Qty */}
                  <div className="col-span-2">
                    <label className="text-xs text-stone-400 mb-1 block">Qty</label>
                    <input type="number" min="1" value={line.qty} onChange={e => updateLine(i, 'qty', e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-lg px-2 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                  </div>
                  {/* Unit Cost */}
                  <div className="col-span-4">
                    <label className="text-xs text-stone-400 mb-1 block">Harga Beli</label>
                    <input type="number" min="0" value={line.unitCost} onChange={e => updateLine(i, 'unitCost', e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-lg px-2 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                  </div>
                  {/* Remove */}
                  <div className="col-span-1 flex items-end justify-center pb-1">
                    <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                      className="p-1.5 text-stone-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Subtotal */}
                  {line.productId && (
                    <div className="col-span-12 text-right text-xs text-stone-500 font-medium -mt-1">
                      = {formatCurrency(line.qty * line.unitCost, currency)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Catatan (opsional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className={inputCls} placeholder="Catatan untuk supplier…" />
          </div>
        </div>

        {/* Footer with totals */}
        <div className="border-t border-stone-100 p-5 space-y-4">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Pajak ({(taxRate * 100).toFixed(0)}%)</span>
                <span>{formatCurrency(taxAmt, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-stone-800 text-base pt-1 border-t border-stone-100">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold hover:bg-stone-200 transition-colors">
              Batal
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Menyimpan…' : 'Buat PO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

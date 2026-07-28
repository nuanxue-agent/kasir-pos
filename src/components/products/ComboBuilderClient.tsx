'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Tag, Percent, DollarSign, Info } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcComboPrice,
  calcIndividualTotal,
  calcSavings,
  calcSavingsPct,
  filterActiveCombos,
  validateSubstituteGroups,
  validateSubstituteGroupSchema,
} from '@/lib/combo-builder'
import type {
  Combo,
  ComboItem,
  ComboSubstituteGroup,
  ComboWithItems,
  DiscountType,
} from '@/lib/combo-builder'

// Re-export pure functions for unit tests
export {
  calcComboPrice,
  calcIndividualTotal,
  calcSavings,
  calcSavingsPct,
  filterActiveCombos,
  validateSubstituteGroups,
  validateSubstituteGroupSchema,
} from '@/lib/combo-builder'
export type { Combo, ComboItem, ComboSubstituteGroup, DiscountType } from '@/lib/combo-builder'

interface Product {
  id: string
  name: string
  price: number
  cost?: number
}

interface ComboBuilderClientProps {
  storeId: string
  currency: string
  initialCombos: ComboWithItems[]
  products: Product[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SavingsBadge({ amount, pct, currency }: { amount: number; pct: number; currency: string }) {
  if (amount <= 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Tag size={10} />
      Hemat {formatCurrency(amount, currency)} ({pct.toFixed(1)}%)
    </span>
  )
}

function DiscountBadge({ type, value }: { type: DiscountType; value: number }) {
  if (value <= 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
      {type === 'PERCENTAGE' ? <Percent size={10} /> : <DollarSign size={10} />}
      {type === 'PERCENTAGE' ? `${value}%` : formatCurrency(value, 'IDR')} off
    </span>
  )
}

const EMPTY_FORM = {
  name: '',
  description: '',
  basePrice: '',
  discountType: 'PERCENTAGE' as DiscountType,
  discountValue: '',
  active: true,
  startDate: '',
  endDate: '',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ComboBuilderClient({
  storeId,
  currency,
  initialCombos,
  products,
}: ComboBuilderClientProps) {
  const [combos, setCombos] = useState<ComboWithItems[]>(initialCombos)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterActive, setFilterActive] = useState(false)

  // ── Item add state ────────────────────────────────────────────────────────
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState({ productId: '', qty: '1', isOptional: false })

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))

  // ── Enriched combos with per-item prices ──────────────────────────────────
  const enrichedCombos = combos.map(c => ({
    ...c,
    items: (c as any).items.map((i: any) => ({
      ...i,
      productName: productMap[i.productId]?.name ?? i.productId,
      productPrice: productMap[i.productId]?.price ?? 0,
    })),
  }))

  const displayed = filterActive ? filterActiveCombos(enrichedCombos) : enrichedCombos

  // ── Create combo ─────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) { toast.error('Nama combo wajib diisi'); return }
    if (!form.basePrice) { toast.error('Harga dasar wajib diisi'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/combos?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          basePrice: Number(form.basePrice),
          discountValue: Number(form.discountValue || 0),
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }

      // Refresh list
      const listRes = await fetch(`/api/combos?storeId=${storeId}`)
      const updated = await listRes.json() as any
      setCombos(updated)
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success('Combo berhasil dibuat')
    } catch {
      toast.error('Gagal membuat combo')
    } finally {
      setSaving(false)
    }
  }, [form, storeId])

  // ── Toggle active ─────────────────────────────────────────────────────────
  const handleToggleActive = useCallback(async (combo: ComboWithItems) => {
    const res = await fetch(`/api/combos/${combo.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !combo.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, active: !c.active } : c))
    toast.success(combo.active ? 'Combo dinonaktifkan' : 'Combo diaktifkan')
  }, [storeId])

  // ── Add item ──────────────────────────────────────────────────────────────
  const handleAddItem = useCallback(async (comboId: string) => {
    if (!itemForm.productId) { toast.error('Pilih produk'); return }
    const res = await fetch(`/api/combos/${comboId}/items?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: itemForm.productId,
        qty: Number(itemForm.qty) || 1,
        isOptional: itemForm.isOptional,
      }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }

    // Refresh items for this combo
    const itemsRes = await fetch(`/api/combos/${comboId}/items?storeId=${storeId}`)
    const newItems = await itemsRes.json() as any
    setCombos(prev => prev.map(c => c.id === comboId ? { ...c, items: newItems } : c))
    setAddingItemTo(null)
    setItemForm({ productId: '', qty: '1', isOptional: false })
    toast.success('Produk ditambahkan ke combo')
  }, [itemForm, storeId])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Combo Meal Builder</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-3)' }}>
            Buat paket produk dengan harga spesial dan kalkulator penghematan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterActive(f => !f)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              filterActive
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                : 'border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-2)]',
            )}
          >
            {filterActive ? 'Aktif saja' : 'Semua combo'}
          </button>
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={16} />
            Buat Combo
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h2 className="mb-4 font-semibold" style={{ color: 'var(--text-1)' }}>Combo Baru</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Nama Combo *
              </label>
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="cth. Paket Hemat A"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Harga Dasar (sebelum diskon) *
              </label>
              <input
                type="number"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.basePrice}
                onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Tipe Diskon
              </label>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.discountType}
                onChange={e => setForm(f => ({ ...f, discountType: e.target.value as DiscountType }))}
              >
                <option value="PERCENTAGE">Persentase (%)</option>
                <option value="FIXED">Nominal (Rp)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Nilai Diskon
              </label>
              <input
                type="number"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Deskripsi
              </label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Deskripsi singkat combo..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Tanggal Mulai
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Tanggal Selesai
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                style={{ color: 'var(--text-1)' }}
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Live price preview */}
          {form.basePrice && (
            <div className="mt-4 rounded-lg bg-[var(--bg-2)] p-3 text-sm">
              <span style={{ color: 'var(--text-2)' }}>Harga combo: </span>
              <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                {formatCurrency(
                  calcComboPrice(
                    Number(form.basePrice),
                    form.discountType,
                    Number(form.discountValue || 0),
                  ),
                  currency,
                )}
              </span>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              style={{ color: 'var(--text-2)' }}
            >
              Batal
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Combo'}
            </button>
          </div>
        </div>
      )}

      {/* Combo list */}
      {displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <Tag size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-3)' }} />
          <p style={{ color: 'var(--text-3)' }}>Belum ada combo. Klik "Buat Combo" untuk mulai.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(combo => {
            const comboPrice = calcComboPrice(combo.basePrice, combo.discountType, combo.discountValue)
            const individualTotal = calcIndividualTotal((combo as any).items, false)
            const savings = calcSavings(combo, (combo as any).items, false)
            const savingsPct = calcSavingsPct(combo, (combo as any).items, false)
            const isOpen = expanded === combo.id

            return (
              <div
                key={combo.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm"
              >
                {/* Combo header row */}
                <div className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>{combo.name}</h3>
                      <DiscountBadge type={combo.discountType} value={combo.discountValue} />
                      <SavingsBadge amount={savings} pct={savingsPct} currency={currency} />
                      {!combo.active && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">Nonaktif</span>
                      )}
                    </div>
                    {combo.description && (
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>{combo.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                      <span style={{ color: 'var(--text-2)' }}>
                        Harga: <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{formatCurrency(comboPrice, currency)}</span>
                      </span>
                      {individualTotal > 0 && (
                        <span style={{ color: 'var(--text-3)' }}>
                          Harga satuan: <span className="line-through">{formatCurrency(individualTotal, currency)}</span>
                        </span>
                      )}
                      <span style={{ color: 'var(--text-3)' }}>{(combo as any).items.length} produk</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(combo as any)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        combo.active
                          ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                          : 'bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--border)]',
                      )}
                    >
                      {combo.active ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : combo.id)}
                      className="rounded-md p-1.5 hover:bg-[var(--bg-2)]"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded items panel */}
                {isOpen && (
                  <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
                    {/* Savings summary card */}
                    {savings > 0 && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                        <Info size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          Pelanggan hemat <strong>{formatCurrency(savings, currency)}</strong> ({savingsPct.toFixed(1)}%) dibanding beli satuan.
                          Harga satuan: {formatCurrency(individualTotal, currency)} → Harga combo: {formatCurrency(comboPrice, currency)}
                        </p>
                      </div>
                    )}

                    {/* Items table */}
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Produk dalam combo
                    </h4>
                    {(combo as any).items.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--text-3)' }}>Belum ada produk. Tambahkan di bawah.</p>
                    ) : (
                      <div className="rounded-lg border border-[var(--border)] overflow-hidden mb-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
                              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-3)' }}>Produk</th>
                              <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: 'var(--text-3)' }}>Qty</th>
                              <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: 'var(--text-3)' }}>Harga satuan</th>
                              <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: 'var(--text-3)' }}>Subtotal</th>
                              <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: 'var(--text-3)' }}>Opsional</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(combo as any).items.map((item: any) => (
                              <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                                <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>
                                  {item.productName ?? item.productId}
                                </td>
                                <td className="px-3 py-2 text-center" style={{ color: 'var(--text-2)' }}>{item.qty}</td>
                                <td className="px-3 py-2 text-right" style={{ color: 'var(--text-2)' }}>
                                  {formatCurrency(item.productPrice ?? 0, currency)}
                                </td>
                                <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--text-1)' }}>
                                  {formatCurrency((item.productPrice ?? 0) * item.qty, currency)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {item.isOptional ? (
                                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">Opsional</span>
                                  ) : (
                                    <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-xs" style={{ color: 'var(--text-3)' }}>Wajib</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Add item form */}
                    {addingItemTo === combo.id ? (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-2)] p-3">
                        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-2)' }}>Tambah Produk</p>
                        <div className="flex flex-wrap gap-2">
                          <select
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                            style={{ color: 'var(--text-1)', minWidth: 160 }}
                            value={itemForm.productId}
                            onChange={e => setItemForm(f => ({ ...f, productId: e.target.value }))}
                          >
                            <option value="">Pilih produk...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({formatCurrency(p.price, currency)})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            className="w-16 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                            style={{ color: 'var(--text-1)' }}
                            value={itemForm.qty}
                            onChange={e => setItemForm(f => ({ ...f, qty: e.target.value }))}
                            placeholder="Qty"
                          />
                          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
                            <input
                              type="checkbox"
                              checked={itemForm.isOptional}
                              onChange={e => setItemForm(f => ({ ...f, isOptional: e.target.checked }))}
                            />
                            Opsional
                          </label>
                          <button
                            onClick={() => handleAddItem(combo.id)}
                            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Tambah
                          </button>
                          <button
                            onClick={() => { setAddingItemTo(null); setItemForm({ productId: '', qty: '1', isOptional: false }) }}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                            style={{ color: 'var(--text-2)' }}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingItemTo(combo.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <Plus size={14} />
                        Tambah produk ke combo
                      </button>
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

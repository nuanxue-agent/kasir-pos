'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, RefreshCw, Trash2, Plus, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { SUPPORTED_CURRENCIES, type ExchangeRate } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrencyClientProps {
  storeId: string
  baseCurrency?: string
}

// ─── Stub FX rates (approximate mid-market from IDR) ─────────────────────────
const STUB_RATES: Record<string, number> = {
  USD: 0.000064,  // ~15,625 IDR/USD
  SGD: 0.000086,  // ~11,628 IDR/SGD
  MYR: 0.000300,  // ~3,333 IDR/MYR
  EUR: 0.000059,  // ~16,949 IDR/EUR
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CurrencyBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-xs text-[var(--text-2)]">
      {code}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CurrencyClient({ storeId, baseCurrency = 'IDR' }: CurrencyClientProps) {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)

  // New rate form
  const [newFrom, setNewFrom] = useState(baseCurrency)
  const [newTo, setNewTo] = useState('USD')
  const [newRate, setNewRate] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exchange-rates?storeId=${storeId}`)
      if (res.ok) {
        const data = (await res.json()) as ExchangeRate[]
        setRates(data)
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    load()
  }, [load])

  // ── Save / upsert a rate ──────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const rateNum = parseFloat(newRate)
    if (!newFrom || !newTo) {
      setFormError('Pilih mata uang asal dan tujuan')
      return
    }
    if (newFrom === newTo) {
      setFormError('Mata uang asal dan tujuan harus berbeda')
      return
    }
    if (isNaN(rateNum) || rateNum <= 0) {
      setFormError('Kurs harus lebih dari 0')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, fromCurrency: newFrom, toCurrency: newTo, rate: rateNum }),
      })
      if (!res.ok) {
        const data = (await res.json()) as any
        setFormError(data.error ?? 'Gagal menyimpan kurs')
        return
      }
      toast.success(`Kurs ${newFrom} → ${newTo} disimpan`)
      setNewRate('')
      await load()
    } catch {
      setFormError('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  // ── Refresh rates from stub API ───────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // Stub: use STUB_RATES seeded from IDR base
      const foreignCurrencies = SUPPORTED_CURRENCIES.filter(c => c !== baseCurrency)
      for (const to of foreignCurrencies) {
        const rate = STUB_RATES[to]
        if (!rate) continue
        await fetch('/api/exchange-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, fromCurrency: baseCurrency, toCurrency: to, rate }),
        })
      }
      toast.success('Kurs diperbarui dari API')
      await load()
    } catch {
      toast.error('Gagal memperbarui kurs')
    } finally {
      setRefreshing(false)
    }
  }

  // ── Delete a rate ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string, from: string, to: string) => {
    try {
      const res = await fetch(`/api/exchange-rates/${id}?storeId=${storeId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`Kurs ${from} → ${to} dihapus`)
        setRates(prev => prev.filter(r => r.id !== id))
      }
    } catch {
      toast.error('Gagal menghapus kurs')
    }
  }

  // ── Detect pre-selected toCurrency based on existing rates ───────────────
  const foreignOptions = SUPPORTED_CURRENCIES.filter(c => c !== newFrom)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Multi-Mata Uang</h3>
            <p className="text-xs text-[var(--text-3)]">
              Kelola kurs tukar untuk pembayaran mata uang asing
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)]',
            refreshing && 'cursor-not-allowed opacity-60',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh dari API
        </button>
      </div>

      {/* Base currency info */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
        <div>
          <p className="text-xs text-[var(--text-3)]">Mata uang utama toko</p>
          <p className="font-mono text-lg font-bold text-amber-400">{baseCurrency}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-[var(--text-3)]">Mata uang diterima</p>
          <div className="mt-1 flex flex-wrap gap-1 justify-end">
            {SUPPORTED_CURRENCIES.filter(c => c !== baseCurrency).map(c => (
              <CurrencyBadge key={c} code={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Exchange rate table */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
          Tabel Kurs
        </h4>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--text-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-sm text-[var(--text-3)]">
            Belum ada kurs. Klik &ldquo;Refresh dari API&rdquo; atau tambah manual.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Dari</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Ke</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--text-3)]">Kurs</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--text-3)]">Diperbarui</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'transition-colors hover:bg-[var(--bg-subtle)]',
                      i !== 0 && 'border-t border-[var(--border)]',
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <CurrencyBadge code={r.fromCurrency} />
                    </td>
                    <td className="px-4 py-2.5">
                      <CurrencyBadge code={r.toCurrency} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--text-1)]">
                      {r.rate.toFixed(6)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-[var(--text-3)]">
                      {new Date(r.updatedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(r.id, r.fromCurrency, r.toCurrency)}
                        className="text-[var(--text-3)] transition-colors hover:text-red-400"
                        aria-label={`Hapus kurs ${r.fromCurrency}→${r.toCurrency}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add rate form */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
          Tambah / Ubah Kurs
        </h4>
        <form onSubmit={handleSave} className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <div className="flex flex-wrap gap-3">
            {/* From currency */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-3)]">Dari</label>
              <select
                value={newFrom}
                onChange={e => {
                  setNewFrom(e.target.value)
                  setNewTo(SUPPORTED_CURRENCIES.find(c => c !== e.target.value) ?? 'USD')
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* To currency */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-3)]">Ke</label>
              <select
                value={newTo}
                onChange={e => setNewTo(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {foreignOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Rate value */}
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-[var(--text-3)]">
                1 {newFrom} =
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.000064"
                value={newRate}
                onChange={e => setNewRate(e.target.value)}
                className="min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Submit */}
            <div className="flex flex-col justify-end">
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90',
                  saving && 'cursor-not-allowed opacity-60',
                )}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Simpan
              </button>
            </div>
          </div>

          {formError && (
            <p className="mt-2 text-xs text-red-400">{formError}</p>
          )}
        </form>
      </div>
    </div>
  )
}

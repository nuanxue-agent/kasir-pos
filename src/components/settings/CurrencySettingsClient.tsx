'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  RefreshCw,
  Plus,
  Loader2,
  Save,
  Star,
  ToggleLeft,
  ToggleRight,
  ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoreCurrency {
  id: string
  storeId: string
  code: string
  symbol: string
  rate: number          // rate vs base currency (base = 1.0)
  active: boolean
  isBase: boolean
  updatedAt: string
}

interface CurrencySettingsClientProps {
  storeId: string
}

// ─── ISO 4217 metadata ────────────────────────────────────────────────────────

const CURRENCY_META: Record<string, { symbol: string; name: string; decimals: number }> = {
  IDR: { symbol: 'Rp',   name: 'Indonesian Rupiah',  decimals: 0 },
  USD: { symbol: '$',    name: 'US Dollar',           decimals: 2 },
  SGD: { symbol: 'S$',   name: 'Singapore Dollar',    decimals: 2 },
  MYR: { symbol: 'RM',   name: 'Malaysian Ringgit',   decimals: 2 },
  EUR: { symbol: '€',    name: 'Euro',                decimals: 2 },
  GBP: { symbol: '£',    name: 'British Pound',       decimals: 2 },
  JPY: { symbol: '¥',    name: 'Japanese Yen',        decimals: 0 },
  CNY: { symbol: '¥',    name: 'Chinese Yuan',        decimals: 2 },
  AUD: { symbol: 'A$',   name: 'Australian Dollar',   decimals: 2 },
  SAR: { symbol: '﷼',    name: 'Saudi Riyal',         decimals: 2 },
}

const ALL_CURRENCIES = Object.keys(CURRENCY_META)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CurrencyBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-xs text-[var(--text-2)]">
      {code}
    </span>
  )
}

/** Round to currency's native decimal places */
function roundForCurrency(amount: number, code: string): number {
  const decimals = CURRENCY_META[code]?.decimals ?? 2
  const factor = Math.pow(10, decimals)
  return Math.round(amount * factor) / factor
}

/** Convert amount from one currency to another given a StoreCurrency list */
function convertBetween(
  amount: number,
  from: string,
  to: string,
  currencies: StoreCurrency[],
): number {
  if (from === to) return amount
  const fromC = currencies.find(c => c.code === from)
  const toC   = currencies.find(c => c.code === to)
  if (!fromC || !toC) return amount
  // Convert to base then to target
  const inBase = fromC.isBase ? amount : amount / fromC.rate
  const result = toC.isBase   ? inBase : inBase * toC.rate
  return roundForCurrency(result, to)
}

// ─── Convert Panel ────────────────────────────────────────────────────────────

function ConvertPanel({ currencies }: { currencies: StoreCurrency[] }) {
  const active = currencies.filter(c => c.active)
  const [amount, setAmount]   = useState('100')
  const [from,   setFrom]     = useState(active[0]?.code ?? 'IDR')
  const [to,     setTo]       = useState(active[1]?.code ?? 'USD')
  const [result, setResult]   = useState<number | null>(null)

  const compute = () => {
    const n = parseFloat(amount)
    if (isNaN(n)) { setResult(null); return }
    setResult(convertBetween(n, from, to, currencies))
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
        <ArrowRightLeft className="h-4 w-4 text-[var(--accent)]" />
        Kalkulator Konversi
      </h3>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-2)]">Jumlah</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-32 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-2)]">Dari</label>
          <select
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          >
            {active.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-2)]">Ke</label>
          <select
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          >
            {active.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <button
          onClick={compute}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Hitung
        </button>
      </div>
      {result !== null && (
        <p className="text-sm text-[var(--text-1)]">
          <span className="font-semibold">{amount} {from}</span>
          {' = '}
          <span className="font-semibold text-[var(--accent)]">
            {result.toLocaleString()} {to}
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CurrencySettingsClient({ storeId }: CurrencySettingsClientProps) {
  const [currencies, setCurrencies]   = useState<StoreCurrency[]>([])
  const [loading,    setLoading]      = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [saving,     setSaving]       = useState<string | null>(null)  // code being saved
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // Add-currency form
  const [addCode,   setAddCode]   = useState('')
  const [addRate,   setAddRate]   = useState('')
  const [addError,  setAddError]  = useState('')
  const [adding,    setAdding]    = useState(false)

  // Inline rate-edit state: code → draft string
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({})

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/currencies?storeId=${storeId}`)
      if (res.ok) {
        const data = await res.json() as { currencies: StoreCurrency[] }
        setCurrencies(data.currencies)
        setLastUpdated(new Date().toISOString())
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { load() }, [load])

  // ── Refresh rates stub ────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // Stub: in production, call an FX API and update rates
      await new Promise(r => setTimeout(r, 800))
      setLastUpdated(new Date().toISOString())
      toast.success('Kurs diperbarui (stub — data real-time tidak tersedia)')
    } finally {
      setRefreshing(false)
    }
  }

  // ── Save edited rate ──────────────────────────────────────────────────────
  const handleSaveRate = async (code: string) => {
    const raw = rateEdits[code]
    const rate = parseFloat(raw)
    if (isNaN(rate) || rate <= 0) {
      toast.error('Kurs harus lebih dari 0')
      return
    }
    setSaving(code)
    try {
      const res = await fetch(`/api/currencies/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, rate }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        toast.error(d.error ?? 'Gagal menyimpan kurs')
        return
      }
      const d = await res.json() as { currency: StoreCurrency }
      setCurrencies(prev => prev.map(c => c.code === code ? d.currency : c))
      setRateEdits(prev => { const n = { ...prev }; delete n[code]; return n })
      toast.success(`Kurs ${code} berhasil disimpan`)
    } finally {
      setSaving(null)
    }
  }

  // ── Set base currency ─────────────────────────────────────────────────────
  const handleSetBase = async (code: string) => {
    setSaving(code)
    try {
      const res = await fetch(`/api/currencies/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, isBase: true }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        toast.error(d.error ?? 'Gagal mengatur mata uang dasar')
        return
      }
      await load()
      toast.success(`${code} ditetapkan sebagai mata uang dasar`)
    } finally {
      setSaving(null)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  const handleToggleActive = async (currency: StoreCurrency) => {
    if (currency.isBase && currency.active) {
      toast.error('Mata uang dasar tidak dapat dinonaktifkan')
      return
    }
    setSaving(currency.code)
    try {
      const res = await fetch(`/api/currencies/${currency.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, active: !currency.active }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        toast.error(d.error ?? 'Gagal mengubah status')
        return
      }
      const d = await res.json() as { currency: StoreCurrency }
      setCurrencies(prev => prev.map(c => c.code === currency.code ? d.currency : c))
    } finally {
      setSaving(null)
    }
  }

  // ── Add currency ──────────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    if (!addCode) { setAddError('Pilih mata uang'); return }
    if (currencies.some(c => c.code === addCode)) {
      setAddError('Mata uang sudah ditambahkan')
      return
    }
    const rate = parseFloat(addRate)
    if (isNaN(rate) || rate <= 0) { setAddError('Kurs harus lebih dari 0'); return }

    setAdding(true)
    try {
      const res = await fetch('/api/currencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          code: addCode,
          symbol: CURRENCY_META[addCode]?.symbol ?? addCode,
          rate,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setAddError(d.error ?? 'Gagal menambahkan mata uang')
        return
      }
      const d = await res.json() as { currency: StoreCurrency }
      setCurrencies(prev => [...prev, d.currency])
      setAddCode('')
      setAddRate('')
      toast.success(`${addCode} berhasil ditambahkan`)
    } finally {
      setAdding(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  const base = currencies.find(c => c.isBase)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-1)]">
            <DollarSign className="h-5 w-5 text-[var(--accent)]" />
            Pengaturan Multi-Mata Uang
          </h2>
          {lastUpdated && (
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Terakhir diperbarui: {new Date(lastUpdated).toLocaleString('id-ID')}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh Kurs
        </button>
      </div>

      {/* Mata uang dasar */}
      {base && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
          <p className="text-xs font-medium text-[var(--text-2)] uppercase tracking-wide mb-1">
            Mata Uang Dasar
          </p>
          <p className="flex items-center gap-2 text-base font-bold text-[var(--text-1)]">
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            {base.code}
            <span className="text-sm font-normal text-[var(--text-2)]">
              {CURRENCY_META[base.code]?.name ?? base.code} · {base.symbol}
            </span>
          </p>
        </div>
      )}

      {/* Currency table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] text-xs uppercase tracking-wide text-[var(--text-2)]">
            <tr>
              <th className="px-4 py-3 text-left">Kode</th>
              <th className="px-4 py-3 text-left">Nama</th>
              <th className="px-4 py-3 text-left">Simbol</th>
              <th className="px-4 py-3 text-right">Kurs vs Dasar</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {currencies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-3)]">
                  Belum ada mata uang — tambahkan di bawah
                </td>
              </tr>
            )}
            {currencies.map(currency => {
              const isSaving   = saving === currency.code
              const draftRate  = rateEdits[currency.code]
              const isEditing  = draftRate !== undefined
              const meta       = CURRENCY_META[currency.code]

              return (
                <tr
                  key={currency.code}
                  className={cn(
                    'bg-[var(--bg)] transition-colors hover:bg-[var(--bg-subtle)]',
                    !currency.active && 'opacity-50',
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CurrencyBadge code={currency.code} />
                      {currency.isBase && (
                        <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" aria-label="Mata uang dasar" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">
                    {meta?.name ?? currency.code}
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--text-2)]">
                    {currency.symbol}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {currency.isBase ? (
                      <span className="text-[var(--text-3)]">1.000000</span>
                    ) : isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          step="any"
                          min="0.000001"
                          value={draftRate}
                          onChange={e =>
                            setRateEdits(prev => ({ ...prev, [currency.code]: e.target.value }))
                          }
                          className="w-28 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRate(currency.code)}
                          disabled={isSaving}
                          className="rounded bg-[var(--accent)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => setRateEdits(prev => { const n = { ...prev }; delete n[currency.code]; return n })}
                          className="rounded px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setRateEdits(prev => ({ ...prev, [currency.code]: String(currency.rate) }))
                        }
                        className="font-mono text-[var(--text-1)] hover:text-[var(--accent)] hover:underline"
                        title="Klik untuk edit"
                      >
                        {currency.rate.toFixed(6)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(currency)}
                      disabled={isSaving}
                      title={currency.active ? 'Nonaktifkan' : 'Aktifkan'}
                      aria-label={`${currency.active ? 'Nonaktifkan' : 'Aktifkan'} ${currency.code}`}
                    >
                      {currency.active
                        ? <ToggleRight className="h-5 w-5 text-[var(--accent)]" />
                        : <ToggleLeft  className="h-5 w-5 text-[var(--text-3)]" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!currency.isBase && (
                      <button
                        onClick={() => handleSetBase(currency.code)}
                        disabled={isSaving}
                        className="rounded px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] disabled:opacity-50"
                        title="Jadikan mata uang dasar"
                      >
                        Jadikan Dasar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add currency form */}
      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 space-y-3"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
          <Plus className="h-4 w-4 text-[var(--accent)]" />
          Tambah Mata Uang
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="add-code" className="text-xs text-[var(--text-2)]">
              Kode ISO 4217
            </label>
            <select
              id="add-code"
              value={addCode}
              onChange={e => setAddCode(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            >
              <option value="">Pilih mata uang…</option>
              {ALL_CURRENCIES
                .filter(c => !currencies.some(sc => sc.code === c))
                .map(c => (
                  <option key={c} value={c}>
                    {c} — {CURRENCY_META[c]?.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="add-rate" className="text-xs text-[var(--text-2)]">
              Kurs vs Dasar ({base?.code ?? '?'})
            </label>
            <input
              id="add-rate"
              type="number"
              step="any"
              min="0.000001"
              placeholder="mis. 0.000064"
              value={addRate}
              onChange={e => setAddRate(e.target.value)}
              className="w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tambah
          </button>
        </div>
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </form>

      {/* Conversion calculator */}
      {currencies.filter(c => c.active).length >= 2 && (
        <ConvertPanel currencies={currencies} />
      )}

      {/* POS info box */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-2)] space-y-1">
        <p className="font-medium text-[var(--text-1)]">Cara kerja multi-mata uang di POS</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Kasir dapat memilih mata uang transaksi dari semua mata uang yang aktif.</li>
          <li>Jumlah yang dimasukkan kasir otomatis dikonversi ke mata uang dasar ({base?.code ?? '—'}).</li>
          <li>Laporan dan akuntansi selalu menggunakan mata uang dasar.</li>
          <li>Setiap konversi dicatat dalam tabel CurrencyTransaction untuk audit.</li>
        </ul>
      </div>
    </div>
  )
}

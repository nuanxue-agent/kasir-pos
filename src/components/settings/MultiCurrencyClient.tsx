'use client'

import { useState, useCallback, useEffect } from 'react'
import { Plus, RefreshCw, Pencil, Check, X, TrendingUp, DollarSign, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  convertBetween,
  findBaseCurrency,
  getDecimalsForCurrency,
  validateBaseCurrency,
} from '@/lib/multi-currency'
import type { Currency } from '@/lib/multi-currency'

// Re-export pure functions for unit tests
export {
  convertAmount,
  convertBetween,
  findBaseCurrency,
  getCrossRate,
  getDecimalsForCurrency,
  roundToCurrency,
  toBaseCurrency,
  getLatestRate,
  filterRateHistory,
  validateBaseCurrency,
  formatWithCurrency,
} from '@/lib/multi-currency'

const COMMON_CURRENCIES = [
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'KRW', name: 'Korean Won', symbol: '₩' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
]

interface HistoryEntry {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  recordedAt: string
}

interface ConvertResult {
  amount: number
  from: string
  to: string
  converted: number
  rate: number
}

interface MultiCurrencyClientProps {
  storeId: string
  baseCurrencyCode: string
}

export default function MultiCurrencyClient({ storeId, baseCurrencyCode }: MultiCurrencyClientProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'currencies' | 'converter' | 'history'>('currencies')

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addName, setAddName] = useState('')
  const [addSymbol, setAddSymbol] = useState('')
  const [addRate, setAddRate] = useState('1')
  const [addIsBase, setAddIsBase] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit rate inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')

  // Converter
  const [cvtAmount, setCvtAmount] = useState('100')
  const [cvtFrom, setCvtFrom] = useState('')
  const [cvtTo, setCvtTo] = useState('')
  const [cvtResult, setCvtResult] = useState<ConvertResult | null>(null)
  const [cvtLoading, setCvtLoading] = useState(false)

  const fetchCurrencies = useCallback(async () => {
    const res = await fetch(`/api/currencies?storeId=${storeId}`)
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    setCurrencies(data)
    if (data.length > 0 && !cvtFrom) setCvtFrom(data[0].code)
    if (data.length > 1 && !cvtTo) setCvtTo(data[1].code)
  }, [storeId, cvtFrom, cvtTo])

  const fetchHistory = useCallback(async () => {
    const res = await fetch(`/api/currencies/history?storeId=${storeId}&limit=50`)
    const data = await res.json() as any
    if (!data.error) setHistory(data)
  }, [storeId])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchCurrencies(), fetchHistory()]).finally(() => setLoading(false))
  }, [fetchCurrencies, fetchHistory])

  // Auto-fill name/symbol when selecting common currency
  const handleCodeChange = (code: string) => {
    setAddCode(code)
    const common = COMMON_CURRENCIES.find(c => c.code === code.toUpperCase())
    if (common) {
      setAddName(common.name)
      setAddSymbol(common.symbol)
    }
  }

  const handleAdd = async () => {
    if (!addCode || !addName || !addSymbol) {
      toast.error('Code, name, and symbol are required')
      return
    }
    setSaving(true)
    const res = await fetch(`/api/currencies?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: addCode.toUpperCase(),
        name: addName,
        symbol: addSymbol,
        exchangeRate: parseFloat(addRate) || 1,
        isBase: addIsBase,
      }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Currency added')
    setShowAdd(false)
    setAddCode(''); setAddName(''); setAddSymbol(''); setAddRate('1'); setAddIsBase(false)
    fetchCurrencies()
  }

  const handleToggleActive = async (c: Currency) => {
    const res = await fetch(`/api/currencies/${c.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    toast.success(c.active ? 'Currency deactivated' : 'Currency activated')
    fetchCurrencies()
  }

  const handleSaveRate = async (id: string) => {
    const rate = parseFloat(editRate)
    if (isNaN(rate) || rate <= 0) { toast.error('Rate must be a positive number'); return }
    const res = await fetch(`/api/currencies/${id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeRate: rate }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    toast.success('Exchange rate updated')
    setEditingId(null)
    fetchCurrencies()
    fetchHistory()
  }

  const handleConvert = async () => {
    if (!cvtFrom || !cvtTo) { toast.error('Select currencies to convert'); return }
    setCvtLoading(true)
    const res = await fetch(`/api/currencies/convert?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(cvtAmount) || 0, from: cvtFrom, to: cvtTo }),
    })
    const data = await res.json() as any
    setCvtLoading(false)
    if (data.error) { toast.error(data.error); return }
    setCvtResult(data)
  }

  const base = findBaseCurrency(currencies)
  const validation = validateBaseCurrency(currencies)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-[var(--text-3)]" size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Multi-Currency</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Manage currencies and exchange rates for your store
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} /> Add Currency
        </button>
      </div>

      {/* Base currency warning */}
      {!validation.valid && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          ⚠ {validation.error} — add a base currency to enable conversions.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-1 w-fit">
        {(['currencies', 'converter', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Currencies tab ── */}
      {tab === 'currencies' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {currencies.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-3)]">
              <DollarSign className="mx-auto mb-3 opacity-30" size={40} />
              <p>No currencies configured.</p>
              <p className="text-sm mt-1">Add a base currency to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Currency</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Symbol</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">Rate (vs base)</th>
                  <th className="px-4 py-3 text-center font-medium text-[var(--text-3)]">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map(c => (
                  <tr key={c.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-1)]/50">
                    <td className="px-4 py-3 text-[var(--text-1)]">
                      <div className="flex items-center gap-2">
                        {c.isBase && <Star size={14} className="text-amber-500 fill-amber-500" />}
                        {c.name}
                        {c.isBase && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            Base
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-[var(--text-1)]">{c.code}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{c.symbol}</td>
                    <td className="px-4 py-3 text-right">
                      {c.isBase ? (
                        <span className="text-[var(--text-3)]">1.000000</span>
                      ) : editingId === c.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            value={editRate}
                            onChange={e => setEditRate(e.target.value)}
                            className="w-32 rounded border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1 text-right text-sm text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                            autoFocus
                          />
                          <button onClick={() => handleSaveRate(c.id)} className="text-green-500 hover:text-green-400">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-[var(--text-3)] hover:text-[var(--text-2)]">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(c.id); setEditRate(String(c.exchangeRate)) }}
                          className="flex items-center gap-1 ml-auto text-[var(--text-1)] hover:text-[var(--primary)]"
                        >
                          {c.exchangeRate.toFixed(6)}
                          <Pencil size={12} className="text-[var(--text-3)]" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        c.active
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : 'bg-[var(--bg-1)] text-[var(--text-3)]',
                      )}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!c.isBase && (
                        <button
                          onClick={() => handleToggleActive(c)}
                          className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] underline"
                        >
                          {c.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Converter tab ── */}
      {tab === 'converter' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 max-w-lg">
          <h2 className="font-semibold text-[var(--text-1)]">Currency Converter</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Amount</label>
              <input
                type="number"
                value={cvtAmount}
                onChange={e => setCvtAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">From</label>
                <select
                  value={cvtFrom}
                  onChange={e => setCvtFrom(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">Select...</option>
                  {currencies.filter(c => c.active).map(c => (
                    <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">To</label>
                <select
                  value={cvtTo}
                  onChange={e => setCvtTo(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">Select...</option>
                  {currencies.filter(c => c.active).map(c => (
                    <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <button
            onClick={handleConvert}
            disabled={cvtLoading}
            className="w-full rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {cvtLoading ? 'Converting...' : 'Convert'}
          </button>
          {cvtResult && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-4 text-center">
              <p className="text-2xl font-bold text-[var(--text-1)]">
                {cvtResult.converted.toLocaleString(undefined, {
                  minimumFractionDigits: getDecimalsForCurrency(cvtResult.to),
                  maximumFractionDigits: getDecimalsForCurrency(cvtResult.to),
                })}
                {' '}{cvtResult.to}
              </p>
              <p className="text-sm text-[var(--text-3)] mt-1">
                1 {cvtResult.from} = {cvtResult.rate.toFixed(6)} {cvtResult.to}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {history.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-3)]">
              <TrendingUp className="mx-auto mb-3 opacity-30" size={40} />
              <p>No rate history yet.</p>
              <p className="text-sm mt-1">Update an exchange rate to record history.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Pair</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">Rate</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">Recorded At</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-1)]/50">
                    <td className="px-4 py-3 font-mono text-[var(--text-1)]">
                      {h.fromCurrency} → {h.toCurrency}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-1)]">{h.rate.toFixed(6)}</td>
                    <td className="px-4 py-3 text-right text-[var(--text-3)]">
                      {new Date(h.recordedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Add Currency Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Add Currency</h2>
              <button onClick={() => setShowAdd(false)} className="text-[var(--text-3)] hover:text-[var(--text-2)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">
                  Currency Code
                </label>
                <div className="flex gap-2">
                  <select
                    value={addCode}
                    onChange={e => handleCodeChange(e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  >
                    <option value="">Select or type...</option>
                    {COMMON_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Custom"
                    value={addCode}
                    onChange={e => handleCodeChange(e.target.value.toUpperCase())}
                    maxLength={5}
                    className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="e.g. US Dollar"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div className="flex gap-3">
                <div className="w-28">
                  <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Symbol</label>
                  <input
                    type="text"
                    value={addSymbol}
                    onChange={e => setAddSymbol(e.target.value)}
                    placeholder="$"
                    maxLength={4}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">
                    Exchange Rate (vs base)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={addRate}
                    onChange={e => setAddRate(e.target.value)}
                    disabled={addIsBase}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addIsBase}
                  onChange={e => { setAddIsBase(e.target.checked); if (e.target.checked) setAddRate('1') }}
                  className="rounded"
                />
                <span className="text-sm text-[var(--text-2)]">Set as base currency</span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-1)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Currency'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

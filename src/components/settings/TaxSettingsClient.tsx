'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Percent,
  ToggleLeft,
  ToggleRight,
  Info,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Star,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaxRateType = 'PERCENTAGE' | 'FIXED'
export type TaxAppliesTo = 'ALL' | 'FOOD' | 'BEVERAGE' | 'SERVICE'

export interface TaxRate {
  id: string
  storeId: string
  name: string
  rate: number
  type: TaxRateType
  appliesTo: TaxAppliesTo
  active: boolean
  isDefault: boolean
}

interface TaxConfig {
  id: string | null
  storeId: string
  ppnRate: number
  ppnEnabled: boolean
  ppnIncluded: boolean
}

interface TaxSettingsClientProps {
  storeId: string
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/** Apply a single TaxRate to a base amount. Returns the tax amount. */
export function applyTaxRate(baseAmount: number, rate: TaxRate): number {
  if (!rate.active) return 0
  if (rate.type === 'FIXED') return rate.rate
  return Math.round(baseAmount * (rate.rate / 100))
}

/** Apply multiple tax rates to a base amount; returns per-rate breakdown + total. */
export function applyMultipleTaxRates(
  baseAmount: number,
  rates: TaxRate[],
): { breakdown: Array<{ rate: TaxRate; amount: number }>; total: number } {
  const breakdown = rates
    .filter(r => r.active)
    .map(r => ({ rate: r, amount: applyTaxRate(baseAmount, r) }))
  const total = breakdown.reduce((s, b) => s + b.amount, 0)
  return { breakdown, total }
}

/** Extract base amount from a tax-inclusive price given multiple active rates. */
export function calcTaxInclusive(
  grossAmount: number,
  rates: TaxRate[],
): { base: number; taxBreakdown: Array<{ rate: TaxRate; amount: number }>; totalTax: number } {
  const activePercentage = rates
    .filter(r => r.active && r.type === 'PERCENTAGE')
    .reduce((s, r) => s + r.rate / 100, 0)
  const base = activePercentage > 0
    ? Math.round(grossAmount / (1 + activePercentage))
    : grossAmount
  const { breakdown, total } = applyMultipleTaxRates(base, rates)
  return { base, taxBreakdown: breakdown, totalTax: total }
}

/** Pick the default tax rate from a list. Falls back to first active if none marked default. */
export function getDefaultTaxRate(rates: TaxRate[]): TaxRate | null {
  return (
    rates.find(r => r.isDefault && r.active) ??
    rates.find(r => r.active) ??
    null
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PPN_RATES = [
  { label: '11% (PPN Standar — UU HPP 2022)', value: 0.11 },
  { label: '12% (PPN 2025)', value: 0.12 },
  { label: '10% (PPN Lama)', value: 0.10 },
  { label: '0% (Bebas PPN)', value: 0 },
]

const APPLIES_TO_LABELS: Record<TaxAppliesTo, string> = {
  ALL: 'Semua',
  FOOD: 'Makanan',
  BEVERAGE: 'Minuman',
  SERVICE: 'Jasa',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaxRateRow({
  rate,
  storeId,
  onUpdated,
}: {
  rate: TaxRate
  storeId: string
  onUpdated: () => void
}) {
  const toggleMutation = useMutation({
    mutationFn: async (patch: Partial<TaxRate>) => {
      const res = await fetch(`/api/tax-rates/${rate.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Gagal memperbarui')
    },
    onSuccess: onUpdated,
  })

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-1)] truncate">{rate.name}</span>
          {rate.isDefault && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              <Star className="h-2.5 w-2.5" /> Default
            </span>
          )}
          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">
            {APPLIES_TO_LABELS[rate.appliesTo]}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">
          {rate.type === 'PERCENTAGE'
            ? `${rate.rate}% dari DPP`
            : `Rp ${rate.rate.toLocaleString('id-ID')} tetap`}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!rate.isDefault && (
          <button
            onClick={() => toggleMutation.mutate({ isDefault: true })}
            disabled={toggleMutation.isPending}
            title="Jadikan default"
            className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-3)] hover:border-amber-300 hover:text-amber-600 disabled:opacity-40"
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => toggleMutation.mutate({ active: !rate.active })}
          disabled={toggleMutation.isPending}
          aria-label={rate.active ? 'Nonaktifkan' : 'Aktifkan'}
          className="text-xs font-semibold transition-colors"
        >
          {rate.active ? (
            <ToggleRight className="h-6 w-6 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-[var(--text-3)]" />
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaxSettingsClient({ storeId }: TaxSettingsClientProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRate, setNewRate] = useState({
    name: '',
    rate: '',
    type: 'PERCENTAGE' as TaxRateType,
    appliesTo: 'ALL' as TaxAppliesTo,
    isDefault: false,
  })

  // ── PPN global config ──
  const { data: config, isLoading: configLoading } = useQuery<TaxConfig>({
    queryKey: ['tax-config', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/settings/tax-config?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat konfigurasi pajak')
      return res.json()
    },
  })

  const [form, setForm] = useState<{
    ppnRate: number
    ppnEnabled: boolean
    ppnIncluded: boolean
  } | null>(null)

  const effective = form ?? (config ? {
    ppnRate: config.ppnRate,
    ppnEnabled: config.ppnEnabled,
    ppnIncluded: config.ppnIncluded,
  } : null)

  const configMutation = useMutation({
    mutationFn: async (payload: { ppnRate: number; ppnEnabled: boolean; ppnIncluded: boolean }) => {
      const res = await fetch('/api/settings/tax-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...payload }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Gagal menyimpan')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-config', storeId] })
      setSaved(true)
      setSaveError(null)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: Error) => setSaveError(e.message),
  })

  // ── Tax rates list ──
  const { data: taxRates = [], isLoading: ratesLoading } = useQuery<TaxRate[]>({
    queryKey: ['tax-rates', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/tax-rates?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat tarif pajak')
      return res.json()
    },
  })

  const addRateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tax-rates?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: newRate.name,
          rate: Number(newRate.rate),
          type: newRate.type,
          appliesTo: newRate.appliesTo,
          isDefault: newRate.isDefault,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Gagal menambah tarif')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-rates', storeId] })
      setShowAddForm(false)
      setNewRate({ name: '', rate: '', type: 'PERCENTAGE', appliesTo: 'ALL', isDefault: false })
    },
  })

  function handleSaveConfig() {
    if (!effective) return
    setSaved(false)
    setSaveError(null)
    configMutation.mutate(effective)
  }

  const isLoading = configLoading || ratesLoading

  if (isLoading || !effective) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-[var(--bg-subtle)]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Section: Global PPN Config ── */}
      <div>
        <h3 className="text-sm font-bold text-[var(--text-1)]">Konfigurasi Pajak (PPN)</h3>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">
          Pengaturan Pajak Pertambahan Nilai sesuai regulasi Indonesia
        </p>
      </div>

      {/* Enable PPN toggle */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-1)]">Aktifkan PPN</p>
          <p className="text-xs text-[var(--text-3)]">Terapkan PPN pada transaksi penjualan</p>
        </div>
        <button
          onClick={() => setForm(f => ({ ...(f ?? effective), ppnEnabled: !effective.ppnEnabled }))}
          aria-label={effective.ppnEnabled ? 'Nonaktifkan PPN' : 'Aktifkan PPN'}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
        >
          {effective.ppnEnabled ? (
            <ToggleRight className="h-7 w-7 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-7 w-7 text-[var(--text-3)]" />
          )}
          <span className={effective.ppnEnabled ? 'text-emerald-600' : 'text-[var(--text-3)]'}>
            {effective.ppnEnabled ? 'Aktif' : 'Nonaktif'}
          </span>
        </button>
      </div>

      {/* PPN rate buttons */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 space-y-2">
        <label className="block text-sm font-semibold text-[var(--text-1)]">Tarif PPN</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PPN_RATES.map(r => (
            <button
              key={r.value}
              onClick={() => setForm(f => ({ ...(f ?? effective), ppnRate: r.value }))}
              disabled={!effective.ppnEnabled}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all
                ${effective.ppnRate === r.value && effective.ppnEnabled
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:border-amber-200 disabled:opacity-40'
                }`}
            >
              <div className="flex items-center gap-1 justify-center">
                <Percent className="h-3 w-3" />
                {(r.value * 100).toFixed(0)}%
              </div>
              <div className="mt-0.5 text-[10px] font-normal leading-tight text-[var(--text-3)]">
                {r.label.split('—')[0].trim()}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-3)]">
          Tarif saat ini: <strong>{(effective.ppnRate * 100).toFixed(0)}%</strong> — Sesuai UU No. 7 Tahun 2021 (HPP)
        </p>
      </div>

      {/* PPN inclusive/exclusive */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-1)]">Metode Penghitungan PPN</p>
          <p className="text-xs text-[var(--text-3)]">Tentukan apakah harga jual sudah termasuk PPN</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setForm(f => ({ ...(f ?? effective), ppnIncluded: false }))}
            disabled={!effective.ppnEnabled}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition-all
              ${!effective.ppnIncluded && effective.ppnEnabled
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:border-blue-200 disabled:opacity-40'
              }`}
          >
            <div className="font-bold">Eksklusif (di luar harga)</div>
            <div className="mt-0.5 text-[10px] text-[var(--text-3)] leading-tight">
              PPN ditambahkan ke harga jual.<br />Harga Rp 100k + PPN 11% = Rp 111k
            </div>
          </button>
          <button
            onClick={() => setForm(f => ({ ...(f ?? effective), ppnIncluded: true }))}
            disabled={!effective.ppnEnabled}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition-all
              ${effective.ppnIncluded && effective.ppnEnabled
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:border-blue-200 disabled:opacity-40'
              }`}
          >
            <div className="font-bold">Inklusif (sudah termasuk)</div>
            <div className="mt-0.5 text-[10px] text-[var(--text-3)] leading-tight">
              PPN sudah ada dalam harga.<br />Harga Rp 111k → DPP Rp 100k
            </div>
          </button>
        </div>
      </div>

      {/* PPh 23 info */}
      <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="text-xs text-blue-700 space-y-0.5">
          <p className="font-semibold">PPh 23 (Pajak Penghasilan Pasal 23)</p>
          <p>Secara otomatis dihitung 2% untuk transaksi B2B di atas Rp 500.000. Ditampilkan di invoice dan laporan pajak.</p>
        </div>
      </div>

      {/* Save config */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSaveConfig}
          disabled={configMutation.isPending}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {configMutation.isPending ? 'Menyimpan…' : 'Simpan Pengaturan Pajak'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle className="h-4 w-4" /> Tersimpan
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
            <AlertCircle className="h-4 w-4" /> {saveError}
          </span>
        )}
      </div>

      {/* ── Section: Custom Tax Rates ── */}
      <div className="border-t border-[var(--border)] pt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-1)]">Tarif Pajak Kustom</h3>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Definisikan beberapa tarif pajak per toko, seperti PPN 11%, Service Charge 5%, dll.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Tarif
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs font-bold text-amber-800">Tarif Pajak Baru</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-3)] mb-1">Nama *</label>
                <input
                  value={newRate.name}
                  onChange={e => setNewRate(r => ({ ...r, name: e.target.value }))}
                  placeholder="cth. PPN 11%, Service Charge"
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-3)] mb-1">
                  {newRate.type === 'PERCENTAGE' ? 'Persentase (%)' : 'Jumlah Tetap (Rp)'} *
                </label>
                <input
                  type="number"
                  value={newRate.rate}
                  onChange={e => setNewRate(r => ({ ...r, rate: e.target.value }))}
                  placeholder={newRate.type === 'PERCENTAGE' ? '11' : '5000'}
                  min={0}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-3)] mb-1">Tipe</label>
                <select
                  value={newRate.type}
                  onChange={e => setNewRate(r => ({ ...r, type: e.target.value as TaxRateType }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
                >
                  <option value="PERCENTAGE">Persentase (%)</option>
                  <option value="FIXED">Tetap (Rp)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-3)] mb-1">Berlaku untuk</label>
                <select
                  value={newRate.appliesTo}
                  onChange={e => setNewRate(r => ({ ...r, appliesTo: e.target.value as TaxAppliesTo }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
                >
                  <option value="ALL">Semua Produk</option>
                  <option value="FOOD">Makanan</option>
                  <option value="BEVERAGE">Minuman</option>
                  <option value="SERVICE">Jasa</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={newRate.isDefault}
                onChange={e => setNewRate(r => ({ ...r, isDefault: e.target.checked }))}
                className="rounded"
              />
              Jadikan tarif default
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => addRateMutation.mutate()}
                disabled={addRateMutation.isPending || !newRate.name || !newRate.rate}
                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {addRateMutation.isPending ? 'Menyimpan…' : 'Simpan Tarif'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
              >
                Batal
              </button>
              {addRateMutation.isError && (
                <span className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {(addRateMutation.error as Error).message}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tax rates list */}
        {ratesLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : taxRates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
            <Percent className="mx-auto mb-2 h-8 w-8 text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-3)]">Belum ada tarif pajak kustom</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Tambahkan tarif seperti PPN 11%, Service Charge 5%, dll.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {taxRates.map(rate => (
              <TaxRateRow
                key={rate.id}
                rate={rate}
                storeId={storeId}
                onUpdated={() => qc.invalidateQueries({ queryKey: ['tax-rates', storeId] })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

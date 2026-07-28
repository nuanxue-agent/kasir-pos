'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Percent, ToggleLeft, ToggleRight, Info, CheckCircle, AlertCircle } from 'lucide-react'

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

const PPN_RATES = [
  { label: '11% (PPN Standar — UU HPP 2022)', value: 0.11 },
  { label: '12% (PPN 2025)', value: 0.12 },
  { label: '10% (PPN Lama)', value: 0.10 },
  { label: '0% (Bebas PPN)', value: 0 },
]

export function TaxSettingsClient({ storeId }: TaxSettingsClientProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: config, isLoading } = useQuery<TaxConfig>({
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

  // Sync form from query data once loaded
  const effective = form ?? (config ? {
    ppnRate: config.ppnRate,
    ppnEnabled: config.ppnEnabled,
    ppnIncluded: config.ppnIncluded,
  } : null)

  const mutation = useMutation({
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
    onError: (e: Error) => {
      setSaveError(e.message)
    },
  })

  function handleSave() {
    if (!effective) return
    setSaved(false)
    setSaveError(null)
    mutation.mutate(effective)
  }

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
    <div className="space-y-5">
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

      {/* PPN rate */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 space-y-2">
        <label className="block text-sm font-semibold text-[var(--text-1)]">
          Tarif PPN
        </label>
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

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {mutation.isPending ? 'Menyimpan…' : 'Simpan Pengaturan Pajak'}
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
    </div>
  )
}

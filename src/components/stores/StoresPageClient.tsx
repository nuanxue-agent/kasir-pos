'use client'

import { useState } from 'react'
import { Store, Save, Phone, Mail, MapPin, Globe, Receipt, Percent } from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

interface StoreData {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  taxRate: number
  currency: string
  timezone: string
  receiptNote: string | null
}

interface Props {
  storeId: string
  initialStore: StoreData | null
}

const inputCls = 'w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-[var(--text-3)] transition-all'

const TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'UTC',
]

const CURRENCIES = ['IDR', 'SGD', 'MYR', 'USD', 'EUR']

export default function StoresPageClient({ storeId, initialStore }: Props) {
  const [form, setForm] = useState({
    name: initialStore?.name ?? '',
    address: initialStore?.address ?? '',
    phone: initialStore?.phone ?? '',
    email: initialStore?.email ?? '',
    taxRate: String(initialStore?.taxRate ?? 0),
    currency: initialStore?.currency ?? 'IDR',
    timezone: initialStore?.timezone ?? 'Asia/Jakarta',
    receiptNote: initialStore?.receiptNote ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Nama toko wajib diisi')
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/store`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: form.name.trim(),
          address: form.address || null,
          phone: form.phone || null,
          email: form.email || null,
          taxRate: Number(form.taxRate) || 0,
          currency: form.currency,
          timezone: form.timezone,
          receiptNote: form.receiptNote || null,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) {
        toast.error(data.error ?? 'Gagal menyimpan')
        return
      }
      toast.success('Pengaturan toko disimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Store size={20} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Pengaturan Toko</h1>
          <p className="text-[var(--text-3)] text-sm">Informasi dan konfigurasi toko Anda</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basic info */}
        <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-[var(--text-1)] text-sm">Informasi Toko</h2>
          <div>
            <label className="block text-xs text-[var(--text-3)] mb-1">Nama Toko *</label>
            <div className="relative">
              <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                className={inputCls + ' pl-9'}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Nama toko"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-3)] mb-1">Alamat</label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-3 text-[var(--text-3)]" />
              <textarea
                className={inputCls + ' pl-9 resize-none'}
                rows={2}
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Alamat toko"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">Telepon</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  className={inputCls + ' pl-9'}
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+62xxx"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  className={inputCls + ' pl-9'}
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="email@toko.com"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Finance & locale */}
        <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-[var(--text-1)] text-sm">Keuangan & Lokasi</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">Mata Uang</label>
              <select className={inputCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">Pajak (%)</label>
              <div className="relative">
                <Percent size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  className={inputCls + ' pl-9'}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.taxRate}
                  onChange={e => set('taxRate', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">Zona Waktu</label>
              <div className="relative">
                <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                <select className={inputCls + ' pl-9'} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Receipt */}
        <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-[var(--text-1)] text-sm flex items-center gap-2">
            <Receipt size={14} /> Catatan Struk
          </h2>
          <textarea
            className={inputCls + ' resize-none'}
            rows={3}
            value={form.receiptNote}
            onChange={e => set('receiptNote', e.target.value)}
            placeholder="Terima kasih telah berbelanja…"
          />
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
        >
          <Save size={16} />
          {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </button>
      </div>
    </div>
  )
}

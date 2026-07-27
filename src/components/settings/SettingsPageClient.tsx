'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Save, Store, Receipt, Globe, LayoutGrid,
  ShoppingCart, Boxes, Users, Percent, BarChart3, CheckCircle2,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

const schema = z.object({
  name: z.string().min(1, 'Wajib diisi'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  taxRate: z.preprocess((v) => parseFloat(String(v)), z.number().min(0).max(100)),
  currency: z.string().min(1),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const ALL_MODULES = [
  { key: 'pos',        label: 'Kasir (POS)',        desc: 'Terminal kasir untuk catat penjualan',      icon: ShoppingCart, required: false },
  { key: 'inventory',  label: 'Stok & Inventori',   desc: 'Kelola stok dan notifikasi stok menipis',   icon: Boxes,        required: false },
  { key: 'customers',  label: 'Pelanggan & Poin',   desc: 'Database pelanggan dan poin loyalitas',     icon: Users,        required: false },
  { key: 'discounts',  label: 'Diskon & Promo',     desc: 'Buat kode diskon dan promo otomatis',       icon: Percent,      required: false },
  { key: 'reports',    label: 'Laporan',            desc: 'Laporan omzet, produk terlaris, dan lainnya', icon: BarChart3,  required: true  },
]

interface SettingsPageClientProps {
  storeId: string
  store: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    taxRate: number
    currency: string
    receiptNote?: string | null
    timezone: string
    modules?: string[]
  }
}

export default function SettingsPageClient({ storeId, store }: SettingsPageClientProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modules, setModules] = useState<string[]>(
    store.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']
  )

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: store.name,
      address: store.address ?? '',
      phone: store.phone ?? '',
      email: store.email ?? '',
      taxRate: store.taxRate * 100,
      currency: store.currency,
      receiptNote: store.receiptNote ?? '',
      timezone: store.timezone,
    },
  })

  function toggleModule(key: string) {
    setModules(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    )
  }

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/settings/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          ...data,
          taxRate: data.taxRate / 100,
          modules: JSON.stringify(modules),
        }),
      })
      if (!res.ok) throw new Error('Gagal menyimpan')
      toast.success('Pengaturan disimpan')
    } catch {
      setError('Gagal menyimpan pengaturan')
      toast.error('Gagal menyimpan pengaturan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Pengaturan Toko</h1>
        <p className="text-stone-500 mt-1 text-sm">Konfigurasi informasi dan preferensi toko kamu</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* ── Store Info ── */}
        <section className="bg-white border border-stone-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-stone-700 font-semibold text-sm">
            <Store className="h-4 w-4 text-amber-500" />
            Informasi Toko
          </div>
          <Field label="Nama Toko" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} />
          </Field>
          <Field label="Alamat" error={errors.address?.message}>
            <textarea {...register('address')} rows={2} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Telepon" error={errors.phone?.message}>
              <input {...register('phone')} className={inputCls} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input {...register('email')} className={inputCls} />
            </Field>
          </div>
        </section>

        {/* ── Tax & Currency ── */}
        <section className="bg-white border border-stone-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-stone-700 font-semibold text-sm">
            <Globe className="h-4 w-4 text-amber-500" />
            Pajak & Mata Uang
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tarif Pajak (%)" error={errors.taxRate?.message}>
              <input type="number" step="0.1" min="0" max="100" {...register('taxRate')} className={inputCls} />
            </Field>
            <Field label="Mata Uang" error={errors.currency?.message}>
              <select {...register('currency')} className={inputCls}>
                <option value="IDR">IDR — Rupiah</option>
                <option value="USD">USD — US Dollar</option>
                <option value="SGD">SGD — Singapore Dollar</option>
                <option value="MYR">MYR — Malaysian Ringgit</option>
              </select>
            </Field>
          </div>
          <Field label="Zona Waktu" error={errors.timezone?.message}>
            <select {...register('timezone')} className={inputCls}>
              <option value="Asia/Jakarta">Asia/Jakarta (WIB, UTC+7)</option>
              <option value="Asia/Makassar">Asia/Makassar (WITA, UTC+8)</option>
              <option value="Asia/Jayapura">Asia/Jayapura (WIT, UTC+9)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </section>

        {/* ── Receipt ── */}
        <section className="bg-white border border-stone-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-stone-700 font-semibold text-sm">
            <Receipt className="h-4 w-4 text-amber-500" />
            Struk
          </div>
          <Field label="Catatan di Struk" error={errors.receiptNote?.message}>
            <textarea
              {...register('receiptNote')}
              rows={3}
              placeholder="Contoh: Terima kasih sudah berbelanja!"
              className={inputCls}
            />
          </Field>
        </section>

        {/* ── Modules ── */}
        <section className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-stone-700 font-semibold text-sm mb-1">
            <LayoutGrid className="h-4 w-4 text-amber-500" />
            Fitur yang Diaktifkan
          </div>
          <p className="text-xs text-stone-400 mb-4">
            Pilih fitur yang sesuai dengan kebutuhan bisnis kamu. Fitur yang dinonaktifkan akan disembunyikan dari tampilan.
          </p>
          <div className="space-y-2">
            {ALL_MODULES.map(({ key, label, desc, icon: Icon, required }) => {
              const enabled = modules.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={required}
                  onClick={() => !required && toggleModule(key)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                    enabled
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-stone-50 border-stone-100 opacity-60'
                  } ${required ? 'cursor-default' : 'cursor-pointer hover:border-amber-300'}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${enabled ? 'bg-amber-100' : 'bg-stone-100'}`}>
                    <Icon className={`h-4 w-4 ${enabled ? 'text-amber-600' : 'text-stone-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${enabled ? 'text-stone-800' : 'text-stone-500'}`}>{label}</p>
                      {required && <span className="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">Wajib</span>}
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5 truncate">{desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    enabled ? 'bg-amber-500 border-amber-500' : 'border-stone-300 bg-white'
                  }`}>
                    {enabled && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {error && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 disabled:from-stone-200 disabled:to-stone-200 disabled:text-stone-400 text-white px-6 py-2.5 rounded-xl font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

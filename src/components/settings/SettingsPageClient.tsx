'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Save,
  Store,
  Receipt,
  Globe,
  LayoutGrid,
  ShoppingCart,
  Boxes,
  Users,
  Percent,
  BarChart3,
  CheckCircle2,
  Palette,
  ImageIcon,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

const schema = z.object({
  name: z.string().min(1, 'Wajib diisi'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  taxRate: z.preprocess(v => parseFloat(String(v)), z.number().min(0).max(100)),
  currency: z.string().min(1),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
  // Branding
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  primaryColor: z.string().optional(),
  logoUrl: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const ALL_MODULES = [
  {
    key: 'pos',
    label: 'Kasir (POS)',
    desc: 'Terminal kasir untuk catat penjualan',
    icon: ShoppingCart,
    required: false,
  },
  {
    key: 'inventory',
    label: 'Stok & Inventori',
    desc: 'Kelola stok dan notifikasi stok menipis',
    icon: Boxes,
    required: false,
  },
  {
    key: 'customers',
    label: 'Pelanggan & Poin',
    desc: 'Database pelanggan dan poin loyalitas',
    icon: Users,
    required: false,
  },
  {
    key: 'discounts',
    label: 'Diskon & Promo',
    desc: 'Buat kode diskon dan promo otomatis',
    icon: Percent,
    required: false,
  },
  {
    key: 'reports',
    label: 'Laporan',
    desc: 'Laporan omzet, produk terlaris, dan lainnya',
    icon: BarChart3,
    required: true,
  },
]

const COLOR_SWATCHES = [
  { label: 'Amber', value: '#f59e0b', bg: 'bg-amber-400', ring: 'ring-amber-400' },
  { label: 'Orange', value: '#f97316', bg: 'bg-orange-500', ring: 'ring-orange-500' },
  { label: 'Green', value: '#22c55e', bg: 'bg-green-500', ring: 'ring-green-500' },
  { label: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', ring: 'ring-blue-500' },
  { label: 'Violet', value: '#7c3aed', bg: 'bg-violet-600', ring: 'ring-violet-600' },
  { label: 'Rose', value: '#f43f5e', bg: 'bg-rose-500', ring: 'ring-rose-500' },
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
    // Branding
    logoUrl?: string | null
    primaryColor?: string | null
    receiptHeader?: string | null
    receiptFooter?: string | null
  }
}

export default function SettingsPageClient({ storeId, store }: SettingsPageClientProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modules, setModules] = useState<string[]>(
    store.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  )
  const [primaryColor, setPrimaryColor] = useState(store.primaryColor ?? '#f59e0b')
  const [logoPreview, setLogoPreview] = useState(store.logoUrl ?? '')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
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
      receiptHeader: store.receiptHeader ?? '',
      receiptFooter: store.receiptFooter ?? '',
      primaryColor: store.primaryColor ?? '#f59e0b',
      logoUrl: store.logoUrl ?? '',
    },
  })

  const logoUrlValue = watch('logoUrl')

  function toggleModule(key: string) {
    setModules(prev => (prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]))
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
          primaryColor,
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
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Pengaturan Toko</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Konfigurasi informasi dan preferensi toko kamu
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* ── Store Info ── */}
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
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
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
            <Globe className="h-4 w-4 text-amber-500" />
            Pajak & Mata Uang
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tarif Pajak (%)" error={errors.taxRate?.message}>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                {...register('taxRate')}
                className={inputCls}
              />
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
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
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

        {/* ── Branding ── */}
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
            <Palette className="h-4 w-4 text-amber-500" />
            Branding
          </div>

          {/* Receipt header */}
          <Field label="Header Struk (nama toko di struk)" error={errors.receiptHeader?.message}>
            <input
              {...register('receiptHeader')}
              placeholder={watch('name') || 'Nama toko Anda'}
              className={inputCls}
            />
          </Field>

          {/* Receipt footer */}
          <Field label="Footer / Catatan Bawah Struk" error={errors.receiptFooter?.message}>
            <textarea
              {...register('receiptFooter')}
              rows={2}
              placeholder="Contoh: Barang yang sudah dibeli tidak dapat dikembalikan."
              className={inputCls}
            />
          </Field>

          {/* Primary color picker */}
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">
              Warna Utama
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {COLOR_SWATCHES.map(swatch => (
                <button
                  key={swatch.value}
                  type="button"
                  title={swatch.label}
                  onClick={() => {
                    setPrimaryColor(swatch.value)
                    setValue('primaryColor', swatch.value)
                  }}
                  className={`h-8 w-8 rounded-full ${swatch.bg} transition-all hover:scale-110 focus:outline-none ${
                    primaryColor === swatch.value ? `ring-2 ring-offset-2 ${swatch.ring}` : ''
                  }`}
                  aria-label={`Pilih warna ${swatch.label}`}
                />
              ))}
              {/* Current color preview */}
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-[var(--border)]"
                style={{ backgroundColor: primaryColor }}
                title={primaryColor}
              />
              <span className="font-mono text-xs text-[var(--text-3)]">{primaryColor}</span>
            </div>
          </div>

          {/* Logo URL */}
          <Field label="URL Logo" error={errors.logoUrl?.message}>
            <input
              {...register('logoUrl')}
              type="url"
              placeholder="https://example.com/logo.png"
              className={inputCls}
              onChange={e => {
                setValue('logoUrl', e.target.value)
                setLogoPreview(e.target.value)
              }}
            />
          </Field>
          {logoUrlValue && (
            <div className="mt-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrlValue}
                alt="Logo preview"
                className="h-14 w-14 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] object-contain p-1"
                onError={e => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                <ImageIcon className="h-3.5 w-3.5" />
                Preview logo
              </div>
            </div>
          )}
          <p className="text-xs text-[var(--text-3)]">
            Upload logo akan tersedia segera. Untuk sementara masukkan URL gambar.
          </p>
        </section>

        {/* ── Modules ── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
            <LayoutGrid className="h-4 w-4 text-amber-500" />
            Fitur yang Diaktifkan
          </div>
          <p className="mb-4 text-xs text-[var(--text-3)]">
            Pilih fitur yang sesuai dengan kebutuhan bisnis kamu. Fitur yang dinonaktifkan akan
            disembunyikan dari tampilan.
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
                  className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    enabled
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-[var(--border)] bg-[var(--bg-subtle)] opacity-60'
                  } ${required ? 'cursor-default' : 'cursor-pointer hover:border-amber-300'}`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${enabled ? 'bg-amber-100' : 'bg-[var(--bg-muted)]'}`}
                  >
                    <Icon
                      className={`h-4 w-4 ${enabled ? 'text-amber-600' : 'text-[var(--text-3)]'}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm font-semibold ${enabled ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}
                      >
                        {label}
                      </p>
                      {required && (
                        <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-3)]">
                          Wajib
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{desc}</p>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      enabled
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-stone-300 bg-[var(--bg-card)]'
                    }`}
                  >
                    {enabled && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 disabled:from-stone-200 disabled:to-stone-200 disabled:text-[var(--text-3)]"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

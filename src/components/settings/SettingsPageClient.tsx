'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Save,
  Store,
  Printer,
  CreditCard,
  Bell,
  Zap,
  Crown,
  Copy,
  Check,
  RefreshCw,
  Globe,
  Palette,
  ImageIcon,
  LayoutGrid,
  ShoppingCart,
  Boxes,
  Users,
  Percent,
  BarChart3,
  CheckCircle2,
} from 'lucide-react'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { toast } from '@/components/ui/Toaster'
import {
  loadReceiptSettings,
  saveReceiptSettings,
  DEFAULT_PAYMENT_METHODS,
  togglePaymentMethod,
  generateApiKey,
  validateWebhookUrl,
  type ReceiptSettings,
  type PaymentMethod,
} from '@/lib/receipt-settings'

const storeSchema = z.object({
  name: z.string().min(1, 'Wajib diisi'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  taxRate: z.preprocess(v => parseFloat(String(v)), z.number().min(0).max(100)),
  currency: z.string().min(1),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  primaryColor: z.string().optional(),
  logoUrl: z.string().optional(),
})
type StoreFormData = z.infer<typeof storeSchema>

const TABS = [
  { id: 'toko', label: 'Toko', icon: Store },
  { id: 'printer', label: 'Printer', icon: Printer },
  { id: 'pembayaran', label: 'Pembayaran', icon: CreditCard },
  { id: 'notifikasi', label: 'Notifikasi', icon: Bell },
  { id: 'integrasi', label: 'Integrasi', icon: Zap },
  { id: 'langganan', label: 'Langganan', icon: Crown },
  { id: 'tema', label: 'Tema', icon: Palette },
] as const
type TabId = (typeof TABS)[number]['id']

const COLOR_SWATCHES = [
  { label: 'Amber', value: '#f59e0b', bg: 'bg-amber-400', ring: 'ring-amber-400' },
  { label: 'Orange', value: '#f97316', bg: 'bg-orange-500', ring: 'ring-orange-500' },
  { label: 'Green', value: '#22c55e', bg: 'bg-green-500', ring: 'ring-green-500' },
  { label: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', ring: 'ring-blue-500' },
  { label: 'Violet', value: '#7c3aed', bg: 'bg-violet-600', ring: 'ring-violet-600' },
  { label: 'Rose', value: '#f43f5e', bg: 'bg-rose-500', ring: 'ring-rose-500' },
]

type AccentKey = 'amber' | 'blue' | 'green' | 'purple' | 'red'

const ACCENT_PRESETS: {
  key: AccentKey
  label: string
  primary: string
  accent: string
  swatch: string
}[] = [
  {
    key: 'amber',
    label: 'Amber (Default)',
    primary: '#f59e0b',
    accent: '#ea580c',
    swatch: 'bg-amber-400',
  },
  { key: 'blue', label: 'Biru', primary: '#3b82f6', accent: '#2563eb', swatch: 'bg-blue-500' },
  { key: 'green', label: 'Hijau', primary: '#22c55e', accent: '#16a34a', swatch: 'bg-green-500' },
  { key: 'purple', label: 'Ungu', primary: '#8b5cf6', accent: '#7c3aed', swatch: 'bg-violet-500' },
  { key: 'red', label: 'Merah', primary: '#ef4444', accent: '#dc2626', swatch: 'bg-red-500' },
]

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

const PLAN_FEATURES = {
  FREE: {
    label: 'Gratis',
    color: 'text-stone-500',
    bg: 'bg-stone-100',
    features: ['1 Toko', '500 Produk', '1 Kasir', 'Laporan Dasar'],
  },
  PRO: {
    label: 'Pro',
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    features: ['3 Toko', '5.000 Produk', '5 Kasir', 'Laporan Lengkap', 'Export Excel', 'Webhook'],
  },
  ENTERPRISE: {
    label: 'Enterprise',
    color: 'text-violet-600',
    bg: 'bg-violet-100',
    features: [
      'Toko Tak Terbatas',
      'Produk Tak Terbatas',
      'Kasir Tak Terbatas',
      'API Penuh',
      'SLA 99.9%',
      'Dukungan Prioritas',
    ],
  },
}

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
    logoUrl?: string | null
    primaryColor?: string | null
    receiptHeader?: string | null
    receiptFooter?: string | null
    apiKey?: string | null
    webhookUrl?: string | null
    plan?: 'FREE' | 'PRO' | 'ENTERPRISE'
  }
}

export default function SettingsPageClient({ storeId, store }: SettingsPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('toko')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modules, setModules] = useState<string[]>(
    store.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  )
  const [primaryColor, setPrimaryColor] = useState(store.primaryColor ?? '#f59e0b')
  const [accentColor, setAccentColor] = useState<AccentKey>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('accent-color') as AccentKey | null
      if (stored && ACCENT_PRESETS.some(p => p.key === stored)) return stored
    }
    return 'amber'
  })

  // Printer tab
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() =>
    loadReceiptSettings(),
  )

  // Payment tab
  const [paymentMethods, setPaymentMethods] = useState(DEFAULT_PAYMENT_METHODS)

  // Notifikasi tab
  const [lowStockThreshold, setLowStockThreshold] = useState(10)
  const [emailAlerts, setEmailAlerts] = useState(false)

  // Integrasi tab
  const [apiKey, setApiKey] = useState(store.apiKey ?? '')
  const [webhookUrl, setWebhookUrl] = useState(store.webhookUrl ?? '')
  const [copied, setCopied] = useState(false)
  const [webhookError, setWebhookError] = useState('')

  const plan = (store.plan ?? 'FREE') as 'FREE' | 'PRO' | 'ENTERPRISE'
  const planInfo = PLAN_FEATURES[plan]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema) as any,
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

  const onSubmitStore = async (data: StoreFormData) => {
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
      toast.success('Pengaturan toko disimpan')
    } catch {
      setError('Gagal menyimpan pengaturan')
      toast.error('Gagal menyimpan pengaturan')
    } finally {
      setSaving(false)
    }
  }

  function savePrinterSettings() {
    saveReceiptSettings(receiptSettings)
    toast.success('Pengaturan printer disimpan')
  }

  async function savePaymentMethods() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          paymentMethods: JSON.stringify(paymentMethods),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Metode pembayaran disimpan')
    } catch {
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  async function saveIntegrasi() {
    if (!validateWebhookUrl(webhookUrl)) {
      setWebhookError('URL webhook tidak valid. Gunakan http:// atau https://')
      return
    }
    setWebhookError('')
    setSaving(true)
    try {
      const res = await fetch('/api/settings/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, apiKey, webhookUrl }),
      })
      if (!res.ok) throw new Error()
      toast.success('Pengaturan integrasi disimpan')
    } catch {
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateApiKey = useCallback(() => {
    setApiKey(generateApiKey())
  }, [])

  const handleCopyApiKey = useCallback(async () => {
    if (!apiKey) return
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Gagal menyalin')
    }
  }, [apiKey])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Pengaturan</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Konfigurasi toko, printer, pembayaran, dan integrasi
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
              activeTab === id
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Toko ── */}
      {activeTab === 'toko' && (
        <form onSubmit={handleSubmit(onSubmitStore)} className="space-y-5">
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Store} label="Informasi Toko" />
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

          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Globe} label="Pajak &amp; Mata Uang" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tarif Pajak (%)" error={errors.taxRate?.message}>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    {...register('taxRate')}
                    className={inputCls}
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2">
                    <HelpTooltip
                      text="Persentase PPN yang dikenakan pada setiap transaksi. Di Indonesia tarif standar adalah 11%. Masukkan 0 jika toko Anda tidak memungut pajak."
                      side="left"
                    />
                  </span>
                </div>
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

          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Palette} label="Branding" />
            <Field label="Header Struk" error={errors.receiptHeader?.message}>
              <input
                {...register('receiptHeader')}
                placeholder={watch('name') || 'Nama toko'}
                className={inputCls}
              />
            </Field>
            <Field label="Footer Struk" error={errors.receiptFooter?.message}>
              <textarea
                {...register('receiptFooter')}
                rows={2}
                placeholder="Terima kasih sudah berbelanja!"
                className={inputCls}
              />
            </Field>
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">
                Warna Utama
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {COLOR_SWATCHES.map(sw => (
                  <button
                    key={sw.value}
                    type="button"
                    title={sw.label}
                    onClick={() => {
                      setPrimaryColor(sw.value)
                      setValue('primaryColor', sw.value)
                    }}
                    className={`h-8 w-8 rounded-full ${sw.bg} transition-all hover:scale-110 focus:outline-none ${primaryColor === sw.value ? `ring-2 ring-offset-2 ${sw.ring}` : ''}`}
                    aria-label={`Pilih warna ${sw.label}`}
                  />
                ))}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-[var(--border)]"
                  style={{ backgroundColor: primaryColor }}
                />
                <span className="font-mono text-xs text-[var(--text-3)]">{primaryColor}</span>
              </div>
            </div>
            <Field label="URL Logo" error={errors.logoUrl?.message}>
              <input
                {...register('logoUrl')}
                type="url"
                placeholder="https://example.com/logo.png"
                className={inputCls}
                onChange={e => setValue('logoUrl', e.target.value)}
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
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
              <LayoutGrid className="h-4 w-4 text-amber-500" />
              Fitur yang Diaktifkan
            </div>
            <p className="mb-4 text-xs text-[var(--text-3)]">
              Pilih fitur yang sesuai dengan kebutuhan bisnis kamu.
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
          <SaveButton saving={saving} label="Simpan Pengaturan Toko" />
        </form>
      )}

      {/* ── Tab: Printer ── */}
      {activeTab === 'printer' && (
        <div className="space-y-5">
          <section className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Printer} label="Pengaturan Printer Struk" />

            {/* Print width */}
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">
                Lebar Kertas
              </label>
              <div className="flex gap-3">
                {([58, 80] as const).map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setReceiptSettings(s => ({ ...s, printWidth: w }))}
                    className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                      receiptSettings.printWidth === w
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:border-amber-300'
                    }`}
                  >
                    {w}mm
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">
                Ukuran Font
              </label>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setReceiptSettings(s => ({ ...s, fontSize: size }))}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-all ${
                      receiptSettings.fontSize === size
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:border-amber-300'
                    }`}
                  >
                    {size === 'small' ? 'Kecil' : size === 'medium' ? 'Sedang' : 'Besar'}
                  </button>
                ))}
              </div>
            </div>

            {/* Show logo */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">Tampilkan Logo</p>
                <p className="text-xs text-[var(--text-3)]">Cetak logo toko di bagian atas struk</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={receiptSettings.showLogo}
                onClick={() => setReceiptSettings(s => ({ ...s, showLogo: !s.showLogo }))}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  receiptSettings.showLogo ? 'bg-amber-500' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    receiptSettings.showLogo ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Footer text */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Teks Footer Struk
              </label>
              <textarea
                value={receiptSettings.footerText}
                onChange={e => setReceiptSettings(s => ({ ...s, footerText: e.target.value }))}
                rows={2}
                placeholder="Terima kasih sudah berbelanja!"
                className={inputCls}
              />
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-semibold text-[var(--text-2)]">Preview Struk</p>
              <div
                className="mx-auto rounded border border-stone-200 bg-white p-3 font-mono text-stone-700"
                style={{
                  width: receiptSettings.printWidth === 58 ? '160px' : '220px',
                  fontSize:
                    receiptSettings.fontSize === 'small'
                      ? '10px'
                      : receiptSettings.fontSize === 'large'
                        ? '14px'
                        : '12px',
                }}
              >
                {receiptSettings.showLogo && (
                  <div className="mb-1 text-center font-bold">[ LOGO ]</div>
                )}
                <div className="text-center font-bold">Nama Toko</div>
                <div className="my-1 border-t border-dashed border-stone-300" />
                <div className="flex justify-between">
                  <span>Produk A</span>
                  <span>Rp 50.000</span>
                </div>
                <div className="my-1 border-t border-dashed border-stone-300" />
                <div className="flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span>Rp 50.000</span>
                </div>
                <div className="my-1 border-t border-dashed border-stone-300" />
                <div className="text-center text-[10px]">
                  {receiptSettings.footerText || 'Footer teks...'}
                </div>
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={savePrinterSettings}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300"
          >
            <Save className="h-4 w-4" />
            Simpan Pengaturan Printer
          </button>
        </div>
      )}

      {/* ── Tab: Pembayaran ── */}
      {activeTab === 'pembayaran' && (
        <div className="space-y-5">
          <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={CreditCard} label="Metode Pembayaran" />
            <p className="text-xs text-[var(--text-3)]">
              Aktifkan metode pembayaran yang tersedia di kasir.
            </p>
            {(
              Object.entries(paymentMethods) as [
                PaymentMethod,
                (typeof paymentMethods)[PaymentMethod],
              ][]
            ).map(([method, cfg]) => (
              <div
                key={method}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-1)]">{cfg.label}</p>
                  <p className="text-xs text-[var(--text-3)]">{method}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cfg.enabled}
                  onClick={() => setPaymentMethods(prev => togglePaymentMethod(prev, method))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    cfg.enabled ? 'bg-amber-500' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      cfg.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </section>
          <SaveButton
            saving={saving}
            label="Simpan Metode Pembayaran"
            onClick={savePaymentMethods}
          />
        </div>
      )}

      {/* ── Tab: Notifikasi ── */}
      {activeTab === 'notifikasi' && (
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Bell} label="Notifikasi" />
            <p className="text-xs text-[var(--text-3)]">
              Pengaturan notifikasi stok dan email. Fitur lengkap segera hadir.
            </p>

            {/* Low stock threshold */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Ambang Batas Stok Menipis
              </label>
              <input
                type="number"
                min="1"
                max="999"
                value={lowStockThreshold}
                onChange={e => setLowStockThreshold(Number(e.target.value))}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Notifikasi muncul saat stok produk di bawah nilai ini.
              </p>
            </div>

            {/* Email alerts */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">Notifikasi Email</p>
                <p className="text-xs text-[var(--text-3)]">
                  Kirim email saat stok menipis (segera hadir)
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emailAlerts}
                onClick={() => setEmailAlerts(v => !v)}
                disabled
                className={`relative h-6 w-11 cursor-not-allowed rounded-full opacity-50 transition-colors ${
                  emailAlerts ? 'bg-amber-500' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    emailAlerts ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              Fitur notifikasi email sedang dalam pengembangan. Tersedia di plan Pro.
            </div>
          </section>
          <SaveButton
            saving={false}
            label="Simpan Notifikasi"
            onClick={() => toast.success('Pengaturan notifikasi disimpan')}
          />
        </div>
      )}

      {/* ── Tab: Integrasi ── */}
      {activeTab === 'integrasi' && (
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Zap} label="Integrasi" />

            {/* API Key */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                API Key
              </label>
              <div className="flex gap-2">
                <input
                  value={apiKey}
                  readOnly
                  placeholder="Klik Generate untuk membuat API Key"
                  className={`${inputCls} flex-1 font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={handleCopyApiKey}
                  disabled={!apiKey}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] transition-all hover:border-amber-400 hover:text-amber-600 disabled:opacity-40"
                  title="Salin API Key"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Disalin!' : 'Salin'}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateApiKey}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-100"
                  title="Generate API Key baru"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generate
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Gunakan API Key ini untuk mengakses Kasir API dari sistem eksternal.
              </p>
            </div>

            {/* Webhook URL */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={e => {
                  setWebhookUrl(e.target.value)
                  setWebhookError('')
                }}
                placeholder="https://your-server.com/webhook/orders"
                className={inputCls}
              />
              {webhookError && <p className="mt-1 text-xs text-red-500">{webhookError}</p>}
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Kasir akan mengirim POST request ke URL ini setiap kali ada order baru.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-[var(--text-3)]">
              <p className="mb-1 font-semibold text-[var(--text-2)]">Payload contoh:</p>
              <pre className="overflow-x-auto font-mono text-[10px]">{`{
  "event": "order.created",
  "orderId": "TRX-00123",
  "total": 75000,
  "storeId": "..."
}`}</pre>
            </div>
          </section>
          <SaveButton saving={saving} label="Simpan Integrasi" onClick={saveIntegrasi} />
        </div>
      )}

      {/* ── Tab: Langganan ── */}
      {activeTab === 'langganan' && (
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Crown} label="Paket Langganan" />

            {/* Current plan badge */}
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${planInfo.bg} ${planInfo.color}`}
            >
              <Crown className="h-4 w-4" />
              Paket {planInfo.label}
            </div>

            {/* Plan cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                Object.entries(PLAN_FEATURES) as [
                  keyof typeof PLAN_FEATURES,
                  (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES],
                ][]
              ).map(([key, info]) => (
                <div
                  key={key}
                  className={`rounded-xl border p-4 ${
                    plan === key
                      ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400'
                      : 'border-[var(--border)] bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className={`mb-2 text-sm font-bold ${info.color}`}>{info.label}</div>
                  <ul className="space-y-1">
                    {info.features.map(f => (
                      <li
                        key={f}
                        className="flex items-center gap-1.5 text-xs text-[var(--text-2)]"
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {plan !== key && (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-amber-300 bg-amber-50 py-1.5 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-100"
                      onClick={() => toast.success('Hubungi tim sales untuk upgrade paket')}
                    >
                      {key === 'FREE' ? 'Downgrade' : 'Upgrade'}
                    </button>
                  )}
                  {plan === key && (
                    <div className="mt-3 rounded-lg bg-amber-100 py-1.5 text-center text-xs font-semibold text-amber-700">
                      Paket Aktif
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-[var(--text-3)]">
              Untuk upgrade atau pertanyaan langganan, hubungi{' '}
              <a href="mailto:sales@kasir.app" className="text-amber-600 underline">
                sales@kasir.app
              </a>
            </p>
          </section>
        </div>
      )}

      {/* ── Tab: Tema ── */}
      {activeTab === 'tema' && (
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <SectionHead icon={Palette} label="Warna Aksen" />
            <p className="text-xs text-[var(--text-2)]">
              Pilih skema warna utama untuk tampilan aplikasi. Perubahan diterapkan langsung.
            </p>
            <div className="flex flex-wrap gap-3">
              {ACCENT_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setAccentColor(preset.key)
                    localStorage.setItem('accent-color', preset.key)
                    document.documentElement.style.setProperty('--primary', preset.primary)
                    document.documentElement.style.setProperty('--accent', preset.accent)
                  }}
                  className={[
                    'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all',
                    accentColor === preset.key
                      ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--text-1)] shadow-sm'
                      : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:border-[var(--border-mid)] hover:text-[var(--text-1)]',
                  ].join(' ')}
                >
                  <span className={`h-3.5 w-3.5 rounded-full ${preset.swatch}`} />
                  {preset.label}
                  {accentColor === preset.key && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)]" />
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
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

function SectionHead({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
      <Icon className="h-4 w-4 text-amber-500" />
      {label}
    </div>
  )
}

function SaveButton({
  saving,
  label,
  onClick,
}: {
  saving: boolean
  label: string
  onClick?: () => void
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type={onClick ? 'button' : 'submit'}
        disabled={saving}
        onClick={onClick}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 disabled:from-stone-200 disabled:to-stone-200 disabled:text-[var(--text-3)]"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Menyimpan…' : label}
      </button>
    </div>
  )
}

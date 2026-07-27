'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, Boxes, Users, BarChart3, Wrench, UtensilsCrossed,
  Store, Globe, ChevronRight, Plus, Package, CheckCircle2,
  ShoppingBag, Sparkles, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Business type presets ───────────────────────────────────────────────────
const BUSINESS_TYPES = [
  {
    id: 'warung',
    emoji: '🍜',
    label: 'Warung / Kedai',
    desc: 'Nasi, mie, gorengan, minuman, dll',
    modules: ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  },
  {
    id: 'cafe',
    emoji: '☕',
    label: 'Cafe / Kopi',
    desc: 'Minuman, kue, dessert',
    modules: ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  },
  {
    id: 'retail',
    emoji: '🛍️',
    label: 'Toko Retail',
    desc: 'Pakaian, elektronik, aksesoris',
    modules: ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  },
  {
    id: 'jasa',
    emoji: '🔧',
    label: 'Usaha Jasa',
    desc: 'Salon, bengkel, laundry, dll',
    modules: ['customers', 'discounts', 'reports'],
  },
  {
    id: 'online',
    emoji: '📦',
    label: 'Toko Online',
    desc: 'Jualan via marketplace atau medsos',
    modules: ['inventory', 'customers', 'discounts', 'reports'],
  },
  {
    id: 'lainnya',
    emoji: '🏪',
    label: 'Lainnya',
    desc: 'Sesuaikan sendiri nanti',
    modules: ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  },
]

const CURRENCIES = [
  { code: 'IDR', label: 'IDR — Rupiah Indonesia' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
]

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

interface Props {
  userName: string
  storeName: string
  storeId: string
}

type Step = 'business_type' | 'store_info' | 'first_product' | 'done'

export default function OnboardingWizard({ userName, storeName, storeId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('business_type')
  const [saving, setSaving] = useState(false)

  // Step 1
  const [selectedType, setSelectedType] = useState<string | null>(null)

  // Step 2
  const [storeInfo, setStoreInfo] = useState({
    name: storeName,
    address: '',
    phone: '',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
  })

  // Step 3
  const [product, setProduct] = useState({ name: '', price: '', stock: '0' })
  const [skipProduct, setSkipProduct] = useState(false)

  const steps: { id: Step; label: string }[] = [
    { id: 'business_type', label: 'Tipe Bisnis' },
    { id: 'store_info',    label: 'Info Toko' },
    { id: 'first_product', label: 'Produk' },
    { id: 'done',          label: 'Selesai' },
  ]

  const stepIndex = steps.findIndex(s => s.id === step)

  async function callApi(stepName: string, data: any) {
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: stepName, data }),
    })
  }

  async function goNext() {
    setSaving(true)
    try {
      if (step === 'business_type') {
        const type = BUSINESS_TYPES.find(t => t.id === selectedType)
        await callApi('business_type', { modules: type?.modules })
        setStep('store_info')
      } else if (step === 'store_info') {
        await callApi('store_info', storeInfo)
        setStep('first_product')
      } else if (step === 'first_product') {
        if (!skipProduct && product.name && product.price) {
          await callApi('first_product', product)
        }
        await callApi('complete', {})
        setStep('done')
      } else if (step === 'done') {
        router.push('/dashboard')
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fffdf7] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-stone-800 text-lg">Lakoo</span>
        </div>
        <span className="text-xs text-stone-400">Setup {stepIndex + 1} dari {steps.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-stone-100">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
          style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8 sm:py-12">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Business Type ── */}
          {step === 'business_type' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-3xl mb-2">👋</div>
                <h1 className="text-2xl font-bold text-stone-800">Halo, {userName.split(' ')[0]}!</h1>
                <p className="text-stone-500 mt-1.5 text-sm">Bisnis kamu jenis apa? Kita sesuaikan fiturnya.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {BUSINESS_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedType(t.id)}
                    className={cn(
                      'flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                      selectedType === t.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-stone-100 bg-white hover:border-stone-200'
                    )}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <div>
                      <p className={cn('text-sm font-semibold', selectedType === t.id ? 'text-amber-700' : 'text-stone-800')}>{t.label}</p>
                      <p className="text-xs text-stone-400 mt-0.5 leading-snug">{t.desc}</p>
                    </div>
                    {selectedType === t.id && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle2 className="h-4 w-4 text-amber-500" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={goNext}
                disabled={!selectedType || saving}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? 'Menyimpan…' : <>Lanjut <ChevronRight className="h-4 w-4" /></>}
              </button>
            </div>
          )}

          {/* ── Step 2: Store Info ── */}
          {step === 'store_info' && (
            <div className="space-y-6">
              <div className="text-center">
                <Store className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                <h1 className="text-2xl font-bold text-stone-800">Info Toko</h1>
                <p className="text-stone-500 mt-1.5 text-sm">Detail toko kamu — bisa diubah kapan saja.</p>
              </div>
              <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Toko *</label>
                  <input value={storeInfo.name} onChange={e => setStoreInfo(s => ({ ...s, name: e.target.value }))}
                    className={inputCls} placeholder="Warung Sari Rasa" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Telepon</label>
                    <input value={storeInfo.phone} onChange={e => setStoreInfo(s => ({ ...s, phone: e.target.value }))}
                      className={inputCls} placeholder="08123456789" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Mata Uang</label>
                    <select value={storeInfo.currency} onChange={e => setStoreInfo(s => ({ ...s, currency: e.target.value }))} className={inputCls}>
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Alamat (opsional)</label>
                  <textarea value={storeInfo.address} onChange={e => setStoreInfo(s => ({ ...s, address: e.target.value }))}
                    rows={2} className={inputCls} placeholder="Jl. Merdeka No. 1, Jakarta" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Zona Waktu</label>
                  <select value={storeInfo.timezone} onChange={e => setStoreInfo(s => ({ ...s, timezone: e.target.value }))} className={inputCls}>
                    <option value="Asia/Jakarta">WIB (UTC+7) — Jakarta, Sumatera, Jawa</option>
                    <option value="Asia/Makassar">WITA (UTC+8) — Bali, Makassar</option>
                    <option value="Asia/Jayapura">WIT (UTC+9) — Papua</option>
                    <option value="Asia/Singapore">SGT (UTC+8) — Singapura</option>
                  </select>
                </div>
              </div>
              <button
                onClick={goNext}
                disabled={!storeInfo.name || saving}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? 'Menyimpan…' : <>Lanjut <ChevronRight className="h-4 w-4" /></>}
              </button>
            </div>
          )}

          {/* ── Step 3: First Product ── */}
          {step === 'first_product' && (
            <div className="space-y-6">
              <div className="text-center">
                <Package className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                <h1 className="text-2xl font-bold text-stone-800">Tambah Produk Pertama</h1>
                <p className="text-stone-500 mt-1.5 text-sm">Mulai dengan satu produk. Bisa tambah lebih banyak nanti.</p>
              </div>
              {!skipProduct ? (
                <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Produk</label>
                    <input value={product.name} onChange={e => setProduct(p => ({ ...p, name: e.target.value }))}
                      className={inputCls} placeholder="Nasi Goreng Spesial" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Harga Jual (Rp)</label>
                      <input type="number" min="0" value={product.price} onChange={e => setProduct(p => ({ ...p, price: e.target.value }))}
                        className={inputCls} placeholder="15000" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Stok Awal</label>
                      <input type="number" min="0" value={product.stock} onChange={e => setProduct(p => ({ ...p, stock: e.target.value }))}
                        className={inputCls} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-8 text-center">
                  <Package className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-sm text-stone-400">Produk akan ditambahkan nanti</p>
                </div>
              )}
              <div className="space-y-3">
                <button
                  onClick={goNext}
                  disabled={saving || (!skipProduct && (!product.name || !product.price))}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? 'Menyimpan…' : <>{skipProduct ? 'Selesai Setup' : 'Tambah & Selesai'} <ChevronRight className="h-4 w-4" /></>}
                </button>
                <button
                  onClick={() => { setSkipProduct(s => !s) }}
                  className="w-full py-2.5 rounded-xl text-stone-500 text-sm font-medium hover:text-stone-700 transition-colors"
                >
                  {skipProduct ? '+ Tambah produk sekarang' : 'Lewati dulu →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 'done' && (
            <div className="text-center space-y-6">
              <div>
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto shadow-xl shadow-amber-200">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800 mt-5">Toko kamu siap! 🎉</h1>
                <p className="text-stone-500 mt-2 text-sm leading-relaxed max-w-sm mx-auto">
                  Setup selesai. Sekarang kamu bisa mulai catat penjualan, kelola produk, dan lihat laporan.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  { icon: ShoppingCart, label: 'Kasir (POS)', desc: 'Catat penjualan', href: '/dashboard/pos' },
                  { icon: Package,     label: 'Katalog',      desc: 'Kelola produk',  href: '/dashboard/products' },
                  { icon: BarChart3,   label: 'Laporan',      desc: 'Pantau omzet',   href: '/dashboard/reports' },
                  { icon: Boxes,       label: 'Stok',         desc: 'Kelola inventori', href: '/dashboard/inventory' },
                ].map(item => (
                  <div key={item.label} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
                    <item.icon className="h-5 w-5 text-amber-500 mb-2" />
                    <p className="text-sm font-semibold text-stone-800">{item.label}</p>
                    <p className="text-xs text-stone-400">{item.desc}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={goNext}
                disabled={saving}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-base shadow-lg shadow-amber-200 hover:shadow-amber-300 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {saving ? 'Memuat…' : <>Mulai Pakai Lakoo <ArrowRight className="h-5 w-5" /></>}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

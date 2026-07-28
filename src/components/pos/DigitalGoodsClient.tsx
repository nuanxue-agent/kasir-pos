'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Zap, Wifi, Gamepad2, Plus, RefreshCw } from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

type Category = 'TOPUP' | 'EVOUCHER' | 'GAME_CREDIT' | 'INTERNET' | 'ELECTRICITY'

interface DigitalProduct {
  id: string
  storeId: string
  name: string
  category: Category
  denomination: number
  price: number
  margin: number
  provider: string
  active: boolean
}

interface DigitalSale {
  id: string
  productId: string
  productName: string
  customerPhone: string
  serialNumber: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  processedAt: string | null
  price: number
}

interface Props { storeId: string; currency?: string }

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  TOPUP: <Smartphone className="h-4 w-4" />,
  EVOUCHER: <Zap className="h-4 w-4" />,
  GAME_CREDIT: <Gamepad2 className="h-4 w-4" />,
  INTERNET: <Wifi className="h-4 w-4" />,
  ELECTRICITY: <Zap className="h-4 w-4" />,
}

const CATEGORY_LABELS: Record<Category, string> = {
  TOPUP: 'Pulsa',
  EVOUCHER: 'E-Voucher',
  GAME_CREDIT: 'Game Credit',
  INTERNET: 'Paket Internet',
  ELECTRICITY: 'Token Listrik',
}

const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  SUCCESS: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export default function DigitalGoodsClient({ storeId, currency = 'IDR' }: Props) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'products' | 'sales'>('products')
  const [showForm, setShowForm] = useState(false)
  const [filterCategory, setFilterCategory] = useState<Category | 'ALL'>('ALL')

  const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  const { data: products = [], isLoading: prodLoading } = useQuery<DigitalProduct[]>({
    queryKey: ['digital-products', storeId],
    queryFn: () => fetch(`/api/digital-products?storeId=${storeId}`).then(r => r.json()).then((d: any) => d.products ?? []),
    staleTime: 30_000,
  })

  const { data: sales = [], isLoading: salesLoading } = useQuery<DigitalSale[]>({
    queryKey: ['digital-sales', storeId],
    queryFn: () => fetch(`/api/digital-sales?storeId=${storeId}`).then(r => r.json()).then((d: any) => d.sales ?? []),
    staleTime: 30_000,
  })

  const filteredProducts = filterCategory === 'ALL' ? products : products.filter(p => p.category === filterCategory)

  // ── Add Product Form ─────────────────────────────────────────────────────
  function ProductForm({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('')
    const [category, setCategory] = useState<Category>('TOPUP')
    const [denomination, setDenomination] = useState('10000')
    const [price, setPrice] = useState('11000')
    const [provider, setProvider] = useState('')
    const [saving, setSaving] = useState(false)

    async function save() {
      if (!name.trim()) { toast.error('Nama produk wajib diisi'); return }
      setSaving(true)
      try {
        const res = await fetch('/api/digital-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId, name: name.trim(), category,
            denomination: Number(denomination),
            price: Number(price),
            margin: Number(price) - Number(denomination),
            provider: provider.trim(),
          }),
        })
        const d = await res.json() as { error?: string }
        if (!res.ok) throw new Error(d.error ?? 'Gagal menyimpan')
        qc.invalidateQueries({ queryKey: ['digital-products', storeId] })
        toast.success('Produk digital ditambahkan')
        onClose()
      } catch (e: any) {
        toast.error(e.message)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-6 shadow-xl">
          <h3 className="mb-4 text-base font-semibold text-[var(--text-1)]">Tambah Produk Digital</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nama</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
                placeholder="Pulsa Telkomsel 10rb" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Kategori</label>
                <select value={category} onChange={e => setCategory(e.target.value as Category)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Provider</label>
                <input value={provider} onChange={e => setProvider(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="Telkomsel" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Denominasi (Rp)</label>
                <input type="number" value={denomination} onChange={e => setDenomination(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Harga Jual (Rp)</label>
                <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
            </div>
            <div className="rounded-lg bg-[var(--bg-subtle)] p-2 text-xs text-[var(--text-2)]">
              Margin: <span className="font-semibold text-green-500">{fmt(Number(price) - Number(denomination))}</span>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]">Batal</button>
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalRevenue = sales.filter(s => s.status === 'SUCCESS').reduce((a, s) => a + s.price, 0)
  const successCount = sales.filter(s => s.status === 'SUCCESS').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Produk Digital</h1>
          <p className="text-sm text-[var(--text-3)]">Pulsa, e-voucher, game credit, dan paket internet</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
          <Plus className="h-4 w-4" /> Tambah Produk
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Produk', value: products.length },
          { label: 'Transaksi Sukses', value: successCount },
          { label: 'Total Revenue', value: fmt(totalRevenue) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-3)]">{s.label}</p>
            <p className="text-xl font-bold text-[var(--text-1)]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['products', 'sales'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}>
            {tab === 'products' ? '📦 Produk' : '📋 Transaksi'}
          </button>
        ))}
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {(['ALL', ...Object.keys(CATEGORY_LABELS)] as const).map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat as any)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${filterCategory === cat ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]'}`}>
                {cat === 'ALL' ? 'Semua' : CATEGORY_LABELS[cat as Category]}
              </button>
            ))}
          </div>

          {prodLoading ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
              <Smartphone className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Belum ada produk digital.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map(p => (
                <div key={p.id} className={`rounded-xl border bg-[var(--bg-card)] p-4 ${p.active ? 'border-[var(--border)]' : 'opacity-50 border-dashed border-[var(--border)]'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-2)]">{CATEGORY_ICONS[p.category]}</span>
                      <span className="text-xs font-medium text-[var(--text-3)]">{CATEGORY_LABELS[p.category]}</span>
                    </div>
                    <span className="text-xs text-[var(--text-3)]">{p.provider}</span>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-1)] mb-1">{p.name}</p>
                  <div className="flex justify-between text-xs text-[var(--text-2)]">
                    <span>Harga: <span className="font-medium text-[var(--text-1)]">{fmt(p.price)}</span></span>
                    <span>Margin: <span className="font-medium text-green-500">{fmt(p.margin)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sales Tab */}
      {activeTab === 'sales' && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          {salesLoading ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat...</div>
          ) : sales.length === 0 ? (
            <div className="p-12 text-center">
              <RefreshCw className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Belum ada transaksi digital.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  {['Produk', 'No. HP', 'Serial', 'Harga', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sales.map(s => (
                  <tr key={s.id} className="hover:bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{s.productName}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{s.customerPhone}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">{s.serialNumber || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-1)]">{fmt(s.price)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && <ProductForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

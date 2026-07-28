'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, X, Check, GitFork } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Variant {
  id: string
  productId: string
  name: string
  sku?: string | null
  price?: number | null
  stock: number
  active: boolean
}

interface Product {
  id: string
  name: string
  price: number
  sku?: string | null
}

interface Props { storeId: string; currency: string }

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

export default function VariantsPageClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Variant | null>(null)
  const [form, setForm] = useState({ name: '', sku: '', price: '', stock: '0' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-list', storeId],
    queryFn: () => fetch(`/api/products?storeId=${storeId}&limit=200`).then(r => r.json()),
  })

  const { data: variants = [], isLoading } = useQuery<Variant[]>({
    queryKey: ['variants', storeId, selectedProduct?.id],
    queryFn: () => selectedProduct
      ? fetch(`/api/variants?storeId=${storeId}&productId=${selectedProduct.id}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedProduct,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/variants/${id}?storeId=${storeId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variants'] }),
  })

  function resetForm() { setForm({ name: '', sku: '', price: '', stock: '0' }); setEditItem(null); setShowForm(false) }

  async function handleSave() {
    if (!form.name || !selectedProduct) return
    setSaving(true)
    try {
      const body = {
        productId: selectedProduct.id,
        name: form.name,
        sku: form.sku || null,
        price: form.price ? Number(form.price) : null,
        stock: Number(form.stock),
      }
      if (editItem) {
        await fetch(`/api/variants/${editItem.id}?storeId=${storeId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
      } else {
        await fetch(`/api/variants?storeId=${storeId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
      }
      qc.invalidateQueries({ queryKey: ['variants'] })
      resetForm()
    } finally { setSaving(false) }
  }

  function openEdit(v: Variant) {
    setForm({ name: v.name, sku: v.sku ?? '', price: v.price != null ? String(v.price) : '', stock: String(v.stock) })
    setEditItem(v); setShowForm(true)
  }

  const filteredProducts = (products as Product[]).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 lg:pb-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Varian Produk</h1>
        <p className="text-stone-400 text-sm mt-0.5">Tambah pilihan ukuran, warna, atau rasa per produk</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Product selector */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3.5 border-b border-stone-100">
              <h2 className="text-sm font-semibold text-stone-800 mb-2">Pilih Produk</h2>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari produk…"
                className={inputCls}
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-stone-50">
              {filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-sm text-stone-400">Tidak ada produk</div>
              ) : filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProduct(p); resetForm() }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    selectedProduct?.id === p.id ? 'bg-amber-50' : 'hover:bg-stone-50'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${selectedProduct?.id === p.id ? 'bg-amber-500' : 'bg-stone-200'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedProduct?.id === p.id ? 'text-amber-700' : 'text-stone-700'}`}>{p.name}</p>
                    <p className="text-xs text-stone-400">{formatCurrency(p.price, currency)}{p.sku ? ` · ${p.sku}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Variants panel */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedProduct ? (
            <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl flex flex-col items-center justify-center py-16 shadow-sm">
              <GitFork className="h-10 w-10 text-stone-200 mb-3" />
              <p className="text-stone-400 text-sm">Pilih produk untuk melihat variannya</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-stone-800">{selectedProduct.name}</h2>
                  <p className="text-xs text-stone-400">Harga dasar: {formatCurrency(selectedProduct.price, currency)}</p>
                </div>
                <button
                  onClick={() => { resetForm(); setShowForm(true) }}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3.5 py-2 rounded-xl text-sm font-semibold shadow-md shadow-amber-200 transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" /> Varian
                </button>
              </div>

              {/* Add/Edit form */}
              {showForm && (
                <div className="bg-[var(--bg-card)] border border-stone-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-stone-800 text-sm">{editItem ? 'Edit Varian' : 'Varian Baru'}</h3>
                    <button onClick={resetForm} className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 mb-1.5 block">Nama Varian *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Contoh: Ukuran L, Rasa Coklat…" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-stone-500 mb-1.5 block">Harga (kosongkan = sama)</label>
                      <input type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                        placeholder={String(selectedProduct.price)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-stone-500 mb-1.5 block">Stok</label>
                      <input type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                        className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 mb-1.5 block">SKU (opsional)</label>
                    <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                      placeholder="SKU-001-L" className={inputCls} />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50">Batal</button>
                    <button onClick={handleSave} disabled={saving || !form.name}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                      {saving ? 'Menyimpan…' : <><Check className="h-4 w-4" />{editItem ? 'Simpan' : 'Tambah'}</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Variant list */}
              <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
                {isLoading ? (
                  <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-stone-50 animate-pulse rounded-xl" />)}</div>
                ) : (variants as Variant[]).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <GitFork className="h-7 w-7 text-stone-200" />
                    <p className="text-sm text-stone-400">Belum ada varian</p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-50">
                    {(variants as Variant[]).map(v => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-800">{v.name}</p>
                          <p className="text-xs text-stone-400">
                            {v.price != null ? formatCurrency(v.price, currency) : 'Harga dasar'} · Stok: {v.stock}
                            {v.sku ? ` · ${v.sku}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteMut.mutate(v.id)} className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

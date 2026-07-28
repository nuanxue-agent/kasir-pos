'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  QrCode, Plus, Trash2, GripVertical, Eye, EyeOff, Star, StarOff,
  Loader2, ImageIcon, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuCategory {
  id: string
  storeId: string
  name: string
  displayOrder: number
  imageUrl: string | null
  active: boolean
}

export interface MenuItem {
  id: string
  categoryId: string
  productId: string
  storeId: string
  displayOrder: number
  featured: boolean
  available: boolean
  // joined fields
  productName?: string
  productPrice?: number
  productImage?: string | null
}

interface Product {
  id: string
  name: string
  price: number
  image: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByOrder<T extends { displayOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.displayOrder - b.displayOrder)
}

// ─── QR Code display ─────────────────────────────────────────────────────────

function QRSection({ storeSlug }: { storeSlug: string }) {
  const menuUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/menu/dm/${storeSlug}`
      : `/menu/dm/${storeSlug}`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <QrCode className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Menu Digital Pelanggan</p>
          <p className="mt-0.5 break-all text-xs text-slate-500">{menuUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={menuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Eye className="h-3.5 w-3.5" />
              Lihat Menu
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(menuUrl)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Salin URL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  items,
  products,
  onToggleActive,
  onDelete,
  onAddItem,
  onRemoveItem,
  onToggleFeatured,
  onToggleAvailable,
  acting,
}: {
  cat: MenuCategory
  items: MenuItem[]
  products: Product[]
  onToggleActive: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onAddItem: (categoryId: string, productId: string) => void
  onRemoveItem: (itemId: string) => void
  onToggleFeatured: (itemId: string, featured: boolean) => void
  onToggleAvailable: (itemId: string, available: boolean) => void
  acting: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState('')

  const catItems = sortByOrder(items.filter(i => i.categoryId === cat.id))
  const usedProductIds = new Set(catItems.map(i => i.productId))
  const availableProducts = products.filter(p => !usedProductIds.has(p.id))

  return (
    <div className={cn('rounded-xl border bg-white shadow-sm', cat.active ? 'border-slate-200' : 'border-slate-200 opacity-60')}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" />
        <button onClick={() => setExpanded(e => !e)} className="flex flex-1 items-center gap-2 text-left">
          <span className="font-medium text-slate-800">{cat.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {catItems.length} item
          </span>
          {expanded ? (
            <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
          )}
        </button>
        <button
          onClick={() => onToggleActive(cat.id, !cat.active)}
          disabled={acting}
          title={cat.active ? 'Nonaktifkan' : 'Aktifkan'}
          className="text-slate-400 hover:text-indigo-600 disabled:opacity-50"
        >
          {cat.active ? <ToggleRight className="h-5 w-5 text-indigo-500" /> : <ToggleLeft className="h-5 w-5" />}
        </button>
        <button
          onClick={() => onDelete(cat.id)}
          disabled={acting}
          className="text-slate-300 hover:text-red-500 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Items */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {catItems.length === 0 && (
            <p className="text-xs text-slate-400 italic">Belum ada item di kategori ini.</p>
          )}
          {catItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              {item.productImage ? (
                <img src={item.productImage} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-200">
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{item.productName ?? item.productId}</p>
                <p className="text-xs text-slate-400">
                  Rp {(item.productPrice ?? 0).toLocaleString('id-ID')}
                </p>
              </div>
              <button
                onClick={() => onToggleFeatured(item.id, !item.featured)}
                disabled={acting}
                title={item.featured ? 'Hapus unggulan' : 'Jadikan unggulan'}
                className="text-slate-300 hover:text-amber-500 disabled:opacity-50"
              >
                {item.featured ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : <StarOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => onToggleAvailable(item.id, !item.available)}
                disabled={acting}
                title={item.available ? 'Tandai tidak tersedia' : 'Tandai tersedia'}
                className="text-slate-300 hover:text-emerald-500 disabled:opacity-50"
              >
                {item.available ? <Eye className="h-4 w-4 text-emerald-500" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => onRemoveItem(item.id)}
                disabled={acting}
                className="text-slate-300 hover:text-red-500 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add item */}
          {availableProducts.length > 0 && (
            <div className="flex gap-2 pt-1">
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">Pilih produk…</option>
                {availableProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!selectedProduct) return
                  onAddItem(cat.id, selectedProduct)
                  setSelectedProduct('')
                }}
                disabled={acting || !selectedProduct}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Mobile preview ───────────────────────────────────────────────────────────

function MobilePreview({
  categories,
  items,
}: {
  categories: MenuCategory[]
  items: MenuItem[]
}) {
  const activeCategories = sortByOrder(categories.filter(c => c.active))

  return (
    <div className="mx-auto w-[320px] overflow-hidden rounded-2xl border-4 border-slate-800 bg-white shadow-xl">
      {/* Phone status bar */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-1">
        <span className="text-[10px] text-slate-300">9:41</span>
        <div className="flex gap-1">
          <span className="text-[10px] text-slate-300">●●●</span>
        </div>
      </div>
      {/* Menu content */}
      <div className="h-[480px] overflow-y-auto bg-gray-50">
        <div className="bg-indigo-600 px-4 pb-4 pt-5 text-white">
          <h1 className="text-lg font-bold">Menu Kami</h1>
          <p className="text-xs text-indigo-200 mt-0.5">Pilih dan pesan langsung</p>
        </div>
        <div className="p-3 space-y-4">
          {activeCategories.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-8">Belum ada kategori aktif</p>
          )}
          {activeCategories.map(cat => {
            const catItems = sortByOrder(
              items.filter(i => i.categoryId === cat.id && i.available)
            )
            if (catItems.length === 0) return null
            return (
              <div key={cat.id}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat.name}</h2>
                <div className="space-y-2">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white p-2 shadow-sm">
                      {item.productImage ? (
                        <img src={item.productImage} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                          <ImageIcon className="h-5 w-5 text-slate-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {item.featured && <span className="mr-1 text-amber-400">★</span>}
                          {item.productName ?? item.productId}
                        </p>
                        <p className="text-[11px] text-indigo-600 font-semibold">
                          Rp {(item.productPrice ?? 0).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <button className="rounded-full bg-indigo-600 p-1 text-white">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DigitalMenuClient({
  storeId,
  storeSlug,
}: {
  storeId: string
  storeSlug: string
}) {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catRes, itemsRes, prodRes] = await Promise.all([
        fetch(`/api/menu-categories?storeId=${storeId}`),
        fetch(`/api/menu-items?storeId=${storeId}`),
        fetch(`/api/products?storeId=${storeId}`),
      ])
      if (!catRes.ok || !itemsRes.ok || !prodRes.ok) throw new Error('Gagal memuat data')
      const [catData, itemsData, prodData] = await Promise.all([
        catRes.json() as Promise<any>,
        itemsRes.json() as Promise<any>,
        prodRes.json() as Promise<any>,
      ])
      setCategories(catData.categories ?? [])
      setItems(itemsData.items ?? [])
      setProducts(prodData.products ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { load() }, [load])

  // ── Mutations ──────────────────────────────────────────────────────────────

  async function addCategory() {
    const name = newCatName.trim()
    if (!name) return
    setActing(true)
    try {
      const res = await fetch('/api/menu-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, name, displayOrder: categories.length }),
      })
      if (!res.ok) throw new Error('Gagal menambah kategori')
      setNewCatName('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActing(false)
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setActing(true)
    try {
      await fetch(`/api/menu-categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      setCategories(prev => prev.map(c => c.id === id ? { ...c, active } : c))
    } finally {
      setActing(false)
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Hapus kategori dan semua itemnya?')) return
    setActing(true)
    try {
      await fetch(`/api/menu-categories/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setActing(false)
    }
  }

  async function addItem(categoryId: string, productId: string) {
    setActing(true)
    try {
      const catItems = items.filter(i => i.categoryId === categoryId)
      await fetch('/api/menu-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, categoryId, productId, displayOrder: catItems.length }),
      })
      await load()
    } finally {
      setActing(false)
    }
  }

  async function removeItem(id: string) {
    setActing(true)
    try {
      await fetch(`/api/menu-items/${id}`, { method: 'DELETE' })
      setItems(prev => prev.filter(i => i.id !== id))
    } finally {
      setActing(false)
    }
  }

  async function toggleFeatured(id: string, featured: boolean) {
    setActing(true)
    try {
      await fetch(`/api/menu-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured }),
      })
      setItems(prev => prev.map(i => i.id === id ? { ...i, featured } : i))
    } finally {
      setActing(false)
    }
  }

  async function toggleAvailable(id: string, available: boolean) {
    setActing(true)
    try {
      await fetch(`/api/menu-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available }),
      })
      setItems(prev => prev.map(i => i.id === id ? { ...i, available } : i))
    } finally {
      setActing(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Menu Digital</h1>
          <p className="mt-0.5 text-sm text-slate-500">Kelola tampilan menu pelanggan dan kiosk mandiri</p>
        </div>
        <button
          onClick={() => setShowPreview(p => !p)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Eye className="h-4 w-4" />
          {showPreview ? 'Sembunyikan Preview' : 'Preview Mobile'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <QRSection storeSlug={storeSlug} />

      <div className={cn('grid gap-6', showPreview ? 'lg:grid-cols-[1fr_340px]' : 'grid-cols-1')}>
        {/* Left: builder */}
        <div className="space-y-4">
          {/* Add category */}
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="Nama kategori baru (contoh: Minuman, Makanan Utama…)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={addCategory}
              disabled={acting || !newCatName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tambah Kategori
            </button>
          </div>

          {sortByOrder(categories).length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <QrCode className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">Belum ada kategori. Tambahkan kategori pertama Anda.</p>
            </div>
          )}

          {sortByOrder(categories).map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              items={items}
              products={products}
              onToggleActive={toggleActive}
              onDelete={deleteCategory}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onToggleFeatured={toggleFeatured}
              onToggleAvailable={toggleAvailable}
              acting={acting}
            />
          ))}
        </div>

        {/* Right: mobile preview */}
        {showPreview && (
          <div className="sticky top-4 self-start">
            <p className="mb-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wide">Preview Pelanggan</p>
            <MobilePreview categories={categories} items={items} />
          </div>
        )}
      </div>
    </div>
  )
}

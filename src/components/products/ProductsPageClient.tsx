'use client'

import { useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { Package, Plus, Pencil, Trash2, Search, Filter, AlertTriangle, Upload } from 'lucide-react'
import ProductFormModal from './ProductFormModal'
import ImportWizardModal from './ImportWizardModal'

interface Product {
  id: string
  name: string
  description?: string | null
  sku?: string | null
  barcode?: string | null
  price: number
  cost: number
  categoryId?: string | null
  image?: string | null
  trackStock: boolean
  stock: number
  lowStock: number
  active: boolean
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null
}

interface Category {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

interface ProductsPageClientProps {
  storeId: string
  initialProducts: Product[]
  categories: Category[]
  currency: string
}

export default function ProductsPageClient({
  storeId,
  initialProducts,
  categories,
  currency,
}: ProductsPageClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Derive existing SKUs for the import wizard
  const existingSKUs = new Set(products.map(p => p.sku).filter(Boolean) as string[])

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || p.categoryId === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Show toast
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')

      setProducts(prev => prev.filter(p => p.id !== id))
      showToast('Product deleted successfully')
    } catch (error) {
      showToast('Failed to delete product', 'error')
    }
  }

  // Handle toggle active
  const handleToggleActive = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !product.active }),
      })
      if (!res.ok) throw new Error('Failed to update')

      const updated = (await res.json()) as any
      setProducts(prev => prev.map(p => (p.id === product.id ? updated : p)))
      showToast(`Product ${updated.active ? 'activated' : 'deactivated'}`)
    } catch (error) {
      showToast('Failed to update product', 'error')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Produk</h1>
          <p className="mt-0.5 text-sm text-[var(--text-2)]">Manage your product catalog</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-amber-400 hover:text-amber-600"
          >
            <Upload className="h-4 w-4" />
            Import Produk
          </button>
          <button
            onClick={() => {
              setEditingProduct(null)
              setShowModal(true)
            }}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] py-2 pr-4 pl-10 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
            />
          </div>

          {/* Category filter */}
          <div className="relative sm:w-64">
            <Filter className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <select
              value={selectedCategory ?? ''}
              onChange={e => setSelectedCategory(e.target.value || null)}
              className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-2 pr-4 pl-10 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
            >
              <option value="">Semua Kategori</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Products table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="mx-auto mb-3 h-12 w-12 text-stone-300" />
            <p className="text-sm text-[var(--text-2)]">
              {search || selectedCategory ? 'No products match your filters' : 'No products yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-subtle)] text-left">
                  <th className="px-5 py-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Product
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    SKU
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Category
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Price
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Stock
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.map(product => (
                  <tr key={product.id} className="transition-colors hover:bg-[var(--bg-subtle)]/50">
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-medium text-[var(--text-1)]">{product.name}</p>
                        {product.description && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-[var(--text-3)]">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[var(--text-2)]">
                      {product.sku || <span className="text-[var(--text-3)] italic">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {product.category ? (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: product.category.color
                              ? `${product.category.color}20`
                              : '#f3f4f6',
                            color: product.category.color || '#6b7280',
                          }}
                        >
                          {product.category.name}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-3)] italic">Uncategorized</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-[var(--text-1)]">
                      {formatCurrency(product.price, currency)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {product.trackStock ? (
                        <div className="flex items-center justify-center gap-1">
                          <span
                            className={cn(
                              'font-medium',
                              product.stock <= product.lowStock
                                ? product.stock === 0
                                  ? 'text-red-600'
                                  : 'text-orange-600'
                                : 'text-[var(--text-1)]',
                            )}
                          >
                            {product.stock}
                          </span>
                          {product.stock <= product.lowStock && product.stock > 0 && (
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-3)] italic">N/A</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(product)}
                        className={cn(
                          'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium transition-colors',
                          product.active
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-[var(--bg-muted)] text-[var(--text-2)] hover:bg-stone-200',
                        )}
                      >
                        {product.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingProduct(product)
                            setShowModal(true)
                          }}
                          className="rounded p-1.5 text-[var(--text-3)] transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="rounded p-1.5 text-[var(--text-3)] transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import wizard */}
      {showImportModal && (
        <ImportWizardModal
          storeId={storeId}
          existingSKUs={existingSKUs}
          onClose={() => setShowImportModal(false)}
          onSuccess={result => {
            showToast(
              `Import selesai: ${result.created} dibuat, ${result.updated} diperbarui${result.errors > 0 ? `, ${result.errors} dilewati` : ''}`,
              'success',
            )
            setShowImportModal(false)
            // Reload products from server by reloading the page
            window.location.reload()
          }}
        />
      )}

      {/* Modal */}
      {showModal && (
        <ProductFormModal
          storeId={storeId}
          categories={categories}
          product={editingProduct}
          onClose={() => {
            setShowModal(false)
            setEditingProduct(null)
          }}
          onSuccess={product => {
            if (editingProduct) {
              setProducts(prev => prev.map(p => (p.id === product.id ? product : p)))
              showToast('Product updated successfully')
            } else {
              setProducts(prev => [...prev, product])
              showToast('Product created successfully')
            }
            setShowModal(false)
            setEditingProduct(null)
          }}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            'fixed right-6 bottom-6 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-opacity',
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600',
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { Package, Plus, Pencil, Trash2, Search, Filter, AlertTriangle } from 'lucide-react'
import ProductFormModal from './ProductFormModal'

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Filter products
  const filteredProducts = products.filter((p) => {
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

      setProducts((prev) => prev.filter((p) => p.id !== id))
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

      const updated = await res.json()
      setProducts((prev) => prev.map((p) => (p.id === product.id ? updated : p)))
      showToast(`Product ${updated.active ? 'activated' : 'deactivated'}`)
    } catch (error) {
      showToast('Failed to update product', 'error')
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your product catalog
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          {/* Category filter */}
          <div className="relative sm:w-64">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select
              value={selectedCategory ?? ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent appearance-none bg-white"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {search || selectedCategory ? 'No products match your filters' : 'No products yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Product
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    SKU
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Category
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Price
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Stock
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Status
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-medium text-gray-800">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {product.sku || <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {product.category ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
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
                        <span className="text-gray-400 italic text-xs">Uncategorized</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-800">
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
                                : 'text-gray-800'
                            )}
                          >
                            {product.stock}
                          </span>
                          {product.stock <= product.lowStock && product.stock > 0 && (
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">N/A</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(product)}
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors',
                          product.active
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
          onSuccess={(product) => {
            if (editingProduct) {
              setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)))
              showToast('Product updated successfully')
            } else {
              setProducts((prev) => [...prev, product])
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
            'fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-opacity z-50',
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

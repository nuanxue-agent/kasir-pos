'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Search,
  Filter,
  Boxes,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
} from 'lucide-react'
import StockAdjustModal from './StockAdjustModal'
import StockLogsModal from './StockLogsModal'

interface Product {
  id: string
  name: string
  sku?: string | null
  stock: number
  lowStock: number
  price: number
  category?: { id: string; name: string } | null
}

interface InventoryPageClientProps {
  storeId: string
}

type FilterMode = 'all' | 'low' | 'out'

export default function InventoryPageClient({ storeId }: InventoryPageClientProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [search, filter, page])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        storeId,
        page: page.toString(),
        limit: '50',
      })
      
      if (search) params.set('q', search)
      if (filter === 'low') params.set('lowStockOnly', 'true')

      const res = await fetch(`/api/inventory?${params}`)
      const data = await res.json()
      
      let filtered = data.products || []
      
      // Client-side filter for "out of stock"
      if (filter === 'out') {
        filtered = filtered.filter((p: Product) => p.stock === 0)
      }
      
      setProducts(filtered)
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStockStatus = (product: Product) => {
    if (product.stock === 0) return { label: 'OUT', color: 'bg-red-500/20 text-red-400' }
    if (product.stock <= product.lowStock) return { label: 'LOW', color: 'bg-orange-500/20 text-orange-400' }
    return { label: 'OK', color: 'bg-green-500/20 text-green-400' }
  }

  const handleAdjustStock = (product: Product) => {
    setSelectedProduct(product)
    setShowAdjustModal(true)
  }

  const handleViewLogs = (product: Product) => {
    setSelectedProduct(product)
    setShowLogsModal(true)
  }

  const handleAdjustSuccess = () => {
    setShowAdjustModal(false)
    fetchProducts()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Boxes className="w-7 h-7" />
            Inventory Management
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Track and manage product stock levels
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => { setFilter('all'); setPage(1) }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            All
          </button>
          <button
            onClick={() => { setFilter('low'); setPage(1) }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
              filter === 'low'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            Low Stock
          </button>
          <button
            onClick={() => { setFilter('out'); setPage(1) }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              filter === 'out'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            Out of Stock
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-700">
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400">Product</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400">SKU</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400">Category</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-gray-400">Current Stock</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-gray-400">Low Stock Alert</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-gray-400">Status</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const status = getStockStatus(product)
                  return (
                    <tr key={product.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{product.name}</div>
                        <div className="text-sm text-gray-400">{formatCurrency(product.price)}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        {product.sku || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        {product.category?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-semibold text-white">
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400">
                        {product.lowStock}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                          status.color
                        )}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAdjustStock(product)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <TrendingUp className="w-4 h-4" />
                            Adjust
                          </button>
                          <button
                            onClick={() => handleViewLogs(product)}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <History className="w-4 h-4" />
                            Logs
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && products.length > 0 && (
          <div className="px-4 py-3 bg-gray-900 border-t border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Showing {products.length} of {total} products
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdjustModal && selectedProduct && (
        <StockAdjustModal
          product={selectedProduct}
          onClose={() => setShowAdjustModal(false)}
          onSuccess={handleAdjustSuccess}
        />
      )}

      {showLogsModal && selectedProduct && (
        <StockLogsModal
          product={selectedProduct}
          onClose={() => setShowLogsModal(false)}
        />
      )}
    </div>
  )
}

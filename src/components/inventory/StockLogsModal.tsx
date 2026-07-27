'use client'

import { useState, useEffect } from 'react'
import { X, History, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'

interface Product {
  id: string
  name: string
  sku?: string | null
  stock: number
}

interface StockLog {
  id: string
  type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'VOID' | 'INITIAL'
  qty: number
  note?: string | null
  createdAt: string
}

interface StockLogsModalProps {
  product: Product
  onClose: () => void
}

const LOG_TYPE_CONFIG = {
  SALE: { label: 'Sale', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  RESTOCK: { label: 'Restock', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  ADJUSTMENT: { label: 'Adjustment', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  VOID: { label: 'Void', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  INITIAL: { label: 'Initial', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

const LIMIT = 10

export default function StockLogsModal({ product, onClose }: StockLogsModalProps) {
  const [logs, setLogs] = useState<StockLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchLogs()
  }, [page])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/inventory/${product.id}/logs?page=${page}&limit=${LIMIT}`
      )
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setTotalPages(data.pages || 1)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-stone-100 rounded-xl border border-stone-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <History className="w-5 h-5" />
            Stock History
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Info */}
        <div className="px-6 py-3 bg-stone-50 border-b border-stone-200">
          <div className="text-white font-medium">{product.name}</div>
          <div className="flex items-center gap-4 mt-0.5">
            {product.sku && (
              <div className="text-gray-400 text-sm">SKU: {product.sku}</div>
            )}
            <div className="text-sm text-gray-400">
              Current: <span className="text-stone-800 font-semibold">{product.stock}</span>
            </div>
            <div className="text-sm text-gray-400">
              {total} log{total !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No stock logs found</div>
          ) : (
            <ul className="divide-y divide-gray-700">
              {logs.map((log) => {
                const config = LOG_TYPE_CONFIG[log.type] || LOG_TYPE_CONFIG.ADJUSTMENT
                const isPositive = log.qty > 0
                return (
                  <li key={log.id} className="px-6 py-4 hover:bg-gray-700/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded border text-xs font-medium shrink-0 mt-0.5',
                          config.color
                        )}>
                          {config.label}
                        </span>
                        <div className="min-w-0">
                          <div className="text-gray-300 text-sm truncate">
                            {log.note || '-'}
                          </div>
                          <div className="text-gray-500 text-xs mt-0.5">
                            {formatDate(log.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        'font-semibold text-lg shrink-0',
                        isPositive ? 'text-green-400' : 'text-red-400'
                      )}>
                        {isPositive ? '+' : ''}{log.qty}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-stone-200 flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

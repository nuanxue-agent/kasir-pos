'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  cost: z.number().min(0, 'Cost cannot be negative'),
  categoryId: z.string().optional(),
  trackStock: z.boolean(),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  lowStock: z.number().int().min(0, 'Low stock cannot be negative'),
  active: z.boolean(),
})

type ProductFormData = {
  name: string
  description?: string
  sku?: string
  barcode?: string
  price: number
  cost: number
  categoryId?: string
  trackStock: boolean
  stock: number
  lowStock: number
  active: boolean
}

interface Category {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

interface Product {
  id: string
  name: string
  description?: string | null
  sku?: string | null
  barcode?: string | null
  price: number
  cost: number
  categoryId?: string | null
  trackStock: boolean
  stock: number
  lowStock: number
  active: boolean
}

interface ProductFormModalProps {
  storeId: string
  categories: Category[]
  product?: Product | null
  onClose: () => void
  onSuccess: (product: any) => void
}

export default function ProductFormModal({
  storeId,
  categories,
  product,
  onClose,
  onSuccess,
}: ProductFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          description: product.description || '',
          sku: product.sku || '',
          barcode: product.barcode || '',
          price: product.price,
          cost: product.cost,
          categoryId: product.categoryId || '',
          trackStock: product.trackStock,
          stock: product.stock,
          lowStock: product.lowStock,
          active: product.active,
        }
      : {
          name: '',
          description: '',
          sku: '',
          barcode: '',
          price: 0,
          cost: 0,
          categoryId: '',
          trackStock: true,
          stock: 0,
          lowStock: 5,
          active: true,
        },
  })

  const trackStock = watch('trackStock')

  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        storeId,
        name: data.name,
        description: data.description || undefined,
        sku: data.sku || undefined,
        barcode: data.barcode || undefined,
        price: data.price,
        cost: data.cost,
        categoryId: data.categoryId || undefined,
        trackStock: data.trackStock,
        stock: data.stock,
        lowStock: data.lowStock,
        active: data.active,
      }

      const url = product ? `/api/products/${product.id}` : '/api/products'
      const method = product ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to save product' }))
        throw new Error(errData.error || 'Failed to save product')
      }

      const savedProduct = await res.json()
      onSuccess(savedProduct)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                {...register('name')}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent',
                  errors.name ? 'border-red-300' : 'border-gray-200'
                )}
                placeholder="e.g. Blue T-Shirt"
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                {...register('description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                placeholder="Optional product description"
              />
            </div>

            {/* SKU & Barcode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
                  SKU
                </label>
                <input
                  id="sku"
                  type="text"
                  {...register('sku')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder="e.g. TSHIRT-BLU-M"
                />
              </div>
              <div>
                <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-1">
                  Barcode
                </label>
                <input
                  id="barcode"
                  type="text"
                  {...register('barcode')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder="e.g. 1234567890123"
                />
              </div>
            </div>

            {/* Price & Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                  Selling Price <span className="text-red-500">*</span>
                </label>
                <input
                  id="price"
                  type="number"
                  step="0.01"
                  {...register('price', { valueAsNumber: true })}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent',
                    errors.price ? 'border-red-300' : 'border-gray-200'
                  )}
                  placeholder="0"
                />
                {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price.message}</p>}
              </div>
              <div>
                <label htmlFor="cost" className="block text-sm font-medium text-gray-700 mb-1">
                  Cost
                </label>
                <input
                  id="cost"
                  type="number"
                  step="0.01"
                  {...register('cost', { valueAsNumber: true })}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent',
                    errors.cost ? 'border-red-300' : 'border-gray-200'
                  )}
                  placeholder="0"
                />
                {errors.cost && <p className="text-xs text-red-600 mt-1">{errors.cost.message}</p>}
              </div>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                id="categoryId"
                {...register('categoryId')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent appearance-none bg-white"
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Track Stock */}
            <div className="flex items-center gap-2">
              <input
                id="trackStock"
                type="checkbox"
                {...register('trackStock')}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-amber-400"
              />
              <label htmlFor="trackStock" className="text-sm font-medium text-gray-700">
                Track Stock
              </label>
            </div>

            {/* Stock & Low Stock (only if tracking) */}
            {trackStock && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="stock" className="block text-sm font-medium text-gray-700 mb-1">
                    Current Stock
                  </label>
                  <input
                    id="stock"
                    type="number"
                    {...register('stock', { valueAsNumber: true })}
                    className={cn(
                      'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent',
                      errors.stock ? 'border-red-300' : 'border-gray-200'
                    )}
                    placeholder="0"
                  />
                  {errors.stock && <p className="text-xs text-red-600 mt-1">{errors.stock.message}</p>}
                </div>
                <div>
                  <label htmlFor="lowStock" className="block text-sm font-medium text-gray-700 mb-1">
                    Low Stock Alert
                  </label>
                  <input
                    id="lowStock"
                    type="number"
                    {...register('lowStock', { valueAsNumber: true })}
                    className={cn(
                      'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent',
                      errors.lowStock ? 'border-red-300' : 'border-gray-200'
                    )}
                    placeholder="5"
                  />
                  {errors.lowStock && <p className="text-xs text-red-600 mt-1">{errors.lowStock.message}</p>}
                </div>
              </div>
            )}

            {/* Active */}
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                {...register('active')}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-amber-400"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700">
                Active (visible in POS)
              </label>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}

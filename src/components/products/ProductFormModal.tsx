'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import BarcodeDisplay from './BarcodeDisplay'
import {
  generateCombinations,
  type VariantAttribute,
  type VariantCombination,
} from '@/lib/variants'

// Watch SKU for live barcode preview

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  cost: z.number().min(0, 'Cost cannot be negative'),
  categoryId: z.string().optional(),
  image: z
    .string()
    .optional()
    .refine(v => !v || /^https?:\/\//i.test(v), {
      message: 'URL gambar harus dimulai dengan http:// atau https://',
    }),
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
  image?: string
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
  image?: string | null
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
          image: product.image || '',
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
          image: '',
          trackStock: true,
          stock: 0,
          lowStock: 5,
          active: true,
        },
  })

  const trackStock = watch('trackStock')
  const imageUrl = watch('image')
  const skuValue = watch('sku')

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
        image: data.image || undefined,
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
        const errData = (await res.json().catch(() => ({ error: 'Failed to save product' }))) as any
        throw new Error(errData.error || 'Failed to save product')
      }

      const savedProduct = await res.json()
      toast.success('Produk disimpan')
      onSuccess(savedProduct)
    } catch (err: any) {
      const msg = err.message || 'Something went wrong'
      setError(msg)
      toast.error('Gagal menyimpan', msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-stone-800">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-stone-700">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                {...register('name')}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                  errors.name ? 'border-red-300' : 'border-stone-200',
                )}
                placeholder="e.g. Blue T-Shirt"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="mb-1 block text-sm font-medium text-stone-700"
              >
                Description
              </label>
              <textarea
                id="description"
                {...register('description')}
                rows={3}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
                placeholder="Optional product description"
              />
            </div>

            {/* SKU & Barcode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="sku" className="mb-1 block text-sm font-medium text-stone-700">
                  SKU
                </label>
                <input
                  id="sku"
                  type="text"
                  {...register('sku')}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
                  placeholder="e.g. TSHIRT-BLU-M"
                />
              </div>
              <div>
                <label htmlFor="barcode" className="mb-1 block text-sm font-medium text-stone-700">
                  Barcode
                </label>
                <input
                  id="barcode"
                  type="text"
                  {...register('barcode')}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
                  placeholder="e.g. 1234567890123"
                />
              </div>
            </div>

            {/* Price & Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="price" className="mb-1 block text-sm font-medium text-stone-700">
                  Selling Price <span className="text-red-500">*</span>
                </label>
                <input
                  id="price"
                  type="number"
                  step="0.01"
                  {...register('price', { valueAsNumber: true })}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                    errors.price ? 'border-red-300' : 'border-stone-200',
                  )}
                  placeholder="0"
                />
                {errors.price && (
                  <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="cost" className="mb-1 block text-sm font-medium text-stone-700">
                  Cost
                </label>
                <input
                  id="cost"
                  type="number"
                  step="0.01"
                  {...register('cost', { valueAsNumber: true })}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                    errors.cost ? 'border-red-300' : 'border-stone-200',
                  )}
                  placeholder="0"
                />
                {errors.cost && <p className="mt-1 text-xs text-red-600">{errors.cost.message}</p>}
              </div>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="categoryId" className="mb-1 block text-sm font-medium text-stone-700">
                Category
              </label>
              <select
                id="categoryId"
                {...register('categoryId')}
                className="w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
              >
                <option value="">Tanpa Kategori</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Image URL */}
            <div>
              <label htmlFor="image" className="mb-1 block text-sm font-medium text-stone-700">
                URL Gambar <span className="font-normal text-stone-400">(opsional)</span>
              </label>
              <input
                id="image"
                type="url"
                {...register('image')}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                  errors.image ? 'border-red-300' : 'border-stone-200',
                )}
                placeholder="https://example.com/image.jpg"
              />
              {errors.image && <p className="mt-1 text-xs text-red-600">{errors.image.message}</p>}
              {imageUrl && /^https?:\/\//i.test(imageUrl) && (
                <div className="mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Preview gambar produk"
                    className="h-24 w-24 rounded-lg border border-stone-200 object-cover"
                    onError={e => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Barcode preview */}
            {skuValue && skuValue.trim() !== '' && (
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Barcode (SKU)
                </label>
                <BarcodeDisplay
                  sku={skuValue.trim()}
                  productName={watch('name')}
                  showPrintButton={true}
                />
              </div>
            )}

            {/* Track Stock */}
            <div className="flex items-center gap-2">
              <input
                id="trackStock"
                type="checkbox"
                {...register('trackStock')}
                className="h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-amber-400"
              />
              <label htmlFor="trackStock" className="text-sm font-medium text-stone-700">
                Track Stock
              </label>
            </div>

            {/* Stock & Low Stock (only if tracking) */}
            {trackStock && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="stock" className="mb-1 block text-sm font-medium text-stone-700">
                    Current Stock
                  </label>
                  <input
                    id="stock"
                    type="number"
                    {...register('stock', { valueAsNumber: true })}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                      errors.stock ? 'border-red-300' : 'border-stone-200',
                    )}
                    placeholder="0"
                  />
                  {errors.stock && (
                    <p className="mt-1 text-xs text-red-600">{errors.stock.message}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="lowStock"
                    className="mb-1 block text-sm font-medium text-stone-700"
                  >
                    Low Stock Alert
                  </label>
                  <input
                    id="lowStock"
                    type="number"
                    {...register('lowStock', { valueAsNumber: true })}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                      errors.lowStock ? 'border-red-300' : 'border-stone-200',
                    )}
                    placeholder="5"
                  />
                  {errors.lowStock && (
                    <p className="mt-1 text-xs text-red-600">{errors.lowStock.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* Active */}
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                {...register('active')}
                className="h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-amber-400"
              />
              <label htmlFor="active" className="text-sm font-medium text-stone-700">
                Active (visible in POS)
              </label>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-stone-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}

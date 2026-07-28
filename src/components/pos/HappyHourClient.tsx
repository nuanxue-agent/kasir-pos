'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Plus,
  RefreshCw,
  Calendar,
  Trash2,
  Edit2,
  Save,
  X,
  Tag,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type DiscountType = 'PERCENTAGE' | 'FIXED' | 'BOGO'
export type AppliesTo = 'ALL' | 'CATEGORY' | 'PRODUCT'

export interface HappyHour {
  id: string
  storeId: string
  name: string
  days: number[] // 0=Sunday, 6=Saturday
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  discountType: DiscountType
  discountValue: number
  appliesTo: AppliesTo
  targetIds: string[] // category or product IDs
  active: boolean
  createdAt: string
  updatedAt: string
}

interface HappyHourClientProps {
  storeId: string
}

interface Category {
  id: string
  name: string
  color?: string | null
}

interface Product {
  id: string
  name: string
  price: number
  categoryId?: string | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DISCOUNT_TYPES: { value: DiscountType; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'FIXED', label: 'Fixed Amount' },
  { value: 'BOGO', label: 'Buy One Get One' },
]

const APPLIES_TO: { value: AppliesTo; label: string }[] = [
  { value: 'ALL', label: 'All Products' },
  { value: 'CATEGORY', label: 'Specific Categories' },
  { value: 'PRODUCT', label: 'Specific Products' },
]

function isHappyHourActive(hh: HappyHour, now: Date = new Date()): boolean {
  if (!hh.active) return false

  const currentDay = now.getDay()
  if (!hh.days.includes(currentDay)) return false

  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  return currentTime >= hh.startTime && currentTime < hh.endTime
}

function getActiveHappyHours(happyHours: HappyHour[], now: Date = new Date()): HappyHour[] {
  return happyHours.filter(hh => isHappyHourActive(hh, now))
}

export default function HappyHourClient({ storeId }: HappyHourClientProps) {
  const [happyHours, setHappyHours] = useState<HappyHour[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  const [formData, setFormData] = useState<Partial<HappyHour>>({
    name: '',
    days: [],
    startTime: '17:00',
    endTime: '19:00',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    appliesTo: 'ALL',
    targetIds: [],
    active: true,
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [hhRes, catRes, prodRes] = await Promise.all([
        fetch(`/api/happy-hours?storeId=${storeId}`).then(r => r.json()),
        fetch(`/api/categories?storeId=${storeId}`).then(r => r.json()),
        fetch(`/api/products?storeId=${storeId}&active=true`).then(r => r.json()),
      ])
      setHappyHours(Array.isArray(hhRes) ? hhRes : [])
      setCategories(Array.isArray(catRes) ? catRes : [])
      setProducts(Array.isArray(prodRes) ? prodRes : [])
    } catch (err: any) {
      console.error('Failed to fetch data:', err)
      setHappyHours([])
      setCategories([])
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleSave = async () => {
    try {
      if (!formData.name?.trim() || !formData.days?.length) {
        alert('Please fill in all required fields')
        return
      }

      const method = editingId ? 'PATCH' : 'POST'
      const url = editingId
        ? `/api/happy-hours/${editingId}`
        : `/api/happy-hours?storeId=${storeId}`

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }

      await fetchData()
      setShowForm(false)
      setEditingId(null)
      setFormData({
        name: '',
        days: [],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      })
    } catch (err: any) {
      alert(err.message || 'Failed to save happy hour')
    }
  }

  const handleEdit = (hh: HappyHour) => {
    setFormData(hh)
    setEditingId(hh.id)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData({
      name: '',
      days: [],
      startTime: '17:00',
      endTime: '19:00',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      appliesTo: 'ALL',
      targetIds: [],
      active: true,
    })
  }

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days?.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...(prev.days || []), day].sort((a, b) => a - b),
    }))
  }

  const activeHours = getActiveHappyHours(happyHours, currentTime)

  const getWeekCalendar = () => {
    const today = new Date()
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      days.push(date)
    }
    return days
  }

  const weekDays = getWeekCalendar()

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Happy Hours</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set up time-based promotions and automatic discounts
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          New Happy Hour
        </button>
      </div>

      {/* Real-time Status */}
      {activeHours.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
            <h3 className="font-semibold text-green-800">Active Now</h3>
          </div>
          <div className="space-y-2">
            {activeHours.map(hh => (
              <div key={hh.id} className="text-sm text-green-700">
                <span className="font-medium">{hh.name}</span> •{' '}
                {hh.discountType === 'PERCENTAGE'
                  ? `${hh.discountValue}% off`
                  : hh.discountType === 'FIXED'
                    ? `Rp ${hh.discountValue.toLocaleString()} off`
                    : 'Buy One Get One'}{' '}
                • Until {hh.endTime}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week Calendar Preview */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
          <Calendar className="h-5 w-5" />
          This Week's Schedule
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((date, idx) => {
            const dayOfWeek = date.getDay()
            const dayHappyHours = happyHours.filter(hh => hh.active && hh.days.includes(dayOfWeek))
            const isToday = date.toDateString() === new Date().toDateString()

            return (
              <div
                key={idx}
                className={cn(
                  'rounded-lg border p-2 text-center',
                  isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50',
                )}
              >
                <div className="text-xs font-medium text-gray-700">{DAYS[dayOfWeek]}</div>
                <div className="mt-1 text-sm text-gray-900">{date.getDate()}</div>
                <div className="mt-2 space-y-1">
                  {dayHappyHours.map(hh => (
                    <div
                      key={hh.id}
                      className="truncate rounded bg-green-100 px-1 py-0.5 text-xs text-green-700"
                      title={`${hh.name} (${hh.startTime}-${hh.endTime})`}
                    >
                      {hh.startTime}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Happy Hours List */}
      <div className="space-y-3">
        {happyHours.map(hh => {
          const isActive = isHappyHourActive(hh, currentTime)
          return (
            <div
              key={hh.id}
              className={cn(
                'rounded-lg border bg-white p-4 transition-all',
                isActive ? 'border-green-400 shadow-md' : 'border-gray-200',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{hh.name}</h3>
                    {isActive && (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                        Active
                      </span>
                    )}
                    {!hh.active && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {hh.startTime} - {hh.endTime}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {hh.days.map(d => DAYS[d]).join(', ')}
                    </div>
                    <div className="flex items-center gap-1">
                      <Tag className="h-4 w-4" />
                      {hh.discountType === 'PERCENTAGE'
                        ? `${hh.discountValue}% off`
                        : hh.discountType === 'FIXED'
                          ? `Rp ${hh.discountValue.toLocaleString()} off`
                          : 'Buy One Get One'}
                    </div>
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      {hh.appliesTo === 'ALL'
                        ? 'All products'
                        : hh.appliesTo === 'CATEGORY'
                          ? `${hh.targetIds.length} categories`
                          : `${hh.targetIds.length} products`}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleEdit(hh)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  <Edit2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          )
        })}

        {happyHours.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Clock className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p>No happy hours configured yet</p>
            <p className="mt-1 text-sm">Create your first happy hour to get started</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingId ? 'Edit Happy Hour' : 'New Happy Hour'}
              </h2>
              <button
                onClick={handleCancel}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Evening Happy Hour"
                />
              </div>

              {/* Days */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Days *</label>
                <div className="flex gap-2">
                  {DAYS.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        formData.days?.includes(idx)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={formData.startTime || ''}
                    onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">End Time *</label>
                  <input
                    type="time"
                    value={formData.endTime || ''}
                    onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Discount Type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Discount Type *
                </label>
                <select
                  value={formData.discountType || 'PERCENTAGE'}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, discountType: e.target.value as DiscountType }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                >
                  {DISCOUNT_TYPES.map(dt => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Discount Value */}
              {formData.discountType !== 'BOGO' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {formData.discountType === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount (Rp)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={formData.discountType === 'PERCENTAGE' ? 100 : undefined}
                    value={formData.discountValue || 0}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        discountValue: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Applies To */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Applies To *</label>
                <select
                  value={formData.appliesTo || 'ALL'}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      appliesTo: e.target.value as AppliesTo,
                      targetIds: [],
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                >
                  {APPLIES_TO.map(at => (
                    <option key={at.value} value={at.value}>
                      {at.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Selection */}
              {formData.appliesTo === 'CATEGORY' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Select Categories
                  </label>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                    {categories.map(cat => (
                      <label
                        key={cat.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={formData.targetIds?.includes(cat.id)}
                          onChange={e => {
                            const checked = e.target.checked
                            setFormData(prev => ({
                              ...prev,
                              targetIds: checked
                                ? [...(prev.targetIds || []), cat.id]
                                : (prev.targetIds || []).filter(id => id !== cat.id),
                            }))
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formData.appliesTo === 'PRODUCT' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Select Products
                  </label>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                    {products.map(prod => (
                      <label
                        key={prod.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={formData.targetIds?.includes(prod.id)}
                          onChange={e => {
                            const checked = e.target.checked
                            setFormData(prev => ({
                              ...prev,
                              targetIds: checked
                                ? [...(prev.targetIds || []), prod.id]
                                : (prev.targetIds || []).filter(id => id !== prod.id),
                            }))
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{prod.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Active */}
              <div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.active ?? true}
                    onChange={e => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

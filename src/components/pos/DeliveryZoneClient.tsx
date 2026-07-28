'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, MapPin, Clock, DollarSign, Check, X, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

export interface DeliveryZone {
  id: string
  storeId: string
  name: string
  minDistance: number
  maxDistance: number
  fee: number
  estimatedMinutes: number
  active: boolean
  createdAt: string
  updatedAt: string
}

interface DeliveryZoneClientProps {
  storeId: string
  currency: string
  initialZones: DeliveryZone[]
}

/* ─── Pure business logic (exported for unit tests) ─────────────────────── */

export function findZoneForDistance(
  zones: DeliveryZone[],
  distanceKm: number,
): DeliveryZone | null {
  const active = zones.filter(z => z.active)
  const matches = active.filter(
    z => distanceKm >= z.minDistance && distanceKm <= z.maxDistance,
  )
  if (matches.length === 0) return null
  // Prefer narrowest (smallest range) when zones overlap
  return matches.sort(
    (a, b) => a.maxDistance - a.minDistance - (b.maxDistance - b.minDistance),
  )[0]
}

export function calcDeliveryFee(
  zones: DeliveryZone[],
  distanceKm: number,
  orderTotal: number,
  freeDeliveryThreshold: number,
): { zone: DeliveryZone | null; fee: number; isFree: boolean } {
  const zone = findZoneForDistance(zones, distanceKm)
  if (!zone) return { zone: null, fee: 0, isFree: false }
  const isFree = freeDeliveryThreshold > 0 && orderTotal >= freeDeliveryThreshold
  return { zone, fee: isFree ? 0 : zone.fee, isFree }
}

export function calcEstimatedMinutes(zone: DeliveryZone | null): number {
  if (!zone) return 0
  return zone.estimatedMinutes
}

export function resolveOverlappingZones(zones: DeliveryZone[]): DeliveryZone[] {
  // Return active zones sorted by minDistance; highlight overlaps for the editor
  return [...zones]
    .filter(z => z.active)
    .sort((a, b) => a.minDistance - b.minDistance)
}

export function hasOverlap(zones: DeliveryZone[], exclude?: string): boolean {
  const active = zones.filter(z => z.active && z.id !== exclude)
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j]
      if (a.minDistance < b.maxDistance && b.minDistance < a.maxDistance) return true
    }
  }
  return false
}

/* ─── Form blank ─────────────────────────────────────────────────────────── */

const BLANK = {
  name: '',
  minDistance: 0,
  maxDistance: 5,
  fee: 10000,
  estimatedMinutes: 30,
  active: true,
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function DeliveryZoneClient({
  storeId,
  currency,
  initialZones,
}: DeliveryZoneClientProps) {
  const [zones, setZones] = useState<DeliveryZone[]>(initialZones)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [freeThreshold, setFreeThreshold] = useState(0)
  const [thresholdInput, setThresholdInput] = useState('0')
  const [calcDistance, setCalcDistance] = useState('')
  const [calcOrder, setCalcOrder] = useState('')
  const [calcResult, setCalcResult] = useState<{
    zone: DeliveryZone | null
    fee: number
    isFree: boolean
  } | null>(null)

  const fetchZones = useCallback(async () => {
    const res = await fetch(`/api/delivery-zones?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) setZones(data)
  }, [storeId])

  useEffect(() => { fetchZones() }, [fetchZones])

  function openNew() {
    setEditId(null)
    setForm({ ...BLANK })
    setShowForm(true)
  }

  function openEdit(z: DeliveryZone) {
    setEditId(z.id)
    setForm({
      name: z.name,
      minDistance: z.minDistance,
      maxDistance: z.maxDistance,
      fee: z.fee,
      estimatedMinutes: z.estimatedMinutes,
      active: z.active,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setForm({ ...BLANK })
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Zone name is required'); return }
    if (form.minDistance < 0) { toast.error('Min distance must be ≥ 0'); return }
    if (form.maxDistance <= form.minDistance) {
      toast.error('Max distance must be greater than min distance')
      return
    }
    setSaving(true)
    try {
      if (editId) {
        const res = await fetch(`/api/delivery-zones/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json() as any
        if (data.error) { toast.error(data.error); return }
        toast.success('Zone updated')
      } else {
        const res = await fetch(`/api/delivery-zones?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json() as any
        if (data.error) { toast.error(data.error); return }
        toast.success('Zone created')
      }
      closeForm()
      await fetchZones()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(z: DeliveryZone) {
    const res = await fetch(`/api/delivery-zones/${z.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !z.active }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    await fetchZones()
  }

  function handleCalculate() {
    const dist = parseFloat(calcDistance)
    const order = parseFloat(calcOrder) || 0
    if (isNaN(dist) || dist < 0) { toast.error('Enter a valid distance'); return }
    const result = calcDeliveryFee(zones, dist, order, freeThreshold)
    setCalcResult(result)
  }

  const sorted = resolveOverlappingZones(zones)
  const overlap = hasOverlap(zones)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Delivery Zones</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Configure distance-based delivery fees for your store
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add Zone
        </button>
      </div>

      {/* Free delivery threshold */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="flex flex-wrap items-center gap-4">
          <DollarSign className="h-5 w-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-1)]">Free Delivery Threshold</p>
            <p className="text-xs text-[var(--text-3)]">
              Orders above this amount qualify for free delivery (0 = disabled)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value)}
              className="w-32 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <button
              onClick={() => {
                const v = parseFloat(thresholdInput)
                if (!isNaN(v) && v >= 0) { setFreeThreshold(v); toast.success('Threshold saved') }
              }}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Save
            </button>
          </div>
          {freeThreshold > 0 && (
            <span className="text-sm text-green-600 font-medium">
              Free delivery above {formatCurrency(freeThreshold, currency)}
            </span>
          )}
        </div>
      </div>

      {/* Overlap warning */}
      {overlap && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ⚠️ Some zones have overlapping distance ranges. The narrowest zone will take priority.
        </div>
      )}

      {/* Zone list */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text-1)]">
            Zones ({zones.length})
          </p>
        </div>
        {zones.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-3)] text-sm">
            No zones configured. Add a zone to get started.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {zones
              .slice()
              .sort((a, b) => a.minDistance - b.minDistance)
              .map(z => (
                <div
                  key={z.id}
                  className={cn(
                    'flex flex-wrap items-center gap-4 px-4 py-3 transition-colors',
                    z.active ? 'hover:bg-[var(--bg-1)]' : 'opacity-50',
                  )}
                >
                  <MapPin className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)]">{z.name}</p>
                    <p className="text-xs text-[var(--text-3)]">
                      {z.minDistance} – {z.maxDistance} km
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-[var(--text-2)]">
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      {formatCurrency(z.fee, currency)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      ~{z.estimatedMinutes} min
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(z)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                        z.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      )}
                    >
                      {z.active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => openEdit(z)}
                      className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Fee calculator */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
        <p className="text-sm font-semibold text-[var(--text-1)]">Delivery Fee Calculator</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-[var(--text-3)] mb-1">Distance (km)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={calcDistance}
              onChange={e => { setCalcDistance(e.target.value); setCalcResult(null) }}
              placeholder="e.g. 3.5"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-[var(--text-3)] mb-1">Order Total</label>
            <input
              type="number"
              min={0}
              value={calcOrder}
              onChange={e => { setCalcOrder(e.target.value); setCalcResult(null) }}
              placeholder="e.g. 150000"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Calculate
            </button>
          </div>
        </div>
        {calcResult && (
          <div className={cn(
            'rounded-lg px-4 py-3 text-sm',
            calcResult.zone ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-700',
          )}>
            {calcResult.zone ? (
              <div className="space-y-1">
                <p><span className="font-medium">Zone:</span> {calcResult.zone.name}</p>
                <p>
                  <span className="font-medium">Fee:</span>{' '}
                  {calcResult.isFree
                    ? <span className="text-green-600 font-semibold">FREE</span>
                    : formatCurrency(calcResult.fee, currency)}
                </p>
                <p><span className="font-medium">Estimated time:</span> ~{calcResult.zone.estimatedMinutes} min</p>
              </div>
            ) : (
              <p>No zone covers this distance. Delivery not available.</p>
            )}
          </div>
        )}
      </div>

      {/* Zone form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text-1)]">
                {editId ? 'Edit Zone' : 'New Delivery Zone'}
              </h2>
              <button
                onClick={closeForm}
                className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-2)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Zone Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Inner City, Suburban"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Min Distance (km)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.minDistance}
                    onChange={e => setForm(f => ({ ...f, minDistance: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Max Distance (km)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.maxDistance}
                    onChange={e => setForm(f => ({ ...f, maxDistance: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Delivery Fee</label>
                  <input
                    type="number"
                    min={0}
                    value={form.fee}
                    onChange={e => setForm(f => ({ ...f, fee: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Est. Minutes</label>
                  <input
                    type="number"
                    min={1}
                    value={form.estimatedMinutes}
                    onChange={e => setForm(f => ({ ...f, estimatedMinutes: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={cn(
                    'relative w-10 h-5 rounded-full transition-colors',
                    form.active ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                      form.active ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  />
                </div>
                <span className="text-sm text-[var(--text-2)]">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={closeForm}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

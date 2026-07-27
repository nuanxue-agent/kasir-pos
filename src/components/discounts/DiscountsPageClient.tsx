'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag, Copy, Check } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface Discount {
  id: string
  name: string
  code?: string | null
  type: 'PERCENTAGE' | 'FIXED'
  value: number
  minOrder: number
  maxUses?: number | null
  usedCount: number
  active: boolean
  startsAt?: string | null
  endsAt?: string | null
}

interface DiscountsPageClientProps {
  storeId: string
  currency: string
}

export default function DiscountsPageClient({ storeId, currency }: DiscountsPageClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Discount | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['discounts', storeId],
    queryFn: () => fetch(`/api/discounts?storeId=${storeId}`).then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/discounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts', storeId] }),
  })

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Discounts</h1>
          <p className="text-stone-500 mt-1 text-sm">Manage coupon codes and promotions</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Discount
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-stone-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : discounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-stone-500">
          <Tag size={48} strokeWidth={1} className="mb-4" />
          <p>No discounts yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {discounts.map((d: Discount) => (
            <div key={d.id} className={cn(
              'bg-stone-100 rounded-xl p-4 flex items-center gap-4 border',
              d.active ? 'border-stone-200' : 'border-stone-200 opacity-60'
            )}>
              {/* Badge */}
              <div className={cn(
                'shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold',
                d.type === 'PERCENTAGE' ? 'bg-indigo-900/50 text-amber-600' : 'bg-green-900/50 text-green-400'
              )}>
                {d.type === 'PERCENTAGE' ? `${d.value}%` : `-`}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white">{d.name}</p>
                  {!d.active && <span className="text-xs bg-slate-700 text-stone-500 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-stone-500">
                  {d.code && (
                    <button
                      onClick={() => copyCode(d.code!, d.id)}
                      className="flex items-center gap-1 font-mono bg-slate-700 px-2 py-0.5 rounded hover:bg-slate-600 transition-colors"
                    >
                      {copiedId === d.id ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                      {d.code}
                    </button>
                  )}
                  {d.type === 'FIXED' && <span>{fmt(d.value)} off</span>}
                  {d.minOrder > 0 && <span>Min order {fmt(d.minOrder)}</span>}
                  {d.maxUses && <span>{d.usedCount}/{d.maxUses} used</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setEditing(d); setShowForm(true) }}
                  className="p-2 text-stone-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(d.id)}
                  className="p-2 text-stone-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DiscountFormModal
          storeId={storeId}
          currency={currency}
          discount={editing}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['discounts', storeId] })
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

// Inline form modal
function DiscountFormModal({ storeId, currency, discount, onClose, onSuccess }: {
  storeId: string
  currency: string
  discount: Discount | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    name: discount?.name ?? '',
    code: discount?.code ?? '',
    type: discount?.type ?? 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    value: discount?.value ?? 10,
    minOrder: discount?.minOrder ?? 0,
    maxUses: discount?.maxUses ?? '',
    active: discount?.active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const url = discount ? `/api/discounts/${discount.id}` : '/api/discounts'
      const method = discount ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form, maxUses: form.maxUses ? Number(form.maxUses) : null }),
      })
      if (!res.ok) { setError('Failed to save'); return }
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md border border-stone-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">{discount ? 'Edit Discount' : 'New Discount'}</h2>

        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Discount name*" className={ic} />
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="Coupon code (optional)" className={cn(ic, 'font-mono')} />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className={ic}>
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="FIXED">Fixed Amount</option>
            </select>
            <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
              placeholder={form.type === 'PERCENTAGE' ? 'e.g. 10' : 'Amount'} className={ic} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={form.minOrder} onChange={e => setForm(f => ({ ...f, minOrder: Number(e.target.value) }))}
              placeholder="Min order (0 = none)" className={ic} />
            <input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
              placeholder="Max uses (blank = ∞)" className={ic} />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="rounded" />
            Active
          </label>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-stone-200 text-stone-500 hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading || !form.name}
            className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-500 disabled:bg-slate-700 text-white text-sm font-medium transition-colors">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ic = 'w-full bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

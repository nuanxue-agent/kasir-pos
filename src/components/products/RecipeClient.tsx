'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Plus,
  X,
  ChevronDown,
  Trash2,
  Package,
  AlertTriangle,
  CheckCircle,
  PlayCircle,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface RecipeClientProps {
  storeId: string
  currency: string
  products: any[]
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const ORDER_STATUS_CONFIG: Record<string, { label: string; pill: string }> = {
  PENDING: { label: 'Menunggu', pill: 'bg-amber-50 text-amber-600 border border-amber-200' },
  IN_PROGRESS: { label: 'Diproses', pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
  COMPLETED: { label: 'Selesai', pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  CANCELLED: { label: 'Dibatalkan', pill: 'bg-red-50 text-red-500 border border-red-200' },
}

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'buah', 'lembar', 'sachet', 'bungkus']

interface Ingredient {
  ingredientProductId: string
  qty: number
  unit: string
}

function RecipeForm({
  storeId,
  products,
  recipe,
  onClose,
  onSaved,
}: {
  storeId: string
  products: any[]
  recipe?: any
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    productId: recipe?.productId ?? '',
    name: recipe?.name ?? '',
    yieldQty: recipe?.yieldQty ?? 1,
    notes: recipe?.notes ?? '',
  })
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients ?? [{ ingredientProductId: '', qty: 1, unit: 'g' }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addIngredient() {
    setIngredients(prev => [...prev, { ingredientProductId: '', qty: 1, unit: 'g' }])
  }

  function removeIngredient(i: number) {
    setIngredients(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateIngredient(i: number, field: keyof Ingredient, value: any) {
    setIngredients(prev =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing)),
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.productId) return setError('Pilih produk hasil')
    if (!form.name) return setError('Nama resep wajib diisi')
    if (ingredients.some(i => !i.ingredientProductId)) return setError('Pilih semua bahan')
    setSaving(true)
    setError('')
    try {
      const url = recipe
        ? `/api/recipes/${recipe.id}?storeId=${storeId}`
        : `/api/recipes?storeId=${storeId}`
      const res = await fetch(url, {
        method: recipe ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ingredients }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Gagal menyimpan')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Produk Hasil</label>
          <select
            className={inputCls}
            value={form.productId}
            onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
          >
            <option value="">-- Pilih Produk --</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nama Resep</label>
          <input
            className={inputCls}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nama resep"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jumlah Hasil (yield)</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={form.yieldQty}
            onChange={e => setForm(f => ({ ...f, yieldQty: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Catatan</label>
          <input
            className={inputCls}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Opsional"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[var(--text-2)]">Bahan-bahan</p>
          <button
            type="button"
            onClick={addIngredient}
            className="text-xs text-amber-600 hover:underline flex items-center gap-1"
          >
            <Plus size={12} /> Tambah Bahan
          </button>
        </div>
        <div className="space-y-2">
          {ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                className={cn(inputCls, 'flex-1')}
                value={ing.ingredientProductId}
                onChange={e => updateIngredient(i, 'ingredientProductId', e.target.value)}
              >
                <option value="">-- Bahan --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                className={cn(inputCls, 'w-24')}
                value={ing.qty}
                onChange={e => updateIngredient(i, 'qty', Number(e.target.value))}
              />
              <select
                className={cn(inputCls, 'w-24')}
                value={ing.unit}
                onChange={e => updateIngredient(i, 'unit', e.target.value)}
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button
                type="button"
                onClick={() => removeIngredient(i)}
                className="text-red-400 hover:text-red-600 shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm rounded-xl bg-amber-400 text-white font-medium hover:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

function ProductionOrderForm({
  storeId,
  recipes,
  onClose,
  onSaved,
}: {
  storeId: string
  recipes: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ recipeId: '', qty: 1 })
  const [availability, setAvailability] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function checkAvailability() {
    if (!form.recipeId) return
    setChecking(true)
    try {
      const r = await fetch(
        `/api/recipes/${form.recipeId}/availability?storeId=${storeId}&batches=${form.qty}`,
      )
      if (r.ok) setAvailability(await r.json())
    } finally {
      setChecking(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.recipeId) return setError('Pilih resep')
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/production-orders?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Gagal')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Resep</label>
        <select
          className={inputCls}
          value={form.recipeId}
          onChange={e => {
            setForm(f => ({ ...f, recipeId: e.target.value }))
            setAvailability(null)
          }}
        >
          <option value="">-- Pilih Resep --</option>
          {recipes.map((r: any) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jumlah Batch</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={form.qty}
            onChange={e => {
              setForm(f => ({ ...f, qty: Number(e.target.value) }))
              setAvailability(null)
            }}
          />
        </div>
        <button
          type="button"
          onClick={checkAvailability}
          disabled={checking || !form.recipeId}
          className="px-3 py-2.5 text-sm rounded-xl border border-amber-400 text-amber-600 hover:bg-amber-50 disabled:opacity-40"
        >
          {checking ? 'Cek...' : 'Cek Stok'}
        </button>
      </div>

      {availability && (
        <div
          className={cn(
            'rounded-xl p-3 text-sm',
            availability.canProduce
              ? 'bg-emerald-50 border border-emerald-200'
              : 'bg-red-50 border border-red-200',
          )}
        >
          <div className="flex items-center gap-2 font-medium mb-1">
            {availability.canProduce ? (
              <CheckCircle size={15} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={15} className="text-red-500" />
            )}
            {availability.canProduce ? 'Stok cukup' : 'Stok tidak cukup'}
          </div>
          {(availability.shortfalls ?? []).map((s: any) => (
            <div key={s.productId} className="text-xs text-red-600">
              {s.name}: butuh {s.required}, tersedia {s.available}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm rounded-xl bg-amber-400 text-white font-medium hover:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Membuat...' : 'Buat Order Produksi'}
        </button>
      </div>
    </form>
  )
}

export default function RecipeClient({ storeId, currency, products }: RecipeClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'recipes' | 'production'>('recipes')
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState<any>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null)

  const { data: recipes = [], isLoading } = useQuery<any[]>({
    queryKey: ['recipes', storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recipes?storeId=${storeId}`)
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['production-orders', storeId],
    enabled: tab === 'production',
    queryFn: async () => {
      const r = await fetch(`/api/production-orders?storeId=${storeId}`)
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  const { data: recipeCost } = useQuery<{ totalCost: number; costPerUnit: number } | null>({
    queryKey: ['recipe-cost', selectedRecipe?.id, storeId],
    enabled: !!selectedRecipe,
    queryFn: async () => {
      const r = await fetch(`/api/recipes/${selectedRecipe.id}/cost?storeId=${storeId}`)
      if (!r.ok) return null
      return r.json() as Promise<{ totalCost: number; costPerUnit: number }>
    },
  })

  const updateOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/production-orders/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error('Gagal update')
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production-orders', storeId] }),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-1)]">Resep & BOM</h2>
          <p className="text-sm text-[var(--text-2)] mt-0.5">Kelola resep produk dan order produksi</p>
        </div>
        <div className="flex gap-2">
          {tab === 'recipes' ? (
            <button
              onClick={() => { setEditRecipe(null); setShowRecipeForm(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 text-white text-sm font-medium hover:bg-amber-500"
            >
              <Plus size={16} /> Tambah Resep
            </button>
          ) : (
            <button
              onClick={() => setShowOrderForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 text-white text-sm font-medium hover:bg-amber-500"
            >
              <PlayCircle size={16} /> Order Produksi
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-xl w-fit">
        {(['recipes', 'production'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'recipes' ? 'Resep' : 'Produksi'}
          </button>
        ))}
      </div>

      {/* Recipe form modal */}
      {showRecipeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--text-1)]">
                {editRecipe ? 'Edit Resep' : 'Tambah Resep'}
              </h3>
              <button onClick={() => { setShowRecipeForm(false); setEditRecipe(null) }}>
                <X size={18} className="text-[var(--text-2)]" />
              </button>
            </div>
            <RecipeForm
              storeId={storeId}
              products={products}
              recipe={editRecipe}
              onClose={() => { setShowRecipeForm(false); setEditRecipe(null) }}
              onSaved={() => qc.invalidateQueries({ queryKey: ['recipes', storeId] })}
            />
          </div>
        </div>
      )}

      {/* Production order form modal */}
      {showOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--text-1)]">Order Produksi</h3>
              <button onClick={() => setShowOrderForm(false)}>
                <X size={18} className="text-[var(--text-2)]" />
              </button>
            </div>
            <ProductionOrderForm
              storeId={storeId}
              recipes={recipes}
              onClose={() => setShowOrderForm(false)}
              onSaved={() => qc.invalidateQueries({ queryKey: ['production-orders', storeId] })}
            />
          </div>
        </div>
      )}

      {/* Recipes tab */}
      {tab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-12 text-[var(--text-2)]">Memuat...</div>
            ) : (recipes as any[]).length === 0 ? (
              <div className="text-center py-12 text-[var(--text-2)]">Belum ada resep</div>
            ) : (
              (recipes as any[]).map((recipe: any) => (
                <button
                  key={recipe.id}
                  onClick={() => setSelectedRecipe(recipe)}
                  className={cn(
                    'w-full text-left p-4 rounded-2xl border transition-all',
                    selectedRecipe?.id === recipe.id
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-300',
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm text-[var(--text-1)]">{recipe.name}</p>
                      <p className="text-xs text-[var(--text-2)] mt-0.5">
                        Hasil: {recipe.yieldQty} unit •{' '}
                        {(recipe.ingredients ?? []).length} bahan
                      </p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setEditRecipe(recipe)
                        setShowRecipeForm(true)
                      }}
                      className="text-xs text-amber-600 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedRecipe && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 space-y-4">
              <h4 className="font-semibold text-[var(--text-1)]">{selectedRecipe.name}</h4>

              <div>
                <p className="text-xs font-medium text-[var(--text-2)] mb-2">Bahan-bahan</p>
                <div className="space-y-1.5">
                  {(selectedRecipe.ingredients ?? []).map((ing: any, i: number) => {
                    const prod = products.find(p => p.id === ing.ingredientProductId)
                    return (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-1)]">
                          {prod?.name ?? ing.ingredientProductId}
                        </span>
                        <span className="text-[var(--text-2)]">
                          {ing.qty} {ing.unit}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {recipeCost && (
                <div className="bg-[var(--bg-subtle)] rounded-xl p-3 space-y-1">
                  <p className="text-xs font-medium text-[var(--text-2)]">Estimasi Biaya</p>
                  <div className="flex justify-between text-sm">
                    <span>Total bahan</span>
                    <span className="font-semibold">{formatCurrency(recipeCost.totalCost ?? 0, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Per unit ({selectedRecipe.yieldQty} yield)</span>
                    <span className="font-semibold text-amber-600">
                      {formatCurrency(recipeCost.costPerUnit ?? 0, currency)}
                    </span>
                  </div>
                </div>
              )}

              {selectedRecipe.notes && (
                <p className="text-xs text-[var(--text-2)]">{selectedRecipe.notes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Production orders tab */}
      {tab === 'production' && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden">
          {ordersLoading ? (
            <div className="text-center py-12 text-[var(--text-2)]">Memuat...</div>
          ) : (orders as any[]).length === 0 ? (
            <div className="text-center py-12 text-[var(--text-2)]">Belum ada order produksi</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">Resep</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">Dibuat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(orders as any[]).map((order: any) => (
                  <tr key={order.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                      {order.recipeName ?? order.recipeId}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{order.qty}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          ORDER_STATUS_CONFIG[order.status]?.pill,
                        )}
                      >
                        {ORDER_STATUS_CONFIG[order.status]?.label ?? order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      {order.createdAt?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => updateOrderStatus.mutate({ id: order.id, status: 'IN_PROGRESS' })}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Proses
                          </button>
                        )}
                        {order.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() => updateOrderStatus.mutate({ id: order.id, status: 'COMPLETED' })}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Selesai
                          </button>
                        )}
                        {(order.status === 'PENDING' || order.status === 'IN_PROGRESS') && (
                          <button
                            onClick={() => updateOrderStatus.mutate({ id: order.id, status: 'CANCELLED' })}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Batal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

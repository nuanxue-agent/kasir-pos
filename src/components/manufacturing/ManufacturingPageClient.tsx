'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Factory, Cog, Settings, CheckCircle2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ManufacturingPageClientProps {
  storeId: string
  currency: string
}

const ic = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'
const labelCls = 'text-xs font-semibold text-[var(--text-2)] mb-1.5 block'

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT:       { label: 'Draft',       cls: 'bg-[var(--bg-muted)] text-[var(--text-2)]' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  COMPLETED:   { label: 'Completed',   cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED:   { label: 'Cancelled',   cls: 'bg-red-100 text-red-600' },
}

function nextStatus(current: string): string | null {
  if (current === 'DRAFT') return 'IN_PROGRESS'
  if (current === 'IN_PROGRESS') return 'COMPLETED'
  return null
}

// ── BOM Form Modal ─────────────────────────────────────────────────────────────
function BOMFormModal({ storeId, onClose, onSaved }: {
  storeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    outputProductId: '',
    outputQty: 1,
    unit: 'pcs',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: productsRaw } = useQuery({
    queryKey: ['products', storeId],
    queryFn: () => fetch(`/api/products?storeId=${storeId}`).then(r => r.json()),
  })
  const products: any[] = (productsRaw as any) ?? []

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) return setError('Name is required')
    if (!form.outputProductId) return setError('Output product is required')
    setSaving(true)
    const res = await fetch(`/api/bom?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, outputQty: Number(form.outputQty), storeId }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = await res.json() as any
      setError(d.error ?? 'Failed to save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full sm:max-w-lg sm:rounded-xl rounded-t-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text-1)]">New Bill of Materials</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
          <div>
            <label className={labelCls}>Name *</label>
            <input value={form.name} onChange={set('name')} className={ic} placeholder="e.g. Chocolate Cake BOM" />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2} className={ic} placeholder="Optional notes…" />
          </div>
          <div>
            <label className={labelCls}>Output Product *</label>
            <select value={form.outputProductId} onChange={set('outputProductId')} className={ic}>
              <option value="">— Select product —</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Output Qty *</label>
              <input type="number" min={0.01} step={0.01} value={form.outputQty}
                onChange={set('outputQty')} className={ic} placeholder="1" />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input value={form.unit} onChange={set('unit')} className={ic} placeholder="pcs" />
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : 'Create BOM'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Work Order Form Modal ──────────────────────────────────────────────────────
function WorkOrderFormModal({ storeId, onClose, onSaved }: {
  storeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    bomId: '',
    plannedQty: 1,
    plannedStart: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: bomsRaw } = useQuery({
    queryKey: ['bom', storeId],
    queryFn: () => fetch(`/api/bom?storeId=${storeId}`).then(r => r.json()),
  })
  const boms: any[] = (bomsRaw as any) ?? []

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.bomId) return setError('BOM is required')
    if (!form.plannedQty || Number(form.plannedQty) <= 0) return setError('Planned qty must be > 0')
    setSaving(true)
    const res = await fetch(`/api/work-orders?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        plannedQty: Number(form.plannedQty),
        plannedStart: form.plannedStart || null,
        storeId,
      }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = await res.json() as any
      setError(d.error ?? 'Failed to save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full sm:max-w-lg sm:rounded-xl rounded-t-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text-1)]">New Work Order</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
          <div>
            <label className={labelCls}>Bill of Materials *</label>
            <select value={form.bomId} onChange={set('bomId')} className={ic}>
              <option value="">— Select BOM —</option>
              {boms.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Planned Qty *</label>
            <input type="number" min={1} step={1} value={form.plannedQty}
              onChange={set('plannedQty')} className={ic} placeholder="1" />
          </div>
          <div>
            <label className={labelCls}>Planned Start Date</label>
            <input type="date" value={form.plannedStart} onChange={set('plannedStart')} className={ic} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={ic} placeholder="Optional notes…" />
          </div>
        </div>
        <div className="border-t border-[var(--border)] p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : 'Create Work Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BOM Tab ────────────────────────────────────────────────────────────────────
function BOMTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: bomsRaw, isLoading } = useQuery({
    queryKey: ['bom', storeId],
    queryFn: () => fetch(`/api/bom?storeId=${storeId}`).then(r => r.json()),
  })
  const boms: any[] = (bomsRaw as any) ?? []

  const refresh = () => {
    setShowForm(false)
    qc.invalidateQueries({ queryKey: ['bom', storeId] })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[var(--text-2)] text-sm">{boms.length} BOM{boms.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>New BOM</span>
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />
          ))}
        </div>
      ) : boms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
          <Settings className="h-12 w-12 text-stone-200 mb-3" />
          <p className="text-[var(--text-3)] text-sm font-medium">No Bills of Materials yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-amber-500 text-sm font-medium hover:text-amber-600 transition-colors"
          >
            + Create your first BOM
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {boms.map((bom: any) => (
            <div key={bom.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Settings className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-1)] truncate">{bom.name}</p>
                    <p className="text-xs text-[var(--text-3)] mt-0.5">
                      Output: <span className="text-[var(--text-2)]">{bom.outputQty} {bom.unit}</span>
                    </p>
                  </div>
                </div>
                <span className={cn(
                  'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full',
                  bom.active !== false
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-[var(--bg-muted)] text-[var(--text-2)]'
                )}>
                  {bom.active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              {bom.description && (
                <p className="text-xs text-[var(--text-3)] mt-2 line-clamp-2">{bom.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <BOMFormModal storeId={storeId} onClose={() => setShowForm(false)} onSaved={refresh} />
      )}
    </>
  )
}

// ── Work Orders Tab ────────────────────────────────────────────────────────────
function WorkOrdersTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data: ordersRaw, isLoading } = useQuery({
    queryKey: ['work-orders', storeId],
    queryFn: () => fetch(`/api/work-orders?storeId=${storeId}`).then(r => r.json()),
  })
  const orders: any[] = (ordersRaw as any) ?? []

  const refresh = () => {
    setShowForm(false)
    qc.invalidateQueries({ queryKey: ['work-orders', storeId] })
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    await fetch(`/api/work-orders/${id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setUpdatingId(null)
    qc.invalidateQueries({ queryKey: ['work-orders', storeId] })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[var(--text-2)] text-sm">{orders.length} work order{orders.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>New Work Order</span>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
          <Cog className="h-12 w-12 text-stone-200 mb-3" />
          <p className="text-[var(--text-3)] text-sm font-medium">No work orders yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-amber-500 text-sm font-medium hover:text-amber-600 transition-colors"
          >
            + Create your first work order
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => {
            const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.DRAFT
            const next = nextStatus(order.status)
            const isUpdating = updatingId === order.id
            return (
              <div key={order.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Cog className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-1)] truncate">
                        {order.bom?.name ?? 'Work Order'}
                      </p>
                      <p className="text-xs text-[var(--text-3)] mt-0.5">
                        Qty: <span className="text-[var(--text-2)]">{order.plannedQty}</span>
                        {order.plannedStart && (
                          <> · Start: <span className="text-[var(--text-2)]">{new Date(order.plannedStart).toLocaleDateString()}</span></>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className={cn('shrink-0 text-xs font-medium px-2.5 py-1 rounded-full', statusCfg.cls)}>
                    {statusCfg.label}
                  </span>
                </div>

                {order.notes && (
                  <p className="text-xs text-[var(--text-3)] mt-2 ml-13 line-clamp-2">{order.notes}</p>
                )}

                {/* Action buttons */}
                {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-50">
                    {next && (
                      <button
                        onClick={() => updateStatus(order.id, next)}
                        disabled={isUpdating}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {STATUS_CONFIG[next]?.label}
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(order.id, 'CANCELLED')}
                      disabled={isUpdating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <WorkOrderFormModal storeId={storeId} onClose={() => setShowForm(false)} onSaved={refresh} />
      )}
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function ManufacturingPageClient({ storeId, currency }: ManufacturingPageClientProps) {
  const [tab, setTab] = useState<'bom' | 'work-orders'>('bom')

  const tabs = [
    { id: 'bom' as const,         label: 'Bill of Materials', icon: Settings },
    { id: 'work-orders' as const, label: 'Work Orders',       icon: Cog },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <Factory className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Manufacturing</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Manage production and bills of materials</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--bg-muted)] p-1 rounded-xl w-fit">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                tab === t.id
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'bom'         && <BOMTab storeId={storeId} />}
      {tab === 'work-orders' && <WorkOrdersTab storeId={storeId} />}
    </div>
  )
}

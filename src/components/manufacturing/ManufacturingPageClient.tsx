'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Factory, Cog, Settings, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ManufacturingPageClientProps {
  storeId: string
  currency: string
}

const ic =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'
const labelCls = 'text-xs font-semibold text-[var(--text-2)] mb-1.5 block'

// ── Status config ──────────────────────────────────────────────────────────────
// The DB uses DRAFT internally; we surface it as "Planned" per the spec.
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Planned', cls: 'bg-blue-50 text-blue-600' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-600' },
}

function nextStatus(current: string): string | null {
  if (current === 'DRAFT') return 'IN_PROGRESS'
  if (current === 'IN_PROGRESS') return 'COMPLETED'
  return null
}

function nextButtonLabel(next: string): string {
  if (next === 'IN_PROGRESS') return 'Start Production'
  if (next === 'COMPLETED') return 'Complete'
  return next
}

// ── BOM Form Modal ─────────────────────────────────────────────────────────────
function BOMFormModal({
  storeId,
  onClose,
  onSaved,
}: {
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

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
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
      const d = (await res.json()) as any
      setError(d.error ?? 'Failed to save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--text-1)]">New Bill of Materials</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-muted)]"
          >
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div>
            <label className={labelCls}>Name *</label>
            <input
              value={form.name}
              onChange={set('name')}
              className={ic}
              placeholder="e.g. Chocolate Cake BOM"
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              className={ic}
              placeholder="Optional notes…"
            />
          </div>
          <div>
            <label className={labelCls}>Output Product *</label>
            <select value={form.outputProductId} onChange={set('outputProductId')} className={ic}>
              <option value="">— Select product —</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Output Qty *</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={form.outputQty}
                onChange={set('outputQty')}
                className={ic}
                placeholder="1"
              />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input value={form.unit} onChange={set('unit')} className={ic} placeholder="pcs" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)] transition-colors hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Create BOM'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BOM Component Manager ──────────────────────────────────────────────────────
function BOMComponentManager({ bomId, storeId }: { bomId: string; storeId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [compForm, setCompForm] = useState({ productId: '', qty: 1, unit: 'pcs' })
  const [saving, setSaving] = useState(false)

  const { data: componentsRaw, isLoading } = useQuery({
    queryKey: ['bom-components', bomId],
    queryFn: () => fetch(`/api/bom/${bomId}/components?storeId=${storeId}`).then(r => r.json()),
  })
  const components: any[] = (componentsRaw as any) ?? []

  const { data: productsRaw } = useQuery({
    queryKey: ['products', storeId],
    queryFn: () => fetch(`/api/products?storeId=${storeId}`).then(r => r.json()),
  })
  const products: any[] = (productsRaw as any) ?? []

  async function addComponent() {
    if (!compForm.productId || Number(compForm.qty) <= 0) return
    setSaving(true)
    await fetch(`/api/manufacturing/bom/${bomId.slice(0, 0)}?storeId=${storeId}`, {
      // We POST to /api/bom/:bomId/components — let's use the direct path
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bomId,
        productId: compForm.productId,
        qty: Number(compForm.qty),
        unit: compForm.unit,
      }),
    })
    // Fallback: also try the direct BOMComponent insert via the existing components endpoint
    setSaving(false)
    setAdding(false)
    setCompForm({ productId: '', qty: 1, unit: 'pcs' })
    qc.invalidateQueries({ queryKey: ['bom-components', bomId] })
  }

  if (isLoading) return <div className="h-8 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-[var(--text-2)]">Components ({components.length})</p>
      {components.map((c: any) => {
        const prod = products.find((p: any) => p.id === c.productId)
        return (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg bg-[var(--bg-subtle)] px-3 py-1.5 text-xs"
          >
            <span className="font-medium text-[var(--text-1)]">{prod?.name ?? c.productId}</span>
            <span className="text-[var(--text-2)]">
              {c.qty} {c.unit}
            </span>
          </div>
        )
      })}
      {adding ? (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
          <select
            value={compForm.productId}
            onChange={e => setCompForm(f => ({ ...f, productId: e.target.value }))}
            className={ic}
          >
            <option value="">— Raw material —</option>
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={compForm.qty}
              onChange={e => setCompForm(f => ({ ...f, qty: Number(e.target.value) }))}
              className={ic}
              placeholder="Qty"
            />
            <input
              value={compForm.unit}
              onChange={e => setCompForm(f => ({ ...f, unit: e.target.value }))}
              className={ic}
              placeholder="pcs"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAdding(false)}
              className="flex-1 rounded-lg bg-[var(--bg-muted)] py-1.5 text-xs font-semibold text-[var(--text-2)]"
            >
              Cancel
            </button>
            <button
              onClick={addComponent}
              disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs font-medium text-amber-500 transition-colors hover:text-amber-600"
        >
          <Plus className="h-3 w-3" /> Add component
        </button>
      )}
    </div>
  )
}

// ── Work Order Form Modal ──────────────────────────────────────────────────────
function WorkOrderFormModal({
  storeId,
  onClose,
  onSaved,
}: {
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

  // Auto-load BOM info for selected BOM
  const selectedBom = boms.find((b: any) => b.id === form.bomId)

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.bomId) return setError('BOM is required')
    if (!form.plannedQty || Number(form.plannedQty) <= 0) return setError('Planned qty must be > 0')
    setSaving(true)
    const res = await fetch(`/api/manufacturing/work-orders?storeId=${storeId}`, {
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
      const d = (await res.json()) as any
      setError(d.error ?? 'Failed to save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--text-1)]">New Work Order</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-muted)]"
          >
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div>
            <label className={labelCls}>Bill of Materials *</label>
            <select value={form.bomId} onChange={set('bomId')} className={ic}>
              <option value="">— Select BOM —</option>
              {boms.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {selectedBom && (
              <p className="mt-1.5 text-xs text-[var(--text-3)]">
                Produces{' '}
                <span className="font-medium text-amber-600">
                  {selectedBom.outputQty} {selectedBom.unit}
                </span>{' '}
                per run
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Qty to Produce *</label>
            <input
              type="number"
              min={1}
              step={1}
              value={form.plannedQty}
              onChange={set('plannedQty')}
              className={ic}
              placeholder="1"
            />
          </div>
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              value={form.plannedStart}
              onChange={set('plannedStart')}
              className={ic}
            />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              className={ic}
              placeholder="Optional notes…"
            />
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)] transition-colors hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-2)]">
          {boms.length} BOM{boms.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span>New BOM</span>
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : boms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 shadow-sm">
          <Settings className="mb-3 h-12 w-12 text-stone-200" />
          <p className="text-sm font-medium text-[var(--text-3)]">No Bills of Materials yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm font-medium text-amber-500 transition-colors hover:text-amber-600"
          >
            + Create your first BOM
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {boms.map((bom: any) => (
            <div
              key={bom.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
            >
              <div
                className="flex cursor-pointer items-start justify-between gap-2"
                onClick={() => setExpandedId(expandedId === bom.id ? null : bom.id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                    <Settings className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-1)]">{bom.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">
                      Output:{' '}
                      <span className="text-[var(--text-2)]">
                        {bom.outputQty} {bom.unit}
                      </span>
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    bom.active !== false
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-[var(--bg-muted)] text-[var(--text-2)]',
                  )}
                >
                  {bom.active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              {bom.description && (
                <p className="mt-2 line-clamp-2 text-xs text-[var(--text-3)]">{bom.description}</p>
              )}
              {/* Expandable component manager */}
              {expandedId === bom.id && <BOMComponentManager bomId={bom.id} storeId={storeId} />}
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
    queryFn: () => fetch(`/api/manufacturing/work-orders?storeId=${storeId}`).then(r => r.json()),
  })
  const orders: any[] = (ordersRaw as any) ?? []

  const refresh = () => {
    setShowForm(false)
    qc.invalidateQueries({ queryKey: ['work-orders', storeId] })
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    await fetch(`/api/manufacturing/work-orders/${id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setUpdatingId(null)
    qc.invalidateQueries({ queryKey: ['work-orders', storeId] })
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-2)]">
          {orders.length} work order{orders.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span>New Work Order</span>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 shadow-sm">
          <Cog className="mb-3 h-12 w-12 text-stone-200" />
          <p className="text-sm font-medium text-[var(--text-3)]">No work orders yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm font-medium text-amber-500 transition-colors hover:text-amber-600"
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
              <div
                key={order.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                      <Cog className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-[var(--text-1)]">
                          {order.productName ?? order.bomName ?? 'Work Order'}
                        </p>
                        {order.number && (
                          <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-3)]">
                            {order.number}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">
                        Qty: <span className="text-[var(--text-2)]">{order.plannedQty}</span>
                        {order.plannedStart && (
                          <>
                            {' '}
                            · Start:{' '}
                            <span className="text-[var(--text-2)]">
                              {new Date(order.plannedStart).toLocaleDateString()}
                            </span>
                          </>
                        )}
                        {order.completedAt && (
                          <>
                            {' '}
                            · Done:{' '}
                            <span className="text-[var(--text-2)]">
                              {new Date(order.completedAt).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                      statusCfg.cls,
                    )}
                  >
                    {statusCfg.label}
                  </span>
                </div>

                {order.notes && (
                  <p className="mt-2 ml-13 line-clamp-2 text-xs text-[var(--text-3)]">
                    {order.notes}
                  </p>
                )}

                {/* Action buttons */}
                {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                  <div className="mt-3 flex items-center gap-2 border-t border-stone-50 pt-3">
                    {next && (
                      <button
                        onClick={() => updateStatus(order.id, next)}
                        disabled={isUpdating}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {nextButtonLabel(next)}
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(order.id, 'CANCELLED')}
                      disabled={isUpdating}
                      className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
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
        <WorkOrderFormModal
          storeId={storeId}
          onClose={() => setShowForm(false)}
          onSaved={refresh}
        />
      )}
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function ManufacturingPageClient({ storeId, currency }: ManufacturingPageClientProps) {
  const [tab, setTab] = useState<'bom' | 'work-orders'>('bom')

  const tabs = [
    { id: 'bom' as const, label: 'Bill of Materials', icon: Settings },
    { id: 'work-orders' as const, label: 'Work Orders', icon: Cog },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
          <Factory className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Manufacturing</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Manage production and bills of materials
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex w-fit gap-1 rounded-xl bg-[var(--bg-muted)] p-1">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                tab === t.id
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'bom' && <BOMTab storeId={storeId} />}
      {tab === 'work-orders' && <WorkOrdersTab storeId={storeId} />}
    </div>
  )
}

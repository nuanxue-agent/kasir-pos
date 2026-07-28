'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Package, Layers, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface KittingClientProps {
  storeId: string
  currency?: string
  initialKits?: any[]
  products?: any[]
}

type Tab = 'kits' | 'jobs'
type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: <Clock className="h-3 w-3" /> },
  IN_PROGRESS: { label: 'In Progress', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: <Loader2 className="h-3 w-3" /> },
  COMPLETED: { label: 'Completed', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  CANCELLED: { label: 'Cancelled', color: 'text-gray-500 bg-gray-50 border-gray-200', icon: <X className="h-3 w-3" /> },
}

// ── Pure business logic exports (for unit tests) ──────────────────────────────

/** Check if enough stock exists to assemble N kits */
export function checkFeasibility(
  components: Array<{ componentProductId: string; requiredQty: number }>,
  stock: Record<string, number>,
  targetQty: number,
): { feasible: boolean; shortage: Array<{ productId: string; required: number; available: number }> } {
  const shortage: Array<{ productId: string; required: number; available: number }> = []
  for (const c of components) {
    const needed = c.requiredQty * targetQty
    const available = stock[c.componentProductId] ?? 0
    if (available < needed) {
      shortage.push({ productId: c.componentProductId, required: needed, available })
    }
  }
  return { feasible: shortage.length === 0, shortage }
}

/** Calculate max assemblable quantity given component stock */
export function calcMaxAssemblable(
  components: Array<{ componentProductId: string; requiredQty: number }>,
  stock: Record<string, number>,
): number {
  if (components.length === 0) return 0
  return Math.floor(
    Math.min(...components.map(c => (stock[c.componentProductId] ?? 0) / c.requiredQty)),
  )
}

/** Calculate total component cost for N kits */
export function calcKitCost(
  components: Array<{ componentProductId: string; requiredQty: number }>,
  costs: Record<string, number>,
  targetQty: number,
): number {
  return components.reduce((sum, c) => sum + (costs[c.componentProductId] ?? 0) * c.requiredQty * targetQty, 0)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KittingClient({ storeId, currency = 'IDR', initialKits = [], products = [] }: KittingClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('kits')
  const [showCreateKit, setShowCreateKit] = useState(false)
  const [expandedKit, setExpandedKit] = useState<string | null>(null)
  const [showCreateJob, setShowCreateJob] = useState(false)

  // ── Kits ──────────────────────────────────────────────────────────────────

  const { data: kits = initialKits } = useQuery({
    queryKey: ['kits', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/kits?storeId=${storeId}`)
      return await res.json() as any
    },
    initialData: initialKits,
  })

  // ── Assembly Jobs ─────────────────────────────────────────────────────────

  const { data: jobs = [] } = useQuery({
    queryKey: ['assembly-jobs', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/assembly-jobs?storeId=${storeId}`)
      return await res.json() as any
    },
    enabled: tab === 'jobs',
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Kitting & Assembly</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Manage kits and run assembly jobs</p>
        </div>
        <button
          onClick={() => tab === 'kits' ? setShowCreateKit(true) : setShowCreateJob(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {tab === 'kits' ? 'New Kit' : 'New Job'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['kits', 'jobs'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'kits' ? (
              <span className="flex items-center gap-2"><Package className="h-4 w-4" />Kits</span>
            ) : (
              <span className="flex items-center gap-2"><Layers className="h-4 w-4" />Assembly Jobs</span>
            )}
          </button>
        ))}
      </div>

      {/* Kits Tab */}
      {tab === 'kits' && (
        <div className="space-y-3">
          {kits.length === 0 ? (
            <EmptyState icon={<Package className="h-10 w-10" />} message="No kits yet. Create a kit to define assembly recipes." />
          ) : (
            kits.map((kit: any) => (
              <KitCard
                key={kit.id}
                kit={kit}
                storeId={storeId}
                currency={currency}
                products={products}
                expanded={expandedKit === kit.id}
                onToggle={() => setExpandedKit(expandedKit === kit.id ? null : kit.id)}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['kits', storeId] })}
              />
            ))
          )}
        </div>
      )}

      {/* Jobs Tab */}
      {tab === 'jobs' && (
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <EmptyState icon={<Layers className="h-10 w-10" />} message="No assembly jobs yet." />
          ) : (
            jobs.map((job: any) => (
              <JobCard
                key={job.id}
                job={job}
                storeId={storeId}
                currency={currency}
                kits={kits}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['assembly-jobs', storeId] })}
              />
            ))
          )}
        </div>
      )}

      {/* Create Kit Modal */}
      {showCreateKit && (
        <CreateKitModal
          storeId={storeId}
          products={products}
          onClose={() => setShowCreateKit(false)}
          onSaved={() => {
            setShowCreateKit(false)
            qc.invalidateQueries({ queryKey: ['kits', storeId] })
          }}
        />
      )}

      {/* Create Job Modal */}
      {showCreateJob && (
        <CreateJobModal
          storeId={storeId}
          kits={kits}
          products={products}
          onClose={() => setShowCreateJob(false)}
          onSaved={() => {
            setShowCreateJob(false)
            qc.invalidateQueries({ queryKey: ['assembly-jobs', storeId] })
          }}
        />
      )}
    </div>
  )
}

// ── Kit Card ──────────────────────────────────────────────────────────────────

function KitCard({
  kit, storeId, currency, products, expanded, onToggle, onRefresh,
}: {
  kit: any
  storeId: string
  currency: string
  products: any[]
  expanded: boolean
  onToggle: () => void
  onRefresh: () => void
}) {
  const { data: components = [], isLoading } = useQuery({
    queryKey: ['kit-components', kit.id],
    queryFn: async () => {
      const res = await fetch(`/api/kits/${kit.id}/components?storeId=${storeId}`)
      return await res.json() as any
    },
    enabled: expanded,
  })

  const { data: feasibility } = useQuery({
    queryKey: ['kit-feasibility', kit.id],
    queryFn: async () => {
      const res = await fetch(`/api/kits/${kit.id}/feasibility?storeId=${storeId}`)
      return await res.json() as any
    },
    enabled: expanded,
  })

  const productMap = Object.fromEntries(products.map((p: any) => [p.id, p]))

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--bg-2)] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-[var(--primary)] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[var(--text-1)]">{kit.name}</p>
            <p className="text-xs text-[var(--text-3)]">
              Output: {kit.outputProductName ?? kit.outputProductId} × {kit.outputQty}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {feasibility && (
            <span className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
              feasibility.feasible
                ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                : 'text-red-600 bg-red-50 border-red-200',
            )}>
              {feasibility.feasible ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {feasibility.feasible ? 'Can Assemble' : 'Short Stock'}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-[var(--text-3)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
            </div>
          ) : components.length === 0 ? (
            <p className="text-sm text-[var(--text-3)] text-center py-4">No components defined yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Components Required</p>
              {components.map((comp: any) => {
                const product = productMap[comp.componentProductId]
                const stock = product?.stock ?? 0
                const sufficient = stock >= comp.requiredQty
                return (
                  <div key={comp.id} className="flex items-center justify-between rounded-lg bg-[var(--bg-2)] px-3 py-2">
                    <span className="text-sm text-[var(--text-1)]">{product?.name ?? comp.componentProductId}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--text-3)]">Need: {comp.requiredQty}</span>
                      <span className={cn('font-medium', sufficient ? 'text-emerald-600' : 'text-red-600')}>
                        Stock: {stock}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {feasibility?.maxAssemblable !== undefined && (
            <div className="rounded-lg bg-[var(--bg-2)] px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-[var(--text-3)]">Max assemblable</span>
              <span className="font-semibold text-[var(--text-1)]">{feasibility.maxAssemblable} unit(s)</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({
  job, storeId, currency, kits, onRefresh,
}: {
  job: any
  storeId: string
  currency: string
  kits: any[]
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const status = job.status as JobStatus
  const cfg = JOB_STATUS_CONFIG[status] ?? JOB_STATUS_CONFIG.PENDING
  const kit = kits.find((k: any) => k.id === job.kitId)

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/assembly-jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, storeId }),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return }
      toast.success('Job updated')
      onRefresh()
    },
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-[var(--primary)] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[var(--text-1)]">{kit?.name ?? job.kitId}</p>
            <p className="text-xs text-[var(--text-3)]">
              Qty: {job.targetQty} · Created {job.createdAt?.slice(0, 10)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
            {cfg.icon}{cfg.label}
          </span>
          {status === 'PENDING' && (
            <button
              onClick={() => updateStatus.mutate('IN_PROGRESS')}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Start
            </button>
          )}
          {status === 'IN_PROGRESS' && (
            <button
              onClick={() => updateStatus.mutate('COMPLETED')}
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Complete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create Kit Modal ──────────────────────────────────────────────────────────

function CreateKitModal({
  storeId, products, onClose, onSaved,
}: {
  storeId: string
  products: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [outputProductId, setOutputProductId] = useState('')
  const [outputQty, setOutputQty] = useState(1)
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!outputProductId) { toast.error('Output product is required'); return }
    setSaving(true)
    const res = await fetch(`/api/kits?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, outputProductId, outputQty, instructions }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Kit created')
    onSaved()
  }

  return (
    <Modal title="Create Kit" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Kit Name">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Gift Basket Kit"
          />
        </FormField>
        <FormField label="Output Product">
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            value={outputProductId}
            onChange={e => setOutputProductId(e.target.value)}
          >
            <option value="">Select product…</option>
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Output Qty">
          <input
            type="number"
            min={1}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            value={outputQty}
            onChange={e => setOutputQty(Number(e.target.value))}
          />
        </FormField>
        <FormField label="Instructions (optional)">
          <textarea
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] resize-none"
            rows={3}
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="Assembly instructions…"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-2)]">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Kit
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Create Job Modal ──────────────────────────────────────────────────────────

function CreateJobModal({
  storeId, kits, products, onClose, onSaved,
}: {
  storeId: string
  kits: any[]
  products: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const [kitId, setKitId] = useState('')
  const [targetQty, setTargetQty] = useState(1)
  const [saving, setSaving] = useState(false)

  const { data: feasibility } = useQuery({
    queryKey: ['kit-feasibility-modal', kitId],
    queryFn: async () => {
      const res = await fetch(`/api/kits/${kitId}/feasibility?storeId=${storeId}`)
      return await res.json() as any
    },
    enabled: !!kitId,
  })

  const handleSave = async () => {
    if (!kitId) { toast.error('Select a kit'); return }
    setSaving(true)
    const res = await fetch(`/api/assembly-jobs?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kitId, targetQty }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Assembly job created')
    onSaved()
  }

  return (
    <Modal title="New Assembly Job" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Kit">
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            value={kitId}
            onChange={e => setKitId(e.target.value)}
          >
            <option value="">Select kit…</option>
            {kits.map((k: any) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Target Qty">
          <input
            type="number"
            min={1}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            value={targetQty}
            onChange={e => setTargetQty(Number(e.target.value))}
          />
        </FormField>

        {kitId && feasibility && (
          <div className={cn(
            'rounded-lg border p-3 text-sm',
            feasibility.feasible
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700',
          )}>
            {feasibility.feasible
              ? `✓ Sufficient stock (max: ${feasibility.maxAssemblable} units)`
              : `⚠ Insufficient stock for ${targetQty} unit(s)`}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-2)]">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Job
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold text-[var(--text-1)]">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-2)]">
            <X className="h-4 w-4 text-[var(--text-3)]" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--text-3)]">{label}</label>
      {children}
    </div>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
      <div className="text-[var(--text-3)] mb-3">{icon}</div>
      <p className="text-sm text-[var(--text-3)]">{message}</p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users, ChevronDown, ChevronRight, Building2, UserCircle2,
  Briefcase, TrendingUp, Plus, X, Edit2, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgNode {
  id: string
  storeId: string
  employeeId: string | null
  managerId: string | null
  title: string
  department: string
  level: number
  active: number
  employeeName: string | null
  employeeRole: string | null
  salary: number | null
  children: OrgNode[]
  spanOfControl: number
}

interface DeptSummary {
  department: string
  headcount: number
  avgSalary: number
  openPositions: number
}

interface OrgChartResponse {
  tree: OrgNode[]
  deptSummary: DeptSummary[]
  total: number
}

interface OrgChartClientProps {
  storeId: string
  employees: Array<{ id: string; name: string; role: string }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const btnSecondary =
  'inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-1)] text-sm font-medium rounded-xl border border-[var(--border)] transition-colors'

const DEPT_COLORS: Record<string, string> = {
  Operasional: 'bg-blue-100 text-blue-700',
  Keuangan: 'bg-emerald-100 text-emerald-700',
  Pemasaran: 'bg-purple-100 text-purple-700',
  SDM: 'bg-amber-100 text-amber-700',
  IT: 'bg-cyan-100 text-cyan-700',
  Umum: 'bg-stone-100 text-stone-600',
}

function deptColor(dept: string) {
  return DEPT_COLORS[dept] ?? 'bg-stone-100 text-stone-600'
}

function fmtCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

// ─── OrgNodeCard ──────────────────────────────────────────────────────────────

function OrgNodeCard({
  node,
  expanded,
  onToggle,
  onEdit,
  depth,
}: {
  node: OrgNode
  expanded: boolean
  onToggle: () => void
  onEdit: (node: OrgNode) => void
  depth: number
}) {
  const hasChildren = node.children.length > 0
  const isOpen = !node.employeeId

  return (
    <div className={cn('flex flex-col items-center', depth > 0 && 'mt-6')}>
      {/* Card */}
      <div
        className={cn(
          'relative w-52 rounded-2xl border bg-[var(--bg-card)] shadow-sm transition-shadow hover:shadow-md',
          isOpen ? 'border-dashed border-amber-300' : 'border-[var(--border)]',
        )}
      >
        {/* Header strip */}
        <div className={cn('rounded-t-2xl px-3 py-1.5 text-xs font-medium', deptColor(node.department))}>
          {node.department || 'Umum'}
        </div>

        {/* Body */}
        <div className="px-3 py-3 space-y-1">
          <p className="text-sm font-semibold text-[var(--text-1)] leading-tight">{node.title}</p>
          {node.employeeName ? (
            <p className="text-xs text-[var(--text-2)] flex items-center gap-1">
              <UserCircle2 size={12} className="shrink-0" />
              {node.employeeName}
            </p>
          ) : (
            <p className="text-xs text-amber-500 italic">Posisi kosong</p>
          )}
          {node.spanOfControl > 0 && (
            <p className="text-xs text-[var(--text-3)] flex items-center gap-1">
              <Users size={11} className="shrink-0" />
              {node.spanOfControl} laporan langsung
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={() => onEdit(node)}
            className="p-1 rounded-lg hover:bg-[var(--bg-3)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
            title="Edit posisi"
          >
            <Edit2 size={12} />
          </button>
        </div>

        {/* Expand toggle */}
        {hasChildren && (
          <button
            onClick={onToggle}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm hover:bg-amber-600 transition-colors"
            title={expanded ? 'Sembunyikan' : 'Tampilkan bawahan'}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-6 flex flex-wrap gap-6 justify-center">
          {/* Connector line */}
          <div className="absolute w-px bg-[var(--border)]" style={{ height: 24, marginTop: -24 }} />
          {node.children.map((child) => (
            <OrgSubtree key={child.id} node={child} depth={depth + 1} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── OrgSubtree (recursive) ────────────────────────────────────────────────────

function OrgSubtree({
  node,
  depth,
  onEdit,
}: {
  node: OrgNode
  depth: number
  onEdit: (node: OrgNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  return (
    <OrgNodeCard
      node={node}
      expanded={expanded}
      onToggle={() => setExpanded((p) => !p)}
      onEdit={onEdit}
      depth={depth}
    />
  )
}

// ─── AddPositionModal ─────────────────────────────────────────────────────────

function AddPositionModal({
  storeId,
  employees,
  positions,
  onClose,
  onSaved,
}: {
  storeId: string
  employees: Array<{ id: string; name: string; role: string }>
  positions: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: '',
    department: '',
    employeeId: '',
    managerId: '',
    level: '0',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title) return
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/org-positions?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          department: form.department,
          employeeId: form.employeeId || null,
          managerId: form.managerId || null,
          level: Number(form.level),
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Posisi ditambahkan')
      onSaved()
      onClose()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text-1)]">Tambah Posisi</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-3)] transition-colors">
            <X size={16} className="text-[var(--text-2)]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jabatan *</label>
            <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="mis. Manajer Operasional" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Departemen</label>
            <input className={inputCls} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="mis. Operasional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Karyawan</label>
            <select className={inputCls} value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">— Posisi kosong —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Atasan (Manajer)</label>
            <select className={inputCls} value={form.managerId} onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}>
              <option value="">— Tidak ada atasan —</option>
              {positions.map((pos) => (
                <option key={pos.id} value={pos.id}>{pos.title} {pos.employeeName ? `(${pos.employeeName})` : '(kosong)'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Level Hierarki</label>
            <input type="number" min={0} max={10} className={inputCls} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Batal</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Menyimpan...' : <><Check size={14} /> Simpan</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── EditPositionModal ────────────────────────────────────────────────────────

function EditPositionModal({
  storeId,
  node,
  employees,
  positions,
  onClose,
  onSaved,
}: {
  storeId: string
  node: OrgNode
  employees: Array<{ id: string; name: string; role: string }>
  positions: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: node.title,
    department: node.department,
    employeeId: node.employeeId ?? '',
    managerId: node.managerId ?? '',
    level: String(node.level),
    active: node.active === 1,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/org-positions/${node.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          department: form.department,
          employeeId: form.employeeId || null,
          managerId: form.managerId || null,
          level: Number(form.level),
          active: form.active,
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Posisi diperbarui')
      onSaved()
      onClose()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text-1)]">Edit Posisi</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-3)] transition-colors">
            <X size={16} className="text-[var(--text-2)]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jabatan *</label>
            <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Departemen</label>
            <input className={inputCls} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Karyawan</label>
            <select className={inputCls} value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">— Posisi kosong —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Atasan</label>
            <select className={inputCls} value={form.managerId} onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}>
              <option value="">— Tidak ada atasan —</option>
              {positions.filter((p) => p.id !== node.id).map((pos) => (
                <option key={pos.id} value={pos.id}>{pos.title} {pos.employeeName ? `(${pos.employeeName})` : '(kosong)'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Level</label>
            <input type="number" min={0} max={10} className={inputCls} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="rounded" />
            <span className="text-sm text-[var(--text-1)]">Posisi aktif</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Batal</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Menyimpan...' : <><Check size={14} /> Perbarui</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DeptSummaryCard ───────────────────────────────────────────────────────────

function DeptSummaryCard({ dept }: { dept: DeptSummary }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', deptColor(dept.department))}>
          {dept.department}
        </span>
        {dept.openPositions > 0 && (
          <span className="text-xs text-amber-600 font-medium">{dept.openPositions} posisi kosong</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <p className="text-xs text-[var(--text-3)]">Jumlah Karyawan</p>
          <p className="text-lg font-bold text-[var(--text-1)]">{dept.headcount}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-3)]">Rata-rata Gaji</p>
          <p className="text-sm font-semibold text-[var(--text-1)]">{fmtCurrency(dept.avgSalary)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function OrgChartClient({ storeId, employees }: OrgChartClientProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editNode, setEditNode] = useState<OrgNode | null>(null)
  const [activeTab, setActiveTab] = useState<'chart' | 'departments'>('chart')

  // Fetch full tree
  const { data: chartData, isLoading: loadingChart } = useQuery<OrgChartResponse>({
    queryKey: ['org-chart', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/org-chart?storeId=${storeId}`)
      return (await res.json()) as OrgChartResponse
    },
  })

  // Fetch flat list for modals
  const { data: positions } = useQuery<any[]>({
    queryKey: ['org-positions', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/org-positions?storeId=${storeId}`)
      return (await res.json()) as any[]
    },
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['org-chart', storeId] })
    qc.invalidateQueries({ queryKey: ['org-positions', storeId] })
  }

  const tree = chartData?.tree ?? []
  const deptSummary = chartData?.deptSummary ?? []
  const totalPositions = chartData?.total ?? 0
  const filledPositions = positions?.filter((p) => p.employeeId).length ?? 0
  const openPositions = totalPositions - filledPositions

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Struktur Organisasi</h1>
          <p className="text-sm text-[var(--text-2)] mt-0.5">Bagan org & hierarki pelaporan karyawan</p>
        </div>
        <button onClick={() => setShowAdd(true)} className={btnPrimary}>
          <Plus size={16} /> Tambah Posisi
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Posisi', value: totalPositions, icon: Briefcase, color: 'text-amber-500' },
          { label: 'Terisi', value: filledPositions, icon: UserCircle2, color: 'text-emerald-500' },
          { label: 'Kosong', value: openPositions, icon: Users, color: 'text-rose-500' },
          { label: 'Departemen', value: deptSummary.length, icon: Building2, color: 'text-blue-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-4 flex items-center gap-3">
            <div className={cn('p-2 rounded-xl bg-[var(--bg-2)]', color)}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-1)]">{value}</p>
              <p className="text-xs text-[var(--text-3)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-2)] rounded-xl p-1 w-fit">
        {([['chart', 'Bagan Org', TrendingUp], ['departments', 'Ringkasan Dept.', Building2]] as const).map(
          ([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ),
        )}
      </div>

      {/* Chart Tab */}
      {activeTab === 'chart' && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-6 overflow-x-auto">
          {loadingChart ? (
            <div className="flex items-center justify-center h-48 text-[var(--text-3)]">
              <div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full mr-3" />
              Memuat bagan...
            </div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[var(--text-3)]">
              <Building2 size={32} className="opacity-30" />
              <p className="text-sm">Belum ada posisi. Tambahkan posisi pertama.</p>
              <button onClick={() => setShowAdd(true)} className={btnPrimary}>
                <Plus size={14} /> Tambah Posisi
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-10 justify-center min-w-max pb-4">
              {tree.map((root) => (
                <OrgSubtree key={root.id} node={root} depth={0} onEdit={setEditNode} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deptSummary.length === 0 ? (
            <div className="col-span-full flex items-center justify-center h-32 text-[var(--text-3)] text-sm">
              Belum ada data departemen.
            </div>
          ) : (
            deptSummary.map((dept) => <DeptSummaryCard key={dept.department} dept={dept} />)
          )}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddPositionModal
          storeId={storeId}
          employees={employees}
          positions={positions ?? []}
          onClose={() => setShowAdd(false)}
          onSaved={refresh}
        />
      )}
      {editNode && (
        <EditPositionModal
          storeId={storeId}
          node={editNode}
          employees={employees}
          positions={positions ?? []}
          onClose={() => setEditNode(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

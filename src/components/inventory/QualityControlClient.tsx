'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Pure logic exports (used by unit tests) ──────────────────────────────────

export type QCStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'PARTIAL'
export type CheckpointResult = 'PASS' | 'FAIL' | 'NA'
export type ReferenceType = 'PURCHASE_ORDER' | 'PRODUCTION' | 'RETURN'

export function calcPassRate(passQty: number, totalQty: number): number {
  if (totalQty <= 0) return 0
  return Math.round((passQty / totalQty) * 100)
}

export function calcFailRate(failQty: number, totalQty: number): number {
  if (totalQty <= 0) return 0
  return Math.round((failQty / totalQty) * 100)
}

export function calcDefectRate(failQty: number, passQty: number): number {
  const total = passQty + failQty
  if (total <= 0) return 0
  return Math.round((failQty / total) * 100)
}

export function deriveInspectionStatus(passQty: number, failQty: number): QCStatus {
  if (passQty === 0 && failQty === 0) return 'PENDING'
  if (failQty === 0 && passQty > 0) return 'PASSED'
  if (passQty === 0 && failQty > 0) return 'FAILED'
  return 'PARTIAL'
}

export function calcCheckpointScore(checkpoints: Array<{ result: CheckpointResult }>): number {
  const applicable = checkpoints.filter(c => c.result !== 'NA')
  if (applicable.length === 0) return 100
  const passed = applicable.filter(c => c.result === 'PASS').length
  return Math.round((passed / applicable.length) * 100)
}

export function isPartialPass(passQty: number, failQty: number): boolean {
  return passQty > 0 && failQty > 0
}

export function validateInspection(data: {
  productId: string
  inspectedBy: string
  passQty: number
  failQty: number
}): string | null {
  if (!data.productId) return 'productId diperlukan'
  if (!data.inspectedBy.trim()) return 'inspectedBy diperlukan'
  if (data.passQty < 0) return 'passQty tidak boleh negatif'
  if (data.failQty < 0) return 'failQty tidak boleh negatif'
  if (data.passQty === 0 && data.failQty === 0) return 'passQty atau failQty harus > 0'
  return null
}

// ─── Inspection templates per product category ────────────────────────────────

export const INSPECTION_TEMPLATES: Record<string, string[]> = {
  'Makanan': ['Kebersihan', 'Tanggal kadaluarsa', 'Kemasan utuh', 'Bau normal', 'Warna sesuai'],
  'Elektronik': ['Fungsi dasar', 'Layar/display', 'Koneksi port', 'Kemasan utuh', 'Aksesori lengkap'],
  'Pakaian': ['Jahitan rapi', 'Ukuran sesuai', 'Warna tidak luntur', 'Tidak cacat', 'Label tersedia'],
  'Minuman': ['Kemasan kedap', 'Tanggal kadaluarsa', 'Volume sesuai', 'Tidak bocor', 'Warna normal'],
  'Default': ['Kondisi fisik', 'Kemasan utuh', 'Kesesuaian spesifikasi', 'Kelengkapan dokumen'],
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface QCInspection {
  id: string
  storeId: string
  productId: string
  productName?: string
  referenceId?: string
  referenceType: ReferenceType
  inspectedBy: string
  inspectedAt: string
  status: QCStatus
  passQty: number
  failQty: number
  notes?: string
  createdAt: string
  updatedAt: string
  checkpointTotal?: number
  checkpointPassed?: number
  checkpointFailed?: number
}

interface QCCheckpoint {
  id: string
  inspectionId: string
  storeId: string
  criterion: string
  result: CheckpointResult
  value?: string
  threshold?: string
  notes?: string
  createdAt: string
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QCStatus }) {
  const map: Record<QCStatus, { label: string; className: string }> = {
    PENDING:  { label: 'Menunggu',  className: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' },
    PASSED:   { label: 'Lulus',     className: 'bg-[var(--color-success)]/15 text-[var(--color-success)]' },
    FAILED:   { label: 'Gagal',     className: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' },
    PARTIAL:  { label: 'Sebagian',  className: 'bg-[var(--color-info)]/15 text-[var(--color-info)]' },
  }
  const { label, className } = map[status] ?? map.PENDING
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  )
}

function ResultBadge({ result }: { result: CheckpointResult }) {
  const map: Record<CheckpointResult, { label: string; className: string }> = {
    PASS: { label: 'Lulus', className: 'bg-[var(--color-success)]/15 text-[var(--color-success)]' },
    FAIL: { label: 'Gagal', className: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' },
    NA:   { label: 'N/A',   className: 'bg-[var(--color-muted)]/15 text-[var(--color-muted)]' },
  }
  const { label, className } = map[result] ?? map.NA
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  )
}

function StatusIcon({ status }: { status: QCStatus }) {
  if (status === 'PASSED')  return <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
  if (status === 'FAILED')  return <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
  if (status === 'PARTIAL') return <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
  return <Clock className="w-4 h-4 text-[var(--color-muted)]" />
}

const REF_TYPE_LABELS: Record<ReferenceType, string> = {
  PURCHASE_ORDER: 'Purchase Order',
  PRODUCTION: 'Produksi',
  RETURN: 'Retur',
}

// ─── New Inspection Form ──────────────────────────────────────────────────────

interface NewInspectionFormProps {
  storeId: string
  onCreated: () => void
  onCancel: () => void
}

function NewInspectionForm({ storeId, onCreated, onCancel }: NewInspectionFormProps) {
  const [productId, setProductId] = useState('')
  const [productName, setProductName] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [referenceType, setReferenceType] = useState<ReferenceType>('PURCHASE_ORDER')
  const [inspectedBy, setInspectedBy] = useState('')
  const [passQty, setPassQty] = useState(0)
  const [failQty, setFailQty] = useState(0)
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState('Default')
  const [checkpoints, setCheckpoints] = useState<Array<{ criterion: string; result: CheckpointResult; value: string; threshold: string; notes: string }>>([])
  const [saving, setSaving] = useState(false)

  const loadTemplate = (cat: string) => {
    setCategory(cat)
    const criteria = INSPECTION_TEMPLATES[cat] ?? INSPECTION_TEMPLATES['Default']
    setCheckpoints(criteria.map(c => ({ criterion: c, result: 'NA', value: '', threshold: '', notes: '' })))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateInspection({ productId, inspectedBy, passQty, failQty })
    if (err) { toast.error(err); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/qc-inspections?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          referenceId: referenceId || undefined,
          referenceType,
          inspectedBy,
          passQty,
          failQty,
          notes: notes || undefined,
          checkpoints: checkpoints.filter(c => c.result !== 'NA' || c.value || c.notes),
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal membuat inspeksi'); return }
      toast.success('Inspeksi berhasil dibuat')
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">ID Produk *</label>
          <input
            value={productId}
            onChange={e => setProductId(e.target.value)}
            placeholder="prod-xxx"
            required
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Nama Produk</label>
          <input
            value={productName}
            onChange={e => setProductName(e.target.value)}
            placeholder="Opsional"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Tipe Referensi</label>
          <select
            value={referenceType}
            onChange={e => setReferenceType(e.target.value as ReferenceType)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            <option value="PURCHASE_ORDER">Purchase Order</option>
            <option value="PRODUCTION">Produksi</option>
            <option value="RETURN">Retur</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">ID Referensi</label>
          <input
            value={referenceId}
            onChange={e => setReferenceId(e.target.value)}
            placeholder="po-xxx / prod-xxx"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Diperiksa Oleh *</label>
          <input
            value={inspectedBy}
            onChange={e => setInspectedBy(e.target.value)}
            placeholder="Nama inspektor"
            required
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Kategori Template</label>
          <select
            value={category}
            onChange={e => loadTemplate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            {Object.keys(INSPECTION_TEMPLATES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Qty Lulus</label>
          <input
            type="number" min="0"
            value={passQty}
            onChange={e => setPassQty(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Qty Gagal</label>
          <input
            type="number" min="0"
            value={failQty}
            onChange={e => setFailQty(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {passQty + failQty > 0 && (
        <div className="flex gap-4 text-xs text-[var(--color-muted)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2">
          <span>Lulus: <strong className="text-[var(--color-success)]">{calcPassRate(passQty, passQty + failQty)}%</strong></span>
          <span>Gagal: <strong className="text-[var(--color-danger)]">{calcFailRate(failQty, passQty + failQty)}%</strong></span>
          <span>Status: <strong>{deriveInspectionStatus(passQty, failQty)}</strong></span>
        </div>
      )}

      <div>
        <label className="block text-xs text-[var(--color-muted)] mb-1">Catatan</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
        />
      </div>

      {checkpoints.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--color-muted)] mb-2">Checkpoint ({checkpoints.length})</p>
          <div className="space-y-2">
            {checkpoints.map((cp, i) => (
              <div key={i} className="flex items-center gap-2 bg-[var(--color-surface-2)] rounded-lg px-3 py-2">
                <span className="flex-1 text-sm">{cp.criterion}</span>
                <select
                  value={cp.result}
                  onChange={e => {
                    const updated = [...checkpoints]
                    updated[i] = { ...updated[i], result: e.target.value as CheckpointResult }
                    setCheckpoints(updated)
                  }}
                  className="px-2 py-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-xs"
                >
                  <option value="NA">N/A</option>
                  <option value="PASS">Lulus</option>
                  <option value="FAIL">Gagal</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors">
          Batal
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors">
          {saving ? 'Menyimpan...' : 'Simpan Inspeksi'}
        </button>
      </div>
    </form>
  )
}

// ─── Inspection Detail Row ────────────────────────────────────────────────────

function InspectionRow({ insp, storeId, onUpdated }: {
  insp: QCInspection
  storeId: string
  onUpdated: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [checkpoints, setCheckpoints] = useState<QCCheckpoint[]>([])
  const [loadingCps, setLoadingCps] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const loadCheckpoints = useCallback(async () => {
    setLoadingCps(true)
    try {
      const res = await fetch(`/api/qc-inspections/${insp.id}/checkpoints?storeId=${storeId}`)
      const data = await res.json() as any
      if (res.ok) setCheckpoints(data.data ?? [])
    } finally {
      setLoadingCps(false)
    }
  }, [insp.id, storeId])

  const handleToggle = () => {
    if (!expanded && checkpoints.length === 0) loadCheckpoints()
    setExpanded(v => !v)
  }

  const handleUpdateStatus = async (status: QCStatus) => {
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/qc-inspections/${insp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal update status'); return }
      toast.success('Status diperbarui')
      onUpdated()
    } finally {
      setUpdatingStatus(false)
    }
  }

  const totalQty = insp.passQty + insp.failQty
  const score = calcCheckpointScore(checkpoints)

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors"
        onClick={handleToggle}
      >
        <StatusIcon status={insp.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{insp.productId}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {REF_TYPE_LABELS[insp.referenceType]} {insp.referenceId ? `· ${insp.referenceId}` : ''} · {insp.inspectedBy}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {totalQty > 0 && (
            <div className="text-xs text-right hidden sm:block">
              <span className="text-[var(--color-success)]">{insp.passQty} lulus</span>
              <span className="text-[var(--color-muted)] mx-1">/</span>
              <span className="text-[var(--color-danger)]">{insp.failQty} gagal</span>
            </div>
          )}
          <StatusBadge status={insp.status} />
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--color-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--color-muted)]" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface-2)] space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-[var(--color-muted)]">Pass Rate</p>
              <p className="font-semibold text-[var(--color-success)]">{calcPassRate(insp.passQty, totalQty)}%</p>
            </div>
            <div>
              <p className="text-[var(--color-muted)]">Defect Rate</p>
              <p className="font-semibold text-[var(--color-danger)]">{calcDefectRate(insp.failQty, insp.passQty)}%</p>
            </div>
            <div>
              <p className="text-[var(--color-muted)]">Checkpoint Score</p>
              <p className="font-semibold">{checkpoints.length > 0 ? `${score}%` : '-'}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted)]">Waktu Inspeksi</p>
              <p className="font-semibold">{new Date(insp.inspectedAt).toLocaleDateString('id-ID')}</p>
            </div>
          </div>

          {insp.notes && (
            <p className="text-xs text-[var(--color-muted)] italic">{insp.notes}</p>
          )}

          {loadingCps ? (
            <p className="text-xs text-[var(--color-muted)]">Memuat checkpoint...</p>
          ) : checkpoints.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">Checkpoint ({checkpoints.length})</p>
              {checkpoints.map(cp => (
                <div key={cp.id} className="flex items-center gap-2 text-xs">
                  <ResultBadge result={cp.result} />
                  <span className="flex-1">{cp.criterion}</span>
                  {cp.value && <span className="text-[var(--color-muted)]">Nilai: {cp.value}</span>}
                  {cp.threshold && <span className="text-[var(--color-muted)]">Batas: {cp.threshold}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Tidak ada checkpoint</p>
          )}

          {insp.status === 'PENDING' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleUpdateStatus('PASSED')}
                disabled={updatingStatus}
                className="px-3 py-1 rounded text-xs bg-[var(--color-success)]/15 text-[var(--color-success)] hover:bg-[var(--color-success)]/25 disabled:opacity-50 transition-colors"
              >
                Tandai Lulus
              </button>
              <button
                onClick={() => handleUpdateStatus('FAILED')}
                disabled={updatingStatus}
                className="px-3 py-1 rounded text-xs bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25 disabled:opacity-50 transition-colors"
              >
                Tandai Gagal
              </button>
              <button
                onClick={() => handleUpdateStatus('PARTIAL')}
                disabled={updatingStatus}
                className="px-3 py-1 rounded text-xs bg-[var(--color-warning)]/15 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/25 disabled:opacity-50 transition-colors"
              >
                Sebagian Lulus
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QualityControlClient({ storeId }: { storeId: string }) {
  const [inspections, setInspections] = useState<QCInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterRefType, setFilterRefType] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let url = `/api/qc-inspections?storeId=${storeId}`
      if (filterStatus) url += `&status=${filterStatus}`
      if (filterRefType) url += `&referenceType=${filterRefType}`
      const res = await fetch(url)
      const data = await res.json() as any
      if (res.ok) setInspections(Array.isArray(data) ? data : [])
      else toast.error(data.error ?? 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [storeId, filterStatus, filterRefType])

  useEffect(() => { load() }, [load])

  const summary = {
    total: inspections.length,
    passed: inspections.filter(i => i.status === 'PASSED').length,
    failed: inspections.filter(i => i.status === 'FAILED').length,
    partial: inspections.filter(i => i.status === 'PARTIAL').length,
    pending: inspections.filter(i => i.status === 'PENDING').length,
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-xl font-semibold">Kontrol Kualitas</h1>
            <p className="text-xs text-[var(--color-muted)]">Inspeksi barang masuk, produksi, dan retur</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Inspeksi Baru
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: summary.total, color: 'text-[var(--color-text)]' },
          { label: 'Lulus', value: summary.passed, color: 'text-[var(--color-success)]' },
          { label: 'Gagal', value: summary.failed, color: 'text-[var(--color-danger)]' },
          { label: 'Sebagian', value: summary.partial, color: 'text-[var(--color-warning)]' },
        ].map(card => (
          <div key={card.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* New inspection form */}
      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">Inspeksi Baru</h2>
          <NewInspectionForm
            storeId={storeId}
            onCreated={() => { setShowForm(false); load() }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Semua Status</option>
          <option value="PENDING">Menunggu</option>
          <option value="PASSED">Lulus</option>
          <option value="FAILED">Gagal</option>
          <option value="PARTIAL">Sebagian</option>
        </select>
        <select
          value={filterRefType}
          onChange={e => setFilterRefType(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Semua Tipe</option>
          <option value="PURCHASE_ORDER">Purchase Order</option>
          <option value="PRODUCTION">Produksi</option>
          <option value="RETURN">Retur</option>
        </select>
      </div>

      {/* Inspection list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-[var(--color-muted)] text-sm">Memuat...</div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-muted)] text-sm">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>Belum ada inspeksi</p>
          </div>
        ) : (
          inspections.map(insp => (
            <InspectionRow
              key={insp.id}
              insp={insp}
              storeId={storeId}
              onUpdated={load}
            />
          ))
        )}
      </div>
    </div>
  )
}

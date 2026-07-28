'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QCInspection {
  id: string
  storeId: string
  productId: string
  referenceId?: string
  referenceType?: 'PURCHASE_ORDER' | 'PRODUCTION' | 'RETURN'
  inspectedBy?: string
  inspectedAt?: string
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'PARTIAL'
  passQty: number
  failQty: number
  notes?: string
  productName?: string
}

export interface QCCheckpoint {
  id: string
  inspectionId: string
  criterion: string
  result: 'PASS' | 'FAIL' | 'NA'
  value?: string
  threshold?: string
  notes?: string
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function calcPassRate(passQty: number, totalQty: number): number {
  if (totalQty <= 0) return 0
  return Math.round((passQty / totalQty) * 100)
}

export function calcDefectRate(failQty: number, totalQty: number): number {
  if (totalQty <= 0) return 0
  return Math.round((failQty / totalQty) * 100)
}

export function deriveInspectionStatus(
  checkpoints: QCCheckpoint[],
  passQty: number,
  failQty: number,
): 'PENDING' | 'PASSED' | 'FAILED' | 'PARTIAL' {
  if (checkpoints.length === 0 && passQty === 0 && failQty === 0) return 'PENDING'
  if (failQty === 0 && passQty > 0) return 'PASSED'
  if (passQty === 0 && failQty > 0) return 'FAILED'
  return 'PARTIAL'
}

export function calcCheckpointScore(checkpoints: QCCheckpoint[]): number {
  if (checkpoints.length === 0) return 0
  const applicable = checkpoints.filter(c => c.result !== 'NA')
  if (applicable.length === 0) return 0
  const passed = applicable.filter(c => c.result === 'PASS').length
  return Math.round((passed / applicable.length) * 100)
}

export function isPartialPass(passQty: number, failQty: number): boolean {
  return passQty > 0 && failQty > 0
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  storeId: string
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  PASSED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
}

const REF_TYPES = ['PURCHASE_ORDER', 'PRODUCTION', 'RETURN'] as const

export default function QualityControlClient({ storeId }: Props) {
  const [inspections, setInspections] = useState<QCInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkpoints, setCheckpoints] = useState<QCCheckpoint[]>([])
  const [filter, setFilter] = useState<string>('ALL')

  const [form, setForm] = useState({
    productId: '',
    referenceType: 'PURCHASE_ORDER' as typeof REF_TYPES[number],
    referenceId: '',
    passQty: '',
    failQty: '',
    notes: '',
  })

  const loadInspections = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/qc-inspections?storeId=${storeId}`)
      const data = await res.json() as any
      setInspections(data.inspections ?? [])
    } catch {
      toast.error('Gagal memuat data inspeksi')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  const loadCheckpoints = useCallback(async (inspectionId: string) => {
    try {
      const res = await fetch(`/api/qc-inspections/${inspectionId}/checkpoints?storeId=${storeId}`)
      const data = await res.json() as any
      setCheckpoints(data.checkpoints ?? [])
    } catch {
      toast.error('Gagal memuat checkpoint')
    }
  }, [storeId])

  useEffect(() => { loadInspections() }, [loadInspections])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    loadCheckpoints(id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/qc-inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId: form.productId,
          referenceType: form.referenceType,
          referenceId: form.referenceId || undefined,
          passQty: Number(form.passQty),
          failQty: Number(form.failQty),
          notes: form.notes,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Inspeksi dibuat')
      setShowForm(false)
      setForm({ productId: '', referenceType: 'PURCHASE_ORDER', referenceId: '', passQty: '', failQty: '', notes: '' })
      loadInspections()
    } catch {
      toast.error('Gagal membuat inspeksi')
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/qc-inspections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, status }),
      })
      if (!res.ok) throw new Error()
      toast.success('Status diperbarui')
      loadInspections()
    } catch {
      toast.error('Gagal memperbarui status')
    }
  }

  const filtered = filter === 'ALL' ? inspections : inspections.filter(i => i.status === filter)
  const selected = inspections.find(i => i.id === selectedId)

  const totalPass = inspections.reduce((s, i) => s + i.passQty, 0)
  const totalFail = inspections.reduce((s, i) => s + i.failQty, 0)
  const overallRate = calcPassRate(totalPass, totalPass + totalFail)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Inspeksi', value: inspections.length },
          { label: 'Lulus', value: inspections.filter(i => i.status === 'PASSED').length },
          { label: 'Gagal', value: inspections.filter(i => i.status === 'FAILED').length },
          { label: 'Pass Rate', value: `${overallRate}%` },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 bg-[var(--bg-card)] border border-[var(--border)]">
            <div className="text-2xl font-bold text-[var(--text-1)]">{s.value}</div>
            <div className="text-xs text-[var(--text-2)] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['ALL', 'PENDING', 'PASSED', 'FAILED', 'PARTIAL'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${filter === s ? 'bg-stone-800 text-white border-stone-800' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-stone-100'}`}
            >
              {s === 'ALL' ? 'Semua' : s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="text-sm px-4 py-2 rounded-xl bg-stone-800 text-white hover:bg-stone-700 transition-colors"
        >
          + Inspeksi Baru
        </button>
      </div>

      {/* List + Detail */}
      <div className="grid grid-cols-3 gap-4">
        {/* List */}
        <div className="col-span-2 space-y-2">
          {loading ? (
            <div className="text-sm text-[var(--text-2)] py-4 text-center">Memuat...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-[var(--text-2)] py-4 text-center">Belum ada inspeksi</div>
          ) : filtered.map(insp => (
            <div
              key={insp.id}
              onClick={() => handleSelect(insp.id)}
              className={`rounded-2xl p-4 border cursor-pointer transition-colors bg-[var(--bg-card)] ${selectedId === insp.id ? 'border-stone-800' : 'border-[var(--border)] hover:border-stone-400'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--text-1)]">{insp.productName ?? insp.productId}</div>
                  <div className="text-xs text-[var(--text-2)] mt-0.5">{insp.referenceType} · Lulus: {insp.passQty} · Gagal: {insp.failQty}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[insp.status]}`}>{insp.status}</span>
              </div>
              {insp.notes && <div className="text-xs text-[var(--text-2)] mt-2 italic">{insp.notes}</div>}
              {insp.status === 'PENDING' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={e => { e.stopPropagation(); handleUpdateStatus(insp.id, 'PASSED') }} className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700">Lulus</button>
                  <button onClick={e => { e.stopPropagation(); handleUpdateStatus(insp.id, 'FAILED') }} className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700">Gagal</button>
                  <button onClick={e => { e.stopPropagation(); handleUpdateStatus(insp.id, 'PARTIAL') }} className="text-xs px-3 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600">Parsial</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          {selected ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[var(--text-1)]">Checkpoint ({checkpoints.length})</div>
              {checkpoints.length === 0 ? (
                <div className="text-xs text-[var(--text-2)]">Belum ada checkpoint</div>
              ) : checkpoints.map(cp => (
                <div key={cp.id} className="text-xs border-b border-[var(--border)] pb-2">
                  <div className="font-medium text-[var(--text-1)]">{cp.criterion}</div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[var(--text-2)]">{cp.value ?? '-'} / {cp.threshold ?? '-'}</span>
                    <span className={cp.result === 'PASS' ? 'text-green-600' : cp.result === 'FAIL' ? 'text-red-600' : 'text-stone-400'}>{cp.result}</span>
                  </div>
                </div>
              ))}
              <div className="text-xs text-[var(--text-2)] pt-1">Score: {calcCheckpointScore(checkpoints)}%</div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-2)] text-center py-8">Pilih inspeksi untuk melihat checkpoint</div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="text-base font-semibold text-[var(--text-1)]">Inspeksi Baru</div>
            <div>
              <label className="text-xs text-[var(--text-2)]">Produk ID</label>
              <input required value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} className="w-full mt-1 text-sm border border-[var(--border)] rounded-xl px-3 py-2 bg-transparent text-[var(--text-1)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-2)]">Tipe Referensi</label>
              <select value={form.referenceType} onChange={e => setForm(f => ({ ...f, referenceType: e.target.value as typeof REF_TYPES[number] }))} className="w-full mt-1 text-sm border border-[var(--border)] rounded-xl px-3 py-2 bg-transparent text-[var(--text-1)]">
                {REF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-2)]">Qty Lulus</label>
                <input required type="number" min="0" value={form.passQty} onChange={e => setForm(f => ({ ...f, passQty: e.target.value }))} className="w-full mt-1 text-sm border border-[var(--border)] rounded-xl px-3 py-2 bg-transparent text-[var(--text-1)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-2)]">Qty Gagal</label>
                <input required type="number" min="0" value={form.failQty} onChange={e => setForm(f => ({ ...f, failQty: e.target.value }))} className="w-full mt-1 text-sm border border-[var(--border)] rounded-xl px-3 py-2 bg-transparent text-[var(--text-1)]" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-2)]">Catatan</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full mt-1 text-sm border border-[var(--border)] rounded-xl px-3 py-2 bg-transparent text-[var(--text-1)]" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:bg-stone-100">Batal</button>
              <button type="submit" className="text-sm px-4 py-2 rounded-xl bg-stone-800 text-white hover:bg-stone-700">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

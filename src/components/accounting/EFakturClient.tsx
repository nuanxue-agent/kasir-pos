'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import {
  FileText,
  Download,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  RefreshCw,
  X,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  generateFakturNumber,
  calcTaxBase,
  calcPPN,
  nextSeriesNumber,
  seriesMatchesPeriod,
  formatCsvRow,
  buildDjpCsv,
  isValidNpwp,
  formatNpwp,
} from '@/lib/e-faktur'

// Re-export pure logic for unit tests
export {
  generateFakturNumber,
  calcTaxBase,
  calcPPN,
  nextSeriesNumber,
  seriesMatchesPeriod,
  formatCsvRow,
  buildDjpCsv,
  isValidNpwp,
  formatNpwp,
}

type FakturStatus = 'DRAFT' | 'UPLOADED' | 'ACCEPTED' | 'REJECTED'

interface EFaktur {
  id: string
  invoiceNumber: string
  fakturCode: string
  buyerNpwp: string
  buyerName: string
  taxBase: number
  taxAmount: number
  status: FakturStatus
  uploadedAt: string | null
  createdAt: string
}

interface FakturSeries {
  id: string
  prefix: string
  lastNumber: number
  year: number
  month: number
}

interface EFakturClientProps {
  storeId: string
  currency: string
}

const STATUS_CONFIG: Record<FakturStatus, { label: string; color: string; Icon: React.ElementType }> = {
  DRAFT:    { label: 'Draft',    color: 'text-slate-600 bg-slate-50 border-slate-200',   Icon: Clock },
  UPLOADED: { label: 'Diupload', color: 'text-blue-600 bg-blue-50 border-blue-200',      Icon: Upload },
  ACCEPTED: { label: 'Diterima', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', Icon: CheckCircle },
  REJECTED: { label: 'Ditolak',  color: 'text-red-600 bg-red-50 border-red-200',         Icon: XCircle },
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

const NAV_TABS = [
  { label: 'Ringkasan',        href: '/dashboard/accounting' },
  { label: 'Chart of Accounts',href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal',           href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo',     href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier',  href: '/dashboard/accounting/supplier-invoices' },
  { label: 'e-Faktur',         href: '/dashboard/accounting/e-faktur' },
]

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {NAV_TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)]',
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Create Faktur Modal ──────────────────────────────────────────────────────
interface CreateModalProps {
  storeId: string
  currency: string
  onClose: () => void
  onCreated: () => void
}

function CreateModal({ storeId, currency, onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState({
    invoiceNumber: '',
    buyerName: '',
    buyerNpwp: '',
    taxBase: '',
  })
  const [saving, setSaving] = useState(false)
  const [npwpError, setNpwpError] = useState('')

  const taxBase = parseFloat(form.taxBase) || 0
  const taxAmount = calcPPN(taxBase)
  const total = taxBase + taxAmount

  const handleNpwpBlur = () => {
    if (form.buyerNpwp && !isValidNpwp(form.buyerNpwp)) {
      setNpwpError('Format NPWP tidak valid (harus 15 digit)')
    } else {
      setNpwpError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.invoiceNumber || !form.buyerName || !form.taxBase) {
      toast.error('Isi semua field yang wajib')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/e-faktur?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: form.invoiceNumber,
          buyerName: form.buyerName,
          buyerNpwp: form.buyerNpwp,
          taxBase,
          taxAmount,
        }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success(`e-Faktur dibuat: ${data.fakturCode}`)
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Buat e-Faktur Baru</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
              Nomor Invoice <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="INV-2025-001"
              value={form.invoiceNumber}
              onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
              Nama Pembeli <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="PT Contoh Maju"
              value={form.buyerName}
              onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">NPWP Pembeli</label>
            <input
              className={cn(
                'w-full rounded-lg border bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]',
                npwpError ? 'border-red-400' : 'border-[var(--border)]',
              )}
              placeholder="012345678901234"
              value={form.buyerNpwp}
              onChange={e => setForm(f => ({ ...f, buyerNpwp: e.target.value.replace(/[^0-9.\-]/g, '') }))}
              onBlur={handleNpwpBlur}
            />
            {npwpError && <p className="mt-1 text-xs text-red-500">{npwpError}</p>}
            {form.buyerNpwp && isValidNpwp(form.buyerNpwp) && (
              <p className="mt-1 text-xs text-[var(--text-3)]">{formatNpwp(form.buyerNpwp)}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
              DPP (Dasar Pengenaan Pajak) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="1000000"
              value={form.taxBase}
              onChange={e => setForm(f => ({ ...f, taxBase: e.target.value }))}
            />
          </div>

          {taxBase > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-2)] p-3 text-sm">
              <div className="flex justify-between text-[var(--text-2)]">
                <span>DPP</span>
                <span>{formatCurrency(taxBase, currency)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-2)]">
                <span>PPN 11%</span>
                <span>{formatCurrency(taxAmount, currency)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 font-semibold text-[var(--text-1)]">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving && <RefreshCw size={14} className="animate-spin" />}
              Buat e-Faktur
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function EFakturClient({ storeId, currency }: EFakturClientProps) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<FakturStatus | 'ALL'>('ALL')
  const [exporting, setExporting] = useState(false)

  const { data: fakturs = [], isLoading } = useQuery({
    queryKey: ['e-faktur', storeId, statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'ALL'
        ? `/api/e-faktur?storeId=${storeId}`
        : `/api/e-faktur?storeId=${storeId}&status=${statusFilter}`
      const res = await fetch(url)
      return await res.json() as EFaktur[]
    },
  })

  const { data: series = [] } = useQuery({
    queryKey: ['faktur-series', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/e-faktur/series?storeId=${storeId}`)
      return await res.json() as FakturSeries[]
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FakturStatus }) => {
      const res = await fetch(`/api/e-faktur/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json() as any
      if (data.error) throw new Error(data.error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['e-faktur', storeId] })
      toast.success('Status diperbarui')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const exportStatus = statusFilter === 'ALL' ? 'DRAFT' : statusFilter
      const res = await fetch(
        `/api/e-faktur/export?storeId=${storeId}&status=${exportStatus}`,
      )
      if (!res.ok) {
        const data = await res.json() as any
        toast.error(data.error ?? 'Gagal export')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `e-faktur-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV berhasil diunduh')
    } catch {
      toast.error('Gagal mengunduh CSV')
    } finally {
      setExporting(false)
    }
  }

  // Summary counts
  const counts = (fakturs as EFaktur[]).reduce(
    (acc, f) => { acc[f.status] = (acc[f.status] ?? 0) + 1; return acc },
    {} as Record<FakturStatus, number>,
  )

  const totalTaxBase   = (fakturs as EFaktur[]).reduce((s, f) => s + f.taxBase, 0)
  const totalTaxAmount = (fakturs as EFaktur[]).reduce((s, f) => s + f.taxAmount, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Sub-nav */}
      <SubNav />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">e-Faktur Pajak</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Kelola faktur pajak elektronik untuk pelaporan DJP Online
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] disabled:opacity-50"
          >
            {exporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            Export CSV DJP
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} />
            Buat e-Faktur
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['DRAFT', 'UPLOADED', 'ACCEPTED', 'REJECTED'] as FakturStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s]
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(prev => prev === s ? 'ALL' : s)}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                statusFilter === s
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-2)]',
              )}
            >
              <p className="text-xs text-[var(--text-3)]">{cfg.label}</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{counts[s] ?? 0}</p>
            </button>
          )
        })}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-xs text-[var(--text-3)]">Total DPP</p>
          <p className="mt-1 text-xl font-bold text-[var(--text-1)]">{formatCurrency(totalTaxBase, currency)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-xs text-[var(--text-3)]">Total PPN 11%</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalTaxAmount, currency)}</p>
        </div>
      </div>

      {/* Series info */}
      {series.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Seri Faktur Aktif</h3>
          <div className="flex flex-wrap gap-3">
            {(series as FakturSeries[]).slice(0, 6).map(s => (
              <div key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm">
                <p className="font-mono text-xs text-[var(--text-3)]">{s.prefix}</p>
                <p className="font-semibold text-[var(--text-1)]">
                  {MONTH_NAMES[(s.month - 1)]} {s.year}
                </p>
                <p className="text-xs text-[var(--text-2)]">No. terakhir: {s.lastNumber}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {(['ALL', 'DRAFT', 'UPLOADED', 'ACCEPTED', 'REJECTED'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === s
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-2)]',
            )}
          >
            {s === 'ALL' ? 'Semua' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
            <RefreshCw size={20} className="animate-spin mr-2" />
            Memuat...
          </div>
        ) : (fakturs as EFaktur[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-3)]">
            <FileText size={40} className="opacity-30" />
            <p>Belum ada e-Faktur</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Buat e-Faktur Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Kode Faktur</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">No. Invoice</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Pembeli</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">NPWP</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">DPP</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">PPN</th>
                  <th className="px-4 py-3 text-center font-medium text-[var(--text-3)]">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-[var(--text-3)]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(fakturs as EFaktur[]).map(f => {
                  const cfg = STATUS_CONFIG[f.status]
                  const StatusIcon = cfg.Icon
                  return (
                    <tr key={f.id} className="hover:bg-[var(--bg-2)] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-1)]">{f.fakturCode}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{f.invoiceNumber}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{f.buyerName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">
                        {f.buyerNpwp ? formatNpwp(f.buyerNpwp) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-1)]">
                        {formatCurrency(f.taxBase, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {formatCurrency(f.taxAmount, currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
                          <StatusIcon size={11} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={f.status}
                          onChange={e => updateStatus.mutate({ id: f.id, status: e.target.value as FakturStatus })}
                          className="rounded border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1 text-xs text-[var(--text-1)]"
                        >
                          <option value="DRAFT">Draft</option>
                          <option value="UPLOADED">Diupload</option>
                          <option value="ACCEPTED">Diterima</option>
                          <option value="REJECTED">Ditolak</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['e-faktur', storeId] })
            qc.invalidateQueries({ queryKey: ['faktur-series', storeId] })
          }}
        />
      )}
    </div>
  )
}

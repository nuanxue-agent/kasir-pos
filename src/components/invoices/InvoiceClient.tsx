'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  FileText,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Printer,
  Share2,
  ChevronRight,
  Trash2,
  X,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'
type PaymentTerms = 'NET7' | 'NET14' | 'NET30' | 'NET60'

interface InvoiceItem {
  id?: string
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  subtotal: number
}

interface Invoice {
  id: string
  number: string
  customerId: string
  customerName?: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  terms: PaymentTerms
  notes?: string
  subtotal: number
  taxAmount: number
  total: number
  items?: InvoiceItem[]
}

interface InvoiceClientProps {
  storeId: string
  currency: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; icon: React.ElementType; pill: string }
> = {
  DRAFT: {
    label: 'Draft',
    icon: Clock,
    pill: 'bg-[var(--bg-muted)] text-[var(--text-2)] border border-[var(--border)]',
  },
  SENT: { label: 'Terkirim', icon: Send, pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
  PAID: {
    label: 'Lunas',
    icon: CheckCircle2,
    pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  },
  OVERDUE: {
    label: 'Jatuh Tempo',
    icon: AlertCircle,
    pill: 'bg-red-50 text-red-500 border border-red-200',
  },
}

const TERMS_DAYS: Record<PaymentTerms, number> = {
  NET7: 7,
  NET14: 14,
  NET30: 30,
  NET60: 60,
}

const TERMS_OPTIONS: PaymentTerms[] = ['NET7', 'NET14', 'NET30', 'NET60']

const STATUS_TABS = [
  { value: '', label: 'Semua' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Terkirim' },
  { value: 'PAID', label: 'Lunas' },
  { value: 'OVERDUE', label: 'Jatuh Tempo' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDueDate(issueDate: string, terms: PaymentTerms): string {
  const d = new Date(issueDate)
  d.setDate(d.getDate() + TERMS_DAYS[terms])
  return d.toISOString().slice(0, 10)
}

function isOverdue(inv: Invoice): boolean {
  if (inv.status === 'PAID') return false
  return new Date(inv.dueDate) < new Date(new Date().toISOString().slice(0, 10))
}

function calcItemSubtotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

function calcTotals(items: InvoiceItem[]): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce((s, i) => s + calcItemSubtotal(i.qty, i.unitPrice), 0)
  const taxAmount = items.reduce(
    (s, i) => s + Math.round(calcItemSubtotal(i.qty, i.unitPrice) * (i.taxRate / 100)),
    0,
  )
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

// ── Empty line ────────────────────────────────────────────────────────────────

function emptyLine(): InvoiceItem {
  return { description: '', qty: 1, unitPrice: 0, taxRate: 11, subtotal: 0 }
}

// ── Invoice Form Modal ────────────────────────────────────────────────────────

interface InvoiceFormProps {
  storeId: string
  currency: string
  onClose: () => void
  onSaved: () => void
}

function InvoiceFormModal({ storeId, currency, onClose, onSaved }: InvoiceFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [customerId, setCustomerId] = useState('')
  const [terms, setTerms] = useState<PaymentTerms>('NET30')
  const [issueDate, setIssueDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<InvoiceItem[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: custData } = useQuery({
    queryKey: ['customers-list', storeId],
    queryFn: () => fetch(`/api/customers?storeId=${storeId}&limit=200`).then(r => r.json()),
  })
  const customers: any[] = (custData as any)?.customers ?? custData ?? []

  const dueDate = calcDueDate(issueDate, terms)
  const { subtotal, taxAmount, total } = calcTotals(lines)

  function updateLine(idx: number, field: keyof InvoiceItem, raw: string) {
    setLines(prev => {
      const next = [...prev]
      const l = { ...next[idx] }
      if (field === 'description') l.description = raw
      else if (field === 'qty') l.qty = parseFloat(raw) || 0
      else if (field === 'unitPrice') l.unitPrice = parseFloat(raw) || 0
      else if (field === 'taxRate') l.taxRate = parseFloat(raw) || 0
      l.subtotal = calcItemSubtotal(l.qty, l.unitPrice)
      next[idx] = l
      return next
    })
  }

  async function handleSave() {
    if (!customerId) {
      setError('Pilih pelanggan')
      return
    }
    if (lines.some(l => !l.description)) {
      setError('Isi deskripsi semua item')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          customerId,
          terms,
          issueDate,
          dueDate,
          notes,
          items: lines,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error || 'Gagal menyimpan')
      }
      onSaved()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-[var(--bg-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Buat Invoice Baru</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-3)] hover:bg-[var(--bg-muted)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p>}

          {/* Customer + Terms */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                Pelanggan *
              </label>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
              >
                <option value="">Pilih pelanggan…</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                Syarat Pembayaran
              </label>
              <select
                value={terms}
                onChange={e => setTerms(e.target.value as PaymentTerms)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
              >
                {TERMS_OPTIONS.map(t => (
                  <option key={t} value={t}>
                    {t} ({TERMS_DAYS[t]} hari)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                Tanggal Terbit
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                Jatuh Tempo
              </label>
              <input
                type="date"
                value={dueDate}
                readOnly
                className="w-full cursor-not-allowed rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)]"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-2)]">Item</label>
            <div className="space-y-2">
              {/* Header row */}
              <div className="hidden grid-cols-[1fr_80px_110px_80px_90px_36px] gap-2 px-1 text-xs text-[var(--text-3)] sm:grid">
                <span>Deskripsi / Produk</span>
                <span>Qty</span>
                <span>Harga Satuan</span>
                <span>Pajak %</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_80px_110px_80px_90px_36px]"
                >
                  <input
                    placeholder="Deskripsi produk/jasa"
                    value={line.description}
                    onChange={e => updateLine(idx, 'description', e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="1"
                    value={line.qty || ''}
                    onChange={e => updateLine(idx, 'qty', e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={line.unitPrice || ''}
                    onChange={e => updateLine(idx, 'unitPrice', e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="11"
                    value={line.taxRate || ''}
                    onChange={e => updateLine(idx, 'taxRate', e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
                  />
                  <span className="text-right text-sm font-medium text-[var(--text-1)]">
                    {formatCurrency(calcItemSubtotal(line.qty, line.unitPrice), currency)}
                  </span>
                  <button
                    onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                    disabled={lines.length === 1}
                    className="rounded-lg p-1 text-[var(--text-3)] hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setLines(prev => [...prev, emptyLine()])}
                className="mt-1 flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
              >
                <Plus size={14} /> Tambah Item
              </button>
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1 border-t border-[var(--border)] pt-4 text-sm">
            <div className="flex justify-between text-[var(--text-2)]">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-2)]">
              <span>Pajak</span>
              <span>{formatCurrency(taxAmount, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-1 text-base font-semibold text-[var(--text-1)]">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Catatan</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Catatan tambahan untuk pelanggan…"
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border)] p-6">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Menyimpan…' : 'Simpan Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Share Modal ───────────────────────────────────────────────────────────────

interface ShareModalProps {
  invoice: Invoice
  onClose: () => void
}

function ShareModal({ invoice, onClose }: ShareModalProps) {
  const message = `Invoice ${invoice.number} — Total: ${invoice.total.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })} — Jatuh tempo: ${formatDate(invoice.dueDate)}`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
  const emailUrl = `mailto:?subject=Invoice ${invoice.number}&body=${encodeURIComponent(message)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
          <h3 className="text-base font-semibold text-[var(--text-1)]">Bagikan Invoice</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-3)] hover:bg-[var(--bg-muted)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <Share2 size={16} /> Kirim via WhatsApp
          </a>
          <a
            href={emailUrl}
            className="flex w-full items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <Send size={16} /> Kirim via Email
          </a>
          <button
            onClick={() => window.print()}
            className="flex w-full items-center gap-3 rounded-xl bg-[var(--bg-muted)] px-4 py-3 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-hover)]"
          >
            <Printer size={16} /> Cetak / PDF
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InvoiceClient({ storeId, currency }: InvoiceClientProps) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [shareInvoice, setShareInvoice] = useState<Invoice | null>(null)

  // Fetch invoices
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', storeId, statusFilter],
    queryFn: () =>
      fetch(
        `/api/invoices?storeId=${storeId}${statusFilter ? `&status=${statusFilter}` : ''}`,
      ).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const rawInvoices: Invoice[] = (data as { invoices?: Invoice[] })?.invoices ?? []

  // Auto-detect overdue on client
  const invoices = rawInvoices
    .map(inv => ({
      ...inv,
      status: (inv.status !== 'PAID' && isOverdue(inv) ? 'OVERDUE' : inv.status) as InvoiceStatus,
    }))
    .filter(
      inv =>
        !search ||
        inv.number.toLowerCase().includes(search.toLowerCase()) ||
        (inv.customerName ?? '').toLowerCase().includes(search.toLowerCase()),
    )

  // Send invoice mutation
  const sendMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      }).then(r => r.json()),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      const inv = rawInvoices.find(i => i.id === id)
      if (inv) setShareInvoice({ ...inv, status: 'SENT' })
    },
  })

  // Pay invoice mutation
  const payMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/invoices/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })

  const handleSaved = useCallback(() => {
    setShowForm(false)
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }, [qc])

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Invoice</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Kelola tagihan ke pelanggan</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={16} /> Buat Invoice
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              statusFilter === tab.value
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-muted)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={15}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-3)]"
        />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nomor invoice atau pelanggan…"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-base)] py-2.5 pr-4 pl-9 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
        />
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat…</div>
      ) : invoices.length === 0 ? (
        <div className="space-y-2 py-16 text-center">
          <FileText size={40} className="mx-auto text-[var(--text-3)]" />
          <p className="font-medium text-[var(--text-2)]">Belum ada invoice</p>
          <p className="text-sm text-[var(--text-3)]">
            Klik &quot;Buat Invoice&quot; untuk memulai
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const cfg = STATUS_CONFIG[inv.status]
            const Icon = cfg.icon
            return (
              <div
                key={inv.id}
                className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 transition-shadow hover:shadow-sm"
              >
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => setSelectedInvoice(inv)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-1)]">{inv.number}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        cfg.pill,
                      )}
                    >
                      <Icon size={11} /> {cfg.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--text-2)]">
                    {inv.customerName ?? inv.customerId}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    Jatuh tempo: {formatDate(inv.dueDate)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-[var(--text-1)]">
                    {formatCurrency(inv.total, currency)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                    {inv.status === 'DRAFT' && (
                      <button
                        onClick={() => sendMutation.mutate(inv.id)}
                        disabled={sendMutation.isPending}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-60"
                      >
                        <Send size={12} /> Kirim
                      </button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'OVERDUE') && (
                      <>
                        <button
                          onClick={() => setShareInvoice(inv)}
                          className="flex items-center gap-1 rounded-lg bg-[var(--bg-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
                        >
                          <Share2 size={12} /> Bagikan
                        </button>
                        <button
                          onClick={() => payMutation.mutate(inv.id)}
                          disabled={payMutation.isPending}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          <CheckCircle2 size={12} /> Lunas
                        </button>
                      </>
                    )}
                    <ChevronRight size={14} className="text-[var(--text-3)]" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <InvoiceFormModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
      {shareInvoice && <ShareModal invoice={shareInvoice} onClose={() => setShareInvoice(null)} />}

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#invoice-print) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

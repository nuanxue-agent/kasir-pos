'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, FileText, CheckCircle2, Clock, AlertTriangle, Send, CreditCard, Loader2 } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface InvoiceClientProps {
  storeId: string
  currency?: string
}

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'
type PaymentTerms = 'NET7' | 'NET14' | 'NET30' | 'NET60'

interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
  taxRate: number
}

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:     { label: 'Draft',     color: 'text-gray-600 bg-gray-50 border-gray-200',       icon: <FileText className="h-3 w-3" /> },
  SENT:      { label: 'Sent',      color: 'text-blue-600 bg-blue-50 border-blue-200',       icon: <Send className="h-3 w-3" /> },
  PAID:      { label: 'Paid',      color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  OVERDUE:   { label: 'Overdue',   color: 'text-red-600 bg-red-50 border-red-200',          icon: <AlertTriangle className="h-3 w-3" /> },
  CANCELLED: { label: 'Cancelled', color: 'text-gray-400 bg-gray-50 border-gray-200',       icon: <X className="h-3 w-3" /> },
}

const TERMS_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: 'NET7',  label: 'Net 7 days' },
  { value: 'NET14', label: 'Net 14 days' },
  { value: 'NET30', label: 'Net 30 days' },
  { value: 'NET60', label: 'Net 60 days' },
]

// ── Pure business logic exports (for unit tests) ──────────────────────────────

export type { InvoiceStatus, PaymentTerms, InvoiceItem }

export const TERMS_DAYS: Record<PaymentTerms, number> = {
  NET7: 7, NET14: 14, NET30: 30, NET60: 60,
}

export function generateInvoiceNumber(date: string, seq: number): string {
  const d = date.replace(/-/g, '')
  return `INV-${d}-${String(seq).padStart(4, '0')}`
}

export function calcDueDate(issueDate: string, terms: PaymentTerms): string {
  const d = new Date(issueDate)
  d.setDate(d.getDate() + TERMS_DAYS[terms])
  return d.toISOString().slice(0, 10)
}

export function isOverdue(dueDate: string, status: InvoiceStatus, today: string): boolean {
  if (status === 'PAID') return false
  return dueDate < today
}

export function calcLineSubtotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

export function calcLineTax(qty: number, unitPrice: number, taxRate: number): number {
  return Math.round(calcLineSubtotal(qty, unitPrice) * (taxRate / 100))
}

export function calcInvoiceTotals(items: InvoiceItem[]): {
  subtotal: number; taxAmount: number; total: number
} {
  const subtotal  = items.reduce((s, i) => s + calcLineSubtotal(i.qty, i.unitPrice), 0)
  const taxAmount = items.reduce((s, i) => s + calcLineTax(i.qty, i.unitPrice, i.taxRate), 0)
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

export function canMarkPaid(status: InvoiceStatus): boolean {
  return status === 'SENT' || status === 'OVERDUE'
}

export function canSend(status: InvoiceStatus): boolean {
  return status === 'DRAFT'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceClient({ storeId, currency = 'IDR' }: InvoiceClientProps) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'ALL'>('ALL')

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices?storeId=${storeId}`)
      return await res.json() as any[]
    },
  })

  const filtered = filterStatus === 'ALL'
    ? invoices
    : invoices.filter((inv: any) => inv.status === filterStatus)

  const updateInvoice = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, storeId }),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return }
      toast.success('Invoice updated')
      qc.invalidateQueries({ queryKey: ['invoices', storeId] })
    },
  })

  const recordPayment = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const res = await fetch(`/api/invoices/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, storeId }),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return }
      toast.success('Payment recorded')
      qc.invalidateQueries({ queryKey: ['invoices', storeId] })
    },
  })

  // Summary stats
  const totalOutstanding = invoices
    .filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .reduce((s: number, i: any) => s + (i.total ?? 0), 0)
  const totalOverdue = invoices
    .filter((i: any) => i.status === 'OVERDUE')
    .reduce((s: number, i: any) => s + (i.total ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Invoices</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">B2B invoice management</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(['ALL', 'DRAFT', 'SENT', 'OVERDUE'] as const).map(s => {
          const count = s === 'ALL' ? invoices.length : invoices.filter((i: any) => i.status === s).length
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                filterStatus === s
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-2)]',
              )}
            >
              <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">{s === 'ALL' ? 'Total' : s}</p>
              <p className="text-2xl font-bold text-[var(--text-1)] mt-1">{count}</p>
            </button>
          )
        })}
      </div>

      {/* Outstanding banner */}
      {totalOutstanding > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">Outstanding receivables</span>
          <div className="flex gap-6 text-sm">
            <span className="text-amber-700">Total: <strong>{formatCurrency(totalOutstanding, currency)}</strong></span>
            {totalOverdue > 0 && (
              <span className="text-red-700">Overdue: <strong>{formatCurrency(totalOverdue, currency)}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Invoice List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12">
          <FileText className="h-10 w-10 text-[var(--text-3)] mb-3" />
          <p className="text-sm text-[var(--text-3)]">No invoices found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv: any) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              currency={currency}
              onSend={() => updateInvoice.mutate({ id: inv.id, body: { status: 'SENT' } })}
              onPay={(amount) => recordPayment.mutate({ id: inv.id, amount })}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateInvoiceModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['invoices', storeId] })
          }}
        />
      )}
    </div>
  )
}

// ── Invoice Row ───────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice, currency, onSend, onPay,
}: {
  invoice: any
  currency: string
  onSend: () => void
  onPay: (amount: number) => void
}) {
  const [showPayModal, setShowPayModal] = useState(false)
  const status = invoice.status as InvoiceStatus
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-[var(--primary)] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[var(--text-1)]">{invoice.number ?? invoice.id}</p>
            <p className="text-xs text-[var(--text-3)]">
              {invoice.customerName ?? 'Customer'} · Due {invoice.dueDate?.slice(0, 10)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[var(--text-1)]">{formatCurrency(invoice.total ?? 0, currency)}</span>
          <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
            {cfg.icon}{cfg.label}
          </span>
          {canSend(status) && (
            <button
              onClick={onSend}
              className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Send className="h-3 w-3" />Send
            </button>
          )}
          {canMarkPaid(status) && (
            <button
              onClick={() => setShowPayModal(true)}
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <CreditCard className="h-3 w-3" />Pay
            </button>
          )}
        </div>
      </div>

      {showPayModal && (
        <PaymentModal
          invoice={invoice}
          currency={currency}
          onClose={() => setShowPayModal(false)}
          onPay={(amount) => { onPay(amount); setShowPayModal(false) }}
        />
      )}
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({
  invoice, currency, onClose, onPay,
}: {
  invoice: any
  currency: string
  onClose: () => void
  onPay: (amount: number) => void
}) {
  const [amount, setAmount] = useState(invoice.total ?? 0)

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--bg-2)] p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-[var(--text-3)]">Invoice</span>
            <span className="font-medium text-[var(--text-1)]">{invoice.number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-3)]">Total</span>
            <span className="font-medium text-[var(--text-1)]">{formatCurrency(invoice.total ?? 0, currency)}</span>
          </div>
        </div>
        <FormField label="Payment Amount">
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-2)]">Cancel</button>
          <button
            onClick={() => onPay(amount)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Record Payment
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────

function CreateInvoiceModal({
  storeId, currency, onClose, onSaved,
}: {
  storeId: string
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [terms, setTerms] = useState<PaymentTerms>('NET30')
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', qty: 1, unitPrice: 0, taxRate: 11 },
  ])
  const [saving, setSaving] = useState(false)

  const totals = calcInvoiceTotals(items)
  const dueDate = calcDueDate(issueDate, terms)

  const addItem = () => setItems(prev => [...prev, { description: '', qty: 1, unitPrice: 0, taxRate: 11 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))

  const handleSave = async () => {
    if (!customerName.trim()) { toast.error('Customer name required'); return }
    if (items.some(i => !i.description.trim())) { toast.error('All items need a description'); return }
    setSaving(true)
    const res = await fetch(`/api/invoices?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName,
        issueDate,
        dueDate,
        terms,
        items,
        ...totals,
      }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Invoice created')
    onSaved()
  }

  return (
    <Modal title="New Invoice" onClose={onClose}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <FormField label="Customer Name">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="PT. Client Name"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Issue Date">
            <input
              type="date"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
              value={issueDate}
              onChange={e => setIssueDate(e.target.value)}
            />
          </FormField>
          <FormField label="Payment Terms">
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
              value={terms}
              onChange={e => setTerms(e.target.value as PaymentTerms)}
            >
              {TERMS_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FormField>
        </div>
        <p className="text-xs text-[var(--text-3)]">Due date: {dueDate}</p>

        {/* Line Items */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Line Items</p>
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-3)]">Item {i + 1}</span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="p-1 hover:bg-[var(--bg-2)] rounded">
                    <X className="h-3 w-3 text-[var(--text-3)]" />
                  </button>
                )}
              </div>
              <input
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-sm text-[var(--text-1)]"
                placeholder="Description"
                value={item.description}
                onChange={e => updateItem(i, 'description', e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-[var(--text-3)]">Qty</label>
                  <input type="number" min={1}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-sm text-[var(--text-1)]"
                    value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-3)]">Unit Price</label>
                  <input type="number" min={0}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-sm text-[var(--text-1)]"
                    value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-3)]">Tax %</label>
                  <input type="number" min={0} max={100}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-sm text-[var(--text-1)]"
                    value={item.taxRate} onChange={e => updateItem(i, 'taxRate', Number(e.target.value))} />
                </div>
              </div>
              <p className="text-xs text-right text-[var(--text-3)]">
                Subtotal: {formatCurrency(calcLineSubtotal(item.qty, item.unitPrice), currency)}
              </p>
            </div>
          ))}
          <button onClick={addItem} className="w-full rounded-lg border border-dashed border-[var(--border)] py-2 text-sm text-[var(--text-3)] hover:bg-[var(--bg-2)]">
            + Add Item
          </button>
        </div>

        {/* Totals */}
        <div className="rounded-lg bg-[var(--bg-2)] p-3 space-y-1 text-sm">
          <div className="flex justify-between text-[var(--text-3)]">
            <span>Subtotal</span><span>{formatCurrency(totals.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-[var(--text-3)]">
            <span>Tax</span><span>{formatCurrency(totals.taxAmount, currency)}</span>
          </div>
          <div className="flex justify-between font-semibold text-[var(--text-1)] border-t border-[var(--border)] pt-1 mt-1">
            <span>Total</span><span>{formatCurrency(totals.total, currency)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)] mt-4">
        <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-2)]">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Invoice
        </button>
      </div>
    </Modal>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
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

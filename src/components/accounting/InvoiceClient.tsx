'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { FileText, Plus, X, CheckCircle, Clock, AlertCircle, CreditCard, Eye, Printer } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  STATUS_LABELS, STATUS_COLORS, generateInvoiceNumber,
  isOverdue, daysOverdue, calcTotal, calcTaxAmount, calcSubtotal, calcItemTotal
} from '@/lib/invoices'
import type { InvoiceStatus } from '@/lib/invoices'

interface InvoiceClientProps {
  storeId: string
  currency: string
}

interface InvoiceItemForm {
  description: string
  qty: number
  unitPrice: number
}

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier', href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Faktur B2B', href: '/dashboard/accounting/invoices' },
]

const EMPTY_FORM = {
  customerId: '', issueDate: new Date().toISOString().split('T')[0],
  dueDate: '', notes: '', paymentTerms: 'NET30', taxRate: 0.11,
  items: [{ description: '', qty: 1, unitPrice: 0 }] as InvoiceItemForm[],
}

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {NAV_TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <a key={tab.href} href={tab.href}
            className={cn('px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-2)] hover:bg-[var(--bg-card)] hover:text-[var(--text-1)]')}>
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}
function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export default function InvoiceClient({ storeId, currency }: InvoiceClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm]   = useState(false)
  const [viewInvoice, setViewInvoice] = useState<any>(null)
  const [payModal, setPayModal]   = useState<any>(null)
  const [payAmount, setPayAmount] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM, items: [{ description: '', qty: 1, unitPrice: 0 }] })

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices?storeId=${storeId}`)
      return await res.json() as any
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/invoices?storeId=${storeId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return }
      toast.success('Faktur berhasil dibuat')
      qc.invalidateQueries({ queryKey: ['invoices', storeId] })
      setShowForm(false)
      setForm({ ...EMPTY_FORM, items: [{ description: '', qty: 1, unitPrice: 0 }] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return }
      toast.success('Status diperbarui')
      qc.invalidateQueries({ queryKey: ['invoices', storeId] })
    },
  })

  const payMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const res = await fetch(`/api/invoices/${id}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      return await res.json() as any
    },
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return }
      toast.success('Pembayaran dicatat')
      qc.invalidateQueries({ queryKey: ['invoices', storeId] })
      setPayModal(null); setPayAmount('')
    },
  })

  const subtotal = calcSubtotal(form.items)
  const taxAmount = calcTaxAmount(subtotal, form.taxRate)
  const total = calcTotal(subtotal, taxAmount)

  const handleSubmit = () => {
    if (!form.customerId) { toast.error('ID pelanggan diperlukan'); return }
    if (!form.dueDate)    { toast.error('Tanggal jatuh tempo diperlukan'); return }
    const validItems = form.items.filter(i => i.description.trim())
    if (validItems.length === 0) { toast.error('Minimal satu item diperlukan'); return }
    createMutation.mutate({
      customerId: form.customerId, issueDate: form.issueDate, dueDate: form.dueDate,
      notes: form.notes, paymentTerms: form.paymentTerms,
      subtotal, taxAmount, total, items: validItems,
    })
  }

  const updateItem = (idx: number, field: keyof InvoiceItemForm, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: val }
      return { ...f, items }
    })
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', qty: 1, unitPrice: 0 }] }))
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const overdueList = (invoices as any[]).filter((inv: any) => isOverdue(inv.dueDate, inv.status as InvoiceStatus))

  return (
    <div className="space-y-6">
      <SubNav />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Faktur &amp; Tagihan</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Kelola faktur B2B dan pembayaran pelanggan</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Buat Faktur
        </button>
      </div>

      {overdueList.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-semibold">{overdueList.length} faktur</span> telah melewati tanggal jatuh tempo
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-[var(--text-3)] text-sm">Memuat...</div>
        ) : (invoices as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--text-3)] gap-2">
            <FileText className="w-8 h-8 opacity-40" />
            <p className="text-sm">Belum ada faktur. Buat faktur pertama Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">No. Faktur</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Pelanggan</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Terbit</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Jatuh Tempo</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">Total</th>
                  <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-[var(--text-2)]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(invoices as any[]).map((inv: any) => {
                  const overdue = isOverdue(inv.dueDate, inv.status as InvoiceStatus)
                  const days = daysOverdue(inv.dueDate)
                  return (
                    <tr key={inv.id} className="hover:bg-[var(--bg-1)] transition-colors">
                      <td className="px-4 py-3 font-mono text-[var(--text-1)]">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{inv.customerId}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{inv.issueDate}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[var(--text-2)]', overdue && 'text-red-600 font-medium')}>
                          {inv.dueDate}{overdue && <span className="ml-1 text-xs">({days}h terlambat)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--text-1)]">
                        {formatCurrency(inv.total, currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={inv.status as InvoiceStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewInvoice(inv)} title="Preview"
                            className="p-1.5 rounded hover:bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          {inv.status === 'DRAFT' && (
                            <button onClick={() => statusMutation.mutate({ id: inv.id, status: 'SENT' })} title="Kirim"
                              className="p-1.5 rounded hover:bg-[var(--bg-2)] text-blue-500 hover:text-blue-700 transition-colors">
                              <Clock className="w-4 h-4" />
                            </button>
                          )}
                          {(inv.status === 'SENT' || inv.status === 'OVERDUE') && (
                            <button onClick={() => { setPayModal(inv); setPayAmount(String(inv.total)) }} title="Catat Pembayaran"
                              className="p-1.5 rounded hover:bg-[var(--bg-2)] text-emerald-500 hover:text-emerald-700 transition-colors">
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                          {inv.status === 'PAID' && (
                            <CheckCircle className="w-4 h-4 text-emerald-500 mx-1.5" />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Buat Faktur Baru</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-[var(--bg-2)] transition-colors">
                <X className="w-4 h-4 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">ID Pelanggan *</label>
                  <input value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
                    placeholder="cust_xxx" className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Syarat Pembayaran</label>
                  <select value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none">
                    <option value="NET7">NET 7</option>
                    <option value="NET14">NET 14</option>
                    <option value="NET30">NET 30</option>
                    <option value="NET60">NET 60</option>
                    <option value="COD">COD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tanggal Terbit *</label>
                  <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jatuh Tempo *</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tarif Pajak (%)</label>
                  <input type="number" min={0} max={100} step={0.1}
                    value={form.taxRate * 100}
                    onChange={e => setForm(f => ({ ...f, taxRate: Number(e.target.value) / 100 }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Catatan</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none resize-none" />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[var(--text-2)]">Item Faktur</label>
                  <button onClick={addItem} className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Tambah Item
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <input placeholder="Deskripsi" value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-xs focus:outline-none" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" placeholder="Qty" min={1} value={item.qty}
                          onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-xs focus:outline-none" />
                      </div>
                      <div className="col-span-4">
                        <input type="number" placeholder="Harga Satuan" min={0} value={item.unitPrice}
                          onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-xs focus:outline-none" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-[var(--border)] pt-4 space-y-1.5">
                <div className="flex justify-between text-sm text-[var(--text-2)]">
                  <span>Subtotal</span><span>{formatCurrency(subtotal, currency)}</span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-2)]">
                  <span>Pajak ({(form.taxRate * 100).toFixed(0)}%)</span><span>{formatCurrency(taxAmount, currency)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold text-[var(--text-1)] pt-1 border-t border-[var(--border)]">
                  <span>Total</span><span>{formatCurrency(total, currency)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors">
                  Batal
                </button>
                <button onClick={handleSubmit} disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60">
                  {createMutation.isPending ? 'Menyimpan...' : 'Buat Faktur'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Catat Pembayaran</h2>
              <button onClick={() => { setPayModal(null); setPayAmount('') }} className="p-2 rounded-lg hover:bg-[var(--bg-2)] transition-colors">
                <X className="w-4 h-4 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-[var(--bg-1)] text-sm space-y-1">
                <div className="flex justify-between text-[var(--text-2)]">
                  <span>Faktur</span><span className="font-mono">{payModal.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-[var(--text-1)] font-medium">
                  <span>Total</span><span>{formatCurrency(payModal.total, currency)}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jumlah Pembayaran</label>
                <input type="number" min={0} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setPayModal(null); setPayAmount('') }}
                  className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors">
                  Batal
                </button>
                <button onClick={() => payMutation.mutate({ id: payModal.id, amount: Number(payAmount) })}
                  disabled={payMutation.isPending || !payAmount}
                  className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60">
                  {payMutation.isPending ? 'Memproses...' : 'Konfirmasi Bayar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Preview Faktur</h2>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors">
                  <Printer className="w-3.5 h-3.5" /> Cetak
                </button>
                <button onClick={() => setViewInvoice(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-8 print:p-0">
              {/* PDF-ready invoice layout */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">FAKTUR</h3>
                  <p className="font-mono text-sm text-gray-500 mt-1">{viewInvoice.invoiceNumber}</p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p>Tanggal Terbit: <span className="font-medium text-gray-900">{viewInvoice.issueDate}</span></p>
                  <p>Jatuh Tempo: <span className="font-medium text-gray-900">{viewInvoice.dueDate}</span></p>
                  {viewInvoice.paymentTerms && <p className="mt-1 text-xs text-gray-400">{viewInvoice.paymentTerms}</p>}
                </div>
              </div>
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tagihan Kepada</p>
                <p className="text-sm text-gray-800">{viewInvoice.customerId}</p>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Deskripsi</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Harga Satuan</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">
                        Item akan dimuat dari API
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Subtotal</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-800">{formatCurrency(viewInvoice.subtotal, currency)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Pajak</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-800">{formatCurrency(viewInvoice.taxAmount, currency)}</td>
                    </tr>
                    <tr className="border-t border-gray-200">
                      <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(viewInvoice.total, currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {viewInvoice.notes && (
                <div className="text-sm text-gray-600">
                  <p className="font-semibold text-gray-800 mb-1">Catatan:</p>
                  <p>{viewInvoice.notes}</p>
                </div>
              )}
              <div className="mt-8 pt-6 border-t border-gray-200 flex justify-between items-center">
                <StatusBadge status={viewInvoice.status as InvoiceStatus} />
                <p className="text-xs text-gray-400">Dokumen ini dibuat secara otomatis oleh sistem kasir</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

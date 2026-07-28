'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { FileText, AlertCircle, CheckCircle, Clock, ChevronDown, ChevronUp, CreditCard, X } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface SupplierInvoiceClientProps {
  storeId: string
  currency: string
}

type InvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'
type AgingBucket = '0-30' | '31-60' | '61-90' | '90+'

interface SupplierInvoice {
  id: string
  vendorId: string
  invoiceNumber: string
  amount: number
  tax: number
  total: number
  dueDate: string
  status: InvoiceStatus
  createdAt: string
  paid: number
  balance: number
}

interface AgingBucketData {
  count: number
  totalBalance: number
  invoices: unknown[]
}

interface AgingReport {
  buckets: Record<AgingBucket, AgingBucketData>
  totalOverdue: number
  totalCount: number
  asOf: string
}

const NAV_TABS = [
  { label: 'Ringkasan',         href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal',            href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo',      href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier',   href: '/dashboard/accounting/supplier-invoices' },
]

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  PENDING:  { label: 'Belum Bayar', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  PARTIAL:  { label: 'Sebagian',    color: 'text-blue-600 bg-blue-50 border-blue-200' },
  PAID:     { label: 'Lunas',       color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  OVERDUE:  { label: 'Jatuh Tempo', color: 'text-red-600 bg-red-50 border-red-200' },
}

const BUCKET_LABELS: Record<AgingBucket, string> = {
  '0-30':  '0-30 hari',
  '31-60': '31-60 hari',
  '61-90': '61-90 hari',
  '90+':   '> 90 hari',
}

const BUCKET_COLORS: Record<AgingBucket, string> = {
  '0-30':  'border-amber-200 bg-amber-50 text-amber-700',
  '31-60': 'border-orange-200 bg-orange-50 text-orange-700',
  '61-90': 'border-red-200 bg-red-50 text-red-600',
  '90+':   'border-red-300 bg-red-100 text-red-700',
}

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
              'whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              active
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]'
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status]
  const icons: Record<InvoiceStatus, React.ReactNode> = {
    PENDING: <Clock className="h-3 w-3" />,
    PARTIAL: <ChevronDown className="h-3 w-3" />,
    PAID:    <CheckCircle className="h-3 w-3" />,
    OVERDUE: <AlertCircle className="h-3 w-3" />,
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border', cfg.color)}>
      {icons[status]}
      {cfg.label}
    </span>
  )
}

function PayModal({
  invoice,
  storeId,
  currency,
  onClose,
}: {
  invoice: SupplierInvoice
  storeId: string
  currency: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState(String(invoice.balance))
  const [method, setMethod] = useState('TRANSFER')
  const [note, setNote] = useState('')

  const pay = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/supplier-invoices/${invoice.id}/pay?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), paymentMethod: method, note: note || undefined }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Gagal memproses pembayaran')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices', storeId] })
      qc.invalidateQueries({ queryKey: ['supplier-invoices-aging', storeId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text-1)]">Bayar Faktur</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="text-sm text-[var(--text-2)] space-y-1">
          <p>Faktur: <span className="font-semibold text-[var(--text-1)]">{invoice.invoiceNumber}</span></p>
          <p>Total: <span className="font-semibold">{formatCurrency(invoice.total, currency)}</span></p>
          <p>Sisa: <span className="font-semibold text-red-500">{formatCurrency(invoice.balance, currency)}</span></p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1 block">Jumlah Bayar</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1 block">Metode Pembayaran</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            >
              <option value="TRANSFER">Transfer Bank</option>
              <option value="CASH">Tunai</option>
              <option value="CHECK">Cek/Giro</option>
              <option value="CREDIT_CARD">Kartu Kredit</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1 block">Catatan (opsional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Nomor referensi, dll."
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>
        </div>
        {pay.error && (
          <p className="text-xs text-red-500">{(pay.error as Error).message}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]">
            Batal
          </button>
          <button
            disabled={pay.isPending || !amount || Number(amount) <= 0}
            onClick={() => pay.mutate()}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pay.isPending ? 'Memproses...' : 'Bayar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgingReportSection({ storeId, currency }: { storeId: string; currency: string }) {
  const [expanded, setExpanded] = useState<AgingBucket | null>(null)

  const { data: aging, isLoading } = useQuery({
    queryKey: ['supplier-invoices-aging', storeId],
    queryFn: () =>
      fetch(`/api/supplier-invoices/aging?storeId=${storeId}`)
        .then(r => r.json()) as Promise<AgingReport>,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  if (!aging) return null

  const buckets: AgingBucket[] = ['0-30', '31-60', '61-90', '90+']

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-[var(--text-3)]">Per tanggal: {aging.asOf}</p>
        <p className="text-sm font-bold text-red-500">
          Total: {formatCurrency(aging.totalOverdue, currency)}
        </p>
      </div>
      {buckets.map(bucket => {
        const b = aging.buckets[bucket]
        if (!b || b.count === 0) return null
        const isOpen = expanded === bucket
        return (
          <div key={bucket} className={cn('border rounded-xl overflow-hidden', BUCKET_COLORS[bucket])}>
            <button
              onClick={() => setExpanded(isOpen ? null : bucket)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">{BUCKET_LABELS[bucket]}</span>
                <span className="text-xs font-medium opacity-75">{b.count} faktur</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{formatCurrency(b.totalBalance, currency)}</span>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-inherit divide-y divide-inherit">
                {(b.invoices as any[]).map((inv: any) => (
                  <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">{inv.invoiceNumber}</p>
                      <p className="text-xs opacity-75">Jatuh tempo: {inv.dueDate}</p>
                    </div>
                    <p className="text-xs font-bold">{formatCurrency(inv.balance, currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {aging.totalCount === 0 && (
        <p className="text-sm text-[var(--text-3)] text-center py-4">Tidak ada faktur jatuh tempo</p>
      )}
    </div>
  )
}

export default function SupplierInvoiceClient({ storeId, currency }: SupplierInvoiceClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'list' | 'aging'>('list')
  const [statusFilter, setStatusFilter] = useState('')
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPaying, setBulkPaying] = useState(false)

  const { data: invoices = [], isLoading } = useQuery<SupplierInvoice[]>({
    queryKey: ['supplier-invoices', storeId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ storeId })
      if (statusFilter) params.set('status', statusFilter)
      return fetch(`/api/supplier-invoices?${params}`).then(r => r.json()) as Promise<SupplierInvoice[]>
    },
  })

  const bulkPay = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map(id => {
          const inv = invoices.find(i => i.id === id)
          if (!inv || inv.balance <= 0) return null
          return fetch(`/api/supplier-invoices/${id}/pay?storeId=${storeId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: inv.balance, paymentMethod: 'TRANSFER' }),
          })
        })
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices', storeId] })
      qc.invalidateQueries({ queryKey: ['supplier-invoices-aging', storeId] })
      setSelected(new Set())
      setBulkPaying(false)
    },
  })

  const selectedInvoices = invoices.filter(i => selected.has(i.id))
  const bulkTotal = selectedInvoices.reduce((s, i) => s + i.balance, 0)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const unpaidInvoices = invoices.filter(i => i.status !== 'PAID')
  const toggleAll = () => {
    if (selected.size === unpaidInvoices.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(unpaidInvoices.map(i => i.id)))
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Faktur Supplier & Hutang Dagang</h1>
        <p className="text-[var(--text-3)] text-sm mt-0.5">Kelola tagihan dari vendor dan jadwal pembayaran</p>
      </div>

      <SubNav />

      <div className="flex gap-2">
        {(['list', 'aging'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              tab === t
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]'
            )}
          >
            {t === 'list' ? 'Daftar Faktur' : 'Laporan Aging'}
          </button>
        ))}
      </div>

      {tab === 'aging' ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[var(--text-1)] mb-4">Laporan Aging Hutang Dagang</h2>
          <AgingReportSection storeId={storeId} currency={currency} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            >
              <option value="">Semua Status</option>
              <option value="PENDING">Belum Bayar</option>
              <option value="PARTIAL">Sebagian</option>
              <option value="OVERDUE">Jatuh Tempo</option>
              <option value="PAID">Lunas</option>
            </select>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-[var(--text-2)]">
                  {selected.size} dipilih · {formatCurrency(bulkTotal, currency)}
                </span>
                <button
                  disabled={bulkPay.isPending}
                  onClick={() => { setBulkPaying(true); bulkPay.mutate(Array.from(selected)) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  {bulkPay.isPending ? 'Memproses...' : 'Bayar Semua'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-3)] bg-[var(--bg-subtle)]">
              <input
                type="checkbox"
                checked={unpaidInvoices.length > 0 && selected.size === unpaidInvoices.length}
                onChange={toggleAll}
                className="rounded"
              />
              <span className="flex-1">Nomor Faktur</span>
              <span className="w-28 text-right hidden sm:block">Total</span>
              <span className="w-28 text-right hidden sm:block">Sisa</span>
              <span className="w-28 text-center hidden md:block">Jatuh Tempo</span>
              <span className="w-24 text-center">Status</span>
              <span className="w-16 text-center">Aksi</span>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="h-8 w-8 text-[var(--text-3)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-3)]">Belum ada faktur supplier</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {invoices.map(inv => (
                  <div
                    key={inv.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors',
                      selected.has(inv.id) && 'bg-amber-50/30'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      disabled={inv.status === 'PAID'}
                      onChange={() => toggleSelect(inv.id)}
                      className="rounded disabled:opacity-30"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-1)] truncate">{inv.invoiceNumber}</p>
                      <p className="text-xs text-[var(--text-3)] truncate">Vendor: {inv.vendorId}</p>
                    </div>
                    <span className="w-28 text-right text-sm font-medium text-[var(--text-1)] hidden sm:block">
                      {formatCurrency(inv.total, currency)}
                    </span>
                    <span className={cn(
                      'w-28 text-right text-sm font-semibold hidden sm:block',
                      inv.balance > 0 ? 'text-red-500' : 'text-emerald-600'
                    )}>
                      {formatCurrency(inv.balance, currency)}
                    </span>
                    <span className={cn(
                      'w-28 text-center text-xs hidden md:block',
                      inv.status === 'OVERDUE' ? 'text-red-500 font-semibold' : 'text-[var(--text-2)]'
                    )}>
                      {inv.dueDate}
                    </span>
                    <div className="w-24 flex justify-center">
                      <StatusBadge status={inv.status} />
                    </div>
                    <div className="w-16 flex justify-center">
                      {inv.status !== 'PAID' && (
                        <button
                          onClick={() => setPayingInvoice(inv)}
                          className="text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 font-semibold"
                        >
                          Bayar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {payingInvoice && (
        <PayModal
          invoice={payingInvoice}
          storeId={storeId}
          currency={currency}
          onClose={() => setPayingInvoice(null)}
        />
      )}
    </div>
  )
}

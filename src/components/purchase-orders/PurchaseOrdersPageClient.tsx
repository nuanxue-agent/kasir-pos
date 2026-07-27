'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Package, Truck, ChevronRight, Clock, CheckCircle2, XCircle, Send, Eye } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import POFormModal from './POFormModal'
import PODetailModal from './PODetailModal'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'

interface PurchaseOrdersPageClientProps {
  storeId: string
  currency: string
  taxRate: number
}

type POStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED'

const STATUS_CONFIG: Record<POStatus, { label: string; icon: React.ElementType; pill: string }> = {
  DRAFT:     { label: 'Draft',     icon: Clock,         pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
  SENT:      { label: 'Terkirim',  icon: Send,          pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
  CONFIRMED: { label: 'Dikonfirmasi', icon: CheckCircle2, pill: 'bg-amber-50 text-amber-600 border border-amber-200' },
  RECEIVED:  { label: 'Diterima',  icon: CheckCircle2,  pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  CANCELLED: { label: 'Dibatalkan', icon: XCircle,      pill: 'bg-red-50 text-red-500 border border-red-200' },
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Terkirim' },
  { value: 'CONFIRMED', label: 'Dikonfirmasi' },
  { value: 'RECEIVED', label: 'Diterima' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
]

const PO_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'number',       label: 'No. PO' },
  { key: 'supplierName', label: 'Supplier' },
  { key: 'orderDate',    label: 'Tgl. Order' },
  { key: 'status',       label: 'Status' },
  { key: 'total',        label: 'Total' },
]

export default function PurchaseOrdersPageClient({ storeId, currency, taxRate }: PurchaseOrdersPageClientProps) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedPO, setSelectedPO] = useState<any>(null)

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['purchase-orders', storeId, statusFilter],
    queryFn: () => fetch(`/api/purchase-orders?storeId=${storeId}${statusFilter ? `&status=${statusFilter}` : ''}`).then(r => r.json()),
  })

  const data = rawData as any
  const orders = (data?.orders ?? []).filter((o: any) =>
    !search || o.number.toLowerCase().includes(search.toLowerCase()) || o.supplierName?.toLowerCase().includes(search.toLowerCase())
  )

  const poExportRows = (data?.orders ?? []).map((o: any) => ({
    number:       o.number,
    supplierName: o.supplierName ?? '',
    orderDate:    o.orderDate ? new Date(o.orderDate).toLocaleDateString('id-ID') : '',
    status:       STATUS_CONFIG[o.status as POStatus]?.label ?? o.status,
    total:        o.total ?? 0,
  }))

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Purchase Orders</h1>
          <p className="text-stone-400 text-sm mt-0.5">Kelola pembelian dari supplier</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            type="pdf"
            label="Ekspor PDF"
            data={poExportRows}
            columns={PO_EXPORT_COLUMNS}
            filename={`purchase-orders-${new Date().toISOString().slice(0, 10)}`}
            title="Purchase Orders"
            currency={currency}
          />
          <ExportButton
            type="excel"
            label="Ekspor Excel"
            data={poExportRows}
            columns={PO_EXPORT_COLUMNS}
            filename={`purchase-orders-${new Date().toISOString().slice(0, 10)}`}
            title="Purchase Orders"
            currency={currency}
          />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Buat PO</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Draft', status: 'DRAFT', color: 'text-stone-500' },
          { label: 'Terkirim', status: 'SENT', color: 'text-blue-600' },
          { label: 'Dikonfirmasi', status: 'CONFIRMED', color: 'text-amber-600' },
          { label: 'Diterima', status: 'RECEIVED', color: 'text-emerald-600' },
        ].map(s => {
          const count = (data?.orders ?? []).filter((o: any) => o.status === s.status).length
          return (
            <button key={s.status} onClick={() => setStatusFilter(s.status === statusFilter ? '' : s.status)}
              className={cn('bg-white border rounded-2xl p-4 text-left shadow-sm transition-all', statusFilter === s.status ? 'border-amber-300 bg-amber-50' : 'border-stone-100 hover:border-stone-200')}>
              <p className={`text-2xl font-bold ${s.color}`}>{count}</p>
              <p className="text-xs text-stone-400 mt-0.5">{s.label}</p>
            </button>
          )
        })}
      </div>

      {/* Filter + Search */}
      <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                statusFilter === t.value ? 'bg-amber-500 text-white shadow-sm' : 'bg-stone-50 text-stone-500 hover:bg-stone-100 border border-stone-200'
              )}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            placeholder="Cari nomor PO atau supplier…" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-1 p-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-stone-50 animate-pulse rounded-xl" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-stone-200 mb-3" />
            <p className="text-stone-400 text-sm">Belum ada purchase order</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-amber-500 text-sm font-medium hover:text-amber-600">
              + Buat PO pertama
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-stone-400">NO. PO</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-stone-400">SUPPLIER</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-stone-400">STATUS</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-stone-400">TGL EKSPEKTASI</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-stone-400">TOTAL</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {orders.map((po: any) => {
                    const cfg = STATUS_CONFIG[po.status as POStatus]
                    const Icon = cfg.icon
                    return (
                      <tr key={po.id} className="hover:bg-stone-50/50 transition-colors cursor-pointer" onClick={() => setSelectedPO(po)}>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-stone-700">{po.number}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                              <Truck className="h-3.5 w-3.5 text-stone-400" />
                            </div>
                            <span className="text-stone-700 font-medium">{po.supplierName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold', cfg.pill)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-500 text-xs">
                          {po.expectedDate ? formatDate(po.expectedDate) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-stone-800">
                          {formatCurrency(po.total, currency)}
                        </td>
                        <td className="py-3 px-4">
                          <ChevronRight className="h-4 w-4 text-stone-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-stone-50">
              {orders.map((po: any) => {
                const cfg = STATUS_CONFIG[po.status as POStatus]
                const Icon = cfg.icon
                return (
                  <button key={po.id} onClick={() => setSelectedPO(po)} className="w-full flex items-center gap-3 p-4 hover:bg-stone-50 transition-colors text-left">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                      <Truck className="h-5 w-5 text-stone-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-stone-600">{po.number}</span>
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold', cfg.pill)}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-stone-700 truncate mt-0.5">{po.supplierName}</p>
                      <p className="text-xs text-stone-400">{formatCurrency(po.total, currency)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-stone-300 shrink-0" />
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {showForm && (
        <POFormModal storeId={storeId} currency={currency} taxRate={taxRate}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) }} />
      )}

      {selectedPO && (
        <PODetailModal po={selectedPO} storeId={storeId} currency={currency}
          onClose={() => setSelectedPO(null)}
          onUpdated={(updated) => { setSelectedPO(updated); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) }} />
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import {
  Building2,
  TrendingUp,
  ShoppingCart,
  Users,
  Receipt,
  RefreshCw,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ────────────────────────────────────────────────────────────────────

interface FranchiseLocation {
  id: string
  name: string
  revenue: number
  orders: number
  staffCount: number
  royaltyRate: number
  contractEnd: string | null
}

interface ConsolidatedReport {
  totalRevenue: number
  totalOrders: number
  totalExpenses: number
  netProfit: number
  locations: FranchiseLocation[]
}

interface StockTransfer {
  id: string
  fromStoreId: string
  fromStoreName: string
  toStoreId: string
  toStoreName: string
  productId: string
  productName: string
  qty: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
  requestedAt: string
  completedAt: string | null
}

interface Product {
  id: string
  name: string
  stock: number
}

interface Store {
  id: string
  name: string
}

interface FranchiseClientProps {
  storeId: string
  currency: string
  stores: Store[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isExpiringSoon(contractEnd: string | null): boolean {
  if (!contractEnd) return false
  const diff = new Date(contractEnd).getTime() - Date.now()
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000
}

function isExpired(contractEnd: string | null): boolean {
  if (!contractEnd) return false
  return new Date(contractEnd).getTime() < Date.now()
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  sub?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <div className="rounded-lg bg-indigo-50 p-2">
        <Icon className="h-5 w-5 text-indigo-600" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-3)]">{label}</p>
        <p className="text-lg font-semibold text-[var(--text-1)]">{value}</p>
        {sub && <p className="text-xs text-[var(--text-3)]">{sub}</p>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: StockTransfer['status'] }) {
  const map: Record<StockTransfer['status'], { label: string; className: string }> = {
    PENDING: { label: 'Menunggu', className: 'bg-yellow-100 text-yellow-700' },
    APPROVED: { label: 'Disetujui', className: 'bg-blue-100 text-blue-700' },
    REJECTED: { label: 'Ditolak', className: 'bg-red-100 text-red-700' },
    COMPLETED: { label: 'Selesai', className: 'bg-green-100 text-green-700' },
  }
  const { label, className } = map[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  )
}

// ── Transfer Request Form ─────────────────────────────────────────────────────

function TransferRequestForm({
  storeId,
  stores,
  onSuccess,
}: {
  storeId: string
  stores: Store[]
  onSuccess: () => void
}) {
  const [fromStoreId, setFromStoreId] = useState(storeId)
  const [toStoreId, setToStoreId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState(1)

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products', fromStoreId],
    queryFn: () => fetch(`/api/products?storeId=${fromStoreId}`).then(r => r.json()),
    enabled: !!fromStoreId,
  })

  const mutation = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/stock-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async r => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Gagal')
        return r.json()
      }),
    onSuccess: () => {
      toast.success('Permintaan transfer stok berhasil dikirim')
      setProductId('')
      setQty(1)
      onSuccess()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!toStoreId || !productId || qty < 1) {
      toast.error('Isi semua kolom dengan benar')
      return
    }
    if (fromStoreId === toStoreId) {
      toast.error('Toko asal dan tujuan tidak boleh sama')
      return
    }
    mutation.mutate({ fromStoreId, toStoreId, productId, qty, storeId })
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Dari Toko</label>
        <select
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          value={fromStoreId}
          onChange={e => {
            setFromStoreId(e.target.value)
            setProductId('')
          }}
        >
          {stores.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Ke Toko</label>
        <select
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          value={toStoreId}
          onChange={e => setToStoreId(e.target.value)}
        >
          <option value="">— Pilih toko —</option>
          {stores
            .filter(s => s.id !== fromStoreId)
            .map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Produk</label>
        <select
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          value={productId}
          onChange={e => setProductId(e.target.value)}
        >
          <option value="">— Pilih produk —</option>
          {(products ?? []).map((p: Product) => (
            <option key={p.id} value={p.id}>
              {p.name} (stok: {p.stock})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Jumlah</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={e => setQty(parseInt(e.target.value) || 1)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <ArrowLeftRight className="h-4 w-4" />
          {mutation.isPending ? 'Mengirim…' : 'Kirim Permintaan'}
        </button>
      </div>
    </form>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FranchiseClient({ storeId, currency, stores }: FranchiseClientProps) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'transfers'>('overview')

  // Consolidated report
  const {
    data: report,
    isLoading: reportLoading,
    refetch: refetchReport,
  } = useQuery<ConsolidatedReport>({
    queryKey: ['consolidated', storeId],
    queryFn: () =>
      fetch(`/api/reports/consolidated?parentStoreId=${storeId}`).then(async r => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Error')
        return r.json()
      }),
  })

  // Stock transfers for this store
  const {
    data: transfers,
    isLoading: transfersLoading,
    refetch: refetchTransfers,
  } = useQuery<StockTransfer[]>({
    queryKey: ['stock-transfers', storeId],
    queryFn: () =>
      fetch(`/api/stock-transfers?storeId=${storeId}`).then(async r => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Error')
        return r.json()
      }),
  })

  // Approve / reject transfer
  const patchTransfer = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/stock-transfers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, storeId }),
      }).then(async r => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Gagal')
        return r.json()
      }),
    onSuccess: () => {
      toast.success('Status transfer diperbarui')
      qc.invalidateQueries({ queryKey: ['stock-transfers', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Issue royalty invoice
  const issueRoyalty = useMutation({
    mutationFn: (franchiseStoreId: string) =>
      fetch('/api/franchise-configs/royalty-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ franchiseStoreId, parentStoreId: storeId }),
      }).then(async r => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Gagal')
        return r.json()
      }),
    onSuccess: () => toast.success('Invoice royalti berhasil dibuat'),
    onError: (e: Error) => toast.error(e.message),
  })

  const locations = report?.locations ?? []

  const chartData = locations.map(loc => ({
    name: loc.name.length > 12 ? loc.name.slice(0, 12) + '…' : loc.name,
    Pendapatan: loc.revenue,
    Royalti: Math.round(loc.revenue * (loc.royaltyRate / 100)),
  }))

  const tabs = [
    { id: 'overview', label: 'Ringkasan Franchise' },
    { id: 'transfers', label: 'Transfer Stok' },
  ] as const

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-2">
            <Building2 className="h-6 w-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">Manajemen Franchise</h1>
            <p className="text-sm text-[var(--text-3)]">Pantau semua lokasi franchise Anda</p>
          </div>
        </div>
        <button
          onClick={() => {
            refetchReport()
            refetchTransfers()
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Perbarui
        </button>
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-xl bg-[var(--bg-subtle)] p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === t.id
                ? 'bg-[var(--bg-card)] text-indigo-700 shadow-sm'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Consolidated stats */}
          {reportLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total Pendapatan"
                value={formatCurrency(report?.totalRevenue ?? 0, currency)}
                icon={TrendingUp}
                sub="Semua lokasi"
              />
              <StatCard
                label="Total Pesanan"
                value={(report?.totalOrders ?? 0).toLocaleString()}
                icon={ShoppingCart}
                sub="Semua lokasi"
              />
              <StatCard
                label="Total Pengeluaran"
                value={formatCurrency(report?.totalExpenses ?? 0, currency)}
                icon={Receipt}
                sub="Semua lokasi"
              />
              <StatCard
                label="Laba Bersih"
                value={formatCurrency(report?.netProfit ?? 0, currency)}
                icon={TrendingUp}
                sub="Pendapatan - Pengeluaran"
              />
            </div>
          )}

          {/* Revenue comparison chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-[var(--text-2)]">
                Perbandingan Pendapatan per Lokasi
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v, currency)} />
                  <Tooltip
                    formatter={(v, name) => [formatCurrency(Number(v), currency), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Pendapatan" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Royalti" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Franchise locations table */}
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-2)]">Lokasi Franchise</h2>
              <span className="text-xs text-[var(--text-3)]">{locations.length} lokasi</span>
            </div>
            {reportLoading ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-3)]" />
              </div>
            ) : locations.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-3)]">
                Belum ada lokasi franchise yang terdaftar
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-subtle)] text-xs tracking-wide text-[var(--text-3)] uppercase">
                      <th className="px-4 py-2.5 text-left">Lokasi</th>
                      <th className="px-4 py-2.5 text-right">Pendapatan</th>
                      <th className="px-4 py-2.5 text-right">Pesanan</th>
                      <th className="px-4 py-2.5 text-right">Staf</th>
                      <th className="px-4 py-2.5 text-right">Royalti %</th>
                      <th className="px-4 py-2.5 text-right">Fee Royalti</th>
                      <th className="px-4 py-2.5 text-right">Kontrak</th>
                      <th className="px-4 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {locations.map(loc => {
                      const royaltyFee = loc.revenue * (loc.royaltyRate / 100)
                      const expiring = isExpiringSoon(loc.contractEnd)
                      const expired = isExpired(loc.contractEnd)
                      return (
                        <tr key={loc.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                          <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 flex-shrink-0 text-indigo-400" />
                              {loc.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-2)]">
                            {formatCurrency(loc.revenue, currency)}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-2)]">
                            {loc.orders.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-2)]">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-[var(--text-3)]" />
                              {loc.staffCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-2)]">{loc.royaltyRate}%</td>
                          <td className="px-4 py-3 text-right font-medium text-indigo-700">
                            {formatCurrency(royaltyFee, currency)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {loc.contractEnd ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  expired
                                    ? 'bg-red-100 text-red-700'
                                    : expiring
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {expired
                                  ? 'Kedaluwarsa'
                                  : expiring
                                    ? 'Segera berakhir'
                                    : loc.contractEnd.slice(0, 10)}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--text-3)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => issueRoyalty.mutate(loc.id)}
                              disabled={issueRoyalty.isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-60"
                            >
                              <Receipt className="h-3 w-3" />
                              Tagih Royalti
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot className="bg-indigo-50">
                    <tr className="text-sm font-semibold text-indigo-900">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(report?.totalRevenue ?? 0, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(report?.totalOrders ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {locations.reduce((s, l) => s + l.staffCount, 0)}
                      </td>
                      <td className="px-4 py-3 text-right">—</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(
                          locations.reduce((s, l) => s + l.revenue * (l.royaltyRate / 100), 0),
                          currency,
                        )}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transfers Tab ── */}
      {activeTab === 'transfers' && (
        <div className="space-y-6">
          {/* Request form */}
          {stores.length > 1 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-2)]">
                <Plus className="h-4 w-4 text-indigo-500" /> Permintaan Transfer Stok
              </h2>
              <TransferRequestForm
                storeId={storeId}
                stores={stores}
                onSuccess={() => qc.invalidateQueries({ queryKey: ['stock-transfers', storeId] })}
              />
            </div>
          )}

          {/* Transfers list */}
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-2)]">Riwayat Transfer Stok</h2>
            </div>
            {transfersLoading ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-3)]" />
              </div>
            ) : !transfers || transfers.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-3)]">Belum ada transfer stok</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-subtle)] text-xs tracking-wide text-[var(--text-3)] uppercase">
                      <th className="px-4 py-2.5 text-left">Produk</th>
                      <th className="px-4 py-2.5 text-left">Dari</th>
                      <th className="px-4 py-2.5 text-left">Ke</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-right">Tanggal</th>
                      <th className="px-4 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transfers.map(tr => (
                      <tr key={tr.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                        <td className="px-4 py-3 font-medium text-[var(--text-1)]">{tr.productName}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{tr.fromStoreName}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{tr.toStoreName}</td>
                        <td className="px-4 py-3 text-right font-medium">{tr.qty}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={tr.status} />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[var(--text-3)]">
                          {new Date(tr.requestedAt).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {tr.status === 'PENDING' && tr.toStoreId === storeId && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() =>
                                  patchTransfer.mutate({ id: tr.id, status: 'APPROVED' })
                                }
                                disabled={patchTransfer.isPending}
                                className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-60"
                                title="Setujui"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  patchTransfer.mutate({ id: tr.id, status: 'REJECTED' })
                                }
                                disabled={patchTransfer.isPending}
                                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-60"
                                title="Tolak"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          {tr.status !== 'PENDING' && (
                            <Clock className="mx-auto h-4 w-4 text-gray-300" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

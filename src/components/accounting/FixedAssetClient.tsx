'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { Package, Plus, Edit, Trash2, TrendingDown, X, Calendar } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface FixedAssetClientProps {
  storeId: string
  currency: string
}

type AssetCategory = 'EQUIPMENT' | 'FURNITURE' | 'VEHICLE' | 'BUILDING' | 'OTHER'
type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED'

interface FixedAsset {
  id: string
  name: string
  category: AssetCategory
  purchaseDate: string
  purchasePrice: number
  usefulLifeYears: number
  residualValue: number
  depreciationMethod: DepreciationMethod
  currentBookValue: number
  status: AssetStatus
  disposalDate?: string
  disposalProceeds?: number
}

interface AssetDepreciation {
  id: string
  assetId: string
  year: number
  month: number
  amount: number
  bookValueAfter: number
  recordedAt: string
}

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier', href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Aset Tetap', href: '/dashboard/accounting/fixed-assets' },
]

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  EQUIPMENT: 'Peralatan',
  FURNITURE: 'Furnitur',
  VEHICLE: 'Kendaraan',
  BUILDING: 'Bangunan',
  OTHER: 'Lainnya',
}

const STATUS_CONFIG: Record<AssetStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Aktif', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  DISPOSED: { label: 'Dijual', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  FULLY_DEPRECIATED: { label: 'Habis Disusut', color: 'text-blue-600 bg-blue-50 border-blue-200' },
}

const METHOD_LABELS: Record<DepreciationMethod, string> = {
  STRAIGHT_LINE: 'Garis Lurus',
  DECLINING_BALANCE: 'Saldo Menurun',
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

function StatusBadge({ status }: { status: AssetStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border', cfg.color)}>
      {cfg.label}
    </span>
  )
}

function AddAssetModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AssetCategory>('EQUIPMENT')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [purchasePrice, setPurchasePrice] = useState('')
  const [usefulLifeYears, setUsefulLifeYears] = useState('5')
  const [residualValue, setResidualValue] = useState('0')
  const [method, setMethod] = useState<DepreciationMethod>('STRAIGHT_LINE')

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fixed-assets?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          purchaseDate,
          purchasePrice: Number(purchasePrice),
          usefulLifeYears: Number(usefulLifeYears),
          residualValue: Number(residualValue),
          depreciationMethod: method,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menambah aset')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets', storeId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text-1)]">Tambah Aset Tetap</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Nama Aset</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Laptop HP EliteBook"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Kategori</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as AssetCategory)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Tanggal Pembelian</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Harga Pembelian</label>
            <input
              type="number"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
              placeholder="12000000"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Masa Manfaat (tahun)</label>
            <input
              type="number"
              value={usefulLifeYears}
              onChange={e => setUsefulLifeYears(e.target.value)}
              placeholder="5"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Nilai Residu</label>
            <input
              type="number"
              value={residualValue}
              onChange={e => setResidualValue(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Metode Penyusutan</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as DepreciationMethod)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            >
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => add.mutate()}
            disabled={add.isPending || !name.trim() || !purchasePrice}
            className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 disabled:opacity-50"
          >
            {add.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--text-1)] font-semibold hover:bg-[var(--bg-muted)]"
          >
            Batal
          </button>
        </div>

        {add.isError && (
          <p className="text-sm text-red-600">{add.error instanceof Error ? add.error.message : 'Error'}</p>
        )}
      </div>
    </div>
  )
}

function DepreciateModal({ asset, storeId, onClose }: { asset: FixedAsset; storeId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1))

  const depreciate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fixed-assets/${asset.id}/depreciate?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month: Number(month) }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal mencatat penyusutan')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets', storeId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text-1)]">Catat Penyusutan</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-sm text-[var(--text-2)] space-y-1">
          <p>Aset: <span className="font-semibold text-[var(--text-1)]">{asset.name}</span></p>
          <p>Nilai Buku: <span className="font-semibold">{formatCurrency(asset.currentBookValue, 'IDR')}</span></p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Tahun</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Bulan (1-12)</label>
            <input
              type="number"
              value={month}
              onChange={e => setMonth(e.target.value)}
              min="1"
              max="12"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => depreciate.mutate()}
            disabled={depreciate.isPending}
            className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 disabled:opacity-50"
          >
            {depreciate.isPending ? 'Menyimpan...' : 'Catat'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--text-1)] font-semibold hover:bg-[var(--bg-muted)]"
          >
            Batal
          </button>
        </div>

        {depreciate.isError && (
          <p className="text-sm text-red-600">{depreciate.error instanceof Error ? depreciate.error.message : 'Error'}</p>
        )}
      </div>
    </div>
  )
}

function DisposeModal({ asset, storeId, onClose }: { asset: FixedAsset; storeId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10))
  const [proceeds, setProceeds] = useState('')

  const dispose = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fixed-assets/${asset.id}/dispose?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposalDate, disposalProceeds: Number(proceeds || 0) }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal melepas aset')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets', storeId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text-1)]">Lepas Aset</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-sm text-[var(--text-2)] space-y-1">
          <p>Aset: <span className="font-semibold text-[var(--text-1)]">{asset.name}</span></p>
          <p>Nilai Buku: <span className="font-semibold">{formatCurrency(asset.currentBookValue, 'IDR')}</span></p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Tanggal Pelepasan</label>
            <input
              type="date"
              value={disposalDate}
              onChange={e => setDisposalDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1">Hasil Penjualan</label>
            <input
              type="number"
              value={proceeds}
              onChange={e => setProceeds(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)]"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => dispose.mutate()}
            disabled={dispose.isPending}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 disabled:opacity-50"
          >
            {dispose.isPending ? 'Menyimpan...' : 'Lepas Aset'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--text-1)] font-semibold hover:bg-[var(--bg-muted)]"
          >
            Batal
          </button>
        </div>

        {dispose.isError && (
          <p className="text-sm text-red-600">{dispose.error instanceof Error ? dispose.error.message : 'Error'}</p>
        )}
      </div>
    </div>
  )
}

export default function FixedAssetClient({ storeId, currency }: FixedAssetClientProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [depreciateAsset, setDepreciateAsset] = useState<FixedAsset | null>(null)
  const [disposeAsset, setDisposeAsset] = useState<FixedAsset | null>(null)

  const { data: assets = [] } = useQuery({
    queryKey: ['fixed-assets', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/fixed-assets?storeId=${storeId}`)
      return res.json() as Promise<FixedAsset[]>
    },
  })

  const activeAssets = assets.filter(a => a.status === 'ACTIVE')
  const totalBookValue = activeAssets.reduce((s, a) => s + a.currentBookValue, 0)
  const totalPurchaseValue = activeAssets.reduce((s, a) => s + a.purchasePrice, 0)

  return (
    <div className="space-y-4 p-4">
      <SubNav />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Aset Tetap</h1>
          <p className="text-sm text-[var(--text-2)]">Kelola aset tetap dan penyusutan</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" />
          Tambah Aset
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-sm mb-1">
            <Package className="h-4 w-4" />
            <span>Total Aset Aktif</span>
          </div>
          <p className="text-2xl font-bold text-[var(--text-1)]">{activeAssets.length}</p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-sm mb-1">
            <TrendingDown className="h-4 w-4" />
            <span>Nilai Buku</span>
          </div>
          <p className="text-2xl font-bold text-[var(--text-1)]">{formatCurrency(totalBookValue, currency)}</p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-sm mb-1">
            <Calendar className="h-4 w-4" />
            <span>Nilai Perolehan</span>
          </div>
          <p className="text-2xl font-bold text-[var(--text-1)]">{formatCurrency(totalPurchaseValue, currency)}</p>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--bg-subtle)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-2)]">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-2)]">Kategori</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-2)]">Tgl Beli</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-2)]">Harga Beli</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-2)]">Nilai Buku</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-2)]">Metode</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-2)]">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-2)]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">
                    Belum ada aset tetap
                  </td>
                </tr>
              ) : (
                assets.map(asset => (
                  <tr key={asset.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3 text-sm font-medium text-[var(--text-1)]">{asset.name}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{CATEGORY_LABELS[asset.category]}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{asset.purchaseDate}</td>
                    <td className="px-4 py-3 text-sm text-right text-[var(--text-2)]">{formatCurrency(asset.purchasePrice, currency)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-[var(--text-1)]">{formatCurrency(asset.currentBookValue, currency)}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{METHOD_LABELS[asset.depreciationMethod]}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={asset.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {asset.status === 'ACTIVE' && (
                          <>
                            <button
                              onClick={() => setDepreciateAsset(asset)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Catat penyusutan"
                            >
                              <TrendingDown className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDisposeAsset(asset)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Lepas aset"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddAssetModal storeId={storeId} onClose={() => setShowAdd(false)} />}
      {depreciateAsset && <DepreciateModal asset={depreciateAsset} storeId={storeId} onClose={() => setDepreciateAsset(null)} />}
      {disposeAsset && <DisposeModal asset={disposeAsset} storeId={storeId} onClose={() => setDisposeAsset(null)} />}
    </div>
  )
}

'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  X,
  Pencil,
  Wrench,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
export type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'UNDER_MAINTENANCE'

export interface Asset {
  id: string
  storeId: string
  name: string
  category: string
  purchaseDate: string
  purchasePrice: number
  usefulLife: number
  method: DepreciationMethod
  salvageValue: number
  status: AssetStatus
  createdAt?: string
  updatedAt?: string
}

export interface MaintenanceLog {
  id: string
  assetId: string
  date: string
  description: string
  cost: number
  createdAt?: string
}

export interface DepreciationRow {
  year: number
  openingBookValue: number
  depreciation: number
  closingBookValue: number
}

// ─── Pure depreciation helpers (also exported for tests) ─────────────────────

export function straightLineAnnual(
  purchasePrice: number,
  salvageValue: number,
  usefulLife: number,
): number {
  if (usefulLife <= 0) return 0
  return (purchasePrice - salvageValue) / usefulLife
}

export function decliningBalanceRate(usefulLife: number): number {
  if (usefulLife <= 0) return 0
  return 2 / usefulLife
}

export function bookValueAtYear(asset: Pick<Asset, 'purchasePrice' | 'salvageValue' | 'usefulLife' | 'method'>, year: number): number {
  const { purchasePrice, salvageValue, usefulLife, method } = asset
  if (year <= 0) return purchasePrice
  if (year >= usefulLife) return salvageValue

  if (method === 'STRAIGHT_LINE') {
    const annual = straightLineAnnual(purchasePrice, salvageValue, usefulLife)
    return Math.max(salvageValue, purchasePrice - annual * year)
  }

  // Declining balance
  const rate = decliningBalanceRate(usefulLife)
  let bv = purchasePrice
  for (let y = 0; y < year; y++) {
    const dep = bv * rate
    bv = Math.max(salvageValue, bv - dep)
  }
  return bv
}

export function generateDepreciationSchedule(asset: Pick<Asset, 'purchasePrice' | 'salvageValue' | 'usefulLife' | 'method'>): DepreciationRow[] {
  const { purchasePrice, salvageValue, usefulLife, method } = asset
  if (usefulLife <= 0) return []
  const rows: DepreciationRow[] = []

  if (method === 'STRAIGHT_LINE') {
    const annual = straightLineAnnual(purchasePrice, salvageValue, usefulLife)
    let bv = purchasePrice
    for (let y = 1; y <= usefulLife; y++) {
      const dep = y < usefulLife ? annual : Math.max(0, bv - salvageValue)
      const closing = Math.max(salvageValue, bv - dep)
      rows.push({ year: y, openingBookValue: bv, depreciation: bv - closing, closingBookValue: closing })
      bv = closing
    }
  } else {
    const rate = decliningBalanceRate(usefulLife)
    let bv = purchasePrice
    for (let y = 1; y <= usefulLife; y++) {
      const dep = y < usefulLife ? bv * rate : Math.max(0, bv - salvageValue)
      const closing = Math.max(salvageValue, bv - dep)
      rows.push({ year: y, openingBookValue: bv, depreciation: bv - closing, closingBookValue: closing })
      bv = closing
    }
  }

  return rows
}

export function monthlyDepreciation(asset: Pick<Asset, 'purchasePrice' | 'salvageValue' | 'usefulLife' | 'method'>): number {
  const schedule = generateDepreciationSchedule(asset)
  if (schedule.length === 0) return 0
  const totalDep = schedule.reduce((s, r) => s + r.depreciation, 0)
  return totalDep / (asset.usefulLife * 12)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  'Peralatan',
  'Kendaraan',
  'Furnitur',
  'Bangunan',
  'Komputer & IT',
  'Mesin',
  'Lain-lain',
]

const METHOD_LABELS: Record<DepreciationMethod, string> = {
  STRAIGHT_LINE: 'Garis Lurus',
  DECLINING_BALANCE: 'Saldo Menurun',
}

const STATUS_LABELS: Record<AssetStatus, string> = {
  ACTIVE: 'Aktif',
  DISPOSED: 'Dilepas',
  UNDER_MAINTENANCE: 'Pemeliharaan',
}

const STATUS_COLORS: Record<AssetStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  DISPOSED: 'bg-red-100 text-red-700',
  UNDER_MAINTENANCE: 'bg-amber-100 text-amber-700',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  storeId: string
  currency: string
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AssetManagementClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const fmt = (v: number) => formatCurrency(v, currency)

  // ── State ──────────────────────────────────────────────────────────────────
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [scheduleAsset, setScheduleAsset] = useState<Asset | null>(null)
  const [maintenanceAsset, setMaintenanceAsset] = useState<Asset | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ['assets', storeId],
    queryFn: () =>
      fetch(`/api/assets?storeId=${storeId}`).then(r => r.json()),
  })

  const { data: maintenanceLogs = [] } = useQuery<MaintenanceLog[]>({
    queryKey: ['maintenance', maintenanceAsset?.id],
    queryFn: () =>
      fetch(`/api/assets/${maintenanceAsset!.id}/maintenance?storeId=${storeId}`).then(r => r.json()),
    enabled: !!maintenanceAsset,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addAsset = useMutation({
    mutationFn: (body: Partial<Asset>) =>
      fetch(`/api/assets?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets', storeId] }); setShowAddAsset(false) },
  })

  const patchAsset = useMutation({
    mutationFn: ({ id, ...body }: Partial<Asset> & { id: string }) =>
      fetch(`/api/assets/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets', storeId] }); setEditAsset(null) },
  })

  const addMaintenance = useMutation({
    mutationFn: (body: Partial<MaintenanceLog>) =>
      fetch(`/api/assets/${maintenanceAsset!.id}/maintenance?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance', maintenanceAsset?.id] }),
  })

  // ── Summaries ──────────────────────────────────────────────────────────────
  const totalBookValue = useMemo(
    () => assets.reduce((s, a) => s + bookValueAtYear(a, yearsSince(a.purchaseDate)), 0),
    [assets],
  )
  const totalMonthlyDep = useMemo(
    () => assets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + monthlyDepreciation(a), 0),
    [assets],
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Manajemen Aset</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Daftar aset bisnis dan jadwal penyusutan</p>
        </div>
        <button
          onClick={() => setShowAddAsset(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Tambah Aset
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Aset" value={String(assets.length)} unit="aset" />
        <SummaryCard label="Total Nilai Buku" value={fmt(totalBookValue)} unit="" />
        <SummaryCard label="Penyusutan Bulanan" value={fmt(totalMonthlyDep)} unit="/bulan" />
      </div>

      {/* Asset table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-[var(--text-3)]" /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-3)]">Belum ada aset. Klik &quot;Tambah Aset&quot; untuk mulai.</div>
      ) : (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Nama</th>
                <th className="px-4 py-3 text-left">Kategori</th>
                <th className="px-4 py-3 text-right">Harga Beli</th>
                <th className="px-4 py-3 text-right">Nilai Buku</th>
                <th className="px-4 py-3 text-left">Metode</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {assets.map(asset => {
                const bv = bookValueAtYear(asset, yearsSince(asset.purchaseDate))
                const expanded = expandedId === asset.id
                return (
                  <>
                    <tr key={asset.id} className="hover:bg-[var(--bg-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{asset.name}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{asset.category}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-2)]">{fmt(asset.purchasePrice)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(bv)}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{METHOD_LABELS[asset.method]}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[asset.status]}`}>
                          {STATUS_LABELS[asset.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <ActionBtn icon={<BarChart2 className="w-4 h-4" />} title="Jadwal Penyusutan" onClick={() => setScheduleAsset(asset)} />
                          <ActionBtn icon={<Wrench className="w-4 h-4" />} title="Log Pemeliharaan" onClick={() => setMaintenanceAsset(asset)} />
                          <ActionBtn icon={<Pencil className="w-4 h-4" />} title="Edit" onClick={() => setEditAsset(asset)} />
                          <ActionBtn
                            icon={expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            title="Detail"
                            onClick={() => setExpandedId(expanded ? null : asset.id)}
                          />
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${asset.id}-detail`} className="bg-blue-50">
                        <td colSpan={7} className="px-6 py-3 text-xs text-[var(--text-2)] space-y-1">
                          <p><span className="font-medium">Tanggal Beli:</span> {asset.purchaseDate}</p>
                          <p><span className="font-medium">Umur Manfaat:</span> {asset.usefulLife} tahun</p>
                          <p><span className="font-medium">Nilai Residu:</span> {fmt(asset.salvageValue)}</p>
                          <p><span className="font-medium">Penyusutan Bulanan:</span> {fmt(monthlyDepreciation(asset))}</p>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit asset modal */}
      {(showAddAsset || editAsset) && (
        <AssetFormModal
          initial={editAsset ?? undefined}
          onClose={() => { setShowAddAsset(false); setEditAsset(null) }}
          onSubmit={data => {
            if (editAsset) patchAsset.mutate({ id: editAsset.id, ...data })
            else addAsset.mutate(data)
          }}
          isPending={addAsset.isPending || patchAsset.isPending}
        />
      )}

      {/* Depreciation schedule modal */}
      {scheduleAsset && (
        <DepreciationScheduleModal
          asset={scheduleAsset}
          currency={currency}
          onClose={() => setScheduleAsset(null)}
        />
      )}

      {/* Maintenance log modal */}
      {maintenanceAsset && (
        <MaintenanceModal
          asset={maintenanceAsset}
          logs={maintenanceLogs}
          currency={currency}
          onClose={() => setMaintenanceAsset(null)}
          onAdd={data => addMaintenance.mutate(data)}
          isPending={addMaintenance.isPending}
        />
      )}
    </div>
  )
}

// ─── Helper: years elapsed ────────────────────────────────────────────────────

function yearsSince(dateStr: string): number {
  const purchase = new Date(dateStr)
  const now = new Date()
  const ms = now.getTime() - purchase.getTime()
  return ms / (1000 * 60 * 60 * 24 * 365.25)
}

// ─── Small components ─────────────────────────────────────────────────────────

function SummaryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-1)] mt-1">{value}<span className="text-sm font-normal text-[var(--text-3)] ml-1">{unit}</span></p>
    </div>
  )
}

function ActionBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-2)]"
    >
      {icon}
    </button>
  )
}

// ─── Asset Form Modal ─────────────────────────────────────────────────────────

interface AssetFormModalProps {
  initial?: Asset
  onClose: () => void
  onSubmit: (data: Partial<Asset>) => void
  isPending: boolean
}

function AssetFormModal({ initial, onClose, onSubmit, isPending }: AssetFormModalProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    category: initial?.category ?? ASSET_CATEGORIES[0],
    purchaseDate: initial?.purchaseDate ?? new Date().toISOString().slice(0, 10),
    purchasePrice: initial?.purchasePrice ?? 0,
    usefulLife: initial?.usefulLife ?? 5,
    method: (initial?.method ?? 'STRAIGHT_LINE') as DepreciationMethod,
    salvageValue: initial?.salvageValue ?? 0,
    status: (initial?.status ?? 'ACTIVE') as AssetStatus,
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal title={initial ? 'Edit Aset' : 'Tambah Aset'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nama Aset">
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label="Kategori">
          <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
            {ASSET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Beli">
            <input type="date" className={inputCls} value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} />
          </Field>
          <Field label="Harga Beli (Rp)">
            <input type="number" min="0" className={inputCls} value={form.purchasePrice} onChange={e => set('purchasePrice', Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Umur Manfaat (tahun)">
            <input type="number" min="1" max="50" className={inputCls} value={form.usefulLife} onChange={e => set('usefulLife', Number(e.target.value))} />
          </Field>
          <Field label="Nilai Residu (Rp)">
            <input type="number" min="0" className={inputCls} value={form.salvageValue} onChange={e => set('salvageValue', Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Metode Penyusutan">
            <select className={inputCls} value={form.method} onChange={e => set('method', e.target.value as DepreciationMethod)}>
              <option value="STRAIGHT_LINE">Garis Lurus</option>
              <option value="DECLINING_BALANCE">Saldo Menurun</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value as AssetStatus)}>
              {(Object.keys(STATUS_LABELS) as AssetStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm hover:bg-[var(--bg-subtle)]">Batal</button>
          <button
            onClick={() => onSubmit(form)}
            disabled={isPending || !form.name}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Depreciation Schedule Modal ──────────────────────────────────────────────

function DepreciationScheduleModal({ asset, currency, onClose }: { asset: Asset; currency: string; onClose: () => void }) {
  const fmt = (v: number) => formatCurrency(v, currency)
  const schedule = generateDepreciationSchedule(asset)

  return (
    <Modal title={`Jadwal Penyusutan — ${asset.name}`} onClose={onClose} wide>
      <div className="text-xs text-[var(--text-3)] mb-3">
        Metode: <span className="font-semibold text-[var(--text-2)]">{METHOD_LABELS[asset.method]}</span>
        {' · '}Umur Manfaat: <span className="font-semibold text-[var(--text-2)]">{asset.usefulLife} tahun</span>
        {' · '}Nilai Residu: <span className="font-semibold text-[var(--text-2)]">{fmt(asset.salvageValue)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-3)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Tahun</th>
              <th className="px-3 py-2 text-right">Nilai Buku Awal</th>
              <th className="px-3 py-2 text-right">Penyusutan</th>
              <th className="px-3 py-2 text-right">Nilai Buku Akhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {schedule.map(row => (
              <tr key={row.year} className="hover:bg-[var(--bg-subtle)]">
                <td className="px-3 py-2 font-medium">Tahun {row.year}</td>
                <td className="px-3 py-2 text-right">{fmt(row.openingBookValue)}</td>
                <td className="px-3 py-2 text-right text-red-600">({fmt(row.depreciation)})</td>
                <td className="px-3 py-2 text-right font-semibold text-blue-700">{fmt(row.closingBookValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

// ─── Maintenance Log Modal ────────────────────────────────────────────────────

interface MaintenanceModalProps {
  asset: Asset
  logs: MaintenanceLog[]
  currency: string
  onClose: () => void
  onAdd: (data: Partial<MaintenanceLog>) => void
  isPending: boolean
}

function MaintenanceModal({ asset, logs, currency, onClose, onAdd, isPending }: MaintenanceModalProps) {
  const fmt = (v: number) => formatCurrency(v, currency)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), description: '', cost: 0 })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal title={`Log Pemeliharaan — ${asset.name}`} onClose={onClose} wide>
      {/* Add entry form */}
      <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-2 mb-4">
        <p className="text-xs font-semibold text-[var(--text-2)] uppercase">Tambah Catatan</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className={inputCls} value={form.date} onChange={e => set('date', e.target.value)} />
          <input type="number" min="0" placeholder="Biaya (Rp)" className={inputCls} value={form.cost} onChange={e => set('cost', Number(e.target.value))} />
        </div>
        <input className={inputCls} placeholder="Deskripsi pemeliharaan..." value={form.description} onChange={e => set('description', e.target.value)} />
        <div className="flex justify-end">
          <button
            onClick={() => onAdd(form)}
            disabled={isPending || !form.description}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>

      {/* Log list */}
      {logs.length === 0 ? (
        <p className="text-center py-6 text-[var(--text-3)] text-sm">Belum ada catatan pemeliharaan.</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {logs.map(log => (
            <div key={log.id} className="py-2 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-1)]">{log.description}</p>
                <p className="text-xs text-[var(--text-3)]">{log.date}</p>
              </div>
              <span className="text-sm font-semibold text-red-600">{fmt(log.cost)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─── Generic Modal wrapper ────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-[var(--bg-card)] rounded-xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-[var(--text-1)]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-subtle)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-2)] mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-[var(--border-mid)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

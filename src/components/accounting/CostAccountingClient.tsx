'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcTotalCost,
  calcCostVariance,
  calcCostVariancePct,
  calcGrossMarginPct,
  calcBudgetVariance,
  calcBudgetUtilizationPct,
  isBudgetOverrun,
} from '@/lib/cost-accounting'

export {
  calcTotalCost,
  calcCostVariance,
  calcCostVariancePct,
  calcGrossMarginPct,
  calcBudgetVariance,
  calcBudgetUtilizationPct,
  isBudgetOverrun,
} from '@/lib/cost-accounting'

interface ProductCost {
  id: string
  storeId: string
  productId: string
  productName?: string
  materialCost: number
  laborCost: number
  overheadCost: number
  totalCost: number
  effectiveDate: string
  notes?: string
}

interface CostCenter {
  id: string
  storeId: string
  name: string
  type: 'PRODUCTION' | 'OVERHEAD' | 'ADMIN' | 'SALES'
  budget: number
  actualCost: number
  period: string
}

interface Props {
  storeId: string
  currency: string
}

const CC_TYPES = ['PRODUCTION', 'OVERHEAD', 'ADMIN', 'SALES'] as const
const TYPE_LABELS: Record<string, string> = {
  PRODUCTION: 'Produksi',
  OVERHEAD: 'Overhead',
  ADMIN: 'Administrasi',
  SALES: 'Penjualan',
}

const TABS = ['product-costs', 'cost-centers', 'variance'] as const
type Tab = typeof TABS[number]

export default function CostAccountingClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('product-costs')
  const [showPCForm, setShowPCForm] = useState(false)
  const [showCCForm, setShowCCForm] = useState(false)
  const [pcForm, setPCForm] = useState({ productId: '', materialCost: '', laborCost: '', overheadCost: '', effectiveDate: '', notes: '' })
  const [ccForm, setCCForm] = useState({ name: '', type: 'OVERHEAD', budget: '', period: '' })

  const { data: productCosts = [], isLoading: pcLoading } = useQuery<ProductCost[]>({
    queryKey: ['product-costs', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/product-costs?storeId=${storeId}`)
      return (await res.json()) as any
    },
  })

  const { data: costCenters = [], isLoading: ccLoading } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/cost-centers?storeId=${storeId}`)
      return (await res.json()) as any
    },
  })

  const { data: variance } = useQuery({
    queryKey: ['cost-centers-variance', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/cost-centers/variance?storeId=${storeId}`)
      return (await res.json()) as any
    },
    enabled: tab === 'variance',
  })

  const addProductCost = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/product-costs?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: pcForm.productId,
          materialCost: Number(pcForm.materialCost),
          laborCost: Number(pcForm.laborCost),
          overheadCost: Number(pcForm.overheadCost),
          effectiveDate: pcForm.effectiveDate,
          notes: pcForm.notes || undefined,
        }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Biaya produk disimpan')
      qc.invalidateQueries({ queryKey: ['product-costs', storeId] })
      setShowPCForm(false)
      setPCForm({ productId: '', materialCost: '', laborCost: '', overheadCost: '', effectiveDate: '', notes: '' })
    },
    onError: (e: any) => toast.error(e.message ?? 'Gagal menyimpan'),
  })

  const addCostCenter = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cost-centers?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ccForm.name,
          type: ccForm.type,
          budget: Number(ccForm.budget),
          period: ccForm.period,
        }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Pusat biaya ditambahkan')
      qc.invalidateQueries({ queryKey: ['cost-centers', storeId] })
      qc.invalidateQueries({ queryKey: ['cost-centers-variance', storeId] })
      setShowCCForm(false)
      setCCForm({ name: '', type: 'OVERHEAD', budget: '', period: '' })
    },
    onError: (e: any) => toast.error(e.message ?? 'Gagal menyimpan'),
  })

  const totalCOGS = productCosts.reduce((s, pc) => s + pc.totalCost, 0)
  const avgMargin = productCosts.length > 0
    ? productCosts.reduce((s, pc) => s + calcGrossMarginPct(pc.totalCost * 1.5, pc.totalCost), 0) / productCosts.length
    : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Akuntansi Biaya</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>COGS, alokasi overhead, dan analisis varians biaya</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total COGS', value: formatCurrency(totalCOGS, currency), icon: DollarSign, color: '#3b82f6' },
          { label: 'Produk Terdaftar', value: String(productCosts.length), icon: BarChart3, color: '#8b5cf6' },
          { label: 'Pusat Biaya', value: String(costCenters.length), icon: TrendingUp, color: '#10b981' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2" style={{ background: card.color + '22' }}>
                <card.icon size={20} style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{card.label}</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {[
          { id: 'product-costs', label: 'Biaya Produk' },
          { id: 'cost-centers', label: 'Pusat Biaya' },
          { id: 'variance', label: 'Analisis Varians' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.id ? 'border-blue-500' : 'border-transparent')}
            style={{ color: tab === t.id ? 'var(--primary)' : 'var(--text-2)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Product Costs tab */}
      {tab === 'product-costs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowPCForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: 'var(--primary)' }}
            >
              <Plus size={16} /> Tambah Biaya
            </button>
          </div>

          {showPCForm && (
            <div className="rounded-xl border p-5 space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Input Biaya Produk</h3>
                <button onClick={() => setShowPCForm(false)}><X size={16} style={{ color: 'var(--text-3)' }} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Product ID *', key: 'productId', type: 'text', placeholder: 'ID produk' },
                  { label: 'Tanggal Berlaku *', key: 'effectiveDate', type: 'date', placeholder: '' },
                  { label: 'Biaya Material', key: 'materialCost', type: 'number', placeholder: '0' },
                  { label: 'Biaya Tenaga Kerja', key: 'laborCost', type: 'number', placeholder: '0' },
                  { label: 'Biaya Overhead', key: 'overheadCost', type: 'number', placeholder: '0' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>{f.label}</label>
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      value={(pcForm as any)[f.key]}
                      onChange={e => setPCForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Catatan</label>
                  <input
                    type="text"
                    placeholder="Catatan opsional"
                    value={pcForm.notes}
                    onChange={e => setPCForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
              </div>
              {pcForm.materialCost || pcForm.laborCost || pcForm.overheadCost ? (
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                  Total biaya: <strong style={{ color: 'var(--text-1)' }}>
                    {formatCurrency(calcTotalCost({
                      materialCost: Number(pcForm.materialCost) || 0,
                      laborCost: Number(pcForm.laborCost) || 0,
                      overheadCost: Number(pcForm.overheadCost) || 0,
                    }), currency)}
                  </strong>
                </p>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowPCForm(false)} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>Batal</button>
                <button
                  onClick={() => addProductCost.mutate()}
                  disabled={addProductCost.isPending}
                  className="px-4 py-2 text-sm rounded-lg text-white font-medium"
                  style={{ background: 'var(--primary)' }}
                >
                  {addProductCost.isPending ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          )}

          {pcLoading ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Memuat...</p>
          ) : productCosts.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Belum ada data biaya produk</p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Produk', 'Material', 'Tenaga Kerja', 'Overhead', 'Total Biaya', 'Berlaku'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productCosts.map((pc, i) => (
                    <tr key={pc.id} className="border-t" style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{pc.productName ?? pc.productId}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(pc.materialCost, currency)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(pc.laborCost, currency)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(pc.overheadCost, currency)}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-1)' }}>{formatCurrency(pc.totalCost, currency)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{pc.effectiveDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cost Centers tab */}
      {tab === 'cost-centers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCCForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: 'var(--primary)' }}
            >
              <Plus size={16} /> Tambah Pusat Biaya
            </button>
          </div>

          {showCCForm && (
            <div className="rounded-xl border p-5 space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Pusat Biaya Baru</h3>
                <button onClick={() => setShowCCForm(false)}><X size={16} style={{ color: 'var(--text-3)' }} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Nama *</label>
                  <input type="text" placeholder="Nama pusat biaya" value={ccForm.name}
                    onChange={e => setCCForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Tipe</label>
                  <select value={ccForm.type} onChange={e => setCCForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}>
                    {CC_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Anggaran</label>
                  <input type="number" placeholder="0" value={ccForm.budget}
                    onChange={e => setCCForm(p => ({ ...p, budget: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Periode (YYYY-MM) *</label>
                  <input type="month" value={ccForm.period}
                    onChange={e => setCCForm(p => ({ ...p, period: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCCForm(false)} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>Batal</button>
                <button onClick={() => addCostCenter.mutate()} disabled={addCostCenter.isPending}
                  className="px-4 py-2 text-sm rounded-lg text-white font-medium" style={{ background: 'var(--primary)' }}>
                  {addCostCenter.isPending ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          )}

          {ccLoading ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Memuat...</p>
          ) : costCenters.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Belum ada pusat biaya</p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Nama', 'Tipe', 'Periode', 'Anggaran', 'Aktual', 'Utilisasi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costCenters.map((cc, i) => {
                    const util = calcBudgetUtilizationPct({ budget: cc.budget, actualCost: cc.actualCost })
                    const over = isBudgetOverrun({ budget: cc.budget, actualCost: cc.actualCost })
                    return (
                      <tr key={cc.id} className="border-t" style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{cc.name}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>
                            {TYPE_LABELS[cc.type] ?? cc.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{cc.period}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(cc.budget, currency)}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(cc.actualCost, currency)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs font-medium')} style={{ color: over ? '#ef4444' : '#10b981' }}>
                            {over ? <TrendingUp size={12} className="inline mr-1" /> : <TrendingDown size={12} className="inline mr-1" />}
                            {util.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Variance Analysis tab */}
      {tab === 'variance' && (
        <div className="space-y-4">
          {!variance ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Memuat analisis varians...</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total Anggaran', value: formatCurrency(variance.summary?.totalBudget ?? 0, currency), color: '#3b82f6' },
                  { label: 'Total Aktual', value: formatCurrency(variance.summary?.totalActual ?? 0, currency), color: '#8b5cf6' },
                  { label: 'Varians', value: formatCurrency(variance.summary?.totalVariance ?? 0, currency), color: (variance.summary?.totalVariance ?? 0) >= 0 ? '#10b981' : '#ef4444' },
                ].map(card => (
                  <div key={card.label} className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{card.label}</p>
                    <p className="text-xl font-bold mt-1" style={{ color: card.color }}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-sm">
                  <thead style={{ background: 'var(--bg-2)' }}>
                    <tr>
                      {['Pusat Biaya', 'Tipe', 'Anggaran', 'Aktual', 'Varians', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(variance.centers ?? []).map((r: any, i: number) => (
                      <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{r.name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{TYPE_LABELS[r.type] ?? r.type}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(r.budget, currency)}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(r.actualCost, currency)}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: r.variance >= 0 ? '#10b981' : '#ef4444' }}>
                          {r.variance >= 0 ? '+' : ''}{formatCurrency(r.variance, currency)}
                          <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>({r.variancePct.toFixed(1)}%)</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: r.status === 'OVER_BUDGET' ? '#ef444422' : '#10b98122', color: r.status === 'OVER_BUDGET' ? '#ef4444' : '#10b981' }}>
                            {r.status === 'OVER_BUDGET' ? 'Melebihi' : 'Sesuai'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useCallback, useEffect } from 'react'
import { Plus, X, Tag, TrendingUp, Users, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcDiscount,
  calcUsageRate,
  validateCoupon,
  type Coupon,
  type DiscountType,
  type CouponAnalytics,
} from '@/lib/coupons'

// Re-export pure functions so tests can import from this module
export {
  calcDiscount,
  calcUsageRate,
  validateCoupon,
  calcPercentageDiscount,
  calcFixedDiscount,
  isCouponActive,
  isCouponExpired,
  meetsMinOrder,
  isWithinUsageLimit,
  isWithinPerCustomerLimit,
} from '@/lib/coupons'

interface Props {
  storeId: string
  currency: string
  initialCoupons: Coupon[]
}

const DISCOUNT_TYPES: { value: DiscountType; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Persentase (%)' },
  { value: 'FIXED', label: 'Nominal Tetap' },
  { value: 'FREE_SHIPPING', label: 'Gratis Ongkir' },
  { value: 'BOGO', label: 'Beli 1 Gratis 1' },
]

const empty = (): Partial<Coupon> => ({
  code: '',
  name: '',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscount: null,
  usageLimit: null,
  perCustomerLimit: null,
  segments: [],
  productIds: [],
  categoryIds: [],
  startDate: null,
  endDate: null,
  active: true,
})

export default function CouponEngineClient({ storeId, currency, initialCoupons }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons)
  const [analytics, setAnalytics] = useState<CouponAnalytics[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [form, setForm] = useState<Partial<Coupon>>(empty())
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'coupons' | 'analytics'>('coupons')

  // Validate preview
  const [previewAmount, setPreviewAmount] = useState('')
  const [previewCode, setPreviewCode] = useState('')
  const [previewResult, setPreviewResult] = useState<{ valid: boolean; discount: number; reason?: string } | null>(null)

  const fetchAnalytics = useCallback(async () => {
    const res = await fetch(`/api/coupons/usage?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) setAnalytics(data)
  }, [storeId])

  useEffect(() => {
    if (tab === 'analytics') fetchAnalytics()
  }, [tab, fetchAnalytics])

  const openCreate = () => {
    setEditing(null)
    setForm(empty())
    setShowForm(true)
  }

  const openEdit = (c: Coupon) => {
    setEditing(c)
    setForm({ ...c })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.code?.trim()) { toast.error('Kode kupon wajib diisi'); return }
    if (!form.name?.trim()) { toast.error('Nama kupon wajib diisi'); return }
    setSaving(true)
    try {
      const url = editing
        ? `/api/coupons/${editing.id}`
        : `/api/coupons?storeId=${storeId}`
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, storeId }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }

      if (editing) {
        setCoupons(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } as Coupon : c))
        toast.success('Kupon diperbarui')
      } else {
        const newRow: Coupon = {
          id: data.id,
          storeId,
          usedCount: 0,
          ...(form as any),
        }
        setCoupons(prev => [newRow, ...prev])
        toast.success('Kupon dibuat')
      }
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (c: Coupon) => {
    const res = await fetch(`/api/coupons/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, active: !c.active } : x))
    toast.success(c.active ? 'Kupon dinonaktifkan' : 'Kupon diaktifkan')
  }

  const handlePreview = () => {
    const coupon = coupons.find(c => c.code.toUpperCase() === previewCode.toUpperCase())
    if (!coupon) { setPreviewResult({ valid: false, discount: 0, reason: 'Kode tidak ditemukan' }); return }
    const amount = parseFloat(previewAmount) || 0
    const result = validateCoupon({ coupon, orderAmount: amount, customerId: 'preview', customerUsageCount: 0 })
    setPreviewResult(result)
  }

  const set = (k: keyof Coupon, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const usageRateColor = (rate: number) => {
    if (rate < 0) return 'text-[var(--text-3)]'
    if (rate >= 0.9) return 'text-red-500'
    if (rate >= 0.6) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Kupon &amp; Promo</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Kelola kupon diskon dengan targeting segmen pelanggan</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} /> Buat Kupon
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['coupons', 'analytics'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'coupons' ? 'Daftar Kupon' : 'Analitik'}
          </button>
        ))}
      </div>

      {/* Coupon Validator */}
      {tab === 'coupons' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-sm font-medium text-[var(--text-2)] mb-3">Cek Kupon</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={previewCode}
              onChange={e => setPreviewCode(e.target.value)}
              placeholder="Kode kupon"
              className="border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm w-36"
            />
            <input
              value={previewAmount}
              onChange={e => setPreviewAmount(e.target.value)}
              placeholder="Total pesanan"
              type="number"
              className="border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm w-40"
            />
            <button
              onClick={handlePreview}
              className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            >
              Cek
            </button>
            {previewResult && (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm', previewResult.valid ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500')}>
                {previewResult.valid
                  ? <><CheckCircle size={14} /> Diskon {formatCurrency(previewResult.discount, currency)}</>
                  : <><XCircle size={14} /> {previewResult.reason}</>
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coupons List */}
      {tab === 'coupons' && (
        <div className="space-y-3">
          {coupons.length === 0 && (
            <div className="text-center py-12 text-[var(--text-3)]">
              <Tag size={40} className="mx-auto mb-3 opacity-30" />
              <p>Belum ada kupon. Buat kupon pertama Anda.</p>
            </div>
          )}
          {coupons.map(c => {
            const rate = calcUsageRate(c.usedCount, c.usageLimit)
            return (
              <div key={c.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex flex-wrap gap-4 items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[var(--primary)] text-lg">{c.code}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', c.active ? 'bg-green-500/10 text-green-600' : 'bg-[var(--border)] text-[var(--text-3)]')}>
                      {c.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-2)] text-[var(--text-2)]">
                      {DISCOUNT_TYPES.find(d => d.value === c.discountType)?.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-2)] mt-1">{c.name}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-[var(--text-3)]">
                    <span>
                      Diskon: {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : formatCurrency(c.discountValue, currency)}
                      {c.maxDiscount ? ` (maks ${formatCurrency(c.maxDiscount, currency)})` : ''}
                    </span>
                    {c.minOrderAmount > 0 && <span>Min. order: {formatCurrency(c.minOrderAmount, currency)}</span>}
                    <span className={usageRateColor(rate)}>
                      Digunakan: {c.usedCount}{c.usageLimit ? `/${c.usageLimit}` : ''}
                    </span>
                    {c.endDate && <span>Berakhir: {new Date(c.endDate).toLocaleDateString('id-ID')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggle(c)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-2)]">
                    {c.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button onClick={() => openEdit(c)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-2)]">
                    Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Kupon', value: coupons.length, icon: Tag },
              { label: 'Kupon Aktif', value: coupons.filter(c => c.active).length, icon: CheckCircle },
              { label: 'Total Digunakan', value: coupons.reduce((s, c) => s + c.usedCount, 0), icon: TrendingUp },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
                <Icon size={20} className="text-[var(--primary)]" />
                <div>
                  <p className="text-xs text-[var(--text-3)]">{label}</p>
                  <p className="text-xl font-bold text-[var(--text-1)]">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Top coupons table */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="font-medium text-[var(--text-1)] text-sm">Top Kupon</p>
            </div>
            {analytics.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-3)] text-sm">Belum ada data penggunaan</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-2)]">
                  <tr>
                    {['Kode', 'Nama', 'Digunakan', 'Usage Rate', 'Total Diskon'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-medium text-[var(--text-3)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.slice(0, 10).map(a => (
                    <tr key={a.couponId} className="border-t border-[var(--border)] hover:bg-[var(--bg-2)]">
                      <td className="px-4 py-3 font-mono font-bold text-[var(--primary)]">{a.code}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{a.name}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{a.usedCount}x</td>
                      <td className="px-4 py-3">
                        {a.usageRate < 0
                          ? <span className="text-[var(--text-3)]">Unlimited</span>
                          : <span className={a.usageRate >= 0.9 ? 'text-red-500' : a.usageRate >= 0.6 ? 'text-yellow-500' : 'text-green-600'}>
                              {(a.usageRate * 100).toFixed(0)}%
                            </span>
                        }
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{formatCurrency(a.totalDiscount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="font-semibold text-[var(--text-1)]">{editing ? 'Edit Kupon' : 'Buat Kupon Baru'}</h2>
              <button onClick={() => setShowForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Kode Kupon *</label>
                  <input
                    value={form.code ?? ''}
                    onChange={e => set('code', e.target.value.toUpperCase())}
                    placeholder="PROMO20"
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Nama *</label>
                  <input
                    value={form.name ?? ''}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Diskon 20% Agustus"
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Tipe Diskon</label>
                  <select
                    value={form.discountType ?? 'PERCENTAGE'}
                    onChange={e => set('discountType', e.target.value as DiscountType)}
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  >
                    {DISCOUNT_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">
                    Nilai Diskon {form.discountType === 'PERCENTAGE' ? '(%)' : '(Rp)'}
                  </label>
                  <input
                    type="number"
                    value={form.discountValue ?? ''}
                    onChange={e => set('discountValue', parseFloat(e.target.value) || 0)}
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Min. Order (Rp)</label>
                  <input
                    type="number"
                    value={form.minOrderAmount ?? 0}
                    onChange={e => set('minOrderAmount', parseFloat(e.target.value) || 0)}
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Maks. Diskon (Rp, opsional)</label>
                  <input
                    type="number"
                    value={form.maxDiscount ?? ''}
                    onChange={e => set('maxDiscount', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="Tidak dibatasi"
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Batas Total Pakai (opsional)</label>
                  <input
                    type="number"
                    value={form.usageLimit ?? ''}
                    onChange={e => set('usageLimit', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Tidak dibatasi"
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Batas per Pelanggan</label>
                  <input
                    type="number"
                    value={form.perCustomerLimit ?? ''}
                    onChange={e => set('perCustomerLimit', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Tidak dibatasi"
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Tanggal Mulai</label>
                  <input
                    type="datetime-local"
                    value={form.startDate?.slice(0, 16) ?? ''}
                    onChange={e => set('startDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Tanggal Berakhir</label>
                  <input
                    type="datetime-local"
                    value={form.endDate?.slice(0, 16) ?? ''}
                    onChange={e => set('endDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className="w-full border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.active ?? true}
                    onChange={e => set('active', e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]" />
                </label>
                <span className="text-sm text-[var(--text-2)]">Aktifkan kupon</span>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]">
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editing ? 'Simpan Perubahan' : 'Buat Kupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

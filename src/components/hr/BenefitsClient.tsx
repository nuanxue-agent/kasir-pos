'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Heart, Shield, Utensils, Car, Package } from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

type PlanType = 'BPJS_KESEHATAN' | 'BPJS_KETENAGAKERJAAN' | 'HEALTH' | 'MEAL' | 'TRANSPORT' | 'OTHER'
type CalcBase = 'FIXED' | 'PERCENTAGE_SALARY'

interface BenefitPlan {
  id: string
  storeId: string
  name: string
  type: PlanType
  employeeContribution: number
  employerContribution: number
  calculationBase: CalcBase
  active?: boolean
}

interface EmployeeBenefit {
  id: string
  employeeId: string
  planId: string
  planName: string
  planType: PlanType
  storeId: string
  active: boolean
  enrolledAt: string
  value: number
  employeeName?: string
}

interface Props { storeId: string }

const TYPE_ICONS: Record<PlanType, React.ReactNode> = {
  BPJS_KESEHATAN: <Heart className="h-4 w-4 text-red-500" />,
  BPJS_KETENAGAKERJAAN: <Shield className="h-4 w-4 text-blue-500" />,
  HEALTH: <Heart className="h-4 w-4 text-pink-500" />,
  MEAL: <Utensils className="h-4 w-4 text-orange-500" />,
  TRANSPORT: <Car className="h-4 w-4 text-green-500" />,
  OTHER: <Package className="h-4 w-4 text-gray-500" />,
}

const TYPE_LABELS: Record<PlanType, string> = {
  BPJS_KESEHATAN: 'BPJS Kesehatan',
  BPJS_KETENAGAKERJAAN: 'BPJS Ketenagakerjaan',
  HEALTH: 'Tunjangan Kesehatan',
  MEAL: 'Tunjangan Makan',
  TRANSPORT: 'Tunjangan Transport',
  OTHER: 'Lainnya',
}

const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export default function BenefitsClient({ storeId }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'plans' | 'enrollments'>('plans')
  const [showForm, setShowForm] = useState(false)

  const { data: plans = [], isLoading: plansLoading } = useQuery<BenefitPlan[]>({
    queryKey: ['benefit-plans', storeId],
    queryFn: () => fetch(`/api/hr/benefit-plans?storeId=${storeId}`).then(r => r.json()).then((d: any) => d.plans ?? []),
    staleTime: 30_000,
  })

  const { data: enrollments = [], isLoading: enrollLoading } = useQuery<EmployeeBenefit[]>({
    queryKey: ['employee-benefits', storeId],
    queryFn: () => fetch(`/api/hr/employee-benefits?storeId=${storeId}`).then(r => r.json()).then((d: any) => d.benefits ?? []),
    staleTime: 30_000,
  })

  function PlanForm({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('')
    const [type, setType] = useState<PlanType>('BPJS_KESEHATAN')
    const [calcBase, setCalcBase] = useState<CalcBase>('PERCENTAGE_SALARY')
    const [empContrib, setEmpContrib] = useState('1')
    const [erContrib, setErContrib] = useState('4')
    const [saving, setSaving] = useState(false)

    async function save() {
      if (!name.trim()) { toast.error('Nama plan wajib diisi'); return }
      setSaving(true)
      try {
        const res = await fetch('/api/hr/benefit-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId, name: name.trim(), type, calculationBase: calcBase,
            employeeContribution: Number(empContrib),
            employerContribution: Number(erContrib),
          }),
        })
        const d = await res.json() as { error?: string }
        if (!res.ok) throw new Error(d.error ?? 'Gagal menyimpan')
        qc.invalidateQueries({ queryKey: ['benefit-plans', storeId] })
        toast.success('Plan benefit ditambahkan')
        onClose()
      } catch (e: any) {
        toast.error(e.message)
      } finally { setSaving(false) }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-6 shadow-xl">
          <h3 className="mb-4 text-base font-semibold text-[var(--text-1)]">Tambah Plan Benefit</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nama</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
                placeholder="BPJS Kesehatan Kelas 1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Tipe</label>
                <select value={type} onChange={e => setType(e.target.value as PlanType)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Dasar Hitung</label>
                <select value={calcBase} onChange={e => setCalcBase(e.target.value as CalcBase)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                  <option value="PERCENTAGE_SALARY">% Gaji</option>
                  <option value="FIXED">Nominal Tetap</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                  Iuran Karyawan ({calcBase === 'PERCENTAGE_SALARY' ? '%' : 'Rp'})
                </label>
                <input type="number" value={empContrib} onChange={e => setEmpContrib(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                  Iuran Perusahaan ({calcBase === 'PERCENTAGE_SALARY' ? '%' : 'Rp'})
                </label>
                <input type="number" value={erContrib} onChange={e => setErContrib(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]">Batal</button>
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalEmployerCost = enrollments.filter(e => e.active).reduce((sum, e) => sum + e.value, 0)
  const activeEnrollments = enrollments.filter(e => e.active).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Tunjangan & Kesejahteraan</h1>
          <p className="text-sm text-[var(--text-3)]">BPJS dan tunjangan karyawan</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
          <Plus className="h-4 w-4" /> Tambah Plan
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Plan', value: plans.length },
          { label: 'Karyawan Terdaftar', value: activeEnrollments },
          { label: 'Biaya/Bulan (Perusahaan)', value: fmt(totalEmployerCost) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-3)]">{s.label}</p>
            <p className="text-lg font-bold text-[var(--text-1)]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['plans', 'enrollments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}>
            {t === 'plans' ? '📋 Plan Benefit' : '👥 Pendaftaran'}
          </button>
        ))}
      </div>

      {/* Plans Tab */}
      {tab === 'plans' && (
        plansLoading ? (
          <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat...</div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
            <Heart className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-3)]">Belum ada plan benefit.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map(p => (
              <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="mb-2 flex items-center gap-2">
                  {TYPE_ICONS[p.type]}
                  <span className="text-xs font-medium text-[var(--text-3)]">{TYPE_LABELS[p.type]}</span>
                </div>
                <p className="text-sm font-semibold text-[var(--text-1)] mb-2">{p.name}</p>
                <div className="space-y-1 text-xs text-[var(--text-2)]">
                  <div className="flex justify-between">
                    <span>Iuran Karyawan:</span>
                    <span className="font-medium">{p.employeeContribution}{p.calculationBase === 'PERCENTAGE_SALARY' ? '%' : ' Rp'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Iuran Perusahaan:</span>
                    <span className="font-medium text-[var(--accent)]">{p.employerContribution}{p.calculationBase === 'PERCENTAGE_SALARY' ? '%' : ' Rp'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dasar:</span>
                    <span>{p.calculationBase === 'FIXED' ? 'Nominal Tetap' : '% Gaji'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Enrollments Tab */}
      {tab === 'enrollments' && (
        enrollLoading ? (
          <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat...</div>
        ) : enrollments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
            <Shield className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-3)]">Belum ada pendaftaran benefit.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  {['Karyawan', 'Plan', 'Tipe', 'Nilai', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-2)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {enrollments.map(e => (
                  <tr key={e.id} className="hover:bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{e.employeeName ?? e.employeeId}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{e.planName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {TYPE_ICONS[e.planType]}
                        <span className="text-xs text-[var(--text-3)]">{TYPE_LABELS[e.planType]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-1)]">{fmt(e.value)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-[var(--bg-subtle)] text-[var(--text-3)]'}`}>
                        {e.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {showForm && <PlanForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

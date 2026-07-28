'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, TrendingUp, Users, DollarSign, Calendar, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface BenefitsClientProps {
  storeId: string
}

type BenefitType = 'BPJS_KESEHATAN' | 'BPJS_KETENAGAKERJAAN' | 'HEALTH' | 'MEAL' | 'TRANSPORT' | 'OTHER'
type CalculationBase = 'FIXED' | 'PERCENTAGE_SALARY'
type Tab = 'plans' | 'enrollments' | 'report'

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const selectCls = inputCls + ' cursor-pointer'

const TYPE_LABELS: Record<BenefitType, string> = {
  BPJS_KESEHATAN: 'BPJS Kesehatan',
  BPJS_KETENAGAKERJAAN: 'BPJS Ketenagakerjaan',
  HEALTH: 'Tunjangan Kesehatan',
  MEAL: 'Tunjangan Makan',
  TRANSPORT: 'Tunjangan Transport',
  OTHER: 'Lainnya',
}

export default function BenefitsClient({ storeId }: BenefitsClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('plans')
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showEnrollForm, setShowEnrollForm] = useState(false)
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7))

  const plansQ = useQuery({
    queryKey: ['benefit-plans', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/benefit-plans?storeId=${storeId}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  const enrollmentsQ = useQuery({
    queryKey: ['employee-benefits', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/employee-benefits?storeId=${storeId}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  const employeesQ = useQuery({
    queryKey: ['employees', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/employees?storeId=${storeId}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  const reportQ = useQuery({
    queryKey: ['benefits-report', storeId, reportMonth],
    queryFn: async () => {
      const res = await fetch(`/api/hr/benefits-report?storeId=${storeId}&month=${reportMonth}`)
      return await res.json() as any
    },
    enabled: tab === 'report',
  })

  const createPlanMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/hr/benefit-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, storeId }),
      })
      if (!res.ok) { const j = await res.json() as any; throw new Error(j.error ?? 'Gagal membuat rencana') }
      return await res.json() as any
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['benefit-plans', storeId] }); toast.success('Rencana tunjangan berhasil dibuat'); setShowPlanForm(false) },
    onError: (e: any) => toast.error(e.message),
  })

  const togglePlanMut = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/hr/benefit-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) throw new Error('Gagal memperbarui')
      return await res.json() as any
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['benefit-plans', storeId] }); toast.success('Status rencana diperbarui') },
    onError: (e: any) => toast.error(e.message),
  })

  const enrollMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/hr/employee-benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, storeId }),
      })
      if (!res.ok) { const j = await res.json() as any; throw new Error(j.error ?? 'Gagal mendaftarkan') }
      return await res.json() as any
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee-benefits', storeId] }); toast.success('Karyawan berhasil didaftarkan'); setShowEnrollForm(false) },
    onError: (e: any) => toast.error(e.message),
  })

  const toggleEnrollMut = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/hr/employee-benefits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) throw new Error('Gagal memperbarui')
      return await res.json() as any
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-benefits', storeId] })
      qc.invalidateQueries({ queryKey: ['benefits-report', storeId, reportMonth] })
      toast.success('Status pendaftaran diperbarui')
    },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Tunjangan &amp; Kesejahteraan</h1>
          <p className="text-sm text-[var(--text-2)] mt-1">Kelola BPJS dan tunjangan karyawan</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        {([
          { id: 'plans' as Tab, label: 'Rencana Tunjangan' },
          { id: 'enrollments' as Tab, label: 'Pendaftaran' },
          { id: 'report' as Tab, label: 'Laporan Biaya' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-all border-b-2',
              tab === t.id
                ? 'text-amber-600 border-amber-600'
                : 'text-[var(--text-2)] border-transparent hover:text-[var(--text-1)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'plans' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowPlanForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Tambah Rencana
          </button>

          {showPlanForm && <PlanForm onSubmit={createPlanMut.mutate} onCancel={() => setShowPlanForm(false)} />}

          <div className="grid gap-4">
            {plansQ.data?.map((p: any) => (
              <div key={p.id} className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-[var(--text-1)]">{p.name}</h3>
                    <p className="text-xs text-[var(--text-2)]">{TYPE_LABELS[p.type as BenefitType] ?? p.type}</p>
                  </div>
                  <button
                    onClick={() => togglePlanMut.mutate({ id: p.id, active: !p.active })}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
                      p.active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200'
                    )}
                  >
                    {p.active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-[var(--text-2)] text-xs">Kontribusi Karyawan</p>
                    <p className="font-medium text-[var(--text-1)] mt-1">
                      {p.calculationBase === 'PERCENTAGE_SALARY' ? `${p.employeeContribution}%` : `Rp ${(p.employeeContribution as number).toLocaleString('id-ID')}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-2)] text-xs">Kontribusi Perusahaan</p>
                    <p className="font-medium text-[var(--text-1)] mt-1">
                      {p.calculationBase === 'PERCENTAGE_SALARY' ? `${p.employerContribution}%` : `Rp ${(p.employerContribution as number).toLocaleString('id-ID')}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-2)] text-xs">Basis Perhitungan</p>
                    <p className="font-medium text-[var(--text-1)] mt-1">
                      {p.calculationBase === 'PERCENTAGE_SALARY' ? '% Gaji' : 'Tetap'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'enrollments' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowEnrollForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Daftarkan Karyawan
          </button>

          {showEnrollForm && (
            <EnrollForm
              plans={plansQ.data ?? []}
              employees={employeesQ.data ?? []}
              onSubmit={enrollMut.mutate}
              onCancel={() => setShowEnrollForm(false)}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Karyawan','Rencana','Jenis','Kontrib. Karyawan','Kontrib. Perusahaan','Tgl Daftar','Status'].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-medium text-[var(--text-2)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrollmentsQ.data?.map((e: any) => {
                  const base = e.calculationBase === 'PERCENTAGE_SALARY' ? (e.baseSalary ?? 0) : 1
                  const empC = e.calculationBase === 'PERCENTAGE_SALARY' ? Math.round(base * (e.employeeContribution / 100)) : e.employeeContribution
                  const erC  = e.calculationBase === 'PERCENTAGE_SALARY' ? Math.round(base * (e.employerContribution / 100)) : e.employerContribution
                  return (
                    <tr key={e.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)]">
                      <td className="py-3 px-4 font-medium text-[var(--text-1)]">{e.employeeName}</td>
                      <td className="py-3 px-4 text-[var(--text-2)]">{e.planName}</td>
                      <td className="py-3 px-4"><span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">{TYPE_LABELS[e.planType as BenefitType] ?? e.planType}</span></td>
                      <td className="py-3 px-4 text-right">Rp {empC.toLocaleString('id-ID')}</td>
                      <td className="py-3 px-4 text-right">Rp {erC.toLocaleString('id-ID')}</td>
                      <td className="py-3 px-4 text-[var(--text-2)]">{new Date(e.enrolledAt).toLocaleDateString('id-ID')}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleEnrollMut.mutate({ id: e.id, active: !e.active })}
                          className={cn('px-2 py-1 rounded-lg text-xs font-medium border', e.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-stone-100 text-stone-500 border-stone-200')}
                        >
                          {e.active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-[var(--text-1)]">Bulan:</label>
            <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className={inputCls + ' w-48'} />
          </div>

          {reportQ.data && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs text-blue-700 font-medium">Kontribusi Karyawan</p>
                  <p className="text-2xl font-bold text-blue-900 mt-2">Rp {(reportQ.data.totals.employeeTotal as number).toLocaleString('id-ID')}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-700 font-medium">Kontribusi Perusahaan</p>
                  <p className="text-2xl font-bold text-amber-900 mt-2">Rp {(reportQ.data.totals.employerTotal as number).toLocaleString('id-ID')}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs text-emerald-700 font-medium">Total Biaya Tunjangan</p>
                  <p className="text-2xl font-bold text-emerald-900 mt-2">Rp {(reportQ.data.totals.grandTotal as number).toLocaleString('id-ID')}</p>
                </div>
              </div>

              <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text-1)] mb-4">Per Jenis Tunjangan</h3>
                <div className="space-y-3">
                  {(reportQ.data.summary as any[]).map((s: any) => (
                    <div key={s.type} className="flex items-center justify-between p-3 bg-white rounded-lg border border-stone-200">
                      <div>
                        <p className="font-medium text-[var(--text-1)]">{TYPE_LABELS[s.type as BenefitType] ?? s.type}</p>
                        <p className="text-xs text-[var(--text-2)]">{s.enrolledCount} karyawan terdaftar</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[var(--text-1)]">Rp {(s.total as number).toLocaleString('id-ID')}</p>
                        <p className="text-xs text-[var(--text-2)]">Karyawan: Rp {(s.employeeTotal as number).toLocaleString('id-ID')} | Perusahaan: Rp {(s.employerTotal as number).toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PlanForm({ onSubmit, onCancel }: { onSubmit: (data: any) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<BenefitType>('OTHER')
  const [empContrib, setEmpContrib] = useState(0)
  const [erContrib, setErContrib] = useState(0)
  const [base, setBase] = useState<CalculationBase>('FIXED')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ name, type, employeeContribution: empContrib, employerContribution: erContrib, calculationBase: base })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-1)]">Tambah Rencana Tunjangan</h3>
        <button type="button" onClick={onCancel}><X className="w-5 h-5 text-[var(--text-2)]" /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Nama Rencana</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Contoh: BPJS Kesehatan 2024" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Jenis</label>
          <select value={type} onChange={e => setType(e.target.value as BenefitType)} className={selectCls} required>
            {(Object.entries(TYPE_LABELS) as [BenefitType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Basis Perhitungan</label>
        <select value={base} onChange={e => setBase(e.target.value as CalculationBase)} className={selectCls}>
          <option value="FIXED">Tetap (Nominal)</option>
          <option value="PERCENTAGE_SALARY">Persentase Gaji</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Kontribusi Karyawan {base === 'PERCENTAGE_SALARY' ? '(%)' : '(Rp)'}</label>
          <input type="number" value={empContrib} onChange={e => setEmpContrib(Number(e.target.value))} className={inputCls} min="0" step={base === 'PERCENTAGE_SALARY' ? '0.01' : '1000'} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Kontribusi Perusahaan {base === 'PERCENTAGE_SALARY' ? '(%)' : '(Rp)'}</label>
          <input type="number" value={erContrib} onChange={e => setErContrib(Number(e.target.value))} className={inputCls} min="0" step={base === 'PERCENTAGE_SALARY' ? '0.01' : '1000'} />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium">Buat Rencana</button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 bg-stone-200 text-stone-700 rounded-xl hover:bg-stone-300 transition-colors font-medium">Batal</button>
      </div>
    </form>
  )
}

function EnrollForm({ plans, employees, onSubmit, onCancel }: { plans: any[]; employees: any[]; onSubmit: (data: any) => void; onCancel: () => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [planId, setPlanId] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ employeeId, planId })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-1)]">Daftarkan Karyawan</h3>
        <button type="button" onClick={onCancel}><X className="w-5 h-5 text-[var(--text-2)]" /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Karyawan</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={selectCls} required>
            <option value="">Pilih karyawan...</option>
            {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Rencana Tunjangan</label>
          <select value={planId} onChange={e => setPlanId(e.target.value)} className={selectCls} required>
            <option value="">Pilih rencana...</option>
            {plans.filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({TYPE_LABELS[p.type as BenefitType] ?? p.type})</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium">Daftarkan</button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 bg-stone-200 text-stone-700 rounded-xl hover:bg-stone-300 transition-colors font-medium">Batal</button>
      </div>
    </form>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ShieldCheck, BadgeCheck, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { calcKesehatanContribution, calcKetenagakerjaanContribution, calcBPJSDueDate } from '@/lib/bpjs'

interface BPJSAdminClientProps {
  storeId: string
}

type BPJSType = 'KESEHATAN' | 'KETENAGAKERJAAN'
type EnrollmentStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING'
type Tab = 'enrollments' | 'contributions'

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'
const selectCls = inputCls + ' cursor-pointer'

const TYPE_LABELS: Record<BPJSType, string> = {
  KESEHATAN: 'BPJS Kesehatan',
  KETENAGAKERJAAN: 'BPJS Ketenagakerjaan',
}

const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INACTIVE: 'bg-stone-100 text-stone-500 border-stone-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function BPJSAdminClient({ storeId }: BPJSAdminClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('enrollments')
  const [showEnrollForm, setShowEnrollForm] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState(() => new Date().toISOString().slice(0, 7))

  // --- Queries ---
  const enrollmentsQ = useQuery({
    queryKey: ['bpjs-enrollments', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/bpjs/enrollments?storeId=${storeId}`)
      const json = (await res.json()) as any
      return (json.data ?? []) as any[]
    },
  })

  const contributionsQ = useQuery({
    queryKey: ['bpjs-contributions', storeId, selectedPeriod],
    queryFn: async () => {
      const res = await fetch(
        `/api/hr/bpjs/contributions?storeId=${storeId}&period=${selectedPeriod}`,
      )
      const json = (await res.json()) as any
      return (json.data ?? []) as any[]
    },
    enabled: tab === 'contributions',
  })

  const employeesQ = useQuery({
    queryKey: ['employees', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/employees?storeId=${storeId}`)
      const json = (await res.json()) as any
      return (json.data ?? []) as any[]
    },
  })

  // --- Mutations ---
  const enrollMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/hr/bpjs/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, storeId }),
      })
      if (!res.ok) {
        const j = (await res.json()) as any
        throw new Error(j.error ?? 'Gagal mendaftarkan')
      }
      return (await res.json()) as any
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bpjs-enrollments', storeId] })
      toast.success('Pendaftaran BPJS berhasil dibuat')
      setShowEnrollForm(false)
    },
    onError: (e: any) => toast.error(e.message),
  })

  const updateEnrollMut = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await fetch(`/api/hr/bpjs/enrollments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Gagal memperbarui status')
      return (await res.json()) as any
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bpjs-enrollments', storeId] })
      toast.success('Status pendaftaran diperbarui')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const generateContribMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/hr/bpjs/contributions?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: selectedPeriod, autoGenerate: true }),
      })
      if (!res.ok) {
        const j = (await res.json()) as any
        throw new Error(j.error ?? 'Gagal generate iuran')
      }
      return (await res.json()) as any
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['bpjs-contributions', storeId, selectedPeriod] })
      toast.success(`${data.created} iuran berhasil digenerate`)
    },
    onError: (e: any) => toast.error(e.message),
  })

  const markPaidMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/bpjs/contributions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid' }),
      })
      if (!res.ok) throw new Error('Gagal memperbarui status iuran')
      return (await res.json()) as any
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bpjs-contributions', storeId, selectedPeriod] })
      toast.success('Iuran ditandai lunas')
    },
    onError: (e: any) => toast.error(e.message),
  })

  // Contribution summary for current month
  const contribs = contributionsQ.data ?? []
  const totalEmp = contribs.reduce((s: number, c: any) => s + (c.employeeContribution ?? 0), 0)
  const totalEr  = contribs.reduce((s: number, c: any) => s + (c.employerContribution ?? 0), 0)
  const totalAll = contribs.reduce((s: number, c: any) => s + (c.totalContribution ?? 0), 0)
  const paidCount    = contribs.filter((c: any) => c.status === 'PAID').length
  const pendingCount = contribs.filter((c: any) => c.status === 'PENDING').length

  const fmt = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Administrasi BPJS</h1>
          <p className="text-sm text-[var(--text-2)] mt-1">
            Kelola pendaftaran dan iuran BPJS Kesehatan &amp; Ketenagakerjaan
          </p>
        </div>
        {tab === 'enrollments' && (
          <button
            onClick={() => setShowEnrollForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Daftarkan Karyawan
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)]">
        {([
          { id: 'enrollments' as Tab, label: 'Peserta' },
          { id: 'contributions' as Tab, label: 'Iuran Bulanan' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-all border-b-2',
              tab === t.id
                ? 'text-amber-600 border-amber-600'
                : 'text-[var(--text-2)] border-transparent hover:text-[var(--text-1)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Enrollments Tab */}
      {tab === 'enrollments' && (
        <div className="space-y-4">
          {showEnrollForm && (
            <EnrollForm
              employees={employeesQ.data ?? []}
              onSubmit={enrollMut.mutate}
              onCancel={() => setShowEnrollForm(false)}
              isPending={enrollMut.isPending}
            />
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Total Peserta',
                value: enrollmentsQ.data?.length ?? 0,
                icon: <BadgeCheck className="w-5 h-5 text-blue-500" />,
                bg: 'from-blue-50 to-blue-100 border-blue-200',
              },
              {
                label: 'Aktif',
                value: enrollmentsQ.data?.filter((e: any) => e.status === 'ACTIVE').length ?? 0,
                icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />,
                bg: 'from-emerald-50 to-emerald-100 border-emerald-200',
              },
              {
                label: 'BPJS Kesehatan',
                value: enrollmentsQ.data?.filter((e: any) => e.type === 'KESEHATAN').length ?? 0,
                icon: <ShieldCheck className="w-5 h-5 text-amber-500" />,
                bg: 'from-amber-50 to-amber-100 border-amber-200',
              },
              {
                label: 'BPJS Ketenagakerjaan',
                value: enrollmentsQ.data?.filter((e: any) => e.type === 'KETENAGAKERJAAN').length ?? 0,
                icon: <ShieldCheck className="w-5 h-5 text-violet-500" />,
                bg: 'from-violet-50 to-violet-100 border-violet-200',
              },
            ].map(s => (
              <div key={s.label} className={cn('bg-gradient-to-br border rounded-xl p-4', s.bg)}>
                <div className="flex items-center gap-2 mb-1">
                  {s.icon}
                  <p className="text-xs font-medium text-[var(--text-2)]">{s.label}</p>
                </div>
                <p className="text-2xl font-bold text-[var(--text-1)]">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-2)]">
                <tr>
                  {['Karyawan', 'Jenis BPJS', 'No. Anggota', 'Kelas', 'Tgl Daftar', 'Status', 'Aksi'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {enrollmentsQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-2)]">
                      Belum ada peserta BPJS terdaftar
                    </td>
                  </tr>
                )}
                {enrollmentsQ.data?.map((e: any) => (
                  <tr key={e.id} className="hover:bg-[var(--bg-muted)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{e.employeeName ?? e.employeeId}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg">
                        {TYPE_LABELS[e.type as BPJSType] ?? e.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{e.memberNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      {e.type === 'KESEHATAN' ? (e.class ? `Kelas ${e.class}` : '—') : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      {new Date(e.enrolledAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-1 rounded-lg border font-medium', STATUS_COLORS[e.status as EnrollmentStatus])}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {e.status !== 'ACTIVE' && (
                          <button
                            onClick={() => updateEnrollMut.mutate({ id: e.id, status: 'ACTIVE' })}
                            className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            Aktifkan
                          </button>
                        )}
                        {e.status === 'ACTIVE' && (
                          <button
                            onClick={() => updateEnrollMut.mutate({ id: e.id, status: 'INACTIVE' })}
                            className="text-xs px-2 py-1 bg-stone-100 text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-200 transition-colors"
                          >
                            Nonaktifkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contributions Tab */}
      {tab === 'contributions' && (
        <div className="space-y-5">
          {/* Period selector + generate button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[var(--text-1)]">Periode:</label>
              <input
                type="month"
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value)}
                className={cn(inputCls, 'w-40')}
              />
            </div>
            <button
              onClick={() => generateContribMut.mutate()}
              disabled={generateContribMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {generateContribMut.isPending ? 'Memproses…' : 'Generate Iuran'}
            </button>
            <p className="text-xs text-[var(--text-2)]">
              Jatuh tempo: {calcBPJSDueDate(selectedPeriod)}
            </p>
          </div>

          {/* Summary cards */}
          {contribs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Iuran Karyawan', value: fmt(totalEmp), color: 'from-blue-50 to-blue-100 border-blue-200' },
                { label: 'Iuran Perusahaan', value: fmt(totalEr), color: 'from-amber-50 to-amber-100 border-amber-200' },
                { label: 'Total Iuran', value: fmt(totalAll), color: 'from-emerald-50 to-emerald-100 border-emerald-200' },
                {
                  label: 'Status',
                  value: `${paidCount} Lunas / ${pendingCount} Belum`,
                  color: pendingCount > 0
                    ? 'from-red-50 to-red-100 border-red-200'
                    : 'from-emerald-50 to-emerald-100 border-emerald-200',
                },
              ].map(s => (
                <div key={s.label} className={cn('bg-gradient-to-br border rounded-xl p-4', s.color)}>
                  <p className="text-xs font-medium text-[var(--text-2)] mb-1">{s.label}</p>
                  <p className="text-lg font-bold text-[var(--text-1)]">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Contributions table */}
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-2)]">
                <tr>
                  {['Karyawan', 'Jenis BPJS', 'Iuran Karyawan', 'Iuran Perusahaan', 'Total', 'Jatuh Tempo', 'Status', 'Aksi'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {contribs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-2)]">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="w-8 h-8 text-stone-300" />
                        <p>Belum ada iuran untuk periode ini</p>
                        <p className="text-xs">Klik &ldquo;Generate Iuran&rdquo; untuk membuat iuran otomatis</p>
                      </div>
                    </td>
                  </tr>
                )}
                {contribs.map((c: any) => (
                  <tr key={c.id} className="hover:bg-[var(--bg-muted)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{c.employeeName ?? c.employeeId}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg">
                        {TYPE_LABELS[c.bpjsType as BPJSType] ?? c.bpjsType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-2)]">{fmt(c.employeeContribution)}</td>
                    <td className="px-4 py-3 text-right text-[var(--text-2)]">{fmt(c.employerContribution)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-1)]">{fmt(c.totalContribution)}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{c.dueDate}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded-lg border font-medium',
                          c.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200',
                        )}
                      >
                        {c.status === 'PAID' ? 'Lunas' : 'Belum Bayar'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.status === 'PENDING' && (
                        <button
                          onClick={() => markPaidMut.mutate(c.id)}
                          disabled={markPaidMut.isPending}
                          className="text-xs px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                        >
                          Tandai Lunas
                        </button>
                      )}
                      {c.status === 'PAID' && (
                        <span className="text-xs text-[var(--text-2)]">
                          {c.paidAt ? new Date(c.paidAt).toLocaleDateString('id-ID') : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// --- EnrollForm sub-component ---
function EnrollForm({
  employees,
  onSubmit,
  onCancel,
  isPending,
}: {
  employees: any[]
  onSubmit: (data: any) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [type, setType] = useState<BPJSType>('KESEHATAN')
  const [memberNumber, setMemberNumber] = useState('')
  const [bpjsClass, setBpjsClass] = useState<1 | 2 | 3>(1)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      employeeId,
      type,
      memberNumber: memberNumber || undefined,
      class: type === 'KESEHATAN' ? bpjsClass : undefined,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-1)]">Daftarkan Karyawan BPJS</h3>
        <button type="button" onClick={onCancel}>
          <X className="w-5 h-5 text-[var(--text-2)]" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Karyawan</label>
          <select
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className={selectCls}
            required
          >
            <option value="">Pilih karyawan...</option>
            {employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Jenis BPJS</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as BPJSType)}
            className={selectCls}
          >
            <option value="KESEHATAN">BPJS Kesehatan</option>
            <option value="KETENAGAKERJAAN">BPJS Ketenagakerjaan</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-1)] mb-2">
            Nomor Anggota (opsional)
          </label>
          <input
            type="text"
            value={memberNumber}
            onChange={e => setMemberNumber(e.target.value)}
            className={inputCls}
            placeholder="Contoh: 0001234567890"
          />
        </div>

        {type === 'KESEHATAN' && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-1)] mb-2">Kelas</label>
            <select
              value={bpjsClass}
              onChange={e => setBpjsClass(Number(e.target.value) as 1 | 2 | 3)}
              className={selectCls}
            >
              <option value={1}>Kelas 1</option>
              <option value={2}>Kelas 2</option>
              <option value={3}>Kelas 3</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium disabled:opacity-50"
        >
          {isPending ? 'Mendaftarkan…' : 'Daftarkan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 bg-stone-200 text-stone-700 rounded-xl hover:bg-stone-300 transition-colors font-medium"
        >
          Batal
        </button>
      </div>
    </form>
  )
}

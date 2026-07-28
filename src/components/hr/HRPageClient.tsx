'use client'

import { useRef, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  DollarSign,
  UserCheck,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  FileText,
  Star,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'
import { EmployeeList } from '@/components/hr/EmployeeList'
import { EmployeeForm } from '@/components/hr/EmployeeForm'
import { PayrollSection } from '@/components/hr/PayrollSection'
import { LeaveSection } from '@/components/hr/LeaveSection'

const PAYROLL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', label: 'Nama' },
  { key: 'position', label: 'Jabatan' },
  { key: 'baseSalary', label: 'Gaji Pokok' },
  { key: 'bpjsKesehatan', label: 'BPJS Kesehatan' },
  { key: 'bpjsKetenagarjaan', label: 'BPJS Ketenagakerjaan' },
  { key: 'pph21', label: 'PPh 21' },
  { key: 'netPay', label: 'Gaji Bersih' },
]

interface HRPageClientProps {
  storeId: string
  currency: string
  userRole?: string
}

// ── Attendance helpers ─────────────────────────────────────────────────────────

const ATTENDANCE_COLOR: Record<string, string> = {
  PRESENT: 'bg-emerald-400',
  ABSENT: 'bg-red-400',
  LATE: 'bg-yellow-400',
  LEAVE: 'bg-blue-400',
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]
const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ── Absensi tab ───────────────────────────────────────────────────────────────

function AbsensiTab({ storeId, employees }: { storeId: string; employees: any[] }) {
  const now = new Date()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? '')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data: records = [] } = useQuery<any[]>({
    queryKey: ['hr-attendance', storeId, selectedEmployeeId, year, month],
    queryFn: () =>
      fetch(
        `/api/hr/attendance?storeId=${storeId}&employeeId=${selectedEmployeeId}&month=${month}&year=${year}`,
      ).then(r => r.json()),
    enabled: !!selectedEmployeeId,
  })

  const statusMap = Object.fromEntries((records as any[]).map((r: any) => [r.date, r.status]))
  const grid = buildCalendarGrid(year, month)
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 }
  for (const s of Object.values(statusMap) as string[]) {
    if (s in counts) counts[s as keyof typeof counts]++
  }

  function prevMonth() {
    if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else setMonth(m => m + 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedEmployeeId}
          onChange={e => setSelectedEmployeeId(e.target.value)}
          className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-1)] transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
        >
          {employees.map((e: any) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="rounded-xl p-2 hover:bg-[var(--bg-muted)]">
          <ChevronLeft className="h-4 w-4 text-[var(--text-2)]" />
        </button>
        <span className="font-semibold text-[var(--text-1)]">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={nextMonth} className="rounded-xl p-2 hover:bg-[var(--bg-muted)]">
          <ChevronRightIcon className="h-4 w-4 text-[var(--text-2)]" />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="grid grid-cols-7 border-b border-[var(--border)]">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-[var(--text-3)]">
              {d}
            </div>
          ))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-[var(--border)] last:border-0">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="h-10 bg-[var(--bg-subtle)]" />
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const status = statusMap[dateStr]
              const dot = status ? ATTENDANCE_COLOR[status] : undefined
              return (
                <div key={di} className="flex h-10 flex-col items-center justify-center gap-0.5">
                  <span className="text-xs text-[var(--text-2)]">{day}</span>
                  {dot && <span className={cn('h-2 w-2 rounded-full', dot)} />}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-2)]">
        {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', ATTENDANCE_COLOR[s])} />
            <span>
              {{ PRESENT: 'Hadir', ABSENT: 'Absen', LATE: 'Terlambat', LEAVE: 'Cuti' }[s]}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {(
          [
            { key: 'PRESENT', label: 'Hadir', color: 'text-emerald-600' },
            { key: 'ABSENT', label: 'Absen', color: 'text-red-500' },
            { key: 'LATE', label: 'Terlambat', color: 'text-yellow-600' },
            { key: 'LEAVE', label: 'Cuti', color: 'text-blue-500' },
          ] as const
        ).map(({ key, label, color }) => (
          <div
            key={key}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-center shadow-sm"
          >
            <p className={cn('text-xl font-bold', color)}>{counts[key]}</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Penilaian tab ─────────────────────────────────────────────────────────────

function PenilaianTab({ storeId, employees }: { storeId: string; employees: any[] }) {
  const [reviews, setReviews] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    employeeId: '',
    score: 3,
    strengths: '',
    improvements: '',
    goals: '',
  })

  useEffect(() => {
    fetch(`/api/hr/reviews?storeId=${storeId}`)
      .then(r => r.json())
      .then((d: any) => setReviews(d.data ?? []))
      .catch(() => {})
  }, [storeId])

  const submit = async () => {
    await fetch('/api/hr/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, storeId }),
    })
    setShowForm(false)
    const d = (await fetch(`/api/hr/reviews?storeId=${storeId}`).then(r => r.json())) as any
    setReviews(d.data ?? [])
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowForm(true)}
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
      >
        + Tambah Penilaian
      </button>
      {showForm && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <select
            value={form.employeeId}
            onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          >
            <option value="">Pilih Karyawan</option>
            {employees.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={() => setForm(f => ({ ...f, score: s }))}
                className={`text-2xl ${form.score >= s ? 'text-amber-400' : 'text-[var(--text-3)]'}`}
              >
                ★
              </button>
            ))}
          </div>
          <input
            placeholder="Kelebihan"
            value={form.strengths}
            onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          />
          <input
            placeholder="Perbaikan"
            value={form.improvements}
            onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          />
          <input
            placeholder="Target"
            value={form.goals}
            onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Simpan
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Batal
            </button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {reviews.map((r: any) => (
          <div
            key={r.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-1)]">{r.employeeName}</span>
              <span className="text-amber-400">
                {'★'.repeat(r.score)}
                {'☆'.repeat(5 - r.score)}
              </span>
            </div>
            {r.strengths && <p className="mt-1 text-sm text-[var(--text-2)]">+ {r.strengths}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export default function HRPageClient({ storeId, currency, userRole }: HRPageClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'karyawan' | 'absensi' | 'cuti' | 'payroll' | 'penilaian'>(
    'karyawan',
  )
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', storeId],
    queryFn: () => fetch(`/api/employees?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = (employees as any[]).filter(
    (e: any) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.position?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase()),
  )

  async function deleteEmployee(id: string) {
    if (!confirm('Nonaktifkan karyawan ini?')) return
    await fetch(`/api/employees/${id}?storeId=${storeId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['employees'] })
  }

  const refresh = () => {
    setShowForm(false)
    setEditing(null)
    qc.invalidateQueries({ queryKey: ['employees'] })
  }

  const activeCount = (employees as any[]).filter(
    (e: any) => e.employmentStatus === 'ACTIVE',
  ).length
  const totalSalary = (employees as any[])
    .filter((e: any) => e.employmentStatus === 'ACTIVE')
    .reduce((s: number, e: any) => s + (e.baseSalary ?? 0), 0)

  const payrollExportRows = (employees as any[]).map((e: any) => ({
    name: e.name,
    position: e.position ?? '',
    baseSalary: e.baseSalary ?? 0,
    bpjsKesehatan: e.bpjsKesehatan ?? 0,
    bpjsKetenagarjaan: e.bpjsKetenagarjaan ?? 0,
    pph21: e.pph21 ?? 0,
    netPay: e.netPay ?? e.baseSalary ?? 0,
  }))

  const TABS = [
    { key: 'karyawan', label: 'Karyawan', icon: Users },
    { key: 'absensi', label: 'Absensi', icon: UserCheck },
    { key: 'cuti', label: 'Cuti & Izin', icon: FileText },
    { key: 'payroll', label: 'Payroll', icon: DollarSign },
    { key: 'penilaian', label: 'Penilaian', icon: TrendingUp },
  ] as const

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">SDM & Penggajian</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Karyawan, absensi, dan gaji</p>
        </div>
        {tab === 'karyawan' && (
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              type="pdf"
              label="Ekspor PDF"
              data={payrollExportRows}
              columns={PAYROLL_EXPORT_COLUMNS}
              filename={`penggajian-${new Date().toISOString().slice(0, 7)}`}
              title="Laporan Penggajian"
              currency={currency}
            />
            <ExportButton
              type="excel"
              label="Ekspor Excel"
              data={payrollExportRows}
              columns={PAYROLL_EXPORT_COLUMNS}
              filename={`penggajian-${new Date().toISOString().slice(0, 7)}`}
              title="Laporan Penggajian"
              currency={currency}
            />
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Tambah Karyawan</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
              <Users className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-[var(--text-1)]">{activeCount}</p>
          <p className="text-xs text-[var(--text-3)]">Karyawan Aktif</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-[var(--text-1)]">
            {formatCurrency(totalSalary, currency)}
          </p>
          <p className="text-xs text-[var(--text-3)]">Total Gaji/Bulan</p>
        </div>
        <div className="col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm sm:col-span-1">
          <div className="flex gap-2">
            <a
              href="/dashboard/hr/payroll"
              className="flex flex-1 items-center gap-2 rounded-xl bg-amber-50 p-3 transition-colors hover:bg-amber-100"
            >
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600">Penggajian</span>
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--bg-subtle)] p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
              tab === key
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{key === 'cuti' ? 'Cuti' : label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'karyawan' && (
        <>
          <EmployeeList
            employees={employees as any[]}
            filtered={filtered}
            isLoading={isLoading}
            search={search}
            currency={currency}
            onSearchChange={setSearch}
            onEdit={setEditing}
            onDelete={deleteEmployee}
            onAddFirst={() => setShowForm(true)}
          />
          {(showForm || editing) && (
            <EmployeeForm
              storeId={storeId}
              employee={editing}
              onClose={() => {
                setShowForm(false)
                setEditing(null)
              }}
              onSaved={refresh}
            />
          )}
        </>
      )}

      {tab === 'absensi' && <AbsensiTab storeId={storeId} employees={employees as any[]} />}

      {tab === 'cuti' && (
        <LeaveSection storeId={storeId} userRole={userRole} employees={employees as any[]} />
      )}

      {tab === 'payroll' && (
        <PayrollSection storeId={storeId} currency={currency} employees={employees as any[]} />
      )}

      {tab === 'penilaian' && <PenilaianTab storeId={storeId} employees={employees as any[]} />}
    </div>
  )
}

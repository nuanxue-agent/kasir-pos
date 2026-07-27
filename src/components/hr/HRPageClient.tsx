'use client'

import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Phone,
  Calendar,
  Briefcase,
  DollarSign,
  UserCheck,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Star,
  Printer,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'

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

const STATUS_CONFIG = {
  ACTIVE: { label: 'Aktif', pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  INACTIVE: {
    label: 'Tidak Aktif',
    pill: 'bg-[var(--bg-muted)] text-[var(--text-2)] border border-[var(--border)]',
  },
  TERMINATED: { label: 'Berhenti', pill: 'bg-red-50 text-red-500 border border-red-200' },
}

const TYPE_CONFIG = {
  FULL_TIME: { label: 'Tetap' },
  PART_TIME: { label: 'Part-time' },
  CONTRACT: { label: 'Kontrak' },
  INTERN: { label: 'Magang' },
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

function EmployeeForm({
  storeId,
  employee,
  onClose,
  onSaved,
}: {
  storeId: string
  employee?: any
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: employee?.name ?? '',
    nik: employee?.nik ?? '',
    position: employee?.position ?? '',
    department: employee?.department ?? '',
    baseSalary: employee?.baseSalary ?? '',
    employmentType: employee?.employmentType ?? 'FULL_TIME',
    joinDate: employee?.joinDate ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    bankName: employee?.bankName ?? '',
    bankAccount: employee?.bankAccount ?? '',
    bankAccountName: employee?.bankAccountName ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.name.trim() || form.name.trim().length < 2) return setError('Nama minimal 2 karakter')
    if (!form.position.trim()) return setError('Posisi harus diisi')
    if (!form.joinDate) return setError('Tanggal bergabung harus diisi')
    setSaving(true)
    const url = employee
      ? `/api/employees/${employee.id}?storeId=${storeId}`
      : `/api/employees?storeId=${storeId}`
    const res = await fetch(url, {
      method: employee ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, baseSalary: Number(form.baseSalary) || 0 }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = (await res.json()) as any
      setError(d.error ?? 'Gagal menyimpan')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-bold text-[var(--text-1)]">
            {employee ? 'Edit Karyawan' : 'Tambah Karyawan'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Nama Lengkap *
              </label>
              <input
                value={form.name}
                onChange={set('name')}
                className={inputCls}
                placeholder="Budi Santoso"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">NIK</label>
              <input
                value={form.nik}
                onChange={set('nik')}
                className={inputCls}
                placeholder="16 digit"
                maxLength={16}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Telepon
              </label>
              <input
                value={form.phone}
                onChange={set('phone')}
                className={inputCls}
                placeholder="08xx"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Posisi *
              </label>
              <input
                value={form.position}
                onChange={set('position')}
                className={inputCls}
                placeholder="Kasir"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Departemen
              </label>
              <input
                value={form.department}
                onChange={set('department')}
                className={inputCls}
                placeholder="Operasional"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Tipe
              </label>
              <select
                value={form.employmentType}
                onChange={set('employmentType')}
                className={inputCls}
              >
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Tgl Bergabung *
              </label>
              <input
                type="date"
                value={form.joinDate}
                onChange={set('joinDate')}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Gaji Pokok
              </label>
              <input
                type="number"
                min="0"
                value={form.baseSalary}
                onChange={set('baseSalary')}
                className={inputCls}
                placeholder="3500000"
              />
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-2">
            <p className="mb-3 text-xs font-semibold text-[var(--text-3)]">INFO BANK</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                  Nama Bank
                </label>
                <input
                  value={form.bankName}
                  onChange={set('bankName')}
                  className={inputCls}
                  placeholder="BCA"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                  No. Rekening
                </label>
                <input
                  value={form.bankAccount}
                  onChange={set('bankAccount')}
                  className={inputCls}
                  placeholder="1234567890"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                  Nama Pemilik Rekening
                </label>
                <input
                  value={form.bankAccountName}
                  onChange={set('bankAccountName')}
                  className={inputCls}
                  placeholder="Budi Santoso"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-stone-200"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Attendance status colour config ──────────────────────────────────────────
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

// ── Leave form ────────────────────────────────────────────────────────────────
function LeaveForm({
  storeId,
  employees,
  onClose,
  onSaved,
}: {
  storeId: string
  employees: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? '',
    startDate: '',
    endDate: '',
    type: 'ANNUAL' as 'ANNUAL' | 'SICK' | 'PERSONAL',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.startDate || !form.endDate) return setError('Tanggal harus diisi')
    if (new Date(form.endDate) < new Date(form.startDate))
      return setError('Tanggal selesai tidak boleh sebelum tanggal mulai')
    if (!form.reason.trim() || form.reason.trim().length < 3)
      return setError('Alasan minimal 3 karakter')
    setSaving(true)
    const res = await fetch(`/api/hr/leave?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = (await res.json()) as any
      setError(d.error ?? 'Gagal menyimpan')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-md sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-bold text-[var(--text-1)]">Ajukan Cuti / Izin</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
              Karyawan
            </label>
            <select value={form.employeeId} onChange={set('employeeId')} className={inputCls}>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Mulai
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Selesai
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={set('endDate')}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Tipe</label>
            <select value={form.type} onChange={set('type')} className={inputCls}>
              <option value="ANNUAL">Cuti Tahunan</option>
              <option value="SICK">Sakit</option>
              <option value="PERSONAL">Izin Pribadi</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
              Alasan
            </label>
            <textarea
              value={form.reason}
              onChange={set('reason')}
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Alasan pengajuan cuti…"
            />
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-stone-200"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Ajukan'}
          </button>
        </div>
      </div>
    </div>
  )
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
      {/* Employee selector */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedEmployeeId}
          onChange={e => setSelectedEmployeeId(e.target.value)}
          className={inputCls + ' max-w-xs'}
        >
          {employees.map((e: any) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {/* Month navigation */}
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

      {/* Calendar grid */}
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

      {/* Legend */}
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

      {/* Summary */}
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

// ── Leave status badge config ─────────────────────────────────────────────────
const LEAVE_STATUS_CONFIG = {
  PENDING: { label: 'Menunggu', pill: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  APPROVED: {
    label: 'Disetujui',
    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  REJECTED: { label: 'Ditolak', pill: 'bg-red-50 text-red-600 border border-red-200' },
}
const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti Tahunan',
  SICK: 'Sakit',
  PERSONAL: 'Izin Pribadi',
}

// ── Cuti & Izin tab ───────────────────────────────────────────────────────────
function CutiTab({
  storeId,
  userRole,
  employees,
}: {
  storeId: string
  userRole?: string
  employees: any[]
}) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const canApprove = userRole === 'OWNER' || userRole === 'MANAGER'

  const { data: leaves = [], isLoading } = useQuery<any[]>({
    queryKey: ['hr-leave', storeId],
    queryFn: () => fetch(`/api/hr/leave?storeId=${storeId}`).then(r => r.json()),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/hr/leave/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-leave'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-3)]">{(leaves as any[]).length} pengajuan</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Ajukan Cuti
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : (leaves as any[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 shadow-sm">
          <FileText className="mb-3 h-12 w-12 text-stone-200" />
          <p className="text-sm text-[var(--text-3)]">Belum ada pengajuan cuti</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(leaves as any[]).map((leave: any) => {
            const cfg =
              LEAVE_STATUS_CONFIG[leave.status as keyof typeof LEAVE_STATUS_CONFIG] ??
              LEAVE_STATUS_CONFIG.PENDING
            const start = leave.startDate?.slice(0, 10) ?? ''
            const end = leave.endDate?.slice(0, 10) ?? ''
            const days =
              start && end
                ? Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
                : 0
            return (
              <div
                key={leave.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-1)]">
                      {leave.employeeName ?? '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">
                      {LEAVE_TYPE_LABEL[leave.type] ?? leave.type} · {start} – {end} ({days} hari)
                    </p>
                    {leave.reason && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-2)]">
                        {leave.reason}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold',
                      cfg.pill,
                    )}
                  >
                    {cfg.label}
                  </span>
                </div>
                {canApprove && leave.status === 'PENDING' && (
                  <div className="mt-3 flex gap-2 border-t border-stone-50 pt-3">
                    <button
                      onClick={() => approveMutation.mutate({ id: leave.id, status: 'APPROVED' })}
                      disabled={approveMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <CheckCircle className="h-3 w-3" /> Setujui
                    </button>
                    <button
                      onClick={() => approveMutation.mutate({ id: leave.id, status: 'REJECTED' })}
                      disabled={approveMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-50 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-100"
                    >
                      <XCircle className="h-3 w-3" /> Tolak
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <LeaveForm
          storeId={storeId}
          employees={employees}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['hr-leave'] })
          }}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HRPageClient({ storeId, currency, userRole }: HRPageClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'karyawan' | 'absensi' | 'cuti' | 'payroll' | 'penilaian'>('karyawan')
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
          {/* Search */}
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pr-4 pl-9 text-sm text-[var(--text-1)] placeholder-stone-400 shadow-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
              placeholder="Cari nama, posisi, atau departemen…"
            />
          </div>

          {/* Employee List */}
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 shadow-sm">
              <Users className="mb-3 h-12 w-12 text-stone-200" />
              <p className="text-sm text-[var(--text-3)]">
                {search ? 'Tidak ada karyawan yang cocok' : 'Belum ada karyawan'}
              </p>
              {!search && (
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-3 text-sm font-medium text-amber-500 hover:text-amber-600"
                >
                  + Tambah karyawan pertama
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((emp: any) => {
                const statusCfg =
                  STATUS_CONFIG[emp.employmentStatus as keyof typeof STATUS_CONFIG] ??
                  STATUS_CONFIG.ACTIVE
                const typeCfg =
                  TYPE_CONFIG[emp.employmentType as keyof typeof TYPE_CONFIG] ??
                  TYPE_CONFIG.FULL_TIME
                const join = new Date(emp.joinDate)
                const now = new Date()
                const months =
                  (now.getFullYear() - join.getFullYear()) * 12 + now.getMonth() - join.getMonth()
                const years = Math.floor(months / 12)
                const remMonths = months % 12
                const tenure = years > 0 ? `${years}th ${remMonths}bl` : `${remMonths}bl`
                return (
                  <div
                    key={emp.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white">
                          {emp.name
                            .split(' ')
                            .map((n: string) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text-1)]">{emp.name}</p>
                          <p className="truncate text-xs text-[var(--text-3)]">
                            {emp.position}
                            {emp.department ? ` · ${emp.department}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={cn(
                            'rounded-lg px-2 py-0.5 text-xs font-semibold',
                            statusCfg.pill,
                          )}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-2)]">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3 text-stone-300" />
                        <span>{formatCurrency(emp.baseSalary, currency)}/bl</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-stone-300" />
                        <span>{tenure}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="h-3 w-3 text-stone-300" />
                        <span>{typeCfg.label}</span>
                      </div>
                      {emp.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-stone-300" />
                          <span className="truncate">{emp.phone}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-stone-50 pt-3">
                      <button
                        onClick={() => setEditing(emp)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--bg-subtle)] py-1.5 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)]"
                      >
                        <Edit2 className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => deleteEmployee(emp.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-50 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-100"
                      >
                        <Trash2 className="h-3 w-3" /> Nonaktifkan
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

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
        <CutiTab storeId={storeId} userRole={userRole} employees={employees as any[]} />
      )}

      {tab === 'payroll' && (
        <PayrollTab storeId={storeId} currency={currency} employees={employees as any[]} />
      )}

      {tab === 'penilaian' && (
        <PenilaianTab storeId={storeId} employees={employees as any[]} />
      )}
    </div>
  )
}

// ─── PayrollTab ───────────────────────────────────────────────────────────────

function PayrollTab({ storeId, currency, employees }: { storeId: string; currency: string; employees: any[] }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [payroll, setPayroll] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [commissionMap, setCommissionMap] = useState<Record<string, number>>({})

  const generate = async () => {
    setLoading(true)
    // First calculate commissions for the period from CommissionRule engine
    const commRes = await fetch('/api/hr/commission/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, month, year }),
    })
    if (commRes.ok) {
      const commData = await commRes.json() as { data?: any[] }
      const map: Record<string, number> = {}
      for (const row of commData.data ?? []) {
        map[row.employeeId] = row.commissionEarned
      }
      setCommissionMap(map)
    }

    const res = await fetch('/api/hr/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, month, year }),
    })
    const data = await res.json() as { data?: any[] }
    setPayroll(data.data ?? [])
    setLoading(false)
  }

  const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{new Date(2000,i).toLocaleString('id-ID',{month:'long'})}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
          {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={generate} disabled={loading} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
          {loading ? 'Menghitung…' : 'Generate Payroll'}
        </button>
        <a
          href="/dashboard/hr/commission"
          className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-50"
        >
          Lihat Komisi →
        </a>
      </div>
      {payroll.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-2)]">
              <tr>
                {['Karyawan','Gaji Pokok','Komisi (Aturan)','Potongan','Gaji Bersih'].map(h => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {payroll.map((row: any) => {
                // Use commission from CommissionRule engine if available, fallback to payroll row
                const commission = commissionMap[row.employeeId] ?? row.commission ?? 0
                const netPay = Math.max(0, (row.baseSalary ?? 0) + commission - (row.deductions ?? row.totalDeductions ?? 0))
                return (
                  <tr key={row.employeeId} className="hover:bg-[var(--bg-muted)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{row.name ?? row.employeeName}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{fmt(row.baseSalary)}</td>
                    <td className="px-4 py-3 text-green-500">+{fmt(commission)}</td>
                    <td className="px-4 py-3 text-red-500">-{fmt(row.deductions ?? row.totalDeductions ?? 0)}</td>
                    <td className="px-4 py-3 font-bold text-[var(--text-1)]">{fmt(netPay)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── PenilaianTab ─────────────────────────────────────────────────────────────

function PenilaianTab({ storeId, employees }: { storeId: string; employees: any[] }) {
  const [reviews, setReviews] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employeeId: '', score: 3, strengths: '', improvements: '', goals: '' })

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
    const d = await fetch(`/api/hr/reviews?storeId=${storeId}`).then(r => r.json()) as any
    setReviews(d.data ?? [])
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(true)} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
        + Tambah Penilaian
      </button>
      {showForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
          <select value={form.employeeId} onChange={e => setForm(f => ({...f, employeeId: e.target.value}))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm">
            <option value="">Pilih Karyawan</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div className="flex gap-2">
            {[1,2,3,4,5].map(s => (
              <button key={s} onClick={() => setForm(f => ({...f, score: s}))} className={`text-2xl ${form.score >= s ? 'text-amber-400' : 'text-[var(--text-3)]'}`}>★</button>
            ))}
          </div>
          <input placeholder="Kelebihan" value={form.strengths} onChange={e => setForm(f => ({...f, strengths: e.target.value}))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm" />
          <input placeholder="Perbaikan" value={form.improvements} onChange={e => setForm(f => ({...f, improvements: e.target.value}))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm" />
          <input placeholder="Target" value={form.goals} onChange={e => setForm(f => ({...f, goals: e.target.value}))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={submit} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white">Simpan</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Batal</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {reviews.map((r: any) => (
          <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-1)]">{r.employeeName}</span>
              <span className="text-amber-400">{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span>
            </div>
            {r.strengths && <p className="mt-1 text-sm text-[var(--text-2)]">+ {r.strengths}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

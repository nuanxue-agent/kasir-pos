'use client'

import { useState, useCallback, useEffect } from 'react'
import { Clock, UserCheck, UserX, AlertCircle, Calendar, ChevronDown, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcLateMinutes,
  calcEarlyLeaveMinutes,
  calcWorkingMinutes,
  determineAttendanceStatus,
  calcMonthlySummary,
  calcAllEmployeeSummaries,
  parseTimeToMinutes,
} from '@/lib/attendance'
import type { AttendanceStatus, AttendanceSetting, AttendanceRecord, MonthlySummary } from '@/lib/attendance'

export {
  calcLateMinutes,
  calcEarlyLeaveMinutes,
  calcWorkingMinutes,
  determineAttendanceStatus,
  calcMonthlySummary,
  calcAllEmployeeSummaries,
  parseTimeToMinutes,
}
export type { AttendanceStatus, AttendanceSetting, AttendanceRecord, MonthlySummary }

interface Employee {
  id: string
  name: string
}

interface AttendanceRow {
  id: string
  employeeId: string
  employeeName?: string
  date: string
  clockIn: string | null
  clockOut: string | null
  status: AttendanceStatus
  lateMinutes: number
  earlyLeaveMinutes: number
  notes: string
}

interface Props {
  storeId: string
  employees: Employee[]
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Hadir',
  ABSENT: 'Absen',
  LATE: 'Terlambat',
  HALF_DAY: 'Setengah Hari',
  LEAVE: 'Cuti',
}

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: 'text-green-500',
  ABSENT: 'text-red-500',
  LATE: 'text-yellow-500',
  HALF_DAY: 'text-orange-400',
  LEAVE: 'text-blue-400',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthISO() {
  return new Date().toISOString().slice(0, 7)
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function formatMinutes(min: number) {
  if (min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0) return `${h}j ${m}m`
  return `${m}m`
}

type Tab = 'daily' | 'summary' | 'correction'

export default function AttendanceClient({ storeId, employees }: Props) {
  const [tab, setTab] = useState<Tab>('daily')
  const [date, setDate] = useState(todayISO())
  const [month, setMonth] = useState(currentMonthISO())
  const [records, setRecords] = useState<AttendanceRow[]>([])
  const [summaries, setSummaries] = useState<MonthlySummary[]>([])
  const [loading, setLoading] = useState(false)

  // Correction state
  const [correctionId, setCorrectionId] = useState('')
  const [correctionClockIn, setCorrectionClockIn] = useState('')
  const [correctionClockOut, setCorrectionClockOut] = useState('')
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [correcting, setCorrecting] = useState(false)

  // Clock-in/out state
  const [selectedEmp, setSelectedEmp] = useState(employees[0]?.id ?? '')
  const [clockNotes, setClockNotes] = useState('')
  const [clocking, setClocking] = useState(false)

  const fetchDaily = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/hr/attendance?storeId=${storeId}&date=${date}`)
      const json = await res.json() as any
      setRecords(json.data ?? [])
    } catch {
      toast.error('Gagal memuat data absensi')
    } finally {
      setLoading(false)
    }
  }, [storeId, date])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/hr/attendance/summary?storeId=${storeId}&month=${month}`)
      const json = await res.json() as any
      setSummaries(json.data ?? [])
    } catch {
      toast.error('Gagal memuat ringkasan bulanan')
    } finally {
      setLoading(false)
    }
  }, [storeId, month])

  useEffect(() => {
    if (tab === 'daily' || tab === 'correction') fetchDaily()
    if (tab === 'summary') fetchSummary()
  }, [tab, fetchDaily, fetchSummary])

  const handleClockIn = async () => {
    if (!selectedEmp) return
    setClocking(true)
    try {
      const res = await fetch(`/api/hr/attendance/clock-in?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, employeeId: selectedEmp, notes: clockNotes }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Clock-in berhasil — ${STATUS_LABEL[json.status as AttendanceStatus] ?? json.status}${json.lateMinutes > 0 ? ` (+${json.lateMinutes}m terlambat)` : ''}`)
      setClockNotes('')
      fetchDaily()
    } finally {
      setClocking(false)
    }
  }

  const handleClockOut = async () => {
    if (!selectedEmp) return
    setClocking(true)
    try {
      const res = await fetch(`/api/hr/attendance/clock-out?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, employeeId: selectedEmp, notes: clockNotes }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Clock-out berhasil${json.earlyLeaveMinutes > 0 ? ` (pulang awal ${json.earlyLeaveMinutes}m)` : ''}`)
      setClockNotes('')
      fetchDaily()
    } finally {
      setClocking(false)
    }
  }

  const handleCorrection = async () => {
    if (!correctionId) return
    setCorrecting(true)
    try {
      const res = await fetch(`/api/hr/attendance/${correctionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clockIn: correctionClockIn || undefined,
          clockOut: correctionClockOut || undefined,
          notes: correctionNotes,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Koreksi absensi berhasil disimpan')
      setCorrectionId('')
      setCorrectionClockIn('')
      setCorrectionClockOut('')
      setCorrectionNotes('')
      fetchDaily()
    } finally {
      setCorrecting(false)
    }
  }

  const selectForCorrection = (row: AttendanceRow) => {
    setCorrectionId(row.id)
    setCorrectionClockIn(row.clockIn ? new Date(row.clockIn).toTimeString().slice(0, 5) : '')
    setCorrectionClockOut(row.clockOut ? new Date(row.clockOut).toTimeString().slice(0, 5) : '')
    setCorrectionNotes(row.notes ?? '')
    setTab('correction')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Absensi Karyawan</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Pencatatan kehadiran, clock in/out, dan rekap bulanan
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['daily', 'summary', 'correction'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent hover:border-gray-400',
            )}
            style={{ color: tab === t ? undefined : 'var(--text-2)' }}
          >
            {t === 'daily' ? 'Absensi Harian' : t === 'summary' ? 'Rekap Bulanan' : 'Koreksi'}
          </button>
        ))}
      </div>

      {/* Daily Tab */}
      {tab === 'daily' && (
        <div className="space-y-6">
          {/* Clock-in/out panel */}
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Clock size={16} /> Clock In / Clock Out
            </h2>
            <div className="flex flex-wrap gap-3">
              <select
                value={selectedEmp}
                onChange={(e) => setSelectedEmp(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Catatan (opsional)"
                value={clockNotes}
                onChange={(e) => setClockNotes(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              />
              <button
                onClick={handleClockIn}
                disabled={clocking || !selectedEmp}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                <UserCheck size={15} /> Masuk
              </button>
              <button
                onClick={handleClockOut}
                disabled={clocking || !selectedEmp}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
                <UserX size={15} /> Pulang
              </button>
            </div>
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>{records.length} catatan</span>
          </div>

          {/* Attendance table */}
          {loading ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-3)' }}>Memuat…</div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Karyawan', 'Masuk', 'Pulang', 'Status', 'Terlambat', 'Pulang Awal', 'Jam Kerja', 'Catatan', ''].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                        Belum ada data absensi untuk tanggal ini
                      </td>
                    </tr>
                  )}
                  {records.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-1)' }}>{r.employeeName ?? r.employeeId}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatTime(r.clockIn)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatTime(r.clockOut)}</td>
                      <td className={cn('px-3 py-2 font-medium', STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatMinutes(r.lateMinutes)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatMinutes(r.earlyLeaveMinutes)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>
                        {r.clockIn && r.clockOut ? formatMinutes(calcWorkingMinutes(r.clockIn, r.clockOut)) : '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[140px] truncate" style={{ color: 'var(--text-3)' }}>{r.notes || '—'}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => selectForCorrection(r)}
                          className="text-xs px-2 py-1 rounded hover:bg-opacity-80"
                          style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}
                        >
                          Koreksi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Monthly Summary Tab */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>

          {loading ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-3)' }}>Memuat…</div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Karyawan', 'Hadir', 'Absen', 'Terlambat', 'Setengah', 'Cuti', 'Terlambat (total)', 'Kehadiran %'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                        Tidak ada data untuk bulan ini
                      </td>
                    </tr>
                  )}
                  {summaries.map((s) => (
                    <tr key={s.employeeId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-1)' }}>{s.employeeName ?? s.employeeId}</td>
                      <td className="px-3 py-2 text-green-500">{s.presentDays}</td>
                      <td className="px-3 py-2 text-red-500">{s.absentDays}</td>
                      <td className="px-3 py-2 text-yellow-500">{s.lateDays}</td>
                      <td className="px-3 py-2 text-orange-400">{s.halfDays}</td>
                      <td className="px-3 py-2 text-blue-400">{s.leaveDays}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatMinutes(s.totalLateMinutes)}</td>
                      <td className="px-3 py-2 font-semibold" style={{
                        color: s.attendanceRate >= 90 ? '#22c55e' : s.attendanceRate >= 70 ? '#eab308' : '#ef4444'
                      }}>
                        {s.attendanceRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Correction Tab */}
      {tab === 'correction' && (
        <div className="space-y-6">
          {/* Select from daily records */}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); fetchDaily() }}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>

          {records.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Karyawan', 'Masuk', 'Pulang', 'Status', ''].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderTop: '1px solid var(--border)', background: correctionId === r.id ? 'var(--bg-2)' : undefined }}
                    >
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-1)' }}>{r.employeeName ?? r.employeeId}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatTime(r.clockIn)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{formatTime(r.clockOut)}</td>
                      <td className={cn('px-3 py-2', STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => selectForCorrection(r)}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'var(--primary)', color: '#fff' }}
                        >
                          Pilih
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Correction form */}
          {correctionId && (
            <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <AlertCircle size={16} className="text-orange-400" /> Form Koreksi Absensi
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Waktu Masuk</label>
                  <input
                    type="time"
                    value={correctionClockIn}
                    onChange={(e) => setCorrectionClockIn(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Waktu Pulang</label>
                  <input
                    type="time"
                    value={correctionClockOut}
                    onChange={(e) => setCorrectionClockOut(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Alasan Koreksi</label>
                <textarea
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  rows={2}
                  placeholder="Mis: Lupa absen, mesin error, dll."
                  className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCorrection}
                  disabled={correcting}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--primary)' }}
                >
                  <CheckCircle size={15} /> Simpan Koreksi
                </button>
                <button
                  onClick={() => setCorrectionId('')}
                  className="rounded-lg px-4 py-2 text-sm"
                  style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

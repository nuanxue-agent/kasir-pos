"use client"

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Plus, X, ChevronLeft, ChevronRight, AlertTriangle, ArrowLeftRight, Check, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'MANAGER'] as const
type Role = typeof ROLES[number]
type ShiftStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'ABSENT'
type SwapStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

const ROLE_COLORS: Record<Role, string> = {
  CASHIER: 'bg-blue-100 text-blue-700 border-blue-200',
  WAITER: 'bg-green-100 text-green-700 border-green-200',
  KITCHEN: 'bg-orange-100 text-orange-700 border-orange-200',
  MANAGER: 'bg-purple-100 text-purple-700 border-purple-200',
}

const STATUS_COLORS: Record<ShiftStatus, string> = {
  SCHEDULED: 'bg-yellow-50 border-yellow-200',
  CONFIRMED: 'bg-emerald-50 border-emerald-200',
  COMPLETED: 'bg-gray-50 border-gray-200',
  ABSENT: 'bg-red-50 border-red-200',
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

interface Shift {
  id: string
  storeId: string
  employeeId: string
  employeeName?: string
  date: string
  startTime: string
  endTime: string
  role: Role
  notes?: string
  status: ShiftStatus
}

interface ShiftSwap {
  id: string
  requesterId: string
  requesterName?: string
  targetId: string
  targetName?: string
  shiftId: string
  status: SwapStatus
}

interface CoverageAlert {
  date: string
  role: Role
  scheduled: number
  required: number
}

interface Employee {
  id: string
  name: string
  position: string
}

interface Props {
  storeId: string
  userRole?: string
}

function getWeekDates(weekOffset: number): string[] {
  const now = new Date()
  const dow = now.getDay()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - dow + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export default function ShiftSchedulerClient({ storeId, userRole }: Props) {
  const qc = useQueryClient()
  const isManager = !userRole || userRole === 'OWNER' || userRole === 'MANAGER'
  const [weekOffset, setWeekOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [showSwaps, setShowSwaps] = useState(false)
  const [swapShiftId, setSwapShiftId] = useState<string | null>(null)
  const [swapTargetId, setSwapTargetId] = useState('')

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const weekParam = weekDates[0]

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['shifts', storeId, weekParam],
    queryFn: async () => {
      const r = await fetch(`/api/hr/shifts?storeId=${storeId}&week=${weekParam}`)
      if (!r.ok) return []
      return r.json()
    },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees', storeId],
    queryFn: async () => {
      const r = await fetch(`/api/hr/employees?storeId=${storeId}`)
      if (!r.ok) return []
      return r.json()
    },
  })

  const { data: coverage = [] } = useQuery<CoverageAlert[]>({
    queryKey: ['coverage', storeId, weekParam],
    queryFn: async () => {
      const r = await fetch(`/api/hr/schedule/coverage?storeId=${storeId}&week=${weekParam}`)
      if (!r.ok) return []
      return r.json()
    },
  })

  const { data: swaps = [] } = useQuery<ShiftSwap[]>({
    queryKey: ['shift-swaps', storeId],
    queryFn: async () => {
      const r = await fetch(`/api/hr/shift-swaps?storeId=${storeId}`)
      if (!r.ok) return []
      return r.json()
    },
  })

  const publishMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/hr/shifts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, week: weekParam }),
      })
      if (!r.ok) throw new Error('Failed to publish')
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', storeId] }),
  })

  const copyWeekMut = useMutation({
    mutationFn: async () => {
      const lastWeek = getWeekDates(weekOffset - 1)[0]
      const r = await fetch('/api/hr/shifts/copy-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, fromWeek: lastWeek, toWeek: weekParam }),
      })
      if (!r.ok) throw new Error('Failed to copy')
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', storeId] }),
  })

  const swapMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) => {
      const r = await fetch(`/api/hr/shift-swaps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error('Failed')
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-swaps'] }),
  })

  const requestSwapMut = useMutation({
    mutationFn: async () => {
      if (!swapShiftId || !swapTargetId) throw new Error('Missing data')
      const r = await fetch('/api/hr/shift-swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, shiftId: swapShiftId, targetId: swapTargetId }),
      })
      if (!r.ok) throw new Error('Failed')
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-swaps'] })
      setSwapShiftId(null)
      setSwapTargetId('')
    },
  })

  const understaffedDays = coverage.filter(c => c.scheduled < c.required)
  const pendingSwaps = swaps.filter(s => s.status === 'PENDING')

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-semibold text-[var(--text-1)]">Jadwal Shift</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-[var(--text-1)] min-w-[160px] text-center">
            {fmtDate(weekDates[0])} – {fmtDate(weekDates[6])}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <button
              onClick={() => copyWeekMut.mutate()}
              disabled={copyWeekMut.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-[var(--border)] hover:bg-[var(--bg-muted)] transition-colors"
            >
              <Clock className="w-4 h-4" /> Salin Minggu Lalu
            </button>
            <button
              onClick={() => publishMut.mutate()}
              disabled={publishMut.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
            >
              <Check className="w-4 h-4" /> Publikasi Jadwal
            </button>
            <button
              onClick={() => { setEditShift(null); setShowForm(true) }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Tambah Shift
            </button>
          </div>
        )}
      </div>

      {/* Coverage Alert Banner */}
      {understaffedDays.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Peringatan kekurangan staf: </span>
            {understaffedDays.map((c, i) => (
              <span key={i}>{fmtDate(c.date)} ({c.role}: {c.scheduled}/{c.required}){i < understaffedDays.length - 1 ? ', ' : ''}</span>
            ))}
          </div>
        </div>
      )}

      {/* Swap Requests Badge */}
      {pendingSwaps.length > 0 && isManager && (
        <button
          onClick={() => setShowSwaps(true)}
          className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
          {pendingSwaps.length} permintaan tukar shift menunggu persetujuan
        </button>
      )}

      {/* Weekly Grid */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full">
          <thead>
            <tr className="bg-[var(--bg-subtle)]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-2)] w-36">Karyawan</th>
              {weekDates.map((d, i) => (
                <th key={d} className="text-center px-2 py-3 text-xs font-semibold text-[var(--text-2)] min-w-[100px]">
                  <div>{DAYS[i]}</div>
                  <div className="text-[var(--text-1)] font-medium">{fmtDate(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-sm text-[var(--text-2)]">
                  Belum ada karyawan
                </td>
              </tr>
            )}
            {employees.map(emp => (
              <tr key={emp.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-subtle)]/50">
                <td className="px-4 py-2">
                  <div className="text-sm font-medium text-[var(--text-1)]">{emp.name}</div>
                  <div className="text-xs text-[var(--text-2)]">{emp.position}</div>
                </td>
                {weekDates.map(d => {
                  const dayShifts = shifts.filter(s => s.employeeId === emp.id && s.date === d)
                  return (
                    <td key={d} className="px-1 py-1 align-top">
                      <div className="space-y-1 min-h-[48px]">
                        {dayShifts.map(shift => (
                          <div
                            key={shift.id}
                            onClick={() => isManager && (setEditShift(shift), setShowForm(true))}
                            className={cn(
                              'px-1.5 py-1 rounded-lg border text-xs cursor-pointer hover:opacity-80 transition-opacity',
                              ROLE_COLORS[shift.role],
                              STATUS_COLORS[shift.status],
                            )}
                          >
                            <div className="font-semibold">{shift.role}</div>
                            <div>{shift.startTime}–{shift.endTime}</div>
                            {!isManager && shift.status === 'SCHEDULED' && (
                              <button
                                onClick={e => { e.stopPropagation(); setSwapShiftId(shift.id) }}
                                className="mt-1 text-[10px] underline text-blue-600"
                              >
                                Tukar
                              </button>
                            )}
                          </div>
                        ))}
                        {isManager && dayShifts.length === 0 && (
                          <button
                            onClick={() => {
                              setEditShift({ id: '', storeId, employeeId: emp.id, date: d, startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'SCHEDULED' })
                              setShowForm(true)
                            }}
                            className="w-full h-8 rounded-lg border border-dashed border-[var(--border)] text-[var(--text-2)] hover:border-amber-400 hover:text-amber-500 transition-colors flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Shift Form Modal */}
      {showForm && (
        <ShiftFormModal
          storeId={storeId}
          shift={editShift}
          employees={employees}
          onClose={() => { setShowForm(false); setEditShift(null) }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['shifts', storeId] })
            setShowForm(false)
            setEditShift(null)
          }}
        />
      )}

      {/* Swap Request Modal */}
      {swapShiftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-1)]">Ajukan Tukar Shift</h2>
              <button onClick={() => setSwapShiftId(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-2)]">Tukar dengan karyawan</label>
              <select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)} className={inputCls}>
                <option value="">Pilih karyawan...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setSwapShiftId(null)} className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--bg-muted)] transition-colors">Batal</button>
              <button
                onClick={() => requestSwapMut.mutate()}
                disabled={!swapTargetId || requestSwapMut.isPending}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                Ajukan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Approvals Modal */}
      {showSwaps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-1)]">Permintaan Tukar Shift</h2>
              <button onClick={() => setShowSwaps(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              {pendingSwaps.length === 0 && <p className="text-sm text-[var(--text-2)] text-center py-4">Tidak ada permintaan pending</p>}
              {pendingSwaps.map(swap => (
                <div key={swap.id} className="flex items-center justify-between p-3 bg-[var(--bg-subtle)] rounded-xl">
                  <div className="text-sm">
                    <span className="font-medium text-[var(--text-1)]">{swap.requesterName ?? swap.requesterId}</span>
                    <span className="text-[var(--text-2)]"> → </span>
                    <span className="font-medium text-[var(--text-1)]">{swap.targetName ?? swap.targetId}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => swapMut.mutate({ id: swap.id, status: 'APPROVED' })}
                      className="px-3 py-1 text-xs rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                    >
                      Setuju
                    </button>
                    <button
                      onClick={() => swapMut.mutate({ id: swap.id, status: 'REJECTED' })}
                      className="px-3 py-1 text-xs rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShiftFormModal({ storeId, shift, employees, onClose, onSaved }: {
  storeId: string
  shift: Shift | null
  employees: Employee[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!shift?.id
  const [form, setForm] = useState({
    employeeId: shift?.employeeId ?? '',
    date: shift?.date ?? new Date().toISOString().slice(0, 10),
    startTime: shift?.startTime ?? '08:00',
    endTime: shift?.endTime ?? '16:00',
    role: shift?.role ?? 'CASHIER' as Role,
    notes: shift?.notes ?? '',
    status: shift?.status ?? 'SCHEDULED' as ShiftStatus,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const url = isEdit ? `/api/hr/shifts/${shift!.id}` : '/api/hr/shifts'
      const method = isEdit ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      })
      if (!r.ok) throw new Error('Gagal menyimpan shift')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!shift?.id) return
    setLoading(true)
    try {
      await fetch(`/api/hr/shifts/${shift.id}`, { method: 'DELETE' })
      onSaved()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-1)]">{isEdit ? 'Edit Shift' : 'Tambah Shift'}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-2)]">Karyawan</label>
            <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className={inputCls} required>
              <option value="">Pilih karyawan...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)]">Tanggal</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-2)]">Mulai</label>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className={inputCls} required />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-2)]">Selesai</label>
              <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className={inputCls} required />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)]">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} className={inputCls}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)]">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ShiftStatus }))} className={inputCls}>
              {(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'ABSENT'] as ShiftStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)]">Catatan</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opsional" className={inputCls} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-2">
            {isEdit && (
              <button type="button" onClick={handleDelete} disabled={loading} className="px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm hover:bg-red-100 transition-colors">
                Hapus
              </button>
            )}
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--bg-muted)] transition-colors">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm hover:bg-amber-600 transition-colors disabled:opacity-50">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

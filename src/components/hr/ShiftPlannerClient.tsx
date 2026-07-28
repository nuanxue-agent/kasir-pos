'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Plus, X, ArrowLeftRight, Check, AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  buildWeeklyGrid,
  calcDailyCoverage,
  detectOvertime,
  getWeekStart,
  getWeekDates,
  type ScheduleEntry,
  type ShiftDefinition,
} from '@/lib/shift-planner'

// Re-export pure functions for unit tests
export {
  buildWeeklyGrid,
  calcDailyCoverage,
  detectOvertime,
  getWeekStart,
  getWeekDates,
} from '@/lib/shift-planner'

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  CONFIRMED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  SWAPPED:   'bg-blue-50 border-blue-200 text-blue-700',
  ABSENT:    'bg-red-50 border-red-200 text-red-700',
}

const SWAP_COLORS: Record<string, string> = {
  PENDING:  'bg-yellow-50 text-yellow-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

interface Employee { id: string; name: string }
interface Shift     { id: string; name: string; startTime: string; endTime: string }
interface SwapRequest {
  id: string
  requesterId: string
  targetId: string
  scheduleId: string
  reason: string
  status: string
  requestedAt: string
  requesterName?: string
  targetName?: string
}

interface ShiftPlannerClientProps {
  storeId: string
  initialEmployees: Employee[]
  initialShifts: Shift[]
}

export default function ShiftPlannerClient({
  storeId,
  initialEmployees,
  initialShifts,
}: ShiftPlannerClientProps) {
  const qc = useQueryClient()

  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekStart(new Date()),
  )
  const [tab, setTab] = useState<'grid' | 'swaps'>('grid')

  // ── Add Shift Modal ──────────────────────────────────────────────────────
  const [addModal, setAddModal] = useState<{ dayOfWeek: number; employeeId: string } | null>(null)
  const [addShiftId, setAddShiftId] = useState('')

  // ── Swap Modal ───────────────────────────────────────────────────────────
  const [swapModal, setSwapModal] = useState<ScheduleEntry | null>(null)
  const [swapTargetId, setSwapTargetId] = useState('')
  const [swapReason, setSwapReason] = useState('')

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart])

  // ── Data Fetching ────────────────────────────────────────────────────────
  const { data: schedules = [] } = useQuery<ScheduleEntry[]>({
    queryKey: ['shift-schedules', storeId, currentWeekStart],
    queryFn: async () => {
      const res = await fetch(
        `/api/hr/shift-schedules?storeId=${storeId}&weekStart=${currentWeekStart}`,
      )
      return (await res.json()) as any
    },
    initialData: [],
  })

  const { data: swapRequests = [] } = useQuery<SwapRequest[]>({
    queryKey: ['shift-swaps', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/shift-swaps?storeId=${storeId}`)
      return (await res.json()) as any
    },
    initialData: [],
  })

  // ── Mutations ────────────────────────────────────────────────────────────
  const addShift = useMutation({
    mutationFn: async (body: {
      employeeId: string
      shiftId: string
      dayOfWeek: number
      weekStart: string
    }) => {
      const res = await fetch(`/api/hr/shift-schedules?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-schedules', storeId] })
      setAddModal(null)
      setAddShiftId('')
      toast.success('Shift ditambahkan')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/hr/shift-schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = (await res.json()) as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-schedules', storeId] })
      toast.success('Status diperbarui')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const requestSwap = useMutation({
    mutationFn: async (body: {
      requesterId: string
      targetId: string
      scheduleId: string
      reason: string
    }) => {
      const res = await fetch(`/api/hr/shift-swaps?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-swaps', storeId] })
      setSwapModal(null)
      setSwapTargetId('')
      setSwapReason('')
      toast.success('Permintaan tukar shift dikirim')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const resolveSwap = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/hr/shift-swaps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = (await res.json()) as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-swaps', storeId] })
      qc.invalidateQueries({ queryKey: ['shift-schedules', storeId] })
      toast.success('Permintaan tukar shift diperbarui')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Computed ─────────────────────────────────────────────────────────────
  const shiftsAsDefinitions = initialShifts.map((s) => ({
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    hoursPerDay: calcHours(s.startTime, s.endTime),
  }))

  const grid = useMemo(
    () => buildWeeklyGrid(schedules, initialEmployees),
    [schedules, initialEmployees],
  )

  const coverage = useMemo(
    () => calcDailyCoverage(schedules, 1),
    [schedules],
  )

  const overtimeAlerts = useMemo(
    () =>
      initialEmployees
        .map((emp) => ({
          ...emp,
          ...detectOvertime(schedules, shiftsAsDefinitions, emp.id),
        }))
        .filter((e) => e.hasOvertime),
    [schedules, initialEmployees, shiftsAsDefinitions],
  )

  // ── Week navigation ───────────────────────────────────────────────────────
  function shiftWeek(delta: number) {
    const d = new Date(currentWeekStart + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta * 7)
    setCurrentWeekStart(d.toISOString().split('T')[0])
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-400/10">
            <Calendar className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">Jadwal Shift</h1>
            <p className="text-sm text-[var(--text-3)]">Rotasi dan penugasan shift karyawan</p>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-[var(--text-2)] min-w-[140px] text-center">
            {weekDates[0]} — {weekDates[6]}
          </span>
          <button
            onClick={() => shiftWeek(1)}
            className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overtime alerts */}
      {overtimeAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {overtimeAlerts.map((emp) => (
            <div key={emp.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{emp.name}: {emp.totalHours}h (overtime {emp.overtimeHours}h)</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--bg-subtle)] rounded-xl w-fit">
        {(['grid', 'swaps'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === t
                ? 'bg-white shadow-sm text-[var(--text-1)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {t === 'grid' ? 'Grid Mingguan' : `Tukar Shift ${swapRequests.filter((s) => s.status === 'PENDING').length > 0 ? `(${swapRequests.filter((s) => s.status === 'PENDING').length})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'grid' && (
        <>
          {/* Coverage bar */}
          <div className="grid grid-cols-7 gap-1">
            {coverage.map((c) => (
              <div key={c.dayOfWeek} className="text-center">
                <div className={cn(
                  'text-xs font-medium py-1 rounded-lg',
                  c.covered ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                )}>
                  {c.scheduled}
                </div>
              </div>
            ))}
          </div>

          {/* Weekly grid */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-[var(--text-3)] p-2 w-32">Karyawan</th>
                  {DAYS.map((day, i) => (
                    <th key={i} className="text-center text-xs font-medium text-[var(--text-3)] p-2">
                      <div>{day}</div>
                      <div className="text-[var(--text-3)] font-normal">{weekDates[i]?.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => (
                  <tr key={row.employeeId} className="border-t border-[var(--border)]">
                    <td className="p-2 text-sm font-medium text-[var(--text-1)] truncate max-w-[120px]">
                      {row.employeeName}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.dayOfWeek} className="p-1 align-top">
                        {cell.entry ? (
                          <div className={cn(
                            'rounded-lg border p-1.5 text-xs space-y-1',
                            STATUS_COLORS[cell.entry.status] ?? 'bg-[var(--bg-subtle)]',
                          )}>
                            <div className="font-medium truncate">
                              {cell.entry.shiftName ?? cell.entry.shiftId}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-70">
                              <Clock className="w-3 h-3" />
                              {cell.entry.shiftStart}–{cell.entry.shiftEnd}
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              <select
                                value={cell.entry.status}
                                onChange={(e) =>
                                  updateStatus.mutate({ id: cell.entry!.id, status: e.target.value })
                                }
                                className="text-xs bg-transparent border-0 p-0 cursor-pointer outline-none"
                              >
                                {['SCHEDULED', 'CONFIRMED', 'SWAPPED', 'ABSENT'].map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => {
                                  setSwapModal(cell.entry)
                                  setSwapTargetId('')
                                  setSwapReason('')
                                }}
                                className="ml-auto hover:opacity-70"
                                title="Tukar shift"
                              >
                                <ArrowLeftRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddModal({ dayOfWeek: cell.dayOfWeek, employeeId: row.employeeId })
                              setAddShiftId(initialShifts[0]?.id ?? '')
                            }}
                            className="w-full h-full min-h-[56px] flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] hover:border-amber-400 hover:bg-amber-50/30 transition-all group"
                          >
                            <Plus className="w-4 h-4 text-[var(--text-3)] group-hover:text-amber-500" />
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'swaps' && (
        <div className="space-y-3">
          {swapRequests.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-3)]">
              Belum ada permintaan tukar shift
            </div>
          ) : (
            swapRequests.map((swap) => (
              <div key={swap.id} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-[var(--text-1)]">
                    {swap.requesterName ?? swap.requesterId} → {swap.targetName ?? swap.targetId}
                  </div>
                  {swap.reason && (
                    <div className="text-xs text-[var(--text-3)]">{swap.reason}</div>
                  )}
                  <div className="text-xs text-[var(--text-3)]">
                    {new Date(swap.requestedAt).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', SWAP_COLORS[swap.status])}>
                    {swap.status}
                  </span>
                  {swap.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => resolveSwap.mutate({ id: swap.id, status: 'APPROVED' })}
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title="Setujui"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => resolveSwap.mutate({ id: swap.id, status: 'REJECTED' })}
                        className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                        title="Tolak"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Shift Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text-1)]">Tambah Shift</h2>
              <button onClick={() => setAddModal(null)}>
                <X className="w-4 h-4 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="text-sm text-[var(--text-2)]">
              {DAYS[addModal.dayOfWeek]} — {initialEmployees.find((e) => e.id === addModal.employeeId)?.name}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[var(--text-2)]">Pilih Shift</label>
              <select
                value={addShiftId}
                onChange={(e) => setAddShiftId(e.target.value)}
                className={inputCls}
              >
                {initialShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime}–{s.endTime})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setAddModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() =>
                  addShift.mutate({
                    employeeId: addModal.employeeId,
                    shiftId: addShiftId,
                    dayOfWeek: addModal.dayOfWeek,
                    weekStart: currentWeekStart,
                  })
                }
                disabled={!addShiftId || addShift.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-400 text-white font-medium text-sm hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {addShift.isPending ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Request Modal */}
      {swapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text-1)]">Tukar Shift</h2>
              <button onClick={() => setSwapModal(null)}>
                <X className="w-4 h-4 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="text-sm text-[var(--text-2)]">
              Shift: {swapModal.shiftName ?? swapModal.shiftId} — {DAYS[swapModal.dayOfWeek]}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tukar dengan karyawan</label>
                <select
                  value={swapTargetId}
                  onChange={(e) => setSwapTargetId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Pilih karyawan…</option>
                  {initialEmployees
                    .filter((e) => e.id !== swapModal.employeeId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Alasan (opsional)</label>
                <textarea
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  rows={2}
                  className={cn(inputCls, 'resize-none')}
                  placeholder="Alasan tukar shift…"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSwapModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() =>
                  requestSwap.mutate({
                    requesterId: swapModal.employeeId,
                    targetId: swapTargetId,
                    scheduleId: swapModal.id,
                    reason: swapReason,
                  })
                }
                disabled={!swapTargetId || requestSwap.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-400 text-white font-medium text-sm hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {requestSwap.isPending ? 'Mengirim…' : 'Kirim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function calcHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff <= 0) diff += 1440 // overnight
  return diff / 60
}

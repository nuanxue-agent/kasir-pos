'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Plus, Calendar, Play, StopCircle, X, Loader2, Clock,
  CheckCircle, AlertCircle, Ban, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  type ScheduledCampaign,
  type ScheduledStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  validateSchedule,
  getCampaignsForDay,
} from '@/lib/campaign-scheduler'

interface CampaignSchedulerClientProps {
  storeId: string
}

const STATUS_ICONS: Record<ScheduledStatus, React.ReactNode> = {
  PENDING:   <Clock className="w-4 h-4" />,
  ACTIVE:    <CheckCircle className="w-4 h-4" />,
  COMPLETED: <CheckCircle className="w-4 h-4" />,
  CANCELLED: <Ban className="w-4 h-4" />,
}

export default function CampaignSchedulerClient({ storeId }: CampaignSchedulerClientProps) {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [filterStatus, setFilterStatus] = useState<ScheduledStatus | 'ALL'>('ALL')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const [form, setForm] = useState({
    campaignId: '',
    startAt: '',
    endAt: '',
    autoStart: true,
    autoStop: true,
  })

  // Fetch scheduled campaigns
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['scheduled-campaigns', storeId, filterStatus],
    queryFn: async () => {
      const url = filterStatus === 'ALL'
        ? `/api/scheduled-campaigns?storeId=${storeId}`
        : `/api/scheduled-campaigns?storeId=${storeId}&status=${filterStatus}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      return await res.json() as ScheduledCampaign[]
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`/api/scheduled-campaigns?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-campaigns'] })
      setShowModal(false)
      resetForm()
      toast.success('Kampanye terjadwal berhasil dibuat')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Trigger mutation (start/stop)
  const triggerMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'stop' }) => {
      const res = await fetch(`/api/scheduled-campaigns/${id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-campaigns'] })
      toast.success(data.message ?? 'Trigger berhasil')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update status mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ScheduledStatus }) => {
      const res = await fetch(`/api/scheduled-campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-campaigns'] })
      toast.success('Status berhasil diperbarui')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const resetForm = () => {
    setForm({
      campaignId: '',
      startAt: '',
      endAt: '',
      autoStart: true,
      autoStop: true,
    })
  }

  const handleCreate = () => {
    if (!form.campaignId.trim()) {
      toast.error('Campaign ID wajib diisi')
      return
    }
    if (!form.startAt.trim()) {
      toast.error('Waktu mulai wajib diisi')
      return
    }

    const validation = validateSchedule(form.startAt, form.endAt || null)
    if (!validation.valid) {
      toast.error(validation.error ?? 'Validasi gagal')
      return
    }

    createMutation.mutate(form)
  }

  const handleTrigger = (id: string, action: 'start' | 'stop') => {
    triggerMutation.mutate({ id, action })
  }

  const handleCancel = (id: string) => {
    updateMutation.mutate({ id, status: 'CANCELLED' })
  }

  // Calendar helpers
  const getMonthDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPad = firstDay.getDay()
    const days: (Date | null)[] = []

    // Padding
    for (let i = 0; i < startPad; i++) days.push(null)
    // Days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d))
    }
    return days
  }

  const getDayKey = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))
  }

  const monthLabel = currentMonth.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Penjadwalan Kampanye</h1>
          <p className="text-sm text-[var(--text-2)] mt-1">
            Atur kampanye promosi otomatis: email, diskon, dan perubahan harga terjadwal
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Jadwalkan Kampanye
        </button>
      </div>

      {/* View Toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setView('list')}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
            view === 'list'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-2)]'
          )}
        >
          Daftar
        </button>
        <button
          onClick={() => setView('calendar')}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
            view === 'calendar'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-2)]'
          )}
        >
          <Calendar className="inline w-4 h-4 mr-1" />
          Kalender
        </button>
      </div>

      {view === 'list' && (
        <>
          {/* Filter */}
          <div className="mb-4 flex gap-2">
            {(['ALL', 'PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium border transition-colors',
                  filterStatus === s
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--bg-2)]'
                )}
              >
                {s === 'ALL' ? 'Semua' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-3)]" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
              <Calendar className="mx-auto mb-3 w-12 h-12 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-2)]">Belum ada kampanye terjadwal</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => (
                <div
                  key={c.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[var(--text-1)]">
                          Campaign ID: {c.campaignId}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                            STATUS_COLORS[c.status]
                          )}
                        >
                          {STATUS_ICONS[c.status]}
                          {STATUS_LABELS[c.status]}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-2)] space-y-0.5">
                        <div>Mulai: {new Date(c.startAt).toLocaleString('id-ID')}</div>
                        {c.endAt && <div>Selesai: {new Date(c.endAt).toLocaleString('id-ID')}</div>}
                        <div className="flex gap-3">
                          <span>Auto-start: {c.autoStart ? 'Ya' : 'Tidak'}</span>
                          <span>Auto-stop: {c.autoStop ? 'Ya' : 'Tidak'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {c.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleTrigger(c.id, 'start')}
                            disabled={triggerMutation.isPending}
                            className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            <Play className="w-3 h-3" />
                            Mulai
                          </button>
                          <button
                            onClick={() => handleCancel(c.id)}
                            disabled={updateMutation.isPending}
                            className="flex items-center gap-1 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            <X className="w-3 h-3" />
                            Batalkan
                          </button>
                        </>
                      )}
                      {c.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleTrigger(c.id, 'stop')}
                          disabled={triggerMutation.isPending}
                          className="flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          <StopCircle className="w-3 h-3" />
                          Hentikan
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'calendar' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="rounded-md p-2 hover:bg-[var(--bg-2)] text-[var(--text-2)]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-[var(--text-1)]">{monthLabel}</h2>
            <button
              onClick={nextMonth}
              className="rounded-md p-2 hover:bg-[var(--bg-2)] text-[var(--text-2)]"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-[var(--text-2)] py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-2">
            {getMonthDays().map((date, idx) => {
              if (!date) return <div key={`pad-${idx}`} />
              const dayKey = getDayKey(date)
              const dayCampaigns = getCampaignsForDay(campaigns, dayKey)
              const isToday =
                date.toDateString() === new Date().toDateString()

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'min-h-20 rounded-md border p-2',
                    isToday
                      ? 'border-[var(--primary)] bg-blue-50/50'
                      : 'border-[var(--border)] bg-[var(--bg-1)]'
                  )}
                >
                  <div className="text-xs font-medium text-[var(--text-2)] mb-1">
                    {date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayCampaigns.slice(0, 3).map(c => (
                      <div
                        key={c.id}
                        className={cn(
                          'text-[10px] rounded px-1 py-0.5 truncate',
                          STATUS_COLORS[c.status]
                        )}
                        title={`Campaign ${c.campaignId} - ${STATUS_LABELS[c.status]}`}
                      >
                        {c.campaignId}
                      </div>
                    ))}
                    {dayCampaigns.length > 3 && (
                      <div className="text-[10px] text-[var(--text-3)]">
                        +{dayCampaigns.length - 3} lagi
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">
                Jadwalkan Kampanye
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 hover:bg-[var(--bg-2)] text-[var(--text-2)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-1)] mb-1">
                  Campaign ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.campaignId}
                  onChange={e => setForm(prev => ({ ...prev, campaignId: e.target.value }))}
                  placeholder="PROMO-2026"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-1)] mb-1">
                  Waktu Mulai <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={e => setForm(prev => ({ ...prev, startAt: e.target.value }))}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-1)] mb-1">
                  Waktu Selesai (opsional)
                </label>
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={e => setForm(prev => ({ ...prev, endAt: e.target.value }))}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-[var(--text-1)]">
                  <input
                    type="checkbox"
                    checked={form.autoStart}
                    onChange={e => setForm(prev => ({ ...prev, autoStart: e.target.checked }))}
                    className="rounded border-[var(--border)]"
                  />
                  Auto-start saat waktu mulai tiba
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-1)]">
                  <input
                    type="checkbox"
                    checked={form.autoStop}
                    onChange={e => setForm(prev => ({ ...prev, autoStop: e.target.checked }))}
                    className="rounded border-[var(--border)]"
                  />
                  Auto-stop saat waktu selesai tiba
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                >
                  Batal
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Buat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

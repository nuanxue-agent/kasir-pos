'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Plus, X, Loader2, Calendar, Bell, Send, RefreshCw } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// Re-export pure logic for unit tests
export {
  daysUntilNextBirthday,
  calcTriggerDate,
  isUpcomingBirthday,
  calcRewardValue,
  isValidQueueTransition,
  getUpcomingCustomers,
  formatTriggerLabel,
} from '@/lib/birthday-automation'

export type { TriggerType, RewardType, QueueStatus, BirthdayAutomation, BirthdayQueue, CustomerBirthday } from '@/lib/birthday-automation'

interface Props {
  storeId: string
  currency?: string
}

interface Automation {
  id: string
  storeId: string
  triggerType: 'BIRTHDAY' | 'ANNIVERSARY' | 'SIGNUP_ANNIVERSARY'
  daysBeforeTrigger: number
  rewardType: 'VOUCHER' | 'POINTS' | 'DISCOUNT'
  rewardValue: number
  message: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface UpcomingCustomer {
  customerId: string
  name: string
  phone?: string
  triggerType: string
  dateISO: string
  daysUntil: number
}

const TRIGGER_LABELS: Record<string, string> = {
  BIRTHDAY: 'Ulang Tahun',
  ANNIVERSARY: 'Anniversary Pembelian',
  SIGNUP_ANNIVERSARY: 'Anniversary Pendaftaran',
}

const REWARD_LABELS: Record<string, string> = {
  VOUCHER: 'Voucher',
  POINTS: 'Poin',
  DISCOUNT: 'Diskon %',
}

const TRIGGER_COLORS: Record<string, string> = {
  BIRTHDAY: 'text-pink-500',
  ANNIVERSARY: 'text-purple-500',
  SIGNUP_ANNIVERSARY: 'text-blue-500',
}

function AutomationForm({
  storeId,
  currency,
  initial,
  onClose,
}: {
  storeId: string
  currency: string
  initial?: Automation | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [triggerType, setTriggerType] = useState<string>(initial?.triggerType ?? 'BIRTHDAY')
  const [daysBeforeTrigger, setDaysBeforeTrigger] = useState(String(initial?.daysBeforeTrigger ?? 0))
  const [rewardType, setRewardType] = useState<string>(initial?.rewardType ?? 'VOUCHER')
  const [rewardValue, setRewardValue] = useState(String(initial?.rewardValue ?? 0))
  const [message, setMessage] = useState(initial?.message ?? '')
  const [active, setActive] = useState(initial?.active !== false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!rewardValue || isNaN(Number(rewardValue))) {
      toast.error('Nilai reward harus diisi')
      return
    }
    setSaving(true)
    try {
      const body = {
        triggerType,
        daysBeforeTrigger: Number(daysBeforeTrigger),
        rewardType,
        rewardValue: Number(rewardValue),
        message,
        active,
      }
      let res: Response
      if (initial) {
        res = await fetch(`/api/birthday-automations/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch(`/api/birthday-automations?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(initial ? 'Automasi diperbarui' : 'Automasi dibuat')
      qc.invalidateQueries({ queryKey: ['birthday-automations', storeId] })
      onClose()
    } catch {
      toast.error('Gagal menyimpan automasi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? 'Edit Automasi' : 'Tambah Automasi'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-2)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Jenis Trigger</label>
            <select
              value={triggerType}
              onChange={e => setTriggerType(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm"
            >
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Hari Sebelum Event</label>
            <input
              type="number"
              min="0"
              max="30"
              value={daysBeforeTrigger}
              onChange={e => setDaysBeforeTrigger(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--text-3)]">0 = kirim pada hari event</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Jenis Reward</label>
              <select
                value={rewardType}
                onChange={e => setRewardType(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm"
              >
                {Object.entries(REWARD_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Nilai Reward</label>
              <input
                type="number"
                min="0"
                value={rewardValue}
                onChange={e => setRewardValue(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm"
                placeholder={rewardType === 'DISCOUNT' ? '% diskon' : rewardType === 'POINTS' ? 'poin' : 'IDR'}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Pesan</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm"
              placeholder="Selamat ulang tahun! Nikmati hadiah spesial dari kami."
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">Aktif</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-2)]"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BirthdayAutomationClient({ storeId, currency = 'IDR' }: Props) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [processing, setProcessing] = useState(false)

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ['birthday-automations', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/birthday-automations?storeId=${storeId}`)
      return await res.json() as any
    },
  })

  const { data: upcoming = [] } = useQuery<UpcomingCustomer[]>({
    queryKey: ['birthday-upcoming', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/birthday-automations/upcoming?storeId=${storeId}&window=30`)
      return await res.json() as any
    },
  })

  const handleToggle = async (item: Automation) => {
    const res = await fetch(`/api/birthday-automations/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(item.active ? 'Automasi dinonaktifkan' : 'Automasi diaktifkan')
    qc.invalidateQueries({ queryKey: ['birthday-automations', storeId] })
  }

  const handleProcess = async () => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/birthday-automations/process?storeId=${storeId}`, { method: 'POST' })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Terkirim: ${json.sent} | Antrian baru: ${json.enqueued} | Gagal: ${json.failed}`)
      qc.invalidateQueries({ queryKey: ['birthday-upcoming', storeId] })
    } catch {
      toast.error('Gagal memproses reward')
    } finally {
      setProcessing(false)
    }
  }

  const openEdit = (item: Automation) => { setEditing(item); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Birthday &amp; Anniversary Automation</h1>
          <p className="text-sm text-[var(--text-3)]">Kirim reward otomatis ke pelanggan saat ulang tahun atau anniversary</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleProcess}
            disabled={processing}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-2)] disabled:opacity-50"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Proses Hari Ini
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tambah Automasi
          </button>
        </div>
      </div>

      {/* Automation rules */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Bell className="h-4 w-4 text-[var(--text-2)]" />
          <h2 className="font-semibold">Aturan Automasi</h2>
          <span className="ml-auto rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-xs">{automations.length}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)]">
            <Gift className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Belum ada aturan automasi</p>
            <p className="text-xs">Klik &quot;Tambah Automasi&quot; untuk memulai</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {automations.map(item => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-2)]', TRIGGER_COLORS[item.triggerType])}>
                  <Gift className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{TRIGGER_LABELS[item.triggerType]}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs', item.active ? 'bg-green-500/10 text-green-600' : 'bg-[var(--bg-2)] text-[var(--text-3)]')}>
                      {item.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-3)]">
                    {item.daysBeforeTrigger === 0 ? 'Pada hari event' : `${item.daysBeforeTrigger} hari sebelum event`}
                    {' · '}
                    {REWARD_LABELS[item.rewardType]}{' '}
                    {item.rewardType === 'DISCOUNT'
                      ? `${item.rewardValue}%`
                      : item.rewardType === 'POINTS'
                      ? `${item.rewardValue} poin`
                      : formatCurrency(item.rewardValue, currency)}
                  </p>
                  {item.message ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-3)] italic">&ldquo;{item.message}&rdquo;</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(item)}
                    className="rounded-lg px-2 py-1 text-xs border border-[var(--border)] hover:bg-[var(--bg-2)]"
                  >
                    {item.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="rounded-lg px-2 py-1 text-xs border border-[var(--border)] hover:bg-[var(--bg-2)]"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming birthdays preview */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Calendar className="h-4 w-4 text-[var(--text-2)]" />
          <h2 className="font-semibold">Upcoming — 30 Hari ke Depan</h2>
          <span className="ml-auto rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-xs">{upcoming.length}</span>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['birthday-upcoming', storeId] })}
            className="ml-1 rounded-lg p-1 hover:bg-[var(--bg-2)]"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[var(--text-3)]" />
          </button>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text-3)]">
            Tidak ada event dalam 30 hari ke depan
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {upcoming.map((c, i) => (
              <div key={`${c.customerId}-${c.triggerType}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold bg-[var(--bg-2)]', TRIGGER_COLORS[c.triggerType])}>
                  {c.daysUntil === 0 ? '🎉' : c.daysUntil}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-[var(--text-3)]">
                    {TRIGGER_LABELS[c.triggerType] ?? c.triggerType}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </p>
                </div>
                <span className="text-xs text-[var(--text-3)]">
                  {c.daysUntil === 0 ? 'Hari ini' : `${c.daysUntil} hari lagi`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <AutomationForm
          storeId={storeId}
          currency={currency}
          initial={editing}
          onClose={closeForm}
        />
      )}
    </div>
  )
}

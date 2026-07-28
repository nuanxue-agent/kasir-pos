'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Calendar, Clock, Users, Phone, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type WaitStatus = 'WAITING' | 'SEATED' | 'LEFT'

export interface Reservation {
  id: string; storeId: string; tableId: string
  customerName: string; customerPhone: string
  partySize: number; date: string; time: string
  duration: number; status: ReservationStatus
  notes?: string | null; createdAt: string; updatedAt: string
}

export interface WaitlistEntry {
  id: string; storeId: string; customerName: string
  customerPhone: string; partySize: number
  addedAt: string; estimatedWait: number
  status: WaitStatus; tableId?: string | null; seatedAt?: string | null
}

interface ReservationClientProps { storeId: string }

const RES_STATUS: Record<ReservationStatus, { label: string; bg: string; text: string; dot: string }> = {
  PENDING:   { label: 'Pending',   bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  CONFIRMED: { label: 'Confirmed', bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  SEATED:    { label: 'Seated',    bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
  COMPLETED: { label: 'Completed', bg: 'bg-gray-50',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  CANCELLED: { label: 'Cancelled', bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-400'    },
  NO_SHOW:   { label: 'No Show',   bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
}

const WAIT_STATUS: Record<WaitStatus, { label: string; bg: string; text: string }> = {
  WAITING: { label: 'Waiting', bg: 'bg-amber-50', text: 'text-amber-700' },
  SEATED:  { label: 'Seated',  bg: 'bg-green-50', text: 'text-green-700' },
  LEFT:    { label: 'Left',    bg: 'bg-gray-50',  text: 'text-gray-600'  },
}

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING:   ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED:    ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], CANCELLED: [], NO_SHOW: [],
}

function today() { return new Date().toISOString().split('T')[0] }

function fmtDate(d: string) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export default function ReservationClient({ storeId }: ReservationClientProps) {
  const [tab, setTab] = useState<'reservations' | 'waitlist'>('reservations')
  const [selectedDate, setSelectedDate] = useState(today())
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewRes, setShowNewRes] = useState(false)
  const [showNewWait, setShowNewWait] = useState(false)

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reservations?storeId=${storeId}&date=${selectedDate}`)
      if (res.ok) setReservations(await res.json())
    } finally { setLoading(false) }
  }, [storeId, selectedDate])

  const fetchWaitlist = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/waitlist?storeId=${storeId}&status=WAITING`)
      if (res.ok) setWaitlist(await res.json())
    } finally { setLoading(false) }
  }, [storeId])

  useEffect(() => { fetchReservations() }, [fetchReservations])
  useEffect(() => { fetchWaitlist() }, [fetchWaitlist])

  async function patchReservation(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/reservations/${id}?storeId=${storeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) fetchReservations()
  }

  async function patchWaitlist(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/waitlist/${id}?storeId=${storeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) { fetchWaitlist(); fetchReservations() }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reservasi &amp; Antrean</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola reservasi meja dan daftar tunggu</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { fetchReservations(); fetchWaitlist() }}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Refresh">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          {tab === 'reservations' ? (
            <button onClick={() => setShowNewRes(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Reservasi Baru
            </button>
          ) : (
            <button onClick={() => setShowNewWait(true)}
              className="flex items-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700">
              <Plus className="w-4 h-4" /> Tambah ke Antrean
            </button>
          )}
        </div>
      </div>
      <div className="bg-white border-b px-6 flex gap-0 flex-shrink-0">
        {(['reservations', 'waitlist'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}>
            {t === 'reservations' ? `Reservasi (${reservations.length})` : `Antrean (${waitlist.length})`}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {tab === 'reservations' ? (
          <ReservationsView reservations={reservations} selectedDate={selectedDate}
            onDateChange={setSelectedDate} onPatch={patchReservation}
            showNewForm={showNewRes} onCloseForm={() => setShowNewRes(false)}
            onCreated={fetchReservations} storeId={storeId} />
        ) : (
          <WaitlistView waitlist={waitlist} onPatch={patchWaitlist}
            showNewForm={showNewWait} onCloseForm={() => setShowNewWait(false)}
            onCreated={fetchWaitlist} storeId={storeId} />
        )}
      </div>
    </div>
  )
}

function ReservationsView({ reservations, selectedDate, onDateChange, onPatch,
  showNewForm, onCloseForm, onCreated, storeId }: {
  reservations: Reservation[]; selectedDate: string
  onDateChange: (d: string) => void
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
  showNewForm: boolean; onCloseForm: () => void; onCreated: () => void; storeId: string
}) {
  const grouped = Object.fromEntries(
    (['PENDING','CONFIRMED','SEATED','COMPLETED','CANCELLED','NO_SHOW'] as ReservationStatus[])
      .map(s => [s, reservations.filter(r => r.status === s)])
  ) as Record<ReservationStatus, Reservation[]>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Calendar className="w-4 h-4 text-gray-400" />
        <input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-sm text-gray-500">{fmtDate(selectedDate)}</span>
        <span className="ml-2 text-sm font-medium text-gray-700">{reservations.length} reservasi</span>
      </div>
      {showNewForm && <NewReservationForm storeId={storeId} defaultDate={selectedDate} onClose={onCloseForm} onCreated={onCreated} />}
      {(['PENDING','CONFIRMED','SEATED'] as ReservationStatus[]).map(status => {
        const items = grouped[status]
        if (!items.length) return null
        return (
          <div key={status}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              {RES_STATUS[status].label} ({items.length})
            </h3>
            <div className="grid gap-2">
              {items.map(r => <ReservationCard key={r.id} reservation={r} onPatch={onPatch} />)}
            </div>
          </div>
        )
      })}
      {(['COMPLETED','CANCELLED','NO_SHOW'] as ReservationStatus[]).map(status => {
        const items = grouped[status]
        if (!items.length) return null
        return (
          <details key={status} className="group">
            <summary className="text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none">
              {RES_STATUS[status].label} ({items.length})
            </summary>
            <div className="grid gap-2 mt-2">
              {items.map(r => <ReservationCard key={r.id} reservation={r} onPatch={onPatch} />)}
            </div>
          </details>
        )
      })}
      {reservations.length === 0 && !showNewForm && (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Tidak ada reservasi pada {fmtDate(selectedDate)}</p>
        </div>
      )}
    </div>
  )
}

function ReservationCard({ reservation: r, onPatch }: {
  reservation: Reservation
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
}) {
  const cfg = RES_STATUS[r.status]
  const next = VALID_TRANSITIONS[r.status]
  return (
    <div className={cn('rounded-xl border p-4 flex items-start gap-4', cfg.bg, 'border-gray-100')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />{cfg.label}
          </span>
          <span className="text-xs text-gray-400">Meja {r.tableId}</span>
        </div>
        <p className="font-medium text-gray-900 truncate">{r.customerName}</p>
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.customerPhone}</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{r.partySize} tamu</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.time} ({r.duration} mnt)</span>
        </div>
        {r.notes && <p className="text-xs text-gray-400 mt-1 italic">{r.notes}</p>}
      </div>
      {next.length > 0 && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          {next.map(ns => (
            <button key={ns} onClick={() => onPatch(r.id, { status: ns })}
              className={cn('text-xs px-2 py-1 rounded-lg font-medium border transition-colors',
                ns === 'CANCELLED' || ns === 'NO_SHOW'
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-blue-200 text-blue-600 hover:bg-blue-50')}>
              {RES_STATUS[ns].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewReservationForm({ storeId, defaultDate, onClose, onCreated }: {
  storeId: string; defaultDate: string; onClose: () => void; onCreated: () => void
}) {
  const [form, setForm] = useState({
    tableId: '', customerName: '', customerPhone: '', partySize: '2',
    date: defaultDate, time: '19:00', duration: '90', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/reservations?storeId=${storeId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, partySize: Number(form.partySize), duration: Number(form.duration) }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; setError(d.error ?? 'Gagal menyimpan'); return }
      onCreated(); onClose()
    } finally { setSaving(false) }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 space-y-3">
      <h3 className="font-medium text-gray-900">Reservasi Baru</h3>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Nama Pelanggan *</span>
          <input value={form.customerName} onChange={f('customerName')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Budi Santoso" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">No. Telepon *</span>
          <input value={form.customerPhone} onChange={f('customerPhone')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="0812..." required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">ID Meja *</span>
          <input value={form.tableId} onChange={f('tableId')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="table-1" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Jumlah Tamu *</span>
          <input type="number" min={1} value={form.partySize} onChange={f('partySize')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Tanggal *</span>
          <input type="date" value={form.date} onChange={f('date')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Jam *</span>
          <input type="time" value={form.time} onChange={f('time')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Durasi (mnt)</span>
          <input type="number" min={15} value={form.duration} onChange={f('duration')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Catatan</span>
          <input value={form.notes} onChange={f('notes')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Ulang tahun, dll." /></label>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Reservasi'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-gray-50">Batal</button>
      </div>
    </form>
  )
}

function WaitlistView({ waitlist, onPatch, showNewForm, onCloseForm, onCreated, storeId }: {
  waitlist: WaitlistEntry[]
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
  showNewForm: boolean; onCloseForm: () => void; onCreated: () => void; storeId: string
}) {
  return (
    <div className="space-y-4">
      {showNewForm && <NewWaitlistForm storeId={storeId} onClose={onCloseForm} onCreated={onCreated} />}
      {waitlist.length === 0 && !showNewForm ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Antrean kosong</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {waitlist.map((w, i) => <WaitlistCard key={w.id} entry={w} position={i} onPatch={onPatch} />)}
        </div>
      )}
    </div>
  )
}

function WaitlistCard({ entry: w, position, onPatch }: {
  entry: WaitlistEntry; position: number
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [tableId, setTableId] = useState('')
  const cfg = WAIT_STATUS[w.status]
  return (
    <div className={cn('rounded-xl border p-4 flex items-start gap-4', cfg.bg, 'border-gray-100')}>
      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
        {position + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>{cfg.label}</span>
          <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />~{w.estimatedWait} mnt</span>
        </div>
        <p className="font-medium text-gray-900">{w.customerName}</p>
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{w.customerPhone}</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{w.partySize} tamu</span>
        </div>
      </div>
      {w.status === 'WAITING' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <input value={tableId} onChange={e => setTableId(e.target.value)} placeholder="ID Meja"
            className="border rounded-lg px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-green-500" />
          <button onClick={() => onPatch(w.id, { status: 'SEATED', tableId: tableId || undefined })}
            className="text-xs px-2 py-1 rounded-lg font-medium border border-green-200 text-green-700 hover:bg-green-50">
            Dudukkan
          </button>
          <button onClick={() => onPatch(w.id, { status: 'LEFT' })}
            className="text-xs px-2 py-1 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50">
            Pergi
          </button>
        </div>
      )}
    </div>
  )
}

function NewWaitlistForm({ storeId, onClose, onCreated }: {
  storeId: string; onClose: () => void; onCreated: () => void
}) {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', partySize: '2' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/waitlist?storeId=${storeId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, partySize: Number(form.partySize) }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; setError(d.error ?? 'Gagal menyimpan'); return }
      onCreated(); onClose()
    } finally { setSaving(false) }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 space-y-3">
      <h3 className="font-medium text-gray-900">Tambah ke Antrean</h3>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Nama *</span>
          <input value={form.customerName} onChange={f('customerName')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder="Nama" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Telepon *</span>
          <input value={form.customerPhone} onChange={f('customerPhone')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder="0812..." required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-600">Tamu *</span>
          <input type="number" min={1} value={form.partySize} onChange={f('partySize')} className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" required /></label>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
          {saving ? 'Menambahkan...' : 'Tambah ke Antrean'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-gray-50">Batal</button>
      </div>
    </form>
  )
}

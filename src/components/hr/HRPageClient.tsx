'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Search, Edit2, Trash2, X, Phone, Mail,
  Calendar, Briefcase, DollarSign, ChevronRight, UserCheck,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface HRPageClientProps { storeId: string; currency: string }

const STATUS_CONFIG = {
  ACTIVE:     { label: 'Aktif',       pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  INACTIVE:   { label: 'Tidak Aktif', pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
  TERMINATED: { label: 'Berhenti',    pill: 'bg-red-50 text-red-500 border border-red-200' },
}

const TYPE_CONFIG = {
  FULL_TIME:  { label: 'Tetap' },
  PART_TIME:  { label: 'Part-time' },
  CONTRACT:   { label: 'Kontrak' },
  INTERN:     { label: 'Magang' },
}

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

function EmployeeForm({ storeId, employee, onClose, onSaved }: {
  storeId: string; employee?: any; onClose: () => void; onSaved: () => void
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
    else { const d = await res.json(); setError(d.error ?? 'Gagal menyimpan') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800">{employee ? 'Edit Karyawan' : 'Tambah Karyawan'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100"><X className="h-4 w-4 text-stone-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Lengkap *</label>
              <input value={form.name} onChange={set('name')} className={inputCls} placeholder="Budi Santoso" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">NIK</label>
              <input value={form.nik} onChange={set('nik')} className={inputCls} placeholder="16 digit" maxLength={16} />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Telepon</label>
              <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="08xx" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Posisi *</label>
              <input value={form.position} onChange={set('position')} className={inputCls} placeholder="Kasir" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Departemen</label>
              <input value={form.department} onChange={set('department')} className={inputCls} placeholder="Operasional" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Tipe</label>
              <select value={form.employmentType} onChange={set('employmentType')} className={inputCls}>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Tgl Bergabung *</label>
              <input type="date" value={form.joinDate} onChange={set('joinDate')} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Gaji Pokok</label>
              <input type="number" min="0" value={form.baseSalary} onChange={set('baseSalary')} className={inputCls} placeholder="3500000" />
            </div>
          </div>
          <div className="pt-2 border-t border-stone-100">
            <p className="text-xs font-semibold text-stone-400 mb-3">INFO BANK</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Bank</label>
                <input value={form.bankName} onChange={set('bankName')} className={inputCls} placeholder="BCA" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">No. Rekening</label>
                <input value={form.bankAccount} onChange={set('bankAccount')} className={inputCls} placeholder="1234567890" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Pemilik Rekening</label>
                <input value={form.bankAccountName} onChange={set('bankAccountName')} className={inputCls} placeholder="Budi Santoso" />
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-stone-100 p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold hover:bg-stone-200">Batal</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HRPageClient({ storeId, currency }: HRPageClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', storeId],
    queryFn: () => fetch(`/api/employees?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = (employees as any[]).filter((e: any) =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.position?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  )

  async function deleteEmployee(id: string) {
    if (!confirm('Nonaktifkan karyawan ini?')) return
    await fetch(`/api/employees/${id}?storeId=${storeId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['employees'] })
  }

  const refresh = () => { setShowForm(false); setEditing(null); qc.invalidateQueries({ queryKey: ['employees'] }) }

  const activeCount = (employees as any[]).filter((e: any) => e.employmentStatus === 'ACTIVE').length
  const totalSalary = (employees as any[]).filter((e: any) => e.employmentStatus === 'ACTIVE').reduce((s: number, e: any) => s + (e.baseSalary ?? 0), 0)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">SDM & Penggajian</h1>
          <p className="text-stone-400 text-sm mt-0.5">Karyawan, absensi, dan gaji</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Tambah Karyawan</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-stone-800">{activeCount}</p>
          <p className="text-xs text-stone-400">Karyawan Aktif</p>
        </div>
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-stone-800">{formatCurrency(totalSalary, currency)}</p>
          <p className="text-xs text-stone-400">Total Gaji/Bulan</p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex gap-2">
            <a href="/dashboard/hr/attendance"
              className="flex-1 flex items-center gap-2 p-3 bg-stone-50 rounded-xl hover:bg-stone-100 transition-colors">
              <UserCheck className="h-4 w-4 text-stone-500" />
              <span className="text-xs font-semibold text-stone-600">Absensi</span>
            </a>
            <a href="/dashboard/hr/payroll"
              className="flex-1 flex items-center gap-2 p-3 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600">Penggajian</span>
            </a>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-100 rounded-2xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
          placeholder="Cari nama, posisi, atau departemen…" />
      </div>

      {/* Employee List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-stone-50 animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <Users className="h-12 w-12 text-stone-200 mb-3" />
          <p className="text-stone-400 text-sm">{search ? 'Tidak ada karyawan yang cocok' : 'Belum ada karyawan'}</p>
          {!search && (
            <button onClick={() => setShowForm(true)} className="mt-3 text-amber-500 text-sm font-medium hover:text-amber-600">
              + Tambah karyawan pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((emp: any) => {
            const statusCfg = STATUS_CONFIG[emp.employmentStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.ACTIVE
            const typeCfg = TYPE_CONFIG[emp.employmentType as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.FULL_TIME
            // calc tenure
            const join = new Date(emp.joinDate)
            const now = new Date()
            const months = (now.getFullYear() - join.getFullYear()) * 12 + now.getMonth() - join.getMonth()
            const years = Math.floor(months / 12)
            const remMonths = months % 12
            const tenure = years > 0 ? `${years}th ${remMonths}bl` : `${remMonths}bl`
            return (
              <div key={emp.id} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 text-white font-bold text-sm">
                      {emp.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-800 truncate">{emp.name}</p>
                      <p className="text-xs text-stone-400 truncate">{emp.position}{emp.department ? ` · ${emp.department}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg', statusCfg.pill)}>{statusCfg.label}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
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
                <div className="flex gap-2 mt-3 pt-3 border-t border-stone-50">
                  <button onClick={() => setEditing(emp)}
                    className="flex-1 py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-600 transition-colors flex items-center justify-center gap-1">
                    <Edit2 className="h-3 w-3" /> Edit
                  </button>
                  <button onClick={() => deleteEmployee(emp.id)}
                    className="flex-1 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-500 transition-colors flex items-center justify-center gap-1">
                    <Trash2 className="h-3 w-3" /> Nonaktifkan
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(showForm || editing) && (
        <EmployeeForm storeId={storeId} employee={editing}
          onClose={() => { setShowForm(false); setEditing(null) }} onSaved={refresh} />
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const TYPE_CONFIG = {
  FULL_TIME: { label: 'Tetap' },
  PART_TIME: { label: 'Part-time' },
  CONTRACT: { label: 'Kontrak' },
  INTERN: { label: 'Magang' },
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

interface EmployeeFormProps {
  storeId: string
  employee?: any
  onClose: () => void
  onSaved: () => void
}

export function EmployeeForm({ storeId, employee, onClose, onSaved }: EmployeeFormProps) {
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

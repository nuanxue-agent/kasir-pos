'use client'

import { Users, Search, Edit2, Trash2, DollarSign, Calendar, Briefcase, Phone } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

interface EmployeeListProps {
  employees: any[]
  filtered: any[]
  isLoading: boolean
  search: string
  currency: string
  onSearchChange: (value: string) => void
  onEdit: (emp: any) => void
  onDelete: (id: string) => void
  onAddFirst: () => void
}

export function EmployeeList({
  employees,
  filtered,
  isLoading,
  search,
  currency,
  onSearchChange,
  onEdit,
  onDelete,
  onAddFirst,
}: EmployeeListProps) {
  return (
    <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
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
              onClick={onAddFirst}
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
              TYPE_CONFIG[emp.employmentType as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.FULL_TIME
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
                      className={cn('rounded-lg px-2 py-0.5 text-xs font-semibold', statusCfg.pill)}
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
                    onClick={() => onEdit(emp)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--bg-subtle)] py-1.5 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)]"
                  >
                    <Edit2 className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => onDelete(emp.id)}
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
    </>
  )
}

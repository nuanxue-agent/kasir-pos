'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit2, Trash2, Check, X, Layers, AlertTriangle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface ChartOfAccountsClientProps {
  storeId: string
  currency: string
}

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
type AccountType = typeof ACCOUNT_TYPES[number]

const TYPE_CONFIG: Record<AccountType, { label: string; color: string; bg: string; border: string }> = {
  ASSET:     { label: 'Aset',       color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  LIABILITY: { label: 'Liabilitas', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  EQUITY:    { label: 'Ekuitas',    color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  REVENUE:   { label: 'Pendapatan', color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-200' },
  EXPENSE:   { label: 'Biaya',      color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200' },
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

// ── Validate code: must be exactly 4 numeric digits ───────────────────────────
export function validateCoaCode(code: string): string | null {
  if (!code) return 'Kode akun harus diisi'
  if (!/^\d{4}$/.test(code)) return 'Kode akun harus 4 digit angka'
  return null
}

// ── Infer type from code (1xxx=ASSET, 2xxx=LIABILITY, etc.) ───────────────────
export function inferTypeFromCode(code: string): AccountType | null {
  if (!/^\d+$/.test(code)) return null
  const first = code[0]
  if (first === '1') return 'ASSET'
  if (first === '2') return 'LIABILITY'
  if (first === '3') return 'EQUITY'
  if (first === '4') return 'REVENUE'
  if (first === '5') return 'EXPENSE'
  return null
}

// ── Can delete: only if balance is 0 ─────────────────────────────────────────
export function canDeleteAccount(account: { balance: number }): boolean {
  return account.balance === 0
}

// ── Add Account Modal ─────────────────────────────────────────────────────────
function AddAccountModal({
  storeId,
  onClose,
  onSaved,
}: {
  storeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ code: '', name: '', type: 'ASSET' as AccountType, openingBalance: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleCodeChange(code: string) {
    const inferred = inferTypeFromCode(code)
    setForm(f => ({ ...f, code, ...(inferred ? { type: inferred } : {}) }))
  }

  async function handleSubmit() {
    setError('')
    const codeErr = validateCoaCode(form.code)
    if (codeErr) return setError(codeErr)
    if (form.name.trim().length < 2) return setError('Nama minimal 2 karakter')
    const ob = Number(form.openingBalance)
    if (isNaN(ob) || ob < 0) return setError('Saldo awal harus >= 0')
    setSaving(true)
    const res = await fetch(`/api/accounts?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: form.code, name: form.name.trim(), type: form.type, openingBalance: ob }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else { const d = await res.json() as any; setError(d.error ?? 'Gagal menyimpan') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full sm:max-w-md sm:rounded-xl rounded-t-3xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text-1)]">Tambah Akun</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)]" aria-label="Tutup">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Kode Akun * <span className="font-normal text-[var(--text-3)]">(4 digit)</span></label>
            <input
              value={form.code}
              onChange={e => handleCodeChange(e.target.value)}
              className={inputCls}
              placeholder="1100"
              maxLength={4}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Nama Akun *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="Kas"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Tipe</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}
              className={inputCls}
            >
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Saldo Awal</label>
            <input
              value={form.openingBalance}
              onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))}
              className={inputCls}
              placeholder="0"
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="p-4 flex gap-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200">
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteConfirmModal({
  account,
  storeId,
  currency,
  onClose,
  onDeleted,
}: {
  account: any
  storeId: string
  currency: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const hasBalance = account.balance !== 0

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/accounts/${account.id}?storeId=${storeId}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) onDeleted()
    else { const d = await res.json() as any; setError(d.error ?? 'Gagal menghapus') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full max-w-sm rounded-xl shadow-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-1)]">Hapus Akun?</p>
            <p className="text-xs text-[var(--text-3)]">{account.code} – {account.name}</p>
          </div>
        </div>
        {hasBalance && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            <strong>Perhatian:</strong> Akun ini memiliki saldo {formatCurrency(account.balance, currency)}. Tidak dapat dihapus sampai saldo nol.
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200">
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || hasBalance}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40"
          >
            {deleting ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inline editable row ───────────────────────────────────────────────────────
function AccountRow({
  account,
  storeId,
  currency,
  onRefresh,
}: {
  account: any
  storeId: string
  currency: string
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editCode, setEditCode] = useState(account.code)
  const [editName, setEditName] = useState(account.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const cfg = TYPE_CONFIG[account.type as AccountType] ?? TYPE_CONFIG.ASSET

  useEffect(() => {
    if (editing) nameRef.current?.focus()
  }, [editing])

  function startEdit() {
    setEditCode(account.code)
    setEditName(account.name)
    setError('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setError('')
  }

  async function saveEdit() {
    setError('')
    const codeErr = validateCoaCode(editCode)
    if (codeErr) return setError(codeErr)
    if (editName.trim().length < 2) return setError('Nama minimal 2 karakter')
    setSaving(true)
    const res = await fetch(`/api/accounts/${account.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: editCode, name: editName.trim() }),
    })
    setSaving(false)
    if (res.ok) { setEditing(false); onRefresh() }
    else { const d = await res.json() as any; setError(d.error ?? 'Gagal menyimpan') }
  }

  if (editing) {
    return (
      <>
        <div className="flex items-center px-4 py-2 gap-2 bg-amber-50/50">
          <input
            value={editCode}
            onChange={e => setEditCode(e.target.value)}
            className="font-mono text-xs font-bold text-[var(--text-1)] w-16 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400"
            maxLength={4}
            inputMode="numeric"
            aria-label="Kode akun"
          />
          <input
            ref={nameRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
            className="flex-1 text-sm text-[var(--text-1)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400"
            aria-label="Nama akun"
          />
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0', cfg.bg, cfg.color)}>
            {cfg.label}
          </span>
          <span className="text-xs text-[var(--text-3)] shrink-0 w-24 text-right">
            {formatCurrency(account.balance, currency)}
          </span>
          <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100" aria-label="Simpan">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </button>
          <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)]" aria-label="Batal">
            <X className="h-3.5 w-3.5 text-[var(--text-3)]" />
          </button>
        </div>
        {error && (
          <div className="px-4 py-1 bg-red-50">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors group">
        <span className="font-mono text-xs font-bold text-[var(--text-2)] w-14 shrink-0">{account.code}</span>
        <span className="text-sm font-medium text-[var(--text-1)] flex-1">{account.name}</span>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 mr-3', cfg.bg, cfg.color)}>
          {cfg.label}
        </span>
        <span className="text-xs text-[var(--text-3)] shrink-0 w-24 text-right mr-3">
          {formatCurrency(account.balance, currency)}
        </span>
        {!account.isSystem && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={startEdit}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
              aria-label={`Edit ${account.name}`}
            >
              <Edit2 className="h-3.5 w-3.5 text-[var(--text-3)]" />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
              aria-label={`Hapus ${account.name}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>
      {showDelete && (
        <DeleteConfirmModal
          account={account}
          storeId={storeId}
          currency={currency}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onRefresh() }}
        />
      )}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ChartOfAccountsClient({ storeId, currency }: ChartOfAccountsClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showAdd, setShowAdd] = useState(false)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', storeId],
    queryFn: () => fetch(`/api/accounts?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = (accounts as any[]).filter((a: any) =>
    (!typeFilter || a.type === typeFilter) &&
    (!search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase()))
  )

  const grouped = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = filtered.filter((a: any) => a.type === type)
    return acc
  }, {} as Record<string, any[]>)

  const refresh = () => qc.invalidateQueries({ queryKey: ['accounts'] })

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Chart of Accounts</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Daftar akun buku besar</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Tambah Akun</span>
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter('')}
          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
            !typeFilter ? 'bg-amber-500 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]')}
        >
          Semua
        </button>
        {ACCOUNT_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t === typeFilter ? '' : t)}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
              typeFilter === t
                ? `${TYPE_CONFIG[t].bg} ${TYPE_CONFIG[t].color} ${TYPE_CONFIG[t].border} border`
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]')}
          >
            {TYPE_CONFIG[t].label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-3)]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
          placeholder="Cari kode atau nama akun…"
        />
      </div>

      {/* Account groups */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {ACCOUNT_TYPES.filter(t => !typeFilter || t === typeFilter).map(type => {
            const accs = grouped[type] ?? []
            if (accs.length === 0 && (typeFilter || search)) return null
            const cfg = TYPE_CONFIG[type]
            return (
              <div key={type} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className={cn('flex items-center gap-2 px-4 py-3 border-b border-stone-50', cfg.bg)}>
                  <Layers className={cn('h-4 w-4', cfg.color)} />
                  <span className={cn('text-xs font-bold', cfg.color)}>{cfg.label}</span>
                  <span className="text-xs text-[var(--text-3)] ml-auto">{accs.length} akun</span>
                </div>
                {accs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-[var(--text-3)]">
                    Belum ada akun {cfg.label.toLowerCase()}
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {accs.map((a: any) => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        storeId={storeId}
                        currency={currency}
                        onRefresh={refresh}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddAccountModal
          storeId={storeId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh() }}
        />
      )}
    </div>
  )
}

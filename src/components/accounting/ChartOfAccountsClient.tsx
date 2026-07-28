'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit2, Trash2, Check, X, Layers, AlertTriangle, ChevronRight, ChevronDown, Download, Upload, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface ChartOfAccountsClientProps {
  storeId: string
  currency: string
}

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
type AccountType = typeof ACCOUNT_TYPES[number]

const TYPE_CONFIG: Record<AccountType, { label: string; color: string; bg: string; border: string; normal: string }> = {
  ASSET:     { label: 'Aset',       color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    normal: 'Debit' },
  LIABILITY: { label: 'Liabilitas', color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200',  normal: 'Kredit' },
  EQUITY:    { label: 'Ekuitas',    color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200',  normal: 'Kredit' },
  REVENUE:   { label: 'Pendapatan', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', normal: 'Kredit' },
  EXPENSE:   { label: 'Biaya',      color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     normal: 'Debit' },
}

export interface Account {
  id: string
  storeId: string
  code: string
  name: string
  type: AccountType
  subtype: string | null
  parentId: string | null
  level: number
  active: number
  description: string | null
  isSystem: number
  balance: number
  createdAt: string
  updatedAt: string
  children?: Account[]
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

// - Pure helpers (exported for tests) -
export function validateCoaCode(code: string): string | null {
  if (!code) return 'Kode akun harus diisi'
  if (!/^\d{4,6}$/.test(code.trim())) return 'Kode akun harus 4-6 digit angka'
  return null
}

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

export function getDebitCreditNormal(type: AccountType): 'debit' | 'credit' {
  return (type === 'ASSET' || type === 'EXPENSE') ? 'debit' : 'credit'
}

export function buildAccountTree(accounts: Account[]): Account[] {
  const map = new Map<string, Account>()
  for (const a of accounts) map.set(a.id, { ...a, children: [] })
  const roots: Account[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }
  const sort = (nodes: Account[]): Account[] => {
    nodes.sort((a, b) => a.code.localeCompare(b.code))
    for (const n of nodes) n.children = sort(n.children ?? [])
    return nodes
  }
  return sort(roots)
}

export function classifyAccountType(code: string): AccountType | null {
  return inferTypeFromCode(code)
}

// - Add Account Modal -
function AddAccountModal({
  storeId, onClose, onSaved,
  accounts,
}: {
  storeId: string
  onClose: () => void
  onSaved: () => void
  accounts: Account[]
}) {
  const [form, setForm] = useState({ code: '', name: '', type: 'ASSET' as AccountType, subtype: '', parentId: '', description: '', openingBalance: '0' })
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
    try {
      const res = await fetch(`/api/accounts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code, name: form.name.trim(), type: form.type,
          subtype: form.subtype || undefined,
          parentId: form.parentId || undefined,
          description: form.description || undefined,
          openingBalance: ob,
        }),
      })
      if (res.ok) { toast.success('Akun berhasil ditambahkan'); onSaved() }
      else { const d = await res.json() as any; setError(d.error ?? 'Gagal menyimpan') }
    } finally { setSaving(false) }
  }

  const parentOptions = accounts.filter(a => a.type === form.type)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full sm:max-w-lg sm:rounded-xl rounded-t-3xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-card)]">
          <h2 className="text-base font-bold text-[var(--text-1)]">Tambah Akun</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)]" aria-label="Tutup">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Kode Akun * <span className="font-normal text-[var(--text-3)]">(4-6 digit)</span></label>
              <input value={form.code} onChange={e => handleCodeChange(e.target.value)} className={inputCls} placeholder="1100" maxLength={6} inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Tipe *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType, parentId: '' }))} className={inputCls}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Nama Akun *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Kas" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Akun Induk</label>
              <select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))} className={inputCls}>
                <option value="">— Tidak ada —</option>
                {parentOptions.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Subtype</label>
              <input value={form.subtype} onChange={e => setForm(f => ({ ...f, subtype: e.target.value }))} className={inputCls} placeholder="CURRENT_ASSET" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Deskripsi</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Opsional" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Saldo Awal</label>
            <input value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} className={inputCls} placeholder="0" inputMode="numeric" />
          </div>
        </div>
        <div className="p-4 flex gap-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200">Batal</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// - Tree Account Row -
function AccountTreeRow({
  account, depth, storeId, onRefresh, expanded, onToggle,
}: {
  account: Account
  depth: number
  storeId: string
  onRefresh: () => void
  expanded: boolean
  onToggle: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editCode, setEditCode] = useState(account.code)
  const [editName, setEditName] = useState(account.name)
  const [editDesc, setEditDesc] = useState(account.description ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const cfg = TYPE_CONFIG[account.type] ?? TYPE_CONFIG.ASSET
  const hasChildren = (account.children?.length ?? 0) > 0

  useEffect(() => { if (editing) nameRef.current?.focus() }, [editing])

  function startEdit() { setEditCode(account.code); setEditName(account.name); setEditDesc(account.description ?? ''); setErr(''); setEditing(true) }
  function cancelEdit() { setEditing(false); setErr('') }

  async function saveEdit() {
    setErr('')
    const codeErr = validateCoaCode(editCode)
    if (codeErr) return setErr(codeErr)
    if (editName.trim().length < 2) return setErr('Nama minimal 2 karakter')
    setSaving(true)
    try {
      const res = await fetch(`/api/accounts/${account.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editCode, name: editName.trim(), description: editDesc || null }),
      })
      if (res.ok) { setEditing(false); toast.success('Akun diperbarui'); onRefresh() }
      else { const d = await res.json() as any; setErr(d.error ?? 'Gagal menyimpan') }
    } finally { setSaving(false) }
  }

  async function handleToggleActive() {
    const res = await fetch(`/api/accounts/${account.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !account.active }),
    })
    if (res.ok) { toast.success(account.active ? 'Akun dinonaktifkan' : 'Akun diaktifkan'); onRefresh() }
    else toast.error('Gagal mengubah status')
  }

  const indent = depth * 20

  return (
    <>
      <div
        className={cn(
          'flex items-center px-4 py-2.5 gap-2 hover:bg-[var(--bg-subtle)] transition-colors group',
          !account.active && 'opacity-50'
        )}
        style={{ paddingLeft: `${16 + indent}px` }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={onToggle}
          className={cn('p-0.5 rounded shrink-0', hasChildren ? 'text-[var(--text-3)] hover:text-[var(--text-1)]' : 'invisible')}
          aria-label={expanded ? 'Tutup' : 'Buka'}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {editing ? (
          <>
            <input value={editCode} onChange={e => setEditCode(e.target.value)}
              className="font-mono text-xs font-bold text-[var(--text-1)] w-14 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400"
              maxLength={6} inputMode="numeric" aria-label="Kode akun" />
            <input ref={nameRef} value={editName} onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
              className="flex-1 text-sm text-[var(--text-1)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400"
              aria-label="Nama akun" />
            <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
              className="w-32 text-xs text-[var(--text-2)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400 hidden sm:block"
              placeholder="Deskripsi" />
            <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 shrink-0" aria-label="Simpan">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            </button>
            <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] shrink-0" aria-label="Batal">
              <X className="h-3.5 w-3.5 text-[var(--text-3)]" />
            </button>
          </>
        ) : (
          <>
            <span className="font-mono text-xs font-bold text-[var(--text-2)] w-14 shrink-0">{account.code}</span>
            <span className={cn('text-sm font-medium text-[var(--text-1)] flex-1', depth === 0 && 'font-bold')}>{account.name}</span>
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 hidden sm:inline', cfg.bg, cfg.color, cfg.border, 'border')}>
              {cfg.label}
            </span>
            <span className="text-xs text-[var(--text-3)] shrink-0 hidden md:inline w-16 text-right">{cfg.normal}</span>
            {account.description && (
              <span className="text-xs text-[var(--text-3)] shrink-0 hidden lg:inline max-w-[160px] truncate">{account.description}</span>
            )}
            {!account.isSystem && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={startEdit} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)]" aria-label={`Edit ${account.name}`}>
                  <Edit2 className="h-3.5 w-3.5 text-[var(--text-3)]" />
                </button>
                <button onClick={handleToggleActive} className="p-1.5 rounded-lg hover:bg-amber-50" aria-label={account.active ? 'Nonaktifkan' : 'Aktifkan'}>
                  {account.active
                    ? <X className="h-3.5 w-3.5 text-amber-500" />
                    : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                </button>
                {!hasChildren && (
                  <button onClick={() => setShowDelete(true)} className="p-1.5 rounded-lg hover:bg-red-50" aria-label={`Hapus ${account.name}`}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {err && <div className="px-4 py-1 bg-red-50"><p className="text-xs text-red-600">{err}</p></div>}
      {showDelete && (
        <DeleteConfirmModal
          account={account} storeId={storeId}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onRefresh() }}
        />
      )}
    </>
  )
}

// - Delete confirmation modal -
function DeleteConfirmModal({ account, storeId, onClose, onDeleted }: {
  account: Account; storeId: string; onClose: () => void; onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/accounts/${account.id}?storeId=${storeId}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { toast.success('Akun dihapus'); onDeleted() }
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
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200">Batal</button>
          <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40">
            {deleting ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  )
}


// - Main Component -
export default function ChartOfAccountsClient({ storeId, currency: _currency }: ChartOfAccountsClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showAdd, setShowAdd] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', storeId],
    queryFn: () => fetch(`/api/accounts?storeId=${storeId}`).then(r => r.json() as Promise<Account[]>),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['accounts'] })

  type FlatRow = Account & { depth: number }
  function flattenFiltered(nodes: Account[], depth = 0): FlatRow[] {
    const result: FlatRow[] = []
    for (const n of nodes) {
      const match =
        (!typeFilter || n.type === typeFilter) &&
        (!search || n.code.includes(search) || n.name.toLowerCase().includes(search.toLowerCase()))
      if (match || (n.children?.length ?? 0) > 0) {
        result.push({ ...n, depth })
        if ((expandedIds.has(n.id) || !!search || !!typeFilter) && (n.children?.length ?? 0) > 0) {
          result.push(...flattenFiltered(n.children ?? [], depth + 1))
        }
      }
    }
    return result
  }

  const tree = buildAccountTree((accounts as Account[]).filter(a => showInactive || a.active))
  const flatRows = flattenFiltered(tree)

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function expandAll() { setExpandedIds(new Set((accounts as Account[]).map(a => a.id))) }
  function collapseAll() { setExpandedIds(new Set()) }

  function handleExport() {
    const blob = new Blob([JSON.stringify(accounts, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chart-of-accounts-${storeId}-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('COA berhasil diekspor')
  }

  async function handleLoadTemplate() {
    try {
      const res = await fetch('/api/accounts/template')
      const data = await res.json() as any
      const template = data.template as Array<{
        code: string; name: string; type: string; subtype: string | null
        parentCode: string | null; level: number; description: string | null
      }>
      const codeToId = new Map<string, string>()
      let created = 0
      let skipped = 0
      for (const acc of template) {
        const parentId = acc.parentCode ? codeToId.get(acc.parentCode) : undefined
        const postRes = await fetch(`/api/accounts?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: acc.code, name: acc.name, type: acc.type, subtype: acc.subtype, parentId, level: acc.level, description: acc.description }),
        })
        if (postRes.ok) { const c = await postRes.json() as any; codeToId.set(acc.code, c.id); created++ }
        else skipped++
      }
      toast.success(`Template PSAK dimuat: ${created} akun dibuat, ${skipped} dilewati`)
      refresh()
    } catch { toast.error('Gagal memuat template') }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const data = JSON.parse(await file.text()) as Account[]
      if (!Array.isArray(data)) throw new Error('Format tidak valid')
      let created = 0
      let skipped = 0
      for (const acc of data) {
        const r = await fetch(`/api/accounts?storeId=${storeId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: acc.code, name: acc.name, type: acc.type, subtype: acc.subtype, description: acc.description }),
        })
        if (r.ok) created++; else skipped++
      }
      toast.success(`Impor selesai: ${created} akun dibuat, ${skipped} dilewati`)
      refresh()
    } catch { toast.error('Gagal mengimpor file') }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const totalAccounts = (accounts as Account[]).length
  const activeAccounts = (accounts as Account[]).filter(a => a.active).length

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Chart of Accounts</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">{activeAccounts} aktif dari {totalAccounts} akun</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-2)] text-xs font-semibold rounded-xl hover:bg-[var(--bg-muted)]">
            <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ekspor</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-2)] text-xs font-semibold rounded-xl hover:bg-[var(--bg-muted)] disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">{importing ? 'Mengimpor…' : 'Impor'}</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          <button onClick={handleLoadTemplate} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-2)] text-xs font-semibold rounded-xl hover:bg-[var(--bg-muted)]">
            <RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Template PSAK</span>
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Tambah Akun</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setTypeFilter('')}>
          <span className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', !typeFilter ? 'bg-amber-500 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]')}>Semua</span>
        </button>
        {ACCOUNT_TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t === typeFilter ? '' : t)}>
            <span className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
              typeFilter === t
                ? `${TYPE_CONFIG[t].bg} ${TYPE_CONFIG[t].color} ${TYPE_CONFIG[t].border} border`
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]')}>
              {TYPE_CONFIG[t].label}
            </span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Tampilkan nonaktif
        </label>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-3)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
            placeholder="Cari kode atau nama akun…" />
        </div>
        <button onClick={expandAll} className="px-3 py-2 text-xs font-semibold text-[var(--text-2)] bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl hover:bg-[var(--bg-muted)]">Buka semua</button>
        <button onClick={collapseAll} className="px-3 py-2 text-xs font-semibold text-[var(--text-2)] bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl hover:bg-[var(--bg-muted)]">Tutup semua</button>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center px-4 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-3)]">
          <span className="w-6 shrink-0" />
          <span className="w-14 shrink-0">Kode</span>
          <span className="flex-1">Nama Akun</span>
          <span className="hidden sm:block w-24 shrink-0 text-center">Tipe</span>
          <span className="hidden md:block w-16 shrink-0 text-right">Normal</span>
          <span className="hidden lg:block w-40 shrink-0">Deskripsi</span>
          <span className="w-20 shrink-0" />
        </div>
        {isLoading ? (
          <div>{[...Array(10)].map((_, i) => <div key={i} className="h-10 bg-[var(--bg-subtle)] animate-pulse border-b border-[var(--border)] last:border-0" />)}</div>
        ) : flatRows.length === 0 ? (
          <div className="py-16 text-center">
            <Layers className="h-10 w-10 text-[var(--text-3)] mx-auto mb-3 opacity-40" />
            <p className="text-sm text-[var(--text-3)]">{search || typeFilter ? 'Tidak ada akun yang cocok' : 'Belum ada akun. Tambah akun atau muat template PSAK.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {flatRows.map(row => (
              <AccountTreeRow key={row.id} account={row} depth={row.depth} storeId={storeId}
                onRefresh={refresh} expanded={expandedIds.has(row.id)} onToggle={() => toggleExpand(row.id)} />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddAccountModal storeId={storeId} accounts={accounts as Account[]}
          onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refresh() }} />
      )}
    </div>
  )
}

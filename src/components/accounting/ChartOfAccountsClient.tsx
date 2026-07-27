'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit2, Layers, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartOfAccountsClientProps {
  storeId: string
  currency: string
}

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
type AccountType = typeof ACCOUNT_TYPES[number]

const TYPE_CONFIG: Record<AccountType, { label: string; color: string; bg: string }> = {
  ASSET:     { label: 'Aset',        color: 'text-blue-600',   bg: 'bg-blue-50' },
  LIABILITY: { label: 'Liabilitas',  color: 'text-orange-600', bg: 'bg-orange-50' },
  EQUITY:    { label: 'Ekuitas',     color: 'text-purple-600', bg: 'bg-purple-50' },
  REVENUE:   { label: 'Pendapatan',  color: 'text-emerald-600', bg: 'bg-emerald-50' },
  EXPENSE:   { label: 'Biaya',       color: 'text-red-600',    bg: 'bg-red-50' },
}

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

function AccountForm({ storeId, account, onClose, onSaved }: { storeId: string; account?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: account?.code ?? '', name: account?.name ?? '', type: account?.type ?? 'ASSET' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setError('')
    if (!/^\d{3,6}$/.test(form.code)) return setError('Kode akun harus 3-6 digit angka')
    if (form.name.trim().length < 2) return setError('Nama minimal 2 karakter')
    setSaving(true)
    const url = account ? `/api/accounts/${account.id}?storeId=${storeId}` : `/api/accounts?storeId=${storeId}`
    const res = await fetch(url, {
      method: account ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else { const d = await res.json() as any; setError(d.error ?? 'Gagal menyimpan') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-bold text-stone-800">{account ? 'Edit Akun' : 'Tambah Akun'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100"><X className="h-4 w-4 text-stone-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Kode Akun *</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className={inputCls} placeholder="111" maxLength={6} />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Akun *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Kas" />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Tipe</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
            </select>
          </div>
        </div>
        <div className="p-4 flex gap-3 border-t border-stone-100">
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

export default function ChartOfAccountsClient({ storeId, currency }: ChartOfAccountsClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)

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

  const refresh = () => { setShowForm(false); setEditing(null); qc.invalidateQueries({ queryKey: ['accounts'] }) }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Chart of Accounts</h1>
          <p className="text-stone-400 text-sm mt-0.5">Daftar akun buku besar</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Tambah Akun</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTypeFilter('')}
          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', !typeFilter ? 'bg-amber-500 text-white' : 'bg-stone-50 text-stone-500 border border-stone-200 hover:bg-stone-100')}>
          Semua
        </button>
        {ACCOUNT_TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t === typeFilter ? '' : t)}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
              typeFilter === t ? `${TYPE_CONFIG[t].bg} ${TYPE_CONFIG[t].color}` : 'bg-stone-50 text-stone-500 border border-stone-200 hover:bg-stone-100')}>
            {TYPE_CONFIG[t].label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-100 rounded-2xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
          placeholder="Cari kode atau nama akun…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-stone-50 animate-pulse rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-4">
          {ACCOUNT_TYPES.filter(t => !typeFilter || t === typeFilter).map(type => {
            const accs = grouped[type] ?? []
            if (accs.length === 0 && typeFilter) return null
            if (accs.length === 0 && !typeFilter && search) return null
            const cfg = TYPE_CONFIG[type]
            return (
              <div key={type} className="bg-white border border-stone-100 rounded-2xl shadow-sm overflow-hidden">
                <div className={cn('flex items-center gap-2 px-4 py-3 border-b border-stone-50', cfg.bg)}>
                  <Layers className={cn('h-4 w-4', cfg.color)} />
                  <span className={cn('text-xs font-bold', cfg.color)}>{cfg.label}</span>
                  <span className="text-xs text-stone-400 ml-auto">{accs.length} akun</span>
                </div>
                {accs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-stone-400">Belum ada akun {cfg.label.toLowerCase()}</div>
                ) : (
                  <div className="divide-y divide-stone-50">
                    {accs.map((a: any) => (
                      <div key={a.id} className="flex items-center px-4 py-3 hover:bg-stone-50 transition-colors">
                        <span className="font-mono text-xs font-bold text-stone-500 w-14 shrink-0">{a.code}</span>
                        <span className="text-sm font-medium text-stone-700 flex-1">{a.name}</span>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 mr-3', cfg.bg, cfg.color)}>
                          {a.normalBalance === 'DEBIT' ? 'D' : 'K'}
                        </span>
                        {!a.isSystem && (
                          <button onClick={() => setEditing(a)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                            <Edit2 className="h-3.5 w-3.5 text-stone-400" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(showForm || editing) && (
        <AccountForm storeId={storeId} account={editing} onClose={() => { setShowForm(false); setEditing(null) }} onSaved={refresh} />
      )}
    </div>
  )
}

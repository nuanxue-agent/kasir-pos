'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Check, RotateCcw, ChevronDown, BookOpen, Scale } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface JournalEntryClientProps { storeId: string; currency: string }

type Tab = 'journal' | 'ledger' | 'trial-balance'

type EntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

interface JournalEntry {
  id: string
  entryNumber: string
  date: string
  description: string
  status: EntryStatus
  postedAt: string | null
  reversedEntryId: string | null
}

interface JournalLine {
  id: string
  entryId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
  memo: string | null
}

interface LedgerRow {
  id: string
  entryId: string
  entryNumber: string
  date: string
  entryDescription: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
  runningBalance: number
  memo: string | null
}

interface TrialAccount {
  accountCode: string
  accountName: string
  totalDebit: number
  totalCredit: number
  balance: number
}

interface NewEntryForm {
  date: string
  description: string
  lines: Array<{ accountCode: string; accountName: string; debit: string; credit: string; memo: string }>
}

const STATUS_CONFIG: Record<EntryStatus, { label: string; pill: string }> = {
  DRAFT:    { label: 'Draft',    pill: 'bg-[var(--bg-muted)] text-[var(--text-2)]' },
  POSTED:   { label: 'Posted',   pill: 'bg-emerald-50 text-emerald-600' },
  REVERSED: { label: 'Reversed', pill: 'bg-amber-50 text-amber-600' },
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const today = new Date().toISOString().slice(0, 10)
const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

function emptyLine() {
  return { accountCode: '', accountName: '', debit: '', credit: '', memo: '' }
}

// ── New Entry Form ──────────────────────────────────────────────────────────

function NewEntryForm({
  storeId,
  onClose,
}: {
  storeId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<NewEntryForm>({
    date: today,
    description: '',
    lines: [emptyLine(), emptyLine()],
  })

  const totalDebit = form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01

  const create = useMutation({
    mutationFn: (body: object) =>
      fetch(`/api/journal-entries?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json() as any),
    onSuccess: (data: any) => {
      if (data.error) { alert(data.error); return }
      qc.invalidateQueries({ queryKey: ['journal-entries', storeId] })
      onClose()
    },
  })

  function setLine(idx: number, field: string, value: string) {
    setForm(f => {
      const lines = [...f.lines]
      lines[idx] = { ...lines[idx], [field]: value }
      return { ...f, lines }
    })
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }))
  }

  function removeLine(idx: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }

  function handleSubmit() {
    if (!form.date || !form.description) { alert('Date and description required'); return }
    const lines = form.lines
      .filter(l => l.accountCode || parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0)
      .map(l => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        memo: l.memo || null,
      }))
    create.mutate({ date: form.date, description: form.description, lines })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text-1)]">Entri Jurnal Baru</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)] text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Tanggal</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Keterangan</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Penjualan tunai" className={inputCls} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--text-2)]">Baris Jurnal</label>
              <button onClick={addLine} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Tambah baris
              </button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                  <input
                    className={cn(inputCls, 'col-span-2')}
                    placeholder="Kode"
                    value={line.accountCode}
                    onChange={e => setLine(idx, 'accountCode', e.target.value)}
                  />
                  <input
                    className={cn(inputCls, 'col-span-4')}
                    placeholder="Nama akun"
                    value={line.accountName}
                    onChange={e => setLine(idx, 'accountName', e.target.value)}
                  />
                  <input
                    className={cn(inputCls, 'col-span-2 text-right')}
                    placeholder="Debit"
                    type="number"
                    min="0"
                    value={line.debit}
                    onChange={e => setLine(idx, 'debit', e.target.value)}
                  />
                  <input
                    className={cn(inputCls, 'col-span-2 text-right')}
                    placeholder="Kredit"
                    type="number"
                    min="0"
                    value={line.credit}
                    onChange={e => setLine(idx, 'credit', e.target.value)}
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={form.lines.length <= 2}
                    className="col-span-1 text-red-400 hover:text-red-600 disabled:opacity-30 text-center text-base"
                  >&times;</button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="flex items-center justify-between bg-[var(--bg-subtle)] rounded-xl px-4 py-2.5 text-xs">
            <span className="text-[var(--text-2)]">Total Debit: <span className="font-mono font-bold text-[var(--text-1)]">{totalDebit.toLocaleString('id')}</span></span>
            <span className="text-[var(--text-2)]">Total Kredit: <span className="font-mono font-bold text-[var(--text-1)]">{totalCredit.toLocaleString('id')}</span></span>
            {balanced && totalDebit > 0
              ? <span className="text-emerald-600 font-semibold">Balanced</span>
              : <span className="text-red-500 font-semibold">Unbalanced</span>}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)] rounded-xl transition-colors">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={create.isPending}
            className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? 'Menyimpan...' : 'Simpan Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Journal Tab ─────────────────────────────────────────────────────────────

function JournalTab({ storeId, currency }: { storeId: string; currency: string }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal-entries', storeId, from, to],
    queryFn: () =>
      fetch(`/api/journal-entries?storeId=${storeId}&from=${from}&to=${to}`)
        .then(r => r.json() as any),
  })

  const { data: lines = [] } = useQuery({
    queryKey: ['journal-lines', storeId, expandedId],
    queryFn: () =>
      fetch(`/api/journal-entries/${expandedId}/lines?storeId=${storeId}`)
        .then(r => r.json() as any),
    enabled: !!expandedId,
  })

  const postEntry = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/journal-entries/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post' }),
      }).then(r => r.json() as any),
    onSuccess: (data: any) => {
      if (data.error) { alert(data.error); return }
      qc.invalidateQueries({ queryKey: ['journal-entries'] })
      qc.invalidateQueries({ queryKey: ['trial-balance'] })
      qc.invalidateQueries({ queryKey: ['general-ledger'] })
    },
  })

  const reverseEntry = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/journal-entries/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse' }),
      }).then(r => r.json() as any),
    onSuccess: (data: any) => {
      if (data.error) { alert(data.error); return }
      qc.invalidateQueries({ queryKey: ['journal-entries'] })
      qc.invalidateQueries({ queryKey: ['trial-balance'] })
      qc.invalidateQueries({ queryKey: ['general-ledger'] })
    },
  })

  return (
    <div className="space-y-4">
      {showForm && <NewEntryForm storeId={storeId} onClose={() => setShowForm(false)} />}

      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-3 flex-1 max-w-xs">
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1 block">Dari</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1 block">Sampai</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Entri Baru</span>
        </button>
      </div>

      <div className="space-y-2">
        {isLoading
          ? [...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />)
          : (entries as JournalEntry[]).length === 0
            ? (
              <div className="flex flex-col items-center py-16 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
                <FileText className="h-12 w-12 text-stone-200 mb-3" />
                <p className="text-[var(--text-3)] text-sm">Belum ada entri jurnal</p>
              </div>
            )
            : (entries as JournalEntry[]).map(entry => {
                const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.DRAFT
                const expanded = expandedId === entry.id
                return (
                  <div key={entry.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-[var(--text-2)]">{entry.entryNumber}</span>
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg', cfg.pill)}>{cfg.label}</span>
                        </div>
                        <p className="text-sm font-medium text-[var(--text-1)] truncate mt-0.5">{entry.description}</p>
                      </div>
                      <span className="text-xs text-[var(--text-3)] shrink-0">{entry.date}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {entry.status === 'DRAFT' && (
                          <button
                            onClick={() => postEntry.mutate(entry.id)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                            title="Post"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {entry.status === 'POSTED' && (
                          <button
                            onClick={() => reverseEntry.mutate(entry.id)}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition-colors"
                            title="Reverse"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                          className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
                        >
                          <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-3)] transition-transform', expanded && 'rotate-180')} />
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="border-t border-[var(--border)] px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[var(--text-3)] font-semibold">
                              <th className="text-left pb-2">Kode</th>
                              <th className="text-left pb-2">Nama Akun</th>
                              <th className="text-right pb-2">Debit</th>
                              <th className="text-right pb-2">Kredit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {(lines as JournalLine[]).map(line => (
                              <tr key={line.id} className="text-[var(--text-1)]">
                                <td className="py-1.5 font-mono">{line.accountCode}</td>
                                <td className="py-1.5">{line.accountName}</td>
                                <td className="text-right py-1.5 font-mono">{line.debit > 0 ? formatCurrency(line.debit, currency) : '—'}</td>
                                <td className="text-right py-1.5 font-mono">{line.credit > 0 ? formatCurrency(line.credit, currency) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })
        }
      </div>
    </div>
  )
}

// ── General Ledger Tab ──────────────────────────────────────────────────────

function LedgerTab({ storeId, currency }: { storeId: string; currency: string }) {
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today)
  const [accountCode, setAccountCode] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['general-ledger', storeId, from, to, accountCode],
    queryFn: () => {
      const params = new URLSearchParams({ storeId, from, to })
      if (accountCode) params.set('accountCode', accountCode)
      return fetch(`/api/general-ledger?${params}`).then(r => r.json() as any)
    },
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <div>
          <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Dari</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Sampai</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Kode Akun</label>
          <input type="text" value={accountCode} onChange={e => setAccountCode(e.target.value)} placeholder="Semua akun" className={inputCls} />
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Tanggal</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">No. Jurnal</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Keterangan</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Akun</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Debit</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Kredit</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading
              ? [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-[var(--bg-subtle)] animate-pulse rounded" /></td></tr>
                ))
              : (rows as LedgerRow[]).length === 0
                ? <tr><td colSpan={7} className="text-center py-12 text-[var(--text-3)] text-sm">Tidak ada transaksi</td></tr>
                : (rows as LedgerRow[]).map(row => (
                    <tr key={row.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="px-4 py-2.5 text-xs text-[var(--text-3)]">{row.date}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-2)]">{row.entryNumber}</td>
                      <td className="px-4 py-2.5 text-[var(--text-1)] text-xs max-w-[160px] truncate">{row.entryDescription}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-2)]">{row.accountCode} {row.accountName}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--text-1)]">{row.debit > 0 ? formatCurrency(row.debit, currency) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--text-1)]">{row.credit > 0 ? formatCurrency(row.credit, currency) : '—'}</td>
                      <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-semibold', row.runningBalance >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(Math.abs(row.runningBalance), currency)}{row.runningBalance < 0 ? ' (Cr)' : ''}
                      </td>
                    </tr>
                  ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Trial Balance Tab ───────────────────────────────────────────────────────

function TrialTab({ storeId, currency }: { storeId: string; currency: string }) {
  const [to, setTo] = useState(today)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['trial-balance', storeId, to],
    queryFn: () =>
      fetch(`/api/trial-balance?storeId=${storeId}&to=${to}`)
        .then(r => r.json() as any),
  })

  const result = (raw as any) ?? {}
  const accounts: TrialAccount[] = result.accounts ?? []
  const grandDebit: number = result.grandDebit ?? 0
  const grandCredit: number = result.grandCredit ?? 0
  const isBalanced: boolean = result.isBalanced ?? true

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex items-center gap-4">
        <label className="text-xs font-semibold text-[var(--text-2)] shrink-0">Per tanggal</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
        {!isLoading && grandDebit > 0 && (
          isBalanced
            ? <span className="text-xs font-semibold text-emerald-600 ml-auto">Balanced</span>
            : <span className="text-xs font-semibold text-red-500 ml-auto">Tidak balance</span>
        )}
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Kode</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Nama Akun</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Debit</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Kredit</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading
              ? [...Array(6)].map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-[var(--bg-subtle)] animate-pulse rounded" /></td></tr>
                ))
              : accounts.length === 0
                ? <tr><td colSpan={5} className="text-center py-12 text-[var(--text-3)] text-sm">Tidak ada data</td></tr>
                : accounts.map(acc => (
                    <tr key={acc.accountCode} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-2)]">{acc.accountCode}</td>
                      <td className="px-4 py-2.5 text-[var(--text-1)]">{acc.accountName}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{acc.totalDebit > 0 ? formatCurrency(acc.totalDebit, currency) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{acc.totalCredit > 0 ? formatCurrency(acc.totalCredit, currency) : '—'}</td>
                      <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-semibold', acc.balance >= 0 ? 'text-[var(--text-1)]' : 'text-red-500')}>
                        {formatCurrency(Math.abs(acc.balance), currency)}{acc.balance < 0 ? ' (Cr)' : ''}
                      </td>
                    </tr>
                  ))
            }
          </tbody>
          <tfoot className="border-t-2 border-[var(--border)] bg-[var(--bg-subtle)]">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-xs font-bold text-[var(--text-1)]">TOTAL</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-[var(--text-1)]">{formatCurrency(grandDebit, currency)}</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-[var(--text-1)]">{formatCurrency(grandCredit, currency)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Main Export ─────────────────────────────────────────────────────────────

export default function JournalEntryClient({ storeId, currency }: JournalEntryClientProps) {
  const [tab, setTab] = useState<Tab>('journal')

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'journal',       label: 'Jurnal',       icon: <FileText className="h-4 w-4" /> },
    { id: 'ledger',        label: 'Buku Besar',   icon: <BookOpen className="h-4 w-4" /> },
    { id: 'trial-balance', label: 'Neraca Saldo', icon: <Scale className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-5 pb-24 lg:pb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Jurnal Umum</h1>
        <p className="text-[var(--text-3)] text-sm mt-0.5">Double-entry bookkeeping</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--bg-subtle)] rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all',
              tab === t.id
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'journal'       && <JournalTab storeId={storeId} currency={currency} />}
      {tab === 'ledger'        && <LedgerTab storeId={storeId} currency={currency} />}
      {tab === 'trial-balance' && <TrialTab storeId={storeId} currency={currency} />}
    </div>
  )
}

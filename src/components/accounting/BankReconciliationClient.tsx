'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import {
  Upload,
  CheckCircle,
  XCircle,
  Zap,
  Link2,
  Building2,
  Plus,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BankTxType = 'CREDIT' | 'DEBIT'
export type BankTxStatus = 'UNMATCHED' | 'MATCHED' | 'MANUAL'

export interface BankAccount {
  id: string
  storeId: string
  name: string
  bankName: string
  accountNumber: string
  currency: string
  balance: number
  lastReconciledAt: string | null
}

export interface BankTransaction {
  id: string
  bankAccountId: string
  storeId: string
  date: string
  description: string
  amount: number
  type: BankTxType
  reference: string | null
  matchedOrderId: string | null
  matchedJournalId: string | null
  status: BankTxStatus
}

export interface ImportedRow {
  date: string
  description: string
  amount: number
  type: BankTxType
  reference?: string
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function parseBankCSV(csvText: string): ImportedRow[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const dateIdx = header.indexOf('date')
  const descIdx = header.indexOf('description')
  const amtIdx  = header.indexOf('amount')
  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) {
    throw new Error('CSV must have columns: date, description, amount')
  }
  const typeIdx = header.indexOf('type')

  const rows: ImportedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
    const amount = parseFloat(cols[amtIdx] ?? '0')
    if (isNaN(amount) || amount === 0) continue
    // If no type column, infer: positive => CREDIT, negative => DEBIT
    let type: BankTxType
    if (typeIdx !== -1) {
      const raw = (cols[typeIdx] ?? '').toUpperCase()
      if (raw !== 'CREDIT' && raw !== 'DEBIT') continue
      type = raw as BankTxType
    } else {
      type = amount >= 0 ? 'CREDIT' : 'DEBIT'
    }
    rows.push({
      date: cols[dateIdx] ?? '',
      description: cols[descIdx] ?? '',
      amount: Math.abs(amount),
      type,
      reference: cols[header.indexOf('reference')] ?? undefined,
    })
  }
  return rows
}

export function calcReconciliationStats(transactions: BankTransaction[]) {
  const total = transactions.length
  const matched = transactions.filter(t => t.status === 'MATCHED' || t.status === 'MANUAL').length
  const unmatched = transactions.filter(t => t.status === 'UNMATCHED').length
  const matchedPct = total > 0 ? Math.round((matched / total) * 100) : 0

  const creditTotal = transactions.reduce((s, t) => s + (t.type === 'CREDIT' ? t.amount : 0), 0)
  const debitTotal  = transactions.reduce((s, t) => s + (t.type === 'DEBIT'  ? t.amount : 0), 0)
  const balanceDiff = creditTotal - debitTotal

  return { total, matched, unmatched, matchedPct, creditTotal, debitTotal, balanceDiff }
}

export function validateTxType(type: string): type is BankTxType {
  return type === 'CREDIT' || type === 'DEBIT'
}

// ─── Sub-nav ──────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Rekonsiliasi', href: '/dashboard/accounting/reconciliation' },
  { label: 'Rekonsiliasi Bank', href: '/dashboard/accounting/bank-reconciliation' },
]

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {NAV_TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              active
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]',
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

interface SummaryBarProps {
  stats: ReturnType<typeof calcReconciliationStats>
  currency: string
}

function SummaryBar({ stats, currency }: SummaryBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Cocok</p>
        <p className="text-2xl font-bold text-emerald-600">{stats.matched}</p>
        <p className="text-xs text-[var(--text-3)] mt-0.5">{stats.matchedPct}% dari total</p>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Belum Cocok</p>
        <p className="text-2xl font-bold text-red-500">{stats.unmatched}</p>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Total Transaksi</p>
        <p className="text-2xl font-bold text-[var(--text-1)]">{stats.total}</p>
      </div>
      <div
        className={cn(
          'bg-[var(--bg-card)] border rounded-xl p-4 shadow-sm',
          Math.abs(stats.balanceDiff) < 0.01 ? 'border-emerald-200' : 'border-red-200',
        )}
      >
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Selisih Saldo</p>
        <p className={cn('text-xl font-bold', Math.abs(stats.balanceDiff) < 0.01 ? 'text-emerald-600' : 'text-red-500')}>
          {formatCurrency(Math.abs(stats.balanceDiff), currency)}
        </p>
      </div>
    </div>
  )
}

// ─── CSV Upload zone ──────────────────────────────────────────────────────────

interface UploadZoneProps {
  onParsed: (rows: ImportedRow[]) => void
  onError: (msg: string) => void
}

function UploadZone({ onParsed, onError }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { onError('Hanya file CSV yang didukung'); return }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const rows = parseBankCSV(text)
        if (rows.length === 0) { onError('Tidak ada data valid dalam CSV'); return }
        onParsed(rows)
      } catch (ex: any) {
        onError(ex?.message ?? 'Gagal parsing CSV')
      }
    }
    reader.readAsText(file)
  }, [onParsed, onError])

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
        dragging ? 'border-amber-400 bg-amber-50/40' : 'border-[var(--border)] hover:border-amber-300 hover:bg-amber-50/20',
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
    >
      <Upload className="h-8 w-8 text-amber-400 mx-auto mb-2" />
      <p className="text-sm font-semibold text-[var(--text-1)]">Upload Mutasi Bank (CSV)</p>
      <p className="text-xs text-[var(--text-3)] mt-1">Kolom: date, description, amount (dan opsional: type, reference)</p>
      <input ref={inputRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
    </div>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────────

interface TxRowProps {
  tx: BankTransaction
  selected: boolean
  onSelect: () => void
  currency: string
}

function TxRow({ tx, selected, onSelect, currency }: TxRowProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all text-sm',
        tx.status === 'MATCHED' || tx.status === 'MANUAL'
          ? 'bg-emerald-50/40 border-emerald-200 opacity-80'
          : 'bg-red-50/40 border-red-200 hover:bg-red-50/60',
        selected && 'ring-2 ring-amber-400',
      )}
    >
      {tx.status === 'UNMATCHED'
        ? <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        : <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--text-1)] truncate">{tx.description}</p>
        <p className="text-xs text-[var(--text-3)]">{tx.date}</p>
        {tx.reference && <p className="text-xs text-[var(--text-3)]">Ref: {tx.reference}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={cn('font-semibold', tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500')}>
          {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount, currency)}
        </p>
        <p className="text-xs text-[var(--text-3)]">{tx.type}</p>
        {tx.status !== 'UNMATCHED' && (
          <p className="text-xs text-emerald-600 font-medium mt-0.5">
            {tx.status === 'MANUAL' ? 'Manual' : 'Auto'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Add bank account modal ───────────────────────────────────────────────────

interface AddAccountModalProps {
  storeId: string
  onClose: () => void
  onCreated: () => void
}

function AddAccountModal({ storeId, onClose, onCreated }: AddAccountModalProps) {
  const [name, setName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [currency, setCurrency] = useState('IDR')
  const [balance, setBalance] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim() || !bankName.trim() || !accountNumber.trim()) {
      setError('Nama, nama bank, dan nomor rekening wajib diisi')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bank-accounts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bankName, accountNumber, currency, balance: parseFloat(balance) || 0 }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data?.error ?? 'Gagal menyimpan'); return }
      onCreated()
      onClose()
    } catch {
      setError('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <h2 className="text-lg font-bold text-[var(--text-1)]">Tambah Rekening Bank</h2>
        {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2">{error}</p>}
        {[
          { label: 'Nama Rekening', value: name, onChange: setName, placeholder: 'cth. Kas BCA Operasional' },
          { label: 'Nama Bank', value: bankName, onChange: setBankName, placeholder: 'cth. BCA' },
          { label: 'Nomor Rekening', value: accountNumber, onChange: setAccountNumber, placeholder: 'cth. 1234567890' },
        ].map(f => (
          <div key={f.label}>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">{f.label}</label>
            <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Mata Uang</label>
            <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Saldo Awal</label>
            <input type="number" value={balance} onChange={e => setBalance(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--bg-muted)] transition-all">Batal</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-all">
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BankReconciliationClientProps {
  storeId: string
  currency: string
}

export default function BankReconciliationClient({ storeId, currency }: BankReconciliationClientProps) {
  const queryClient = useQueryClient()

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [from, setFrom] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [csvError, setCsvError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [autoMatching, setAutoMatching] = useState(false)
  const [selectedUnmatched, setSelectedUnmatched] = useState<string | null>(null)
  const [manualMatchOrderId, setManualMatchOrderId] = useState('')
  const [manualMatchJournalId, setManualMatchJournalId] = useState('')
  const [matchError, setMatchError] = useState<string | null>(null)

  // Fetch bank accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['bank-accounts', storeId],
    queryFn: () => fetch(`/api/bank-accounts?storeId=${storeId}`).then(r => r.json()),
  })
  const accounts: BankAccount[] = Array.isArray(accountsData) ? accountsData as BankAccount[] : []

  // Auto-select first account
  const accountId = selectedAccountId ?? accounts[0]?.id ?? null

  // Fetch transactions for selected account
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['bank-transactions', storeId, accountId, from, to],
    queryFn: () =>
      fetch(`/api/bank-transactions?storeId=${storeId}&bankAccountId=${accountId}&from=${from}&to=${to}`)
        .then(r => r.json()),
    enabled: !!accountId,
  })
  const transactions: BankTransaction[] = Array.isArray(txData) ? txData as BankTransaction[] : []

  const selectedAccount = accounts.find(a => a.id === accountId) ?? null
  const stats = calcReconciliationStats(transactions)
  const unmatchedTxs = transactions.filter(t => t.status === 'UNMATCHED')

  // Import CSV
  const handleImport = useCallback(async (rows: ImportedRow[]) => {
    if (!accountId) return
    setImporting(true)
    setCsvError(null)
    try {
      const res = await fetch(`/api/bank-transactions?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId: accountId, rows }),
      })
      const data = await res.json() as any
      if (!res.ok) { setCsvError(data?.error ?? 'Gagal import'); return }
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', storeId] })
    } catch {
      setCsvError('Gagal terhubung ke server')
    } finally {
      setImporting(false)
    }
  }, [accountId, storeId, queryClient])

  // Auto-match
  const handleAutoMatch = useCallback(async () => {
    if (!accountId) return
    setAutoMatching(true)
    try {
      const res = await fetch(`/api/bank-transactions/auto-match?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId: accountId, from, to }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['bank-transactions', storeId] })
      }
    } finally {
      setAutoMatching(false)
    }
  }, [accountId, storeId, from, to, queryClient])

  // Manual match mutation
  const matchMutation = useMutation({
    mutationFn: (body: { txId: string; matchedOrderId?: string; matchedJournalId?: string }) =>
      fetch(`/api/bank-transactions/${body.txId}/match?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchedOrderId: body.matchedOrderId || null, matchedJournalId: body.matchedJournalId || null }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', storeId] })
      setSelectedUnmatched(null)
      setManualMatchOrderId('')
      setManualMatchJournalId('')
      setMatchError(null)
    },
    onError: () => setMatchError('Gagal menyimpan pencocokan'),
  })

  const handleManualMatch = useCallback(() => {
    if (!selectedUnmatched) return
    if (!manualMatchOrderId.trim() && !manualMatchJournalId.trim()) {
      setMatchError('Masukkan Order ID atau Journal ID')
      return
    }
    matchMutation.mutate({
      txId: selectedUnmatched,
      matchedOrderId: manualMatchOrderId.trim() || undefined,
      matchedJournalId: manualMatchJournalId.trim() || undefined,
    })
  }, [selectedUnmatched, manualMatchOrderId, manualMatchJournalId, matchMutation])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Rekonsiliasi Bank</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Cocokkan mutasi bank dengan transaksi sistem</p>
        </div>
        <button
          onClick={() => setShowAddAccount(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-all shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Rekening
        </button>
      </div>

      <SubNav />

      {showAddAccount && (
        <AddAccountModal
          storeId={storeId}
          onClose={() => setShowAddAccount(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['bank-accounts', storeId] })}
        />
      )}

      {/* Account selector */}
      {accountsLoading ? (
        <div className="h-16 bg-[var(--bg-subtle)] rounded-xl animate-pulse" />
      ) : accounts.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
          <Building2 className="h-8 w-8 text-[var(--text-3)] mx-auto mb-2" />
          <p className="text-sm font-semibold text-[var(--text-1)]">Belum ada rekening bank</p>
          <p className="text-xs text-[var(--text-3)] mt-1">Klik tombol Rekening di atas untuk menambahkan</p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {accounts.map(acc => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={cn(
                'shrink-0 px-4 py-3 rounded-xl border text-left transition-all',
                accountId === acc.id
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-1)] hover:border-amber-300',
              )}
            >
              <p className="text-sm font-semibold">{acc.name}</p>
              <p className="text-xs opacity-80">{acc.bankName} &bull; {acc.accountNumber}</p>
            </button>
          ))}
        </div>
      )}

      {accountId && (
        <>
          {/* Date range + actions */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[{ label: 'Dari', value: from, onChange: setFrom }, { label: 'Sampai', value: to, onChange: setTo }].map(f => (
                <div key={f.label}>
                  <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">{f.label}</label>
                  <input type="date" value={f.value} onChange={e => f.onChange(e.target.value)}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleAutoMatch} disabled={autoMatching || transactions.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-all">
                <Zap className="h-4 w-4" />
                {autoMatching ? 'Mencocokkan...' : 'Auto-Match'}
              </button>
              <button onClick={() => queryClient.invalidateQueries({ queryKey: ['bank-transactions', storeId] })}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--bg-muted)] transition-all">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CSV Upload */}
          {csvError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {csvError}
            </div>
          )}
          <UploadZone
            onParsed={rows => handleImport(rows)}
            onError={msg => setCsvError(msg)}
          />
          {importing && <p className="text-sm text-[var(--text-3)] text-center">Mengimpor transaksi...</p>}

          {/* Stats */}
          {transactions.length > 0 && <SummaryBar stats={stats} currency={selectedAccount?.currency ?? currency} />}

          {/* Transaction list */}
          {txLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-[var(--bg-subtle)] rounded-xl animate-pulse" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
              <p className="text-sm text-[var(--text-3)]">Belum ada transaksi. Upload mutasi bank (CSV) di atas.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                {transactions.length} Transaksi
              </p>
              {transactions.map(tx => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  selected={selectedUnmatched === tx.id}
                  onSelect={() => {
                    if (tx.status !== 'UNMATCHED') return
                    setSelectedUnmatched(prev => prev === tx.id ? null : tx.id)
                    setMatchError(null)
                  }}
                  currency={selectedAccount?.currency ?? currency}
                />
              ))}
            </div>
          )}

          {/* Manual match panel */}
          {selectedUnmatched && (
            <div className="bg-[var(--bg-card)] border border-amber-300 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold text-[var(--text-1)]">Cocokkan Manual</p>
              </div>
              {matchError && <p className="text-xs text-red-500">{matchError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Order ID</label>
                  <input value={manualMatchOrderId} onChange={e => setManualMatchOrderId(e.target.value)}
                    placeholder="ID order yang cocok"
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Journal Entry ID</label>
                  <input value={manualMatchJournalId} onChange={e => setManualMatchJournalId(e.target.value)}
                    placeholder="ID jurnal yang cocok"
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setSelectedUnmatched(null); setManualMatchOrderId(''); setManualMatchJournalId(''); setMatchError(null) }}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--bg-muted)] transition-all">
                  Batal
                </button>
                <button onClick={handleManualMatch} disabled={matchMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-all">
                  {matchMutation.isPending ? 'Menyimpan...' : 'Simpan Pencocokan'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import {
  Upload,
  CheckCircle,
  XCircle,
  Zap,
  AlertTriangle,
  FileText,
  RefreshCw,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BankTxType = 'CREDIT' | 'DEBIT'
export type MatchStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED'

export interface BankStatementRow {
  id: string
  date: string
  description: string
  amount: number
  type: BankTxType
  matchedId: string | null
  status: MatchStatus
}

export interface SystemTransaction {
  id: string
  date: string
  description: string
  amount: number
  type: BankTxType
  matchedId: string | null
  status: MatchStatus
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

export function parseBankStatementCSV(csvText: string): BankStatementRow[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const dateIdx = header.indexOf('date')
  const descIdx = header.indexOf('description')
  const amtIdx = header.indexOf('amount')
  const typeIdx = header.indexOf('type')

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1 || typeIdx === -1) {
    throw new Error('CSV must have columns: date, description, amount, type')
  }

  const rows: BankStatementRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
    const rawType = (cols[typeIdx] ?? '').toUpperCase()
    if (rawType !== 'CREDIT' && rawType !== 'DEBIT') continue
    const amount = parseFloat(cols[amtIdx] ?? '0')
    if (isNaN(amount)) continue

    rows.push({
      id: `bank-${i}-${Date.now()}`,
      date: cols[dateIdx] ?? '',
      description: cols[descIdx] ?? '',
      amount: Math.abs(amount),
      type: rawType as BankTxType,
      matchedId: null,
      status: 'UNMATCHED',
    })
  }
  return rows
}

// ─── Auto-match algorithm ────────────────────────────────────────────────────

export function autoMatch(
  bankRows: BankStatementRow[],
  systemRows: SystemTransaction[],
): { bank: BankStatementRow[]; system: SystemTransaction[] } {
  const updatedBank = bankRows.map(b => ({ ...b }))
  const updatedSystem = systemRows.map(s => ({ ...s }))
  const usedSystemIds = new Set<string>()

  for (const bank of updatedBank) {
    if (bank.status === 'MATCHED') continue
    const bankDate = new Date(bank.date).getTime()

    for (const sys of updatedSystem) {
      if (sys.status === 'MATCHED' || usedSystemIds.has(sys.id)) continue
      if (sys.type !== bank.type) continue
      if (Math.abs(sys.amount - bank.amount) > 0.001) continue

      const sysDate = new Date(sys.date).getTime()
      const diffDays = Math.abs(bankDate - sysDate) / (1000 * 60 * 60 * 24)
      if (diffDays <= 1) {
        bank.matchedId = sys.id
        bank.status = 'MATCHED'
        sys.matchedId = bank.id
        sys.status = 'MATCHED'
        usedSystemIds.add(sys.id)
        break
      }
    }
  }

  return { bank: updatedBank, system: updatedSystem }
}

// ─── Discrepancy calculation ──────────────────────────────────────────────────

export function calcDiscrepancy(
  bankRows: BankStatementRow[],
  systemRows: SystemTransaction[],
) {
  const totalMatched = bankRows.filter(r => r.status === 'MATCHED').length
  const unmatchedBank = bankRows.filter(r => r.status === 'UNMATCHED')
  const unmatchedSystem = systemRows.filter(r => r.status === 'UNMATCHED')

  const bankUnmatchedAmount = unmatchedBank.reduce((s, r) => {
    return s + (r.type === 'CREDIT' ? r.amount : -r.amount)
  }, 0)
  const systemUnmatchedAmount = unmatchedSystem.reduce((s, r) => {
    return s + (r.type === 'CREDIT' ? r.amount : -r.amount)
  }, 0)

  return {
    totalMatched,
    unmatchedBankCount: unmatchedBank.length,
    unmatchedSystemCount: unmatchedSystem.length,
    discrepancyAmount: bankUnmatchedAmount - systemUnmatchedAmount,
  }
}

// ─── Sub-nav (shared with other accounting pages) ────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Rekonsiliasi', href: '/dashboard/accounting/reconciliation' },
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

// ─── CSV Upload zone ──────────────────────────────────────────────────────────

interface UploadZoneProps {
  onParsed: (rows: BankStatementRow[]) => void
  onError: (msg: string) => void
}

function UploadZone({ onParsed, onError }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) {
        onError('Hanya file CSV yang didukung')
        return
      }
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const text = e.target?.result as string
          const rows = parseBankStatementCSV(text)
          if (rows.length === 0) {
            onError('Tidak ada data valid dalam CSV')
            return
          }
          onParsed(rows)
        } catch (err: any) {
          onError(err?.message ?? 'Gagal parsing CSV')
        }
      }
      reader.readAsText(file)
    },
    [onParsed, onError],
  )

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
        dragging
          ? 'border-amber-400 bg-amber-50/40'
          : 'border-[var(--border)] hover:border-amber-300 hover:bg-amber-50/20',
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
    >
      <Upload className="h-8 w-8 text-amber-400 mx-auto mb-2" />
      <p className="text-sm font-semibold text-[var(--text-1)]">Upload Mutasi Bank (CSV)</p>
      <p className="text-xs text-[var(--text-3)] mt-1">
        Kolom: date, description, amount, type (CREDIT/DEBIT)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

interface SummaryBarProps {
  stats: ReturnType<typeof calcDiscrepancy>
  currency: string
}

function SummaryBar({ stats, currency }: SummaryBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Cocok</p>
        <p className="text-2xl font-bold text-emerald-600">{stats.totalMatched}</p>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Tidak Cocok (Bank)</p>
        <p className="text-2xl font-bold text-red-500">{stats.unmatchedBankCount}</p>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Tidak Cocok (Sistem)</p>
        <p className="text-2xl font-bold text-orange-500">{stats.unmatchedSystemCount}</p>
      </div>
      <div
        className={cn(
          'bg-[var(--bg-card)] border rounded-xl p-4 shadow-sm',
          Math.abs(stats.discrepancyAmount) < 0.01
            ? 'border-emerald-200'
            : 'border-red-200',
        )}
      >
        <p className="text-xs font-medium text-[var(--text-3)] mb-1">Selisih</p>
        <p
          className={cn(
            'text-xl font-bold',
            Math.abs(stats.discrepancyAmount) < 0.01 ? 'text-emerald-600' : 'text-red-500',
          )}
        >
          {formatCurrency(Math.abs(stats.discrepancyAmount), currency)}
        </p>
      </div>
    </div>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────────

interface TxRowProps {
  row: BankStatementRow | SystemTransaction
  selected: boolean
  onSelect: () => void
  currency: string
}

function TxRow({ row, selected, onSelect, currency }: TxRowProps) {
  const unmatched = row.status === 'UNMATCHED'
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all text-sm',
        row.status === 'MATCHED'
          ? 'bg-emerald-50/40 border-emerald-200 opacity-70'
          : unmatched
            ? 'bg-red-50/40 border-red-200 hover:bg-red-50/60'
            : 'bg-[var(--bg-subtle)] border-[var(--border)]',
        selected && 'ring-2 ring-amber-400',
      )}
    >
      {row.status === 'MATCHED' ? (
        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--text-1)] truncate">{row.description}</p>
        <p className="text-xs text-[var(--text-3)]">{row.date}</p>
      </div>
      <div className="text-right shrink-0">
        <p
          className={cn(
            'font-semibold',
            row.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500',
          )}
        >
          {row.type === 'CREDIT' ? '+' : '-'}
          {formatCurrency(row.amount, currency)}
        </p>
        <p className="text-xs text-[var(--text-3)]">{row.type}</p>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface ReconciliationClientProps {
  storeId: string
  currency: string
}

export default function ReconciliationClient({
  storeId,
  currency,
}: ReconciliationClientProps) {
  const queryClient = useQueryClient()
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const lastDay = today.toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(lastDay)
  const [bankRows, setBankRows] = useState<BankStatementRow[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)

  // Fetch system transactions (unmatched journal / orders)
  const { data: sysData, isLoading: sysLoading } = useQuery({
    queryKey: ['reconciliation', storeId, from, to],
    queryFn: () =>
      fetch(
        `/api/accounting/reconciliation?storeId=${storeId}&from=${from}&to=${to}`,
      ).then(r => r.json()),
  })

  const rawSystemRows: SystemTransaction[] = Array.isArray(sysData) ? sysData : []

  // Maintain local match state on top of server data
  const [localSystem, setLocalSystem] = useState<SystemTransaction[]>([])
  const systemRows: SystemTransaction[] =
    localSystem.length > 0 ? localSystem : rawSystemRows

  // Sync server data → local when it arrives or date changes
  const prevSysRef = useRef<SystemTransaction[]>([])
  if (rawSystemRows !== prevSysRef.current && rawSystemRows.length > 0) {
    prevSysRef.current = rawSystemRows
    setLocalSystem(rawSystemRows.map(r => ({ ...r })))
  }

  // POST match mutation
  const matchMutation = useMutation({
    mutationFn: (body: { bankId: string; systemId: string }) =>
      fetch(`/api/accounting/reconciliation?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', storeId] })
    },
  })

  // Auto-match
  const handleAutoMatch = useCallback(() => {
    if (bankRows.length === 0 || systemRows.length === 0) return
    const { bank, system } = autoMatch(bankRows, systemRows)
    setBankRows(bank)
    setLocalSystem(system)

    // Persist matches to server
    for (const b of bank) {
      if (b.status === 'MATCHED' && b.matchedId) {
        matchMutation.mutate({ bankId: b.id, systemId: b.matchedId })
      }
    }
  }, [bankRows, systemRows, matchMutation])

  // Manual match
  const handleManualMatch = useCallback(() => {
    if (!selectedBank || !selectedSystem) return
    const bankRow = bankRows.find(r => r.id === selectedBank)
    const sysRow = systemRows.find(r => r.id === selectedSystem)
    if (!bankRow || !sysRow) return

    setBankRows(prev =>
      prev.map(r =>
        r.id === selectedBank ? { ...r, status: 'MATCHED', matchedId: selectedSystem } : r,
      ),
    )
    setLocalSystem(prev =>
      prev.map(r =>
        r.id === selectedSystem ? { ...r, status: 'MATCHED', matchedId: selectedBank } : r,
      ),
    )
    matchMutation.mutate({ bankId: selectedBank, systemId: selectedSystem })
    setSelectedBank(null)
    setSelectedSystem(null)
  }, [selectedBank, selectedSystem, bankRows, systemRows, matchMutation])

  const stats = calcDiscrepancy(bankRows, systemRows)

  const canManualMatch =
    selectedBank !== null &&
    selectedSystem !== null &&
    bankRows.find(r => r.id === selectedBank)?.status === 'UNMATCHED' &&
    systemRows.find(r => r.id === selectedSystem)?.status === 'UNMATCHED'

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">
          Rekonsiliasi Bank
        </h1>
        <p className="text-[var(--text-3)] text-sm mt-0.5">
          Cocokkan mutasi bank dengan transaksi sistem
        </p>
      </div>

      <SubNav />

      {/* Date range */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">
              Dari
            </label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">
              Sampai
            </label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>
        </div>
      </div>

      {/* CSV upload */}
      {bankRows.length === 0 ? (
        <div className="space-y-2">
          <UploadZone
            onParsed={rows => {
              setBankRows(rows)
              setCsvError(null)
            }}
            onError={setCsvError}
          />
          {csvError && (
            <div className="flex items-center gap-2 text-red-500 text-sm p-3 bg-red-50 rounded-xl border border-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {csvError}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-[var(--text-1)]">
            <FileText className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">{bankRows.length} transaksi bank dimuat</span>
          </div>
          <button
            onClick={() => {
              setBankRows([])
              setSelectedBank(null)
            }}
            className="text-xs text-[var(--text-3)] hover:text-red-500 transition-colors"
          >
            Hapus
          </button>
        </div>
      )}

      {/* Summary */}
      {bankRows.length > 0 && <SummaryBar stats={stats} currency={currency} />}

      {/* Action buttons */}
      {bankRows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAutoMatch}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
          >
            <Zap className="h-4 w-4" />
            Auto-match
          </button>
          <button
            onClick={handleManualMatch}
            disabled={!canManualMatch}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all',
              canManualMatch
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-3)] border border-[var(--border)] cursor-not-allowed',
            )}
          >
            <CheckCircle className="h-4 w-4" />
            Tandai Cocok
          </button>
          {sysLoading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-3)]">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Memuat transaksi sistem...
            </div>
          )}
        </div>
      )}

      {/* Two-column reconciliation view */}
      {bankRows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Bank statement */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--text-1)] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Mutasi Bank
              <span className="ml-auto text-xs font-normal text-[var(--text-3)]">
                {bankRows.length} transaksi
              </span>
            </h2>
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {bankRows.map(row => (
                <TxRow
                  key={row.id}
                  row={row}
                  selected={selectedBank === row.id}
                  onSelect={() => {
                    if (row.status === 'MATCHED') return
                    setSelectedBank(prev => (prev === row.id ? null : row.id))
                  }}
                  currency={currency}
                />
              ))}
            </div>
          </div>

          {/* System transactions */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--text-1)] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Transaksi Sistem
              <span className="ml-auto text-xs font-normal text-[var(--text-3)]">
                {systemRows.length} transaksi
              </span>
            </h2>
            {sysLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 bg-[var(--bg-subtle)] animate-pulse rounded-xl"
                  />
                ))}
              </div>
            ) : systemRows.length === 0 ? (
              <div className="text-center py-10 text-[var(--text-3)] text-sm">
                Tidak ada transaksi sistem untuk periode ini
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {systemRows.map(row => (
                  <TxRow
                    key={row.id}
                    row={row}
                    selected={selectedSystem === row.id}
                    onSelect={() => {
                      if (row.status === 'MATCHED') return
                      setSelectedSystem(prev => (prev === row.id ? null : row.id))
                    }}
                    currency={currency}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hint when nothing loaded */}
      {bankRows.length === 0 && (
        <div className="text-center py-16 text-[var(--text-3)] text-sm">
          Upload mutasi bank dalam format CSV untuk memulai rekonsiliasi
        </div>
      )}
    </div>
  )
}

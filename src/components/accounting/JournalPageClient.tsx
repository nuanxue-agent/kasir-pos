'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Check, X, ChevronDown } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface JournalPageClientProps { storeId: string; currency: string }

const STATUS_CONFIG = {
  DRAFT:  { label: 'Draft',   pill: 'bg-[var(--bg-muted)] text-[var(--text-2)]' },
  POSTED: { label: 'Posted',  pill: 'bg-emerald-50 text-emerald-600' },
  VOIDED: { label: 'Voided',  pill: 'bg-red-50 text-red-500' },
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

export default function JournalPageClient({ storeId, currency }: JournalPageClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal', storeId, from, to],
    queryFn: () => fetch(`/api/journal?storeId=${storeId}&from=${from}&to=${to}`).then(r => r.json()),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', storeId],
    queryFn: () => fetch(`/api/accounts?storeId=${storeId}`).then(r => r.json()),
  })

  const post = useMutation({
    mutationFn: (id: string) => fetch(`/api/journal/${id}?storeId=${storeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'POSTED' }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal'] }),
  })

  const void_ = useMutation({
    mutationFn: (id: string) => fetch(`/api/journal/${id}?storeId=${storeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VOIDED' }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal'] }),
  })

  const { data: lines = [] } = useQuery({
    queryKey: ['journal-lines', expandedId],
    queryFn: () => fetch(`/api/journal/lines?storeId=${storeId}&entryId=${expandedId}`).then(r => r.json()),
    enabled: !!expandedId,
  })

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Jurnal Umum</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">General ledger journal entries</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Entri Baru</span>
        </button>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <div>
          <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Dari</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Sampai</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-16 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />)
        ) : (entries as any[]).length === 0 ? (
          <div className="flex flex-col items-center py-16 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
            <FileText className="h-12 w-12 text-stone-200 mb-3" />
            <p className="text-[var(--text-3)] text-sm">Belum ada entri jurnal</p>
          </div>
        ) : (entries as any[]).map((entry: any) => {
          const cfg = STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.DRAFT
          const expanded = expandedId === entry.id
          return (
            <div key={entry.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[var(--text-2)]">{entry.number}</span>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-lg', cfg.pill)}>{cfg.label}</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--text-1)] truncate mt-0.5">{entry.description}</p>
                </div>
                <span className="text-xs text-[var(--text-3)] shrink-0">{entry.date}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {entry.status === 'DRAFT' && (
                    <button onClick={() => post.mutate(entry.id)}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors" title="Post">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {entry.status === 'POSTED' && (
                    <button onClick={() => void_.mutate(entry.id)}
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors" title="Void">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => setExpandedId(expanded ? null : entry.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
                    <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-3)] transition-transform', expanded && 'rotate-180')} />
                  </button>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-[var(--border)] px-4 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--text-3)] font-semibold">
                        <th className="text-left pb-2">Akun</th>
                        <th className="text-right pb-2">Debit</th>
                        <th className="text-right pb-2">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {(lines as any[]).map((line: any) => (
                        <tr key={line.id} className="text-[var(--text-1)]">
                          <td className="py-1.5">{line.code} — {line.accountName}</td>
                          <td className="text-right py-1.5 font-mono">{line.debit > 0 ? line.debit.toLocaleString() : ''}</td>
                          <td className="text-right py-1.5 font-mono">{line.credit > 0 ? line.credit.toLocaleString() : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

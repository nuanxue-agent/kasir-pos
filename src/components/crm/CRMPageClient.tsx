'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Plus, Search, Phone, Mail, Building2, Calendar, DollarSign, Target, TrendingUp, Award } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface CRMPageClientProps { storeId: string; currency: string }

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'

const PIPELINE_STAGES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'NEW', label: 'Baru', color: 'bg-stone-100 text-stone-600' },
  { value: 'CONTACTED', label: 'Dihubungi', color: 'bg-blue-50 text-blue-600' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-purple-50 text-purple-600' },
  { value: 'PROPOSAL', label: 'Proposal', color: 'bg-amber-50 text-amber-600' },
  { value: 'NEGOTIATION', label: 'Negosiasi', color: 'bg-orange-50 text-orange-600' },
  { value: 'WON', label: 'Menang', color: 'bg-emerald-50 text-emerald-600' },
  { value: 'LOST', label: 'Kalah', color: 'bg-red-50 text-red-500' },
]

const PRIORITY_CONFIG = {
  LOW: { label: 'Rendah', color: 'text-stone-400' },
  MEDIUM: { label: 'Sedang', color: 'text-amber-500' },
  HIGH: { label: 'Tinggi', color: 'text-red-500' },
}

export default function CRMPageClient({ storeId, currency }: CRMPageClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', storeId],
    queryFn: () => fetch(`/api/leads?storeId=${storeId}`).then(r => r.json()),
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) =>
      fetch(`/api/leads/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  const filtered = (leads as any[]).filter((l: any) =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.company?.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.value] = filtered.filter((l: any) => l.status === stage.value)
    return acc
  }, {} as Record<LeadStatus, any[]>)

  const totalValue = filtered.filter((l: any) => l.status !== 'LOST').reduce((s: number, l: any) => s + (l.value ?? 0), 0)
  const weightedValue = filtered.filter((l: any) => l.status !== 'LOST').reduce((s: number, l: any) => s + (l.value ?? 0) * (l.probability ?? 0) / 100, 0)
  const wonCount = filtered.filter((l: any) => l.status === 'WON').length
  const closedCount = filtered.filter((l: any) => l.status === 'WON' || l.status === 'LOST').length
  const conversionRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0

  function handleDrop(leadId: string, newStatus: LeadStatus) {
    updateStatus.mutate({ id: leadId, status: newStatus })
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">CRM Pipeline</h1>
          <p className="text-stone-400 text-sm mt-0.5">Sales funnel & lead tracking</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add Lead</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-blue-500" />
            <p className="text-xs font-medium text-stone-400">Pipeline Value</p>
          </div>
          <p className="text-xl font-bold text-stone-800">{formatCurrency(totalValue, currency)}</p>
        </div>
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-medium text-stone-400">Weighted Value</p>
          </div>
          <p className="text-xl font-bold text-stone-800">{formatCurrency(weightedValue, currency)}</p>
        </div>
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Award className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-medium text-stone-400">Win Rate</p>
          </div>
          <p className="text-xl font-bold text-emerald-600">{conversionRate}%</p>
        </div>
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-purple-500" />
            <p className="text-xs font-medium text-stone-400">Total Leads</p>
          </div>
          <p className="text-xl font-bold text-stone-800">{filtered.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-100 rounded-2xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
          placeholder="Search leads…" />
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {[...Array(7)].map((_, i) => <div key={i} className="h-96 bg-stone-50 animate-pulse rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 overflow-x-auto">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = grouped[stage.value] ?? []
            const stageValue = stageLeads.reduce((s: number, l: any) => s + (l.value ?? 0), 0)
            return (
              <div key={stage.value}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const leadId = e.dataTransfer.getData('leadId')
                  if (leadId) handleDrop(leadId, stage.value)
                }}
                className="bg-stone-50/50 border border-stone-100 rounded-2xl p-3 min-h-[500px]">
                <div className={cn('flex items-center justify-between mb-3 px-3 py-2 rounded-xl', stage.color)}>
                  <span className="text-xs font-bold">{stage.label}</span>
                  <span className="text-xs font-semibold">{stageLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead: any) => {
                    const priorityCfg = PRIORITY_CONFIG[lead.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.MEDIUM
                    return (
                      <div key={lead.id}
                        draggable
                        onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}
                        className="bg-white border border-stone-200 rounded-xl p-3 cursor-move hover:shadow-md transition-all">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-stone-800 line-clamp-2">{lead.name}</p>
                          <div className={cn('w-2 h-2 rounded-full shrink-0 mt-1', priorityCfg.color === 'text-red-500' ? 'bg-red-500' : priorityCfg.color === 'text-amber-500' ? 'bg-amber-500' : 'bg-stone-300')} />
                        </div>
                        {lead.company && (
                          <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                            <Building2 className="h-3 w-3 text-stone-300" />
                            <span className="truncate">{lead.company}</span>
                          </div>
                        )}
                        {lead.value > 0 && (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 mb-1">
                            <DollarSign className="h-3 w-3" />
                            <span>{formatCurrency(lead.value, currency)}</span>
                            {lead.probability > 0 && <span className="text-stone-400">({lead.probability}%)</span>}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-stone-400 mt-2 pt-2 border-t border-stone-100">
                          {lead.email && <Mail className="h-3 w-3" />}
                          {lead.phone && <Phone className="h-3 w-3" />}
                          {lead.expectedCloseDate && (
                            <div className="ml-auto flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(lead.expectedCloseDate)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {stageLeads.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-stone-200 text-xs text-stone-500 font-semibold px-2">
                    Total: {formatCurrency(stageValue, currency)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

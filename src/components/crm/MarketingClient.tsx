'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Plus, Send, Mail, MessageSquare, Users, Clock, CheckCircle,
  FileText, ChevronRight, ChevronLeft, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MESSAGE_TEMPLATES,
  type CampaignType,
  type CampaignStatus,
  type AudienceType,
} from '@/lib/marketing'

interface MarketingClientProps {
  storeId: string
}

const TYPE_CONFIG: Record<CampaignType, { label: string; icon: React.ReactNode; color: string }> = {
  EMAIL:    { label: 'Email',    icon: null, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  SMS:      { label: 'SMS',      icon: null, color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  WHATSAPP: { label: 'WhatsApp', icon: null, color: 'bg-green-50 text-green-700 border-green-200' },
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Draft',     color: 'bg-[var(--bg-muted)] text-[var(--text-2)]' },
  SCHEDULED: { label: 'Terjadwal', color: 'bg-amber-50 text-amber-600' },
  SENT:      { label: 'Terkirim',  color: 'bg-emerald-50 text-emerald-600' },
}

const AUDIENCE_OPTIONS: { value: AudienceType; label: string }[] = [
  { value: 'ALL',          label: 'Semua pelanggan' },
  { value: 'SEGMENT',      label: 'Berdasarkan segmen' },
  { value: 'LOYALTY_TIER', label: 'Berdasarkan tier loyalitas' },
]

const SEGMENT_OPTIONS = ['Champions', 'Loyal', 'New', 'AtRisk', 'Lost']

interface WizardState {
  type: CampaignType
  audience: AudienceType
  audienceValue: string
  name: string
  message: string
  scheduleNow: boolean
  scheduledAt: string
}

const DEFAULT_WIZARD: WizardState = {
  type: 'EMAIL',
  audience: 'ALL',
  audienceValue: '',
  name: '',
  message: '',
  scheduleNow: true,
  scheduledAt: '',
}

export default function MarketingClient({ storeId }: MarketingClientProps) {
  const qc = useQueryClient()
  const [showWizard, setShowWizard] = useState(false)
  const [step, setStep] = useState(1)
  const [wizard, setWizard] = useState<WizardState>(DEFAULT_WIZARD)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [statsMap, setStatsMap] = useState<Record<string, { delivered: number; failed: number; opened: number }>>({})

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['marketing-campaigns', storeId],
    queryFn: () => fetch(`/api/marketing-campaigns?storeId=${storeId}`).then(r => r.json()),
  })

  const { data: loyaltyTiers = [] } = useQuery({
    queryKey: ['loyalty-tiers', storeId],
    queryFn: () => fetch(`/api/loyalty-tiers?storeId=${storeId}`).then(r => r.json()),
  })

  const createCampaign = useMutation({
    mutationFn: (body: object) =>
      fetch(`/api/marketing-campaigns?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-campaigns'] })
      setShowWizard(false)
      setStep(1)
      setWizard(DEFAULT_WIZARD)
    },
  })

  async function handleSend(id: string) {
    setSendingId(id)
    try {
      const res = await fetch(`/api/marketing-campaigns/send/${id}?storeId=${storeId}`, { method: 'POST' })
      const data = await res.json() as { stats?: { delivered: number; failed: number; opened: number } }
      if (data.stats) setStatsMap(prev => ({ ...prev, [id]: data.stats! }))
      qc.invalidateQueries({ queryKey: ['marketing-campaigns'] })
    } finally {
      setSendingId(null)
    }
  }

  function handleSubmitWizard() {
    if (!wizard.name.trim() || !wizard.message.trim()) return
    createCampaign.mutate({
      name: wizard.name.trim(),
      type: wizard.type,
      message: wizard.message.trim(),
      audience: wizard.audience,
      audienceValue: wizard.audienceValue || null,
      scheduledAt: wizard.scheduleNow ? null : wizard.scheduledAt || null,
    })
  }

  const charCount = wizard.message.length
  const isSmsOverLimit = wizard.type === 'SMS' && charCount > 160

  // ── Wizard steps ───────────────────────────────────────────────────────────

  function Step1() {
    const types: CampaignType[] = ['EMAIL', 'SMS', 'WHATSAPP']
    const icons: Record<CampaignType, React.ReactNode> = {
      EMAIL:    <Mail className="h-5 w-5" />,
      SMS:      <MessageSquare className="h-5 w-5" />,
      WHATSAPP: <MessageSquare className="h-5 w-5 text-green-600" />,
    }
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--text-1)]">Pilih Tipe Kampanye</h3>
        <div className="grid grid-cols-3 gap-3">
          {types.map(type => (
            <button
              key={type}
              onClick={() => setWizard(w => ({ ...w, type }))}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                wizard.type === type
                  ? 'border-amber-400 bg-amber-50 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:border-amber-300',
              )}
            >
              {icons[type]}
              <span className="text-sm font-medium text-[var(--text-1)]">{TYPE_CONFIG[type].label}</span>
            </button>
          ))}
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Nama Kampanye</label>
          <input
            value={wizard.name}
            onChange={e => setWizard(w => ({ ...w, name: e.target.value }))}
            placeholder="Contoh: Promo Lebaran 2025"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-amber-400"
          />
        </div>
      </div>
    )
  }

  function Step2() {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--text-1)]">Pilih Audiens</h3>
        <div className="space-y-2">
          {AUDIENCE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setWizard(w => ({ ...w, audience: opt.value, audienceValue: '' }))}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                wizard.audience === opt.value
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:border-amber-300',
              )}
            >
              <Users className="h-4 w-4 text-[var(--text-3)]" />
              <span className="text-sm font-medium text-[var(--text-1)]">{opt.label}</span>
            </button>
          ))}
        </div>
        {wizard.audience === 'SEGMENT' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Pilih Segmen</label>
            <select
              value={wizard.audienceValue}
              onChange={e => setWizard(w => ({ ...w, audienceValue: e.target.value }))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-amber-400"
            >
              <option value="">-- Pilih segmen --</option>
              {SEGMENT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        {wizard.audience === 'LOYALTY_TIER' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Pilih Tier</label>
            <select
              value={wizard.audienceValue}
              onChange={e => setWizard(w => ({ ...w, audienceValue: e.target.value }))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-amber-400"
            >
              <option value="">-- Pilih tier --</option>
              {(loyaltyTiers as any[]).map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    )
  }

  function Step3() {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--text-1)]">Tulis Pesan</h3>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">Template</p>
          <div className="flex flex-wrap gap-2">
            {MESSAGE_TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => setWizard(w => ({ ...w, message: tpl.body }))}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:border-amber-400 hover:text-[var(--text-1)]"
              >
                <FileText className="h-3 w-3" />
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Pesan</label>
          <textarea
            value={wizard.message}
            onChange={e => setWizard(w => ({ ...w, message: e.target.value }))}
            rows={5}
            placeholder="Tulis pesan... Gunakan {name}, {points}, {tier}"
            className={cn(
              'w-full resize-none rounded-lg border bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-amber-400',
              isSmsOverLimit ? 'border-red-400' : 'border-[var(--border)]',
            )}
          />
          <div className={cn('mt-1 flex justify-between text-xs', isSmsOverLimit ? 'text-red-500' : 'text-[var(--text-3)]')}>
            <span>Variabel: {'{name}'}, {'{points}'}, {'{tier}'}</span>
            <span>
              {charCount}
              {wizard.type === 'SMS' ? '/160' : ''} karakter
              {isSmsOverLimit ? ' — melebihi batas SMS' : ''}
            </span>
          </div>
        </div>
      </div>
    )
  }

  function Step4() {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--text-1)]">Jadwalkan Pengiriman</h3>
        <div className="space-y-2">
          <button
            onClick={() => setWizard(w => ({ ...w, scheduleNow: true }))}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
              wizard.scheduleNow
                ? 'border-amber-400 bg-amber-50'
                : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:border-amber-300',
            )}
          >
            <Send className="h-4 w-4 text-[var(--text-3)]" />
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Kirim Sekarang</p>
              <p className="text-xs text-[var(--text-3)]">Kampanye langsung dikirim setelah dibuat</p>
            </div>
          </button>
          <button
            onClick={() => setWizard(w => ({ ...w, scheduleNow: false }))}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
              !wizard.scheduleNow
                ? 'border-amber-400 bg-amber-50'
                : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:border-amber-300',
            )}
          >
            <Clock className="h-4 w-4 text-[var(--text-3)]" />
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Jadwalkan</p>
              <p className="text-xs text-[var(--text-3)]">Pilih tanggal dan waktu pengiriman</p>
            </div>
          </button>
        </div>
        {!wizard.scheduleNow && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Tanggal dan Waktu</label>
            <input
              type="datetime-local"
              value={wizard.scheduledAt}
              onChange={e => setWizard(w => ({ ...w, scheduledAt: e.target.value }))}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-amber-400"
            />
          </div>
        )}
      </div>
    )
  }

  const stepComponents = [Step1, Step2, Step3, Step4]
  const StepComp = stepComponents[step - 1]
  const canNext =
    step === 1 ? !!wizard.name.trim() :
    step === 3 ? !!wizard.message.trim() && !isSmsOverLimit :
    true

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Email & SMS Marketing</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Kirim kampanye ke pelanggan Anda</p>
        </div>
        <button
          onClick={() => { setShowWizard(true); setStep(1); setWizard(DEFAULT_WIZARD) }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Buat Kampanye</span>
        </button>
      </div>

      {/* Campaign table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[var(--text-3)]">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            Memuat kampanye...
          </div>
        ) : (campaigns as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className="mb-3 h-10 w-10 text-[var(--text-3)]" />
            <p className="font-medium text-[var(--text-2)]">Belum ada kampanye</p>
            <p className="mt-1 text-sm text-[var(--text-3)]">Buat kampanye pertama Anda</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                {['Kampanye', 'Tipe', 'Status', 'Audiens', 'Terkirim', 'Aksi'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(campaigns as any[]).map((c: any) => {
                const typeCfg = TYPE_CONFIG[c.type as CampaignType] ?? TYPE_CONFIG.EMAIL
                const statusCfg = STATUS_CONFIG[c.status as CampaignStatus] ?? STATUS_CONFIG.DRAFT
                const stats = statsMap[c.id]
                return (
                  <tr key={c.id} className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-1)]">{c.name}</p>
                      {c.scheduledAt && (
                        <p className="text-xs text-[var(--text-3)]">
                          <Clock className="mr-0.5 inline h-3 w-3" />
                          {new Date(c.scheduledAt).toLocaleString('id-ID')}
                        </p>
                      )}
                      {stats && (
                        <p className="mt-0.5 text-xs text-emerald-600">
                          {stats.delivered} terkirim · {stats.opened} dibuka · {stats.failed} gagal
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', typeCfg.color)}>
                        {typeCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                      {c.audience === 'ALL' ? 'Semua pelanggan' : c.audienceValue || c.audience}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-1)]">
                      {c.sentCount > 0 ? c.sentCount.toLocaleString('id-ID') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.status !== 'SENT' ? (
                        <button
                          onClick={() => handleSend(c.id)}
                          disabled={sendingId === c.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
                        >
                          {sendingId === c.id ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Kirim
                        </button>
                      ) : (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Wizard modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <div>
                <h2 className="font-bold text-[var(--text-1)]">Buat Kampanye Baru</h2>
                <p className="text-xs text-[var(--text-3)]">Langkah {step} dari 4</p>
              </div>
              <button onClick={() => setShowWizard(false)} className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1.5 border-b border-[var(--border)] px-6 py-3">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={cn('h-1.5 flex-1 rounded-full transition-all', s <= step ? 'bg-amber-500' : 'bg-[var(--bg-muted)]')} />
              ))}
            </div>
            <div className="px-6 py-5">
              <StepComp />
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
              <button
                onClick={() => step > 1 ? setStep(s => s - 1) : setShowWizard(false)}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <ChevronLeft className="h-4 w-4" />
                {step > 1 ? 'Kembali' : 'Batal'}
              </button>
              {step < 4 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                >
                  Lanjut <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitWizard}
                  disabled={createCampaign.isPending || !wizard.name.trim() || !wizard.message.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                >
                  {createCampaign.isPending
                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <Send className="h-4 w-4" />}
                  Simpan Kampanye
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

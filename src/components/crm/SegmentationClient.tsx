'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Play, Send, X, ChevronRight, Megaphone, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleField = 'recency' | 'frequency' | 'monetary' | 'rfmSegment'
type RuleOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'
type CampaignType = 'DISCOUNT' | 'POINTS' | 'NOTIFICATION'

interface SegmentRule {
  field: RuleField
  operator: RuleOperator
  value: string | number
}

interface CustomerSegment {
  id: string
  name: string
  description?: string
  rules: SegmentRule[]
  memberCount: number
  createdAt: string
}

interface CrmCampaign {
  id: string
  segmentId: string
  segmentName?: string
  name: string
  type: CampaignType
  value?: string
  scheduledAt?: string
  sentAt?: string
  status: 'DRAFT' | 'SCHEDULED' | 'SENT'
  audienceSize?: number
  createdAt: string
}

interface Props {
  storeId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<RuleField, string> = {
  recency: 'Recency (hari)',
  frequency: 'Frekuensi (order)',
  monetary: 'Monetary (total belanja)',
  rfmSegment: 'Segmen RFM',
}

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  eq: '=',
  neq: '!=',
}

const RFM_SEGMENTS = ['Champions', 'Loyal', 'New', 'AtRisk', 'Lost']

const CAMPAIGN_TYPE_CONFIG: Record<CampaignType, { label: string; color: string }> = {
  DISCOUNT: { label: 'Diskon', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  POINTS: { label: 'Poin', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  NOTIFICATION: { label: 'Notifikasi', color: 'bg-violet-100 text-violet-700 border-violet-200' },
}

const STATUS_CONFIG = {
  DRAFT: { label: 'Draft', cls: 'bg-[var(--bg-muted)] text-[var(--text-2)]' },
  SCHEDULED: { label: 'Terjadwal', cls: 'bg-amber-50 text-amber-600' },
  SENT: { label: 'Terkirim', cls: 'bg-emerald-50 text-emerald-600' },
}

const DEFAULT_RULE: SegmentRule = { field: 'recency', operator: 'lte', value: 30 }

// ─── Component ────────────────────────────────────────────────────────────────

export default function SegmentationClient({ storeId }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'segments' | 'campaigns'>('segments')
  const [showSegmentForm, setShowSegmentForm] = useState(false)
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [computingId, setComputingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

  // ── Segment form state ─────────────────────────────────────────────────────
  const [segName, setSegName] = useState('')
  const [segDesc, setSegDesc] = useState('')
  const [segRules, setSegRules] = useState<SegmentRule[]>([{ ...DEFAULT_RULE }])

  // ── Campaign form state ────────────────────────────────────────────────────
  const [campName, setCampName] = useState('')
  const [campType, setCampType] = useState<CampaignType>('NOTIFICATION')
  const [campValue, setCampValue] = useState('')
  const [campSegId, setCampSegId] = useState('')
  const [campScheduled, setCampScheduled] = useState('')

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: segments = [], isLoading: loadingSeg } = useQuery<CustomerSegment[]>({
    queryKey: ['crm-segments', storeId],
    queryFn: () => fetch(`/api/crm/segments?storeId=${storeId}`).then(r => r.json()),
    staleTime: 30_000,
  })

  const { data: campaigns = [], isLoading: loadingCamp } = useQuery<CrmCampaign[]>({
    queryKey: ['crm-campaigns', storeId],
    queryFn: () => fetch(`/api/crm/campaigns?storeId=${storeId}`).then(r => r.json()),
    staleTime: 30_000,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createSegment = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/crm/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-segments'] })
      setShowSegmentForm(false)
      setSegName('')
      setSegDesc('')
      setSegRules([{ ...DEFAULT_RULE }])
    },
  })

  const createCampaign = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/crm/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] })
      setShowCampaignForm(false)
      setCampName('')
      setCampType('NOTIFICATION')
      setCampValue('')
      setCampSegId('')
      setCampScheduled('')
    },
  })

  async function handleCompute(segId: string) {
    setComputingId(segId)
    try {
      await fetch(`/api/crm/segments/${segId}/compute`, { method: 'POST' })
      qc.invalidateQueries({ queryKey: ['crm-segments'] })
    } finally {
      setComputingId(null)
    }
  }

  async function handleSend(campId: string) {
    setSendingId(campId)
    try {
      await fetch(`/api/crm/campaigns/${campId}/send`, { method: 'POST' })
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] })
    } finally {
      setSendingId(null)
    }
  }

  function addRule() {
    setSegRules(r => [...r, { ...DEFAULT_RULE }])
  }

  function removeRule(i: number) {
    setSegRules(r => r.filter((_, idx) => idx !== i))
  }

  function updateRule(i: number, patch: Partial<SegmentRule>) {
    setSegRules(r => r.map((rule, idx) => (idx === i ? { ...rule, ...patch } : rule)))
  }

  function handleCreateSegment() {
    if (!segName.trim()) return
    createSegment.mutate({
      storeId,
      name: segName.trim(),
      description: segDesc.trim() || undefined,
      rules: segRules,
    })
  }

  function handleCreateCampaign() {
    if (!campName.trim() || !campSegId) return
    createCampaign.mutate({
      storeId,
      segmentId: campSegId,
      name: campName.trim(),
      type: campType,
      value: campValue.trim() || undefined,
      scheduledAt: campScheduled || undefined,
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">
            Segmentasi & Kampanye
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Kelola segmen pelanggan dan kampanye bertarget
          </p>
        </div>
        <button
          onClick={() =>
            tab === 'segments' ? setShowSegmentForm(true) : setShowCampaignForm(true)
          }
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">
            {tab === 'segments' ? 'Segmen Baru' : 'Kampanye Baru'}
          </span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
        {(['segments', 'campaigns'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'segments' ? <Layers className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
            {t === 'segments' ? 'Segmen' : 'Kampanye'}
          </button>
        ))}
      </div>

      {/* Segments tab */}
      {tab === 'segments' && (
        <div className="space-y-3">
          {loadingSeg ? (
            <LoadingSpinner label="Memuat segmen..." />
          ) : segments.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-10 w-10" />}
              title="Belum ada segmen"
              subtitle="Buat segmen pertama untuk mengelompokkan pelanggan"
            />
          ) : (
            segments.map(seg => (
              <div
                key={seg.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-[var(--text-1)]">{seg.name}</h3>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {seg.memberCount} pelanggan
                      </span>
                    </div>
                    {seg.description && (
                      <p className="mt-0.5 truncate text-sm text-[var(--text-3)]">
                        {seg.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {seg.rules.map((rule, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-2)]"
                        >
                          {FIELD_LABELS[rule.field]} {OPERATOR_LABELS[rule.operator]} {rule.value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleCompute(seg.id)}
                      disabled={computingId === seg.id}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:border-amber-400 hover:text-[var(--text-1)] disabled:opacity-50"
                      title="Hitung ulang anggota segmen"
                    >
                      {computingId === seg.id ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      Hitung
                    </button>
                    <button
                      onClick={() => {
                        setCampSegId(seg.id)
                        setShowCampaignForm(true)
                        setTab('campaigns')
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-amber-600"
                    >
                      <Send className="h-3 w-3" />
                      Kampanye
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Campaigns tab */}
      {tab === 'campaigns' && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
          {loadingCamp ? (
            <LoadingSpinner label="Memuat kampanye..." />
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-10 w-10" />}
              title="Belum ada kampanye"
              subtitle="Buat kampanye bertarget dari segmen pelanggan"
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                  {['Kampanye', 'Tipe', 'Segmen', 'Audiens', 'Status', 'Aksi'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const typeCfg = CAMPAIGN_TYPE_CONFIG[c.type]
                  const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.DRAFT
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text-1)]">{c.name}</p>
                        {c.value && (
                          <p className="text-xs text-[var(--text-3)]">Nilai: {c.value}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                            typeCfg.color,
                          )}
                        >
                          {typeCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                        {c.segmentName ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-1)]">
                        {c.audienceSize ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            statusCfg.cls,
                          )}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.status !== 'SENT' ? (
                          <button
                            onClick={() => handleSend(c.id)}
                            disabled={sendingId === c.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
                          >
                            {sendingId === c.id ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Kirim
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-emerald-600">✓ Terkirim</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Segment form modal */}
      {showSegmentForm && (
        <Modal title="Segmen Baru" onClose={() => setShowSegmentForm(false)}>
          <div className="space-y-4">
            <Field label="Nama Segmen">
              <input
                value={segName}
                onChange={e => setSegName(e.target.value)}
                placeholder="Contoh: Pelanggan VIP"
                className="input-base"
              />
            </Field>
            <Field label="Deskripsi (opsional)">
              <input
                value={segDesc}
                onChange={e => setSegDesc(e.target.value)}
                placeholder="Deskripsi singkat..."
                className="input-base"
              />
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--text-2)]">
                  Aturan Segmentasi
                </label>
                <button
                  onClick={addRule}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                >
                  <Plus className="h-3 w-3" /> Tambah Aturan
                </button>
              </div>
              <div className="space-y-2">
                {segRules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={rule.field}
                      onChange={e =>
                        updateRule(i, {
                          field: e.target.value as RuleField,
                          value: rule.field === 'rfmSegment' ? 'Champions' : 0,
                        })
                      }
                      className="input-base flex-1"
                    >
                      {(Object.entries(FIELD_LABELS) as [RuleField, string][]).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rule.operator}
                      onChange={e => updateRule(i, { operator: e.target.value as RuleOperator })}
                      className="input-base w-20"
                    >
                      {(Object.entries(OPERATOR_LABELS) as [RuleOperator, string][]).map(
                        ([v, l]) =>
                          rule.field === 'rfmSegment' && !['eq', 'neq'].includes(v) ? null : (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ),
                      )}
                    </select>
                    {rule.field === 'rfmSegment' ? (
                      <select
                        value={String(rule.value)}
                        onChange={e => updateRule(i, { value: e.target.value })}
                        className="input-base flex-1"
                      >
                        {RFM_SEGMENTS.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={Number(rule.value)}
                        onChange={e => updateRule(i, { value: Number(e.target.value) })}
                        className="input-base w-24"
                      />
                    )}
                    {segRules.length > 1 && (
                      <button
                        onClick={() => removeRule(i)}
                        className="text-[var(--text-3)] hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSegmentForm(false)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
              >
                Batal
              </button>
              <button
                onClick={handleCreateSegment}
                disabled={createSegment.isPending || !segName.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {createSegment.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Campaign form modal */}
      {showCampaignForm && (
        <Modal title="Kampanye Baru" onClose={() => setShowCampaignForm(false)}>
          <div className="space-y-4">
            <Field label="Nama Kampanye">
              <input
                value={campName}
                onChange={e => setCampName(e.target.value)}
                placeholder="Contoh: Promo Lebaran"
                className="input-base"
              />
            </Field>
            <Field label="Segmen Target">
              <select
                value={campSegId}
                onChange={e => setCampSegId(e.target.value)}
                className="input-base"
              >
                <option value="">-- Pilih segmen --</option>
                {segments.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.memberCount} pelanggan)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipe Kampanye">
              <div className="flex gap-2">
                {(['DISCOUNT', 'POINTS', 'NOTIFICATION'] as CampaignType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setCampType(t)}
                    className={cn(
                      'flex-1 rounded-lg border py-2 text-sm font-medium transition-all',
                      campType === t
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-[var(--border)] text-[var(--text-2)] hover:border-amber-300',
                    )}
                  >
                    {CAMPAIGN_TYPE_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </Field>
            {campType !== 'NOTIFICATION' && (
              <Field label={campType === 'DISCOUNT' ? 'Nilai Diskon (%)' : 'Jumlah Poin'}>
                <input
                  type="number"
                  value={campValue}
                  onChange={e => setCampValue(e.target.value)}
                  placeholder="0"
                  className="input-base"
                />
              </Field>
            )}
            <Field label="Jadwal (opsional)">
              <input
                type="datetime-local"
                value={campScheduled}
                onChange={e => setCampScheduled(e.target.value)}
                className="input-base"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCampaignForm(false)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
              >
                Batal
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={createCampaign.isPending || !campName.trim() || !campSegId}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {createCampaign.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-bold text-[var(--text-1)]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">{label}</label>
      {children}
    </div>
  )
}

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-[var(--text-3)]">
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      {label}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="mb-3 text-[var(--text-3)]">{icon}</span>
      <p className="font-medium text-[var(--text-2)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--text-3)]">{subtitle}</p>
    </div>
  )
}

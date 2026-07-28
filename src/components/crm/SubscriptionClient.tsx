'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Plus, TrendingDown, DollarSign, Users, Bell,
  RefreshCw, Check, X, Loader2, Play,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface SubscriptionClientProps { storeId: string; currency: string }
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
export type SubStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED'

export interface MembershipPlan {
  id: string; storeId: string; name: string; price: number
  cycle: BillingCycle; benefits: string[] | string; active: boolean; createdAt: string
}
export interface CustomerSubscription {
  id: string; customerId: string; planId: string; storeId: string
  startDate: string; nextBilling: string; status: SubStatus; autoRenew: boolean
  planName?: string; planPrice?: number; planCycle?: BillingCycle
  customerName?: string; customerPhone?: string
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: 'Bulanan', QUARTERLY: 'Kuartalan', ANNUAL: 'Tahunan',
}
const STATUS_CONFIG: Record<SubStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Aktif', color: 'bg-emerald-50 text-emerald-600' },
  PAUSED: { label: 'Dijeda', color: 'bg-amber-50 text-amber-600' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-red-50 text-red-500' },
}

export function cycleFactor(cycle: BillingCycle): number {
  if (cycle === 'QUARTERLY') return 1 / 3
  if (cycle === 'ANNUAL') return 1 / 12
  return 1
}
export function computeMRR(subs: CustomerSubscription[]): number {
  return subs
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + (s.planPrice ?? 0) * cycleFactor(s.planCycle ?? 'MONTHLY'), 0)
}
export function computeChurnRate(subs: CustomerSubscription[]): number {
  if (subs.length === 0) return 0
  return Math.round((subs.filter((s) => s.status === 'CANCELLED').length / subs.length) * 100)
}
export function computeNextBilling(startDate: string, cycle: BillingCycle): string {
  const d = new Date(startDate)
  if (cycle === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (cycle === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}
export function normalizeCycle(raw: string): BillingCycle {
  const u = (raw ?? '').toUpperCase()
  if (u === 'QUARTERLY') return 'QUARTERLY'
  if (u === 'ANNUAL' || u === 'YEARLY') return 'ANNUAL'
  return 'MONTHLY'
}

function MetricCard({ icon, label, value, sub, bg }: {
  icon: React.ReactNode; label: string; value: string; sub: string; bg: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-2">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", bg)}>{icon}</div>
      <div className="text-2xl font-bold text-[var(--text-1)]">{value}</div>
      <div className="text-xs font-medium text-[var(--text-2)]">{label}</div>
      <div className="text-xs text-[var(--text-3)]">{sub}</div>
    </div>
  )
}

function parseBenefits(b: string[] | string): string[] {
  if (Array.isArray(b)) return b
  try { return JSON.parse(b as string) } catch { return [] }
}

function PlanCard({ plan, currency }: { plan: MembershipPlan; currency: string }) {
  const benefits = parseBenefits(plan.benefits)
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-[var(--text-1)]">{plan.name}</div>
          <div className="text-xs text-[var(--text-3)] mt-0.5">{CYCLE_LABEL[plan.cycle]}</div>
        </div>
        <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium",
          plan.active ? "bg-emerald-50 text-emerald-600" : "bg-[var(--bg-muted)] text-[var(--text-3)]")}>
          {plan.active ? "Aktif" : "Nonaktif"}
        </span>
      </div>
      <div className="text-2xl font-bold text-[var(--text-1)]">
        {formatCurrency(plan.price, currency)}
        <span className="text-sm font-normal text-[var(--text-3)]">{"/ "}{CYCLE_LABEL[plan.cycle].toLowerCase()}</span>
      </div>
      {benefits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm text-[var(--text-2)]">
              <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />{b}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SubscriptionClient({ storeId, currency }: SubscriptionClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'plans' | 'subs'>('subs')
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showSubForm, setShowSubForm] = useState(false)
  const [planForm, setPlanForm] = useState({ name: '', price: '', cycle: 'MONTHLY' as BillingCycle, benefits: '' })
  const [subForm, setSubForm] = useState({
    customerId: '', planId: '', startDate: new Date().toISOString().slice(0, 10), autoRenew: true,
  })

  const { data: plans = [], isLoading: plansLoading } = useQuery<MembershipPlan[]>({
    queryKey: ["membership-plans", storeId],
    queryFn: () => fetch(`/api/membership-plans?storeId=${storeId}`).then((r) => r.json()),
  })
  const { data: subs = [], isLoading: subsLoading } = useQuery<CustomerSubscription[]>({
    queryKey: ["subscriptions", storeId],
    queryFn: () => fetch(`/api/subscriptions?storeId=${storeId}`).then((r) => r.json()),
  })
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers-list", storeId],
    queryFn: () => fetch(`/api/customers?storeId=${storeId}`).then((r) => r.json()),
  })

  const activeSubs = subs.filter((s) => s.status === "ACTIVE")
  const mrr = computeMRR(subs)
  const churnRate = computeChurnRate(subs)
  const today = new Date()
  const in3Days = new Date(today.getTime() + 3 * 86400000)
  const upcomingBillings = activeSubs.filter((s) => {
    const nb = new Date(s.nextBilling)
    return nb >= today && nb <= in3Days
  }).length

  const createPlan = useMutation({
    mutationFn: (body: any) => fetch("/api/membership-plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, storeId }),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["membership-plans", storeId] })
      setShowPlanForm(false)
      setPlanForm({ name: "", price: "", cycle: "MONTHLY", benefits: "" })
    },
  })
  const createSub = useMutation({
    mutationFn: (body: any) => fetch("/api/subscriptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, storeId }),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions", storeId] })
      setShowSubForm(false)
      setSubForm({ customerId: "", planId: "", startDate: new Date().toISOString().slice(0, 10), autoRenew: true })
    },
  })
  const updateSub = useMutation({
    mutationFn: ({ id, ...body }: any) => fetch(`/api/subscriptions/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, storeId }),
    }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions", storeId] }),
  })
  const processBilling = useMutation({
    mutationFn: () => fetch("/api/subscriptions/process-billing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["subscriptions", storeId] })
      alert(`Billing diproses: ${data.processed ?? 0} langganan diperbarui`)
    },
  })

  function handlePlanSubmit(e: React.FormEvent) {
    e.preventDefault()
    createPlan.mutate({
      name: planForm.name, price: Number(planForm.price), cycle: planForm.cycle,
      benefits: planForm.benefits.split("
").map((b: string) => b.trim()).filter(Boolean),
    })
  }
  function handleSubSubmit(e: React.FormEvent) { e.preventDefault(); createSub.mutate(subForm) }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">Langganan &amp; Membership</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola paket membership dan langganan pelanggan</p>
        </div>
        <button onClick={() => processBilling.mutate()} disabled={processBilling.isPending}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity">
          {processBilling.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Proses Billing
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard icon={<DollarSign className="h-5 w-5 text-emerald-500" />} label="MRR"
          value={formatCurrency(mrr, currency)} sub="Monthly Recurring Revenue" bg="bg-emerald-50" />
        <MetricCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Langganan Aktif"
          value={String(activeSubs.length)} sub={`dari ${subs.length} total`} bg="bg-blue-50" />
        <MetricCard icon={<TrendingDown className="h-5 w-5 text-red-500" />} label="Churn Rate"
          value={`${churnRate}%`} sub="Langganan dibatalkan" bg="bg-red-50" />
        <MetricCard icon={<Bell className="h-5 w-5 text-amber-500" />} label="Jatuh Tempo Segera"
          value={String(upcomingBillings)} sub="dalam 3 hari" bg="bg-amber-50" />
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        {(["subs", "plans"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]")}>
            {t === "subs" ? "Langganan" : "Paket Membership"}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button onClick={() => setShowPlanForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-muted)] transition-colors">
              <Plus className="h-4 w-4" />Tambah Paket
            </button>
          </div>
          {showPlanForm && (
            <form onSubmit={handlePlanSubmit} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
              <h3 className="font-medium text-[var(--text-1)]">Paket Baru</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input required placeholder="Nama paket" value={planForm.name}
                  onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)]" />
                <input required type="number" min="0" placeholder="Harga" value={planForm.price}
                  onChange={(e) => setPlanForm((p) => ({ ...p, price: e.target.value }))}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)]" />
              </div>
              <select value={planForm.cycle} onChange={(e) => setPlanForm((p) => ({ ...p, cycle: e.target.value as BillingCycle }))}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                <option value="MONTHLY">Bulanan</option>
                <option value="QUARTERLY">Kuartalan (3 bulan)</option>
                <option value="ANNUAL">Tahunan</option>
              </select>
              <textarea placeholder="Manfaat (satu per baris)" value={planForm.benefits}
                onChange={(e) => setPlanForm((p) => ({ ...p, benefits: e.target.value }))}
                rows={3} className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] resize-none" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowPlanForm(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-muted)] transition-colors">Batal</button>
                <button type="submit" disabled={createPlan.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity">
                  {createPlan.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Simpan
                </button>
              </div>
            </form>
          )}
          {plansLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" /></div>
          ) : plans.length === 0 ? (
            <div className="text-center py-10 text-[var(--text-3)] text-sm">Belum ada paket membership</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => <PlanCard key={plan.id} plan={plan} currency={currency} />)}
            </div>
          )}
        </div>
      )}

      {tab === "subs" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button onClick={() => setShowSubForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-muted)] transition-colors">
              <Plus className="h-4 w-4" />Tambah Langganan
            </button>
          </div>
          {showSubForm && (
            <form onSubmit={handleSubSubmit} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
              <h3 className="font-medium text-[var(--text-1)]">Langganan Baru</h3>
              <select required value={subForm.customerId} onChange={(e) => setSubForm((p) => ({ ...p, customerId: e.target.value }))}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                <option value="">Pilih pelanggan</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
                ))}
              </select>
              <select required value={subForm.planId} onChange={(e) => setSubForm((p) => ({ ...p, planId: e.target.value }))}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                <option value="">Pilih paket</option>
                {plans.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price, currency)}/{CYCLE_LABEL[p.cycle]}</option>
                ))}
              </select>
              <input type="date" required value={subForm.startDate}
                onChange={(e) => setSubForm((p) => ({ ...p, startDate: e.target.value }))}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <input type="checkbox" checked={subForm.autoRenew}
                  onChange={(e) => setSubForm((p) => ({ ...p, autoRenew: e.target.checked }))} className="rounded" />
                Perpanjang otomatis
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowSubForm(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-muted)] transition-colors">Batal</button>
                <button type="submit" disabled={createSub.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity">
                  {createSub.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Simpan
                </button>
              </div>
            </form>
          )}
          {subsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" /></div>
          ) : subs.length === 0 ? (
            <div className="text-center py-10 text-[var(--text-3)] text-sm">Belum ada langganan aktif</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Pelanggan</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Paket</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Tagihan Berikutnya</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {subs.map((sub) => {
                    const nb = new Date(sub.nextBilling)
                    const daysUntil = Math.ceil((nb.getTime() - Date.now()) / 86400000)
                    const isNearDue = daysUntil <= 3 && daysUntil >= 0 && sub.status === "ACTIVE"
                    return (
                      <tr key={sub.id} className="bg-[var(--bg-card)] hover:bg-[var(--bg-muted)] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--text-1)]">{sub.customerName ?? sub.customerId}</div>
                          {sub.customerPhone && <div className="text-xs text-[var(--text-3)]">{sub.customerPhone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[var(--text-1)]">{sub.planName ?? sub.planId}</div>
                          {sub.planPrice !== undefined && (
                            <div className="text-xs text-[var(--text-3)]">{formatCurrency(sub.planPrice, currency)}/{CYCLE_LABEL[sub.planCycle ?? "MONTHLY"]}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className={cn("text-[var(--text-1)]", isNearDue && "font-semibold text-amber-600")}>{formatDate(sub.nextBilling)}</div>
                          {isNearDue && <div className="flex items-center gap-1 text-xs text-amber-600 mt-0.5"><Bell className="h-3 w-3" />Segera jatuh tempo</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CONFIG[sub.status].color)}>
                            {STATUS_CONFIG[sub.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {sub.status === "ACTIVE" && (
                              <button onClick={() => updateSub.mutate({ id: sub.id, status: "PAUSED" })} title="Jeda"
                                className="rounded p-1 text-amber-500 hover:bg-amber-50 transition-colors"><RefreshCw className="h-3.5 w-3.5" /></button>
                            )}
                            {sub.status === "PAUSED" && (
                              <button onClick={() => updateSub.mutate({ id: sub.id, status: "ACTIVE" })} title="Aktifkan"
                                className="rounded p-1 text-emerald-500 hover:bg-emerald-50 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                            )}
                            {sub.status !== "CANCELLED" && (
                              <button onClick={() => updateSub.mutate({ id: sub.id, status: "CANCELLED" })} title="Batalkan"
                                className="rounded p-1 text-red-500 hover:bg-red-50 transition-colors"><X className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import {
  Crown, Check, X, Zap, Store, Package, BarChart3,
  Globe, Shield, Headphones, CreditCard, TrendingUp,
  AlertCircle, ChevronRight,
} from 'lucide-react'
import {
  getPlanLimits,
  isFeatureAllowed,
  usagePercent,
  planLabel,
  type Plan,
  type Feature,
} from '@/lib/plan'

interface SubscriptionClientProps {
  currentPlan: Plan
  productsUsed: number
  ordersThisMonth: number
  storesUsed: number
}

// ── Plan display config ───────────────────────────────────────────────────────

const PLAN_CONFIG: Record<Plan, {
  badge: string
  badgeBg: string
  badgeText: string
  ringColor: string
  btnClass: string
  headerBg: string
  price: string
  period: string
  highlight: boolean
}> = {
  FREE: {
    badge: 'Gratis',
    badgeBg: 'bg-stone-100',
    badgeText: 'text-stone-600',
    ringColor: 'ring-stone-200',
    btnClass: 'bg-stone-100 text-stone-600 hover:bg-stone-200',
    headerBg: 'bg-stone-50',
    price: 'Rp 0',
    period: 'selamanya',
    highlight: false,
  },
  PRO: {
    badge: 'Pro',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
    ringColor: 'ring-amber-300',
    btnClass: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-200',
    headerBg: 'bg-amber-50',
    price: 'Rp 149.000',
    period: '/bulan',
    highlight: true,
  },
  ENTERPRISE: {
    badge: 'Enterprise',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-700',
    ringColor: 'ring-violet-300',
    btnClass: 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-200',
    headerBg: 'bg-violet-50',
    price: 'Hubungi kami',
    period: '',
    highlight: false,
  },
}

const FEATURE_ROWS: { feature: Feature; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { feature: 'MULTI_STORE', label: 'Multi-Toko', icon: Store },
  { feature: 'ADVANCED_REPORTS', label: 'Laporan Lanjutan', icon: BarChart3 },
  { feature: 'API_ACCESS', label: 'Akses API', icon: Zap },
  { feature: 'WHITE_LABEL', label: 'White Label', icon: Globe },
  { feature: 'GIFT_CARDS', label: 'Gift Card', icon: CreditCard },
  { feature: 'MANUFACTURING', label: 'Manufaktur', icon: TrendingUp },
]

const PLANS: Plan[] = ['FREE', 'PRO', 'ENTERPRISE']

// ── Sub-components ────────────────────────────────────────────────────────────

function UsageMeter({
  label,
  current,
  limit,
  icon: Icon,
}: {
  label: string
  current: number
  limit: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const pct = usagePercent(limit, current)
  const unlimited = limit === -1
  const nearLimit = pct >= 80 && !unlimited

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-2)]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <span className={`text-xs font-semibold ${nearLimit ? 'text-rose-500' : 'text-[var(--text-1)]'}`}>
          {unlimited ? `${current.toLocaleString('id-ID')} / ∞` : `${current.toLocaleString('id-ID')} / ${limit.toLocaleString('id-ID')}`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
        {unlimited ? (
          <div className="h-2 w-1/4 rounded-full bg-green-400" />
        ) : (
          <div
            className={`h-2 rounded-full transition-all ${
              pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {nearLimit && !unlimited && (
        <p className="flex items-center gap-1 text-[10px] text-rose-500">
          <AlertCircle className="h-3 w-3" />
          Hampir mencapai batas — pertimbangkan upgrade
        </p>
      )}
    </div>
  )
}

function FeatureCell({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <div className="flex justify-center">
      <Check className="h-4 w-4 text-green-500" />
    </div>
  ) : (
    <div className="flex justify-center">
      <X className="h-4 w-4 text-stone-300" />
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({
  targetPlan,
  onClose,
}: {
  targetPlan: Plan
  onClose: () => void
}) {
  const cfg = PLAN_CONFIG[targetPlan]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold text-[var(--text-1)]">
              Upgrade ke {cfg.badge}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
            aria-label="Tutup modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Price callout */}
        <div className={`mb-5 rounded-xl ${cfg.headerBg} border border-[var(--border)] p-4 text-center`}>
          <p className="text-2xl font-bold text-[var(--text-1)]">{cfg.price}</p>
          {cfg.period && <p className="text-sm text-[var(--text-2)]">{cfg.period}</p>}
        </div>

        {/* What you get */}
        <div className="mb-5 space-y-2">
          {FEATURE_ROWS.filter(({ feature }) => isFeatureAllowed(targetPlan, feature)).map(({ feature, label, icon: Icon }) => (
            <div key={feature} className="flex items-center gap-2 text-sm text-[var(--text-1)]">
              <Check className="h-4 w-4 shrink-0 text-green-500" />
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
              {label}
            </div>
          ))}
        </div>

        {/* Payment placeholder notice */}
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          Integrasi pembayaran sedang dalam pengembangan. Tim kami akan menghubungi Anda untuk proses upgrade.
        </div>

        {/* CTA */}
        <button
          onClick={onClose}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${cfg.btnClass}`}
        >
          <Shield className="h-4 w-4" />
          Hubungi Tim Sales
          <ChevronRight className="h-4 w-4" />
        </button>
        <p className="mt-3 text-center text-xs text-[var(--text-3)]">
          Tidak ada biaya tersembunyi · Batalkan kapan saja
        </p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SubscriptionClient({
  currentPlan,
  productsUsed,
  ordersThisMonth,
  storesUsed,
}: SubscriptionClientProps) {
  const [modalPlan, setModalPlan] = useState<Plan | null>(null)
  const limits = getPlanLimits(currentPlan)
  const cfg = PLAN_CONFIG[currentPlan]

  return (
    <div className="space-y-6">
      {/* Current plan badge */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[var(--text-3)]">Paket Saat Ini</p>
            <div className="mt-1 flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <h2 className="text-xl font-bold text-[var(--text-1)]">{planLabel(currentPlan)}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
                {cfg.badge}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-2)]">
              {currentPlan === 'FREE'
                ? 'Cocok untuk bisnis yang baru memulai'
                : currentPlan === 'PRO'
                ? 'Untuk bisnis yang sedang berkembang'
                : 'Solusi lengkap untuk enterprise'}
            </p>
          </div>
          {currentPlan !== 'ENTERPRISE' && (
            <button
              onClick={() => setModalPlan(currentPlan === 'FREE' ? 'PRO' : 'ENTERPRISE')}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300"
            >
              <Crown className="h-4 w-4" />
              Upgrade Sekarang
            </button>
          )}
        </div>

        {/* Usage meters */}
        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
          <p className="text-xs font-semibold text-[var(--text-2)]">Penggunaan Bulan Ini</p>
          <UsageMeter
            label="Produk"
            current={productsUsed}
            limit={limits.maxProducts}
            icon={Package}
          />
          <UsageMeter
            label="Toko"
            current={storesUsed}
            limit={limits.maxStores}
            icon={Store}
          />
          <UsageMeter
            label="Transaksi Bulan Ini"
            current={ordersThisMonth}
            limit={-1}
            icon={TrendingUp}
          />
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-sm font-bold text-[var(--text-1)]">Perbandingan Paket</h3>
          <p className="mt-0.5 text-xs text-[var(--text-2)]">Pilih paket yang sesuai dengan kebutuhan bisnis kamu</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 px-5 py-3 text-left text-xs font-semibold text-[var(--text-2)]">Fitur</th>
                {PLANS.map(plan => {
                  const c = PLAN_CONFIG[plan]
                  const isActive = plan === currentPlan
                  return (
                    <th
                      key={plan}
                      className={`px-4 py-3 text-center ${isActive ? c.headerBg : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.badgeBg} ${c.badgeText}`}>
                          {c.badge}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-medium text-[var(--text-3)]">Paket kamu</span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {/* Store row */}
              <tr>
                <td className="flex items-center gap-2 px-5 py-3 text-xs font-medium text-[var(--text-2)]">
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  Jumlah Toko
                </td>
                {PLANS.map(plan => {
                  const l = getPlanLimits(plan)
                  const isActive = plan === currentPlan
                  return (
                    <td key={plan} className={`px-4 py-3 text-center text-xs font-semibold ${isActive ? PLAN_CONFIG[plan].headerBg : ''} ${isActive ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}>
                      {l.maxStores === -1 ? '∞' : l.maxStores}
                    </td>
                  )
                })}
              </tr>
              {/* Products row */}
              <tr>
                <td className="flex items-center gap-2 px-5 py-3 text-xs font-medium text-[var(--text-2)]">
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  Produk
                </td>
                {PLANS.map(plan => {
                  const l = getPlanLimits(plan)
                  const isActive = plan === currentPlan
                  return (
                    <td key={plan} className={`px-4 py-3 text-center text-xs font-semibold ${isActive ? PLAN_CONFIG[plan].headerBg : ''} ${isActive ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}>
                      {l.maxProducts === -1 ? '∞' : l.maxProducts.toLocaleString('id-ID')}
                    </td>
                  )
                })}
              </tr>
              {/* Cashiers row */}
              <tr>
                <td className="flex items-center gap-2 px-5 py-3 text-xs font-medium text-[var(--text-2)]">
                  <Headphones className="h-3.5 w-3.5 shrink-0" />
                  Kasir
                </td>
                {PLANS.map(plan => {
                  const l = getPlanLimits(plan)
                  const isActive = plan === currentPlan
                  return (
                    <td key={plan} className={`px-4 py-3 text-center text-xs font-semibold ${isActive ? PLAN_CONFIG[plan].headerBg : ''} ${isActive ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}>
                      {l.maxCashiers === -1 ? '∞' : l.maxCashiers}
                    </td>
                  )
                })}
              </tr>
              {/* Feature rows */}
              {FEATURE_ROWS.map(({ feature, label, icon: Icon }) => (
                <tr key={feature}>
                  <td className="flex items-center gap-2 px-5 py-3 text-xs font-medium text-[var(--text-2)]">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </td>
                  {PLANS.map(plan => {
                    const isActive = plan === currentPlan
                    return (
                      <td key={plan} className={`px-4 py-3 ${isActive ? PLAN_CONFIG[plan].headerBg : ''}`}>
                        <FeatureCell allowed={isFeatureAllowed(plan, feature)} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            {/* CTA row */}
            <tfoot>
              <tr className="border-t border-[var(--border)]">
                <td className="px-5 py-4 text-xs font-semibold text-[var(--text-2)]">Harga / bulan</td>
                {PLANS.map(plan => {
                  const c = PLAN_CONFIG[plan]
                  const isActive = plan === currentPlan
                  return (
                    <td key={plan} className={`px-4 py-4 text-center ${isActive ? c.headerBg : ''}`}>
                      <div className="flex flex-col items-center gap-2">
                        <div>
                          <p className="text-sm font-bold text-[var(--text-1)]">{c.price}</p>
                          {c.period && <p className="text-[10px] text-[var(--text-3)]">{c.period}</p>}
                        </div>
                        {isActive ? (
                          <span className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text-3)]">
                            Aktif
                          </span>
                        ) : (
                          <button
                            onClick={() => setModalPlan(plan)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${c.btnClass}`}
                          >
                            {plan === 'ENTERPRISE' ? 'Hubungi Kami' : 'Upgrade'}
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Upgrade modal */}
      {modalPlan && modalPlan !== currentPlan && (
        <PaymentModal targetPlan={modalPlan} onClose={() => setModalPlan(null)} />
      )}
    </div>
  )
}

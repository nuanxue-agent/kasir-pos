'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Store,
  Receipt,
  Package,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  ShoppingBag,
  Sparkles,
  Globe,
  Database,
  Users,
  BookOpen,
  ShoppingCart,
  BarChart3,
  Heart,
  UserCheck,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORE_TYPES = [
  { id: 'Retail', emoji: '🛍️', label: 'Retail', desc: 'Clothing, electronics, accessories' },
  {
    id: 'Food & Beverage',
    emoji: '🍜',
    label: 'Food & Beverage',
    desc: 'Restaurant, café, warung',
  },
  { id: 'Service', emoji: '🔧', label: 'Service', desc: 'Salon, laundry, workshop' },
  {
    id: 'Manufacturing',
    emoji: '🏭',
    label: 'Manufacturing',
    desc: 'Production, assembly, fabrication',
  },
  { id: 'Other', emoji: '🏪', label: 'Other', desc: 'Customize later' },
]

const CURRENCIES = [
  { code: 'IDR', label: 'IDR — Indonesian Rupiah' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
]

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta — WIB (UTC+7)' },
  { value: 'Asia/Makassar', label: 'Asia/Makassar — WITA (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'Asia/Jayapura — WIT (UTC+9)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore — SGT (UTC+8)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur — MYT (UTC+8)' },
  { value: 'Europe/London', label: 'Europe/London — GMT/BST' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin — CET/CEST (UTC+1/2)' },
  { value: 'America/New_York', label: 'America/New_York — EST/EDT' },
  { value: 'UTC', label: 'UTC' },
]

const MODULES = [
  { id: 'pos', icon: ShoppingCart, label: 'POS', desc: 'Point of sale & cashier', color: 'amber' },
  {
    id: 'inventory',
    icon: Package,
    label: 'Inventory',
    desc: 'Stock & product management',
    color: 'blue',
  },
  {
    id: 'accounting',
    icon: BarChart3,
    label: 'Accounting',
    desc: 'GL, P&L, balance sheet',
    color: 'green',
  },
  { id: 'hr', icon: UserCheck, label: 'HR', desc: 'Employees & payroll', color: 'purple' },
  { id: 'crm', icon: Users, label: 'CRM', desc: 'Customers & pipeline', color: 'rose' },
  { id: 'loyalty', icon: Heart, label: 'Loyalty', desc: 'Points & rewards program', color: 'pink' },
] as const

type ModuleId = (typeof MODULES)[number]['id']

const STEPS = [
  { id: 'store_setup', label: 'Store Info' },
  { id: 'modules', label: 'Modules' },
  { id: 'seed_data', label: 'Demo Data' },
  { id: 'done', label: 'Done' },
] as const

type StepId = (typeof STEPS)[number]['id']

const inputCls =
  'w-full bg-[var(--bg-card,#fafaf9)] border border-[var(--border,#e7e5e4)] rounded-xl px-4 py-3 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  userName: string
  storeName: string
  storeId: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingWizard({ userName, storeName, storeId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<StepId>('store_setup')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — Store Info
  const [storeSetup, setStoreSetup] = useState({
    name: storeName,
    address: '',
    phone: '',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    storeType: '' as string,
  })

  // Step 2 — Modules
  const [modules, setModules] = useState<Set<ModuleId>>(new Set(['pos', 'inventory']))

  // Step 3 — Seed Data
  const [seedProducts, setSeedProducts] = useState(true)

  // Summary
  const [seededItems, setSeededItems] = useState<string[]>([])

  const stepIndex = STEPS.findIndex(s => s.id === step)

  function toggleModule(id: ModuleId) {
    setModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async function handleNext() {
    setSaving(true)
    setError('')
    try {
      if (step === 'store_setup') {
        const res = await fetch('/api/settings/store', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            name: storeSetup.name,
            address: storeSetup.address,
            phone: storeSetup.phone,
            currency: storeSetup.currency,
            timezone: storeSetup.timezone,
          }),
        })
        if (!res.ok) throw new Error('Failed to save store info')
        setStep('modules')
      } else if (step === 'modules') {
        // Save enabled modules to store settings
        const res = await fetch('/api/settings/store', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            modules: Array.from(modules),
          }),
        })
        if (!res.ok) throw new Error('Failed to save modules')
        setStep('seed_data')
      } else if (step === 'seed_data') {
        if (seedProducts) {
          const res = await fetch('/api/onboarding/seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId,
              storeType: storeSetup.storeType || 'Other',
              products: true,
              accounts: modules.has('accounting'),
              customers: modules.has('crm'),
            }),
          })
          if (!res.ok) throw new Error('Failed to seed data')
          const json = (await res.json()) as any
          setSeededItems(json.seeded ?? [])
        }
        await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'complete', data: {} }),
        })
        setStep('done')
      } else if (step === 'done') {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-[#fffdf7]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-[var(--bg-card)] px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold text-stone-800">Lakoo</span>
        </div>
        <span className="text-xs text-stone-400">
          Step {stepIndex + 1} of {STEPS.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-stone-100">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
          style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 px-4 pt-5">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all',
                i < stepIndex
                  ? 'bg-amber-500 text-white'
                  : i === stepIndex
                    ? 'bg-amber-500 text-white ring-4 ring-amber-100'
                    : 'bg-stone-100 text-stone-400',
              )}
            >
              {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'hidden text-xs font-medium sm:block',
                i === stepIndex ? 'text-stone-700' : 'text-stone-400',
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn('h-px w-8', i < stepIndex ? 'bg-amber-300' : 'bg-stone-200')} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-start px-4 py-8 sm:py-10">
        <div className="w-full max-w-lg">
          {/* ── Step 1: Store Info ── */}
          {step === 'store_setup' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mb-2 text-3xl">👋</div>
                <h1 className="text-2xl font-bold text-stone-800">
                  Welcome, {userName.split(' ')[0]}!
                </h1>
                <p className="mt-1.5 text-sm text-stone-500">
                  Let's set up your store in a few steps.
                </p>
              </div>

              <div className="space-y-4 rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card,#fff)] p-5 shadow-sm">
                {/* Store name */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-stone-500">
                    Store Name *
                  </label>
                  <input
                    value={storeSetup.name}
                    onChange={e => setStoreSetup(s => ({ ...s, name: e.target.value }))}
                    className={inputCls}
                    placeholder="Warung Saya"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-stone-500">
                    Address
                  </label>
                  <textarea
                    rows={2}
                    value={storeSetup.address}
                    onChange={e => setStoreSetup(s => ({ ...s, address: e.target.value }))}
                    className={inputCls}
                    placeholder="Jl. Merdeka No. 1, Jakarta"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-stone-500">Phone</label>
                  <input
                    type="tel"
                    value={storeSetup.phone}
                    onChange={e => setStoreSetup(s => ({ ...s, phone: e.target.value }))}
                    className={inputCls}
                    placeholder="+62 21 1234 5678"
                  />
                </div>

                {/* Store type */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-stone-500">
                    Store Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STORE_TYPES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setStoreSetup(s => ({ ...s, storeType: t.id }))}
                        className={cn(
                          'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.98]',
                          storeSetup.storeType === t.id
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-stone-100 bg-stone-50 hover:border-stone-200',
                        )}
                      >
                        <span className="text-xl">{t.emoji}</span>
                        <p
                          className={cn(
                            'text-xs leading-tight font-semibold',
                            storeSetup.storeType === t.id ? 'text-amber-700' : 'text-stone-700',
                          )}
                        >
                          {t.label}
                        </p>
                        <p className="text-[10px] leading-snug text-stone-400">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Currency & Timezone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-stone-500">
                      Currency
                    </label>
                    <select
                      value={storeSetup.currency}
                      onChange={e => setStoreSetup(s => ({ ...s, currency: e.target.value }))}
                      className={inputCls}
                    >
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-stone-500">
                      Timezone
                    </label>
                    <select
                      value={storeSetup.timezone}
                      onChange={e => setStoreSetup(s => ({ ...s, timezone: e.target.value }))}
                      className={inputCls}
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              <NextButton
                onClick={handleNext}
                disabled={!storeSetup.name.trim() || saving}
                saving={saving}
              />
            </div>
          )}

          {/* ── Step 2: Modules ── */}
          {step === 'modules' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200">
                  <Layers className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800">Choose Modules</h1>
                <p className="mt-1.5 text-sm text-stone-500">
                  Select the features you want to enable. You can always change this later.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {MODULES.map(m => {
                  const active = modules.has(m.id)
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleModule(m.id)}
                      className={cn(
                        'relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.97]',
                        active
                          ? 'border-amber-400 bg-amber-50 shadow-sm shadow-amber-100'
                          : 'border-[var(--border,#e7e5e4)] bg-[var(--bg-card,#fafaf9)] hover:border-stone-300',
                      )}
                      aria-pressed={active}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500">
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        </span>
                      )}
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-xl',
                          active ? 'bg-amber-100' : 'bg-stone-100',
                        )}
                      >
                        <Icon
                          className={cn('h-5 w-5', active ? 'text-amber-600' : 'text-stone-400')}
                        />
                      </div>
                      <div>
                        <p
                          className={cn(
                            'text-sm font-bold',
                            active ? 'text-amber-800' : 'text-stone-700',
                          )}
                        >
                          {m.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-stone-400">{m.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className="text-center text-xs text-stone-400">
                {modules.size === 0
                  ? 'Select at least one module to continue.'
                  : `${modules.size} module${modules.size > 1 ? 's' : ''} selected`}
              </p>

              {error && <ErrorBanner message={error} />}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('store_setup')}
                  className="rounded-xl border border-[var(--border,#e7e5e4)] px-5 py-3 text-sm font-medium text-stone-600 transition-all hover:bg-stone-50"
                >
                  Back
                </button>
                <NextButton
                  onClick={handleNext}
                  disabled={modules.size === 0 || saving}
                  saving={saving}
                  flex1
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Demo Data ── */}
          {step === 'seed_data' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200">
                  <Database className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800">Demo Products</h1>
                <p className="mt-1.5 text-sm text-stone-500">
                  Seed your store with sample products to explore the POS right away.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card,#fff)] p-5 shadow-sm">
                {/* Yes/No toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                        seedProducts ? 'bg-amber-100' : 'bg-stone-100',
                      )}
                    >
                      <Package
                        className={cn(
                          'h-5 w-5',
                          seedProducts ? 'text-amber-600' : 'text-stone-400',
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-800">Add sample products</p>
                      <p className="mt-0.5 text-xs text-stone-400">
                        13 demo products across categories
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={seedProducts}
                    onClick={() => setSeedProducts(v => !v)}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 focus:outline-none',
                      seedProducts ? 'bg-amber-500' : 'bg-stone-200',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--bg-card)] shadow-md ring-0 transition-transform',
                        seedProducts ? 'translate-x-5' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>

                {seedProducts && (
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4 text-center">
                    {[
                      { emoji: '🍚', label: 'Makanan', count: 5 },
                      { emoji: '🥤', label: 'Minuman', count: 5 },
                      { emoji: '🍿', label: 'Snack', count: 3 },
                    ].map(cat => (
                      <div key={cat.label} className="rounded-xl bg-amber-50 p-2.5">
                        <div className="text-xl">{cat.emoji}</div>
                        <p className="mt-1 text-[11px] font-semibold text-stone-700">{cat.label}</p>
                        <p className="text-[10px] text-stone-400">{cat.count} items</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-stone-400">
                Demo data can be deleted anytime from the dashboard.
              </p>

              {error && <ErrorBanner message={error} />}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('modules')}
                  className="rounded-xl border border-[var(--border,#e7e5e4)] px-5 py-3 text-sm font-medium text-stone-600 transition-all hover:bg-stone-50"
                >
                  Back
                </button>
                <NextButton
                  onClick={handleNext}
                  disabled={saving}
                  saving={saving}
                  label={saving ? 'Setting up…' : 'Finish Setup'}
                  flex1
                />
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 'done' && (
            <div className="space-y-6 text-center">
              <div>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl shadow-amber-200">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <h1 className="mt-5 text-2xl font-bold text-stone-800">Your store is ready! 🎉</h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
                  Setup complete. Here's what was configured:
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card,#fff)] p-5 text-left shadow-sm">
                <SummaryRow icon={Store} label="Store name" value={storeSetup.name} />
                {storeSetup.address && (
                  <SummaryRow icon={Globe} label="Address" value={storeSetup.address} />
                )}
                <SummaryRow
                  icon={Globe}
                  label="Currency & timezone"
                  value={`${storeSetup.currency} · ${storeSetup.timezone}`}
                />
                <SummaryRow
                  icon={Layers}
                  label="Modules enabled"
                  value={Array.from(modules)
                    .map(m => MODULES.find(x => x.id === m)?.label ?? m)
                    .join(', ')}
                />
                {seededItems.length > 0 && (
                  <SummaryRow icon={Database} label="Seeded" value={seededItems.join(', ')} />
                )}
              </div>

              <a
                href="/dashboard"
                onClick={e => {
                  e.preventDefault()
                  router.push('/dashboard')
                  router.refresh()
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-bold text-white shadow-lg shadow-amber-200 transition-all hover:shadow-amber-300 active:scale-[0.98]"
              >
                Go to Dashboard <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function NextButton({
  onClick,
  disabled,
  saving,
  label,
  flex1,
}: {
  onClick: () => void
  disabled: boolean
  saving: boolean
  label?: string
  flex1?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 disabled:cursor-not-allowed disabled:opacity-40',
        flex1 ? 'flex-1' : 'w-full',
      )}
    >
      {saving
        ? (label ?? 'Saving…')
        : (label ?? (
            <>
              Next <ChevronRight className="h-4 w-4" />
            </>
          ))}
    </button>
  )
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
        <Icon className="h-3.5 w-3.5 text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-400">{label}</p>
        <p className="truncate text-sm font-medium text-stone-700">{value}</p>
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
      {message}
    </p>
  )
}

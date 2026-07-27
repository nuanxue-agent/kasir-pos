'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Store, Receipt, Package, CheckCircle2, ChevronRight, ArrowRight,
  ShoppingBag, Sparkles, Globe, Database, Users, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORE_TYPES = [
  { id: 'Retail',           emoji: '🛍️', label: 'Retail',            desc: 'Clothing, electronics, accessories' },
  { id: 'Food & Beverage',  emoji: '🍜', label: 'Food & Beverage',    desc: 'Restaurant, café, warung' },
  { id: 'Service',          emoji: '🔧', label: 'Service',            desc: 'Salon, laundry, workshop' },
  { id: 'Manufacturing',    emoji: '🏭', label: 'Manufacturing',      desc: 'Production, assembly, fabrication' },
  { id: 'Other',            emoji: '🏪', label: 'Other',              desc: 'Customize later' },
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
  { value: 'Asia/Jakarta',   label: 'Asia/Jakarta — WIB (UTC+7)' },
  { value: 'Asia/Makassar',  label: 'Asia/Makassar — WITA (UTC+8)' },
  { value: 'Asia/Jayapura',  label: 'Asia/Jayapura — WIT (UTC+9)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore — SGT (UTC+8)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur — MYT (UTC+8)' },
  { value: 'Europe/London',  label: 'Europe/London — GMT/BST' },
  { value: 'Europe/Berlin',  label: 'Europe/Berlin — CET/CEST (UTC+1/2)' },
  { value: 'America/New_York', label: 'America/New_York — EST/EDT' },
  { value: 'UTC',            label: 'UTC' },
]

const STEPS = [
  { id: 'store_setup',   label: 'Store Setup' },
  { id: 'receipt_tax',   label: 'Receipt & Tax' },
  { id: 'seed_data',     label: 'Seed Data' },
  { id: 'done',          label: 'Done' },
] as const

type StepId = typeof STEPS[number]['id']

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userName: string
  storeName: string
  storeId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingWizard({ userName, storeName, storeId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<StepId>('store_setup')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — Store Setup
  const [storeSetup, setStoreSetup] = useState({
    name: storeName,
    storeType: '' as string,
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
  })

  // Step 2 — Receipt & Tax
  const [receiptTax, setReceiptTax] = useState({
    taxRate: 11,
    receiptNote: '',
    phone: '',
    address: '',
  })

  // Step 3 — Seed Data
  const [seedData, setSeedData] = useState({
    products: true,
    accounts: true,
    customers: true,
  })

  // What was seeded (for summary)
  const [seededItems, setSeededItems] = useState<string[]>([])

  const stepIndex = STEPS.findIndex(s => s.id === step)

  // ─── Navigation ─────────────────────────────────────────────────────────────

  async function handleNext() {
    setSaving(true)
    setError('')
    try {
      if (step === 'store_setup') {
        // PATCH /api/settings/store — step 1 fields
        const res = await fetch('/api/settings/store', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            name: storeSetup.name,
            currency: storeSetup.currency,
            timezone: storeSetup.timezone,
          }),
        })
        if (!res.ok) throw new Error('Failed to save store setup')
        setStep('receipt_tax')

      } else if (step === 'receipt_tax') {
        // PATCH /api/settings/store — step 2 fields
        const res = await fetch('/api/settings/store', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            taxRate: receiptTax.taxRate / 100,
            receiptNote: receiptTax.receiptNote,
            phone: receiptTax.phone,
            address: receiptTax.address,
          }),
        })
        if (!res.ok) throw new Error('Failed to save receipt/tax settings')
        setStep('seed_data')

      } else if (step === 'seed_data') {
        const anySelected = seedData.products || seedData.accounts || seedData.customers
        if (anySelected) {
          const res = await fetch('/api/onboarding/seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId,
              storeType: storeSetup.storeType || 'Other',
              ...seedData,
            }),
          })
          if (!res.ok) throw new Error('Failed to seed data')
          const json = await res.json() as any
          setSeededItems(json.seeded ?? [])
        }
        // Mark onboarding complete
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

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#fffdf7] flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-stone-800 text-lg">Lakoo</span>
        </div>
        <span className="text-xs text-stone-400">Step {stepIndex + 1} of {STEPS.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-stone-100">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
          style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 pt-5 px-4">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-all',
              i < stepIndex  ? 'bg-amber-500 text-white' :
              i === stepIndex ? 'bg-amber-500 text-white ring-4 ring-amber-100' :
              'bg-stone-100 text-stone-400'
            )}>
              {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn(
              'text-xs font-medium hidden sm:block',
              i === stepIndex ? 'text-stone-700' : 'text-stone-400'
            )}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn('w-6 h-px', i < stepIndex ? 'bg-amber-300' : 'bg-stone-200')} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8 sm:py-10">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Store Setup ── */}
          {step === 'store_setup' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-3xl mb-2">👋</div>
                <h1 className="text-2xl font-bold text-stone-800">Welcome, {userName.split(' ')[0]}!</h1>
                <p className="text-stone-500 mt-1.5 text-sm">Let's set up your store in a few steps.</p>
              </div>

              <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm space-y-4">
                {/* Store name */}
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Store Name *</label>
                  <input
                    value={storeSetup.name}
                    onChange={e => setStoreSetup(s => ({ ...s, name: e.target.value }))}
                    className={inputCls}
                    placeholder="My Awesome Store"
                  />
                </div>

                {/* Store type */}
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-2 block">Store Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STORE_TYPES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setStoreSetup(s => ({ ...s, storeType: t.id }))}
                        className={cn(
                          'flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                          storeSetup.storeType === t.id
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-stone-100 bg-stone-50 hover:border-stone-200'
                        )}
                      >
                        <span className="text-xl">{t.emoji}</span>
                        <p className={cn('text-xs font-semibold leading-tight', storeSetup.storeType === t.id ? 'text-amber-700' : 'text-stone-700')}>
                          {t.label}
                        </p>
                        <p className="text-[10px] text-stone-400 leading-snug">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Currency & Timezone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Currency</label>
                    <select
                      value={storeSetup.currency}
                      onChange={e => setStoreSetup(s => ({ ...s, currency: e.target.value }))}
                      className={inputCls}
                    >
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Timezone</label>
                    <select
                      value={storeSetup.timezone}
                      onChange={e => setStoreSetup(s => ({ ...s, timezone: e.target.value }))}
                      className={inputCls}
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
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

          {/* ── Step 2: Receipt & Tax ── */}
          {step === 'receipt_tax' && (
            <div className="space-y-6">
              <div className="text-center">
                <Receipt className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                <h1 className="text-2xl font-bold text-stone-800">Receipt & Tax</h1>
                <p className="text-stone-500 mt-1.5 text-sm">Configure your tax rate and receipt details.</p>
              </div>

              <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm space-y-4">
                {/* Tax rate */}
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
                    Tax Rate (%) <span className="text-stone-400 font-normal">— 0 to 30</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={receiptTax.taxRate}
                    onChange={e => setReceiptTax(r => ({ ...r, taxRate: Number(e.target.value) }))}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-stone-400 mt-1">Indonesia default: 11% (PPN)</p>
                </div>

                {/* Receipt header */}
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Receipt Header Message</label>
                  <textarea
                    rows={2}
                    value={receiptTax.receiptNote}
                    onChange={e => setReceiptTax(r => ({ ...r, receiptNote: e.target.value }))}
                    className={inputCls}
                    placeholder="Thank you for shopping with us!"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Store Phone</label>
                  <input
                    type="tel"
                    value={receiptTax.phone}
                    onChange={e => setReceiptTax(r => ({ ...r, phone: e.target.value }))}
                    className={inputCls}
                    placeholder="+62 21 1234 5678"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Store Address</label>
                  <textarea
                    rows={2}
                    value={receiptTax.address}
                    onChange={e => setReceiptTax(r => ({ ...r, address: e.target.value }))}
                    className={inputCls}
                    placeholder="Jl. Merdeka No. 1, Jakarta"
                  />
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('store_setup')}
                  className="px-5 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-all"
                >
                  Back
                </button>
                <NextButton onClick={handleNext} disabled={saving} saving={saving} flex1 />
              </div>
            </div>
          )}

          {/* ── Step 3: Seed Data ── */}
          {step === 'seed_data' && (
            <div className="space-y-6">
              <div className="text-center">
                <Database className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                <h1 className="text-2xl font-bold text-stone-800">Seed Data</h1>
                <p className="text-stone-500 mt-1.5 text-sm">
                  Optionally pre-populate your store with demo data to get started faster.
                </p>
              </div>

              <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm space-y-3">
                <SeedOption
                  icon={Package}
                  title="Add sample products"
                  desc={`5 demo products matching your store type (${storeSetup.storeType || 'General'})`}
                  checked={seedData.products}
                  onChange={v => setSeedData(s => ({ ...s, products: v }))}
                />
                <SeedOption
                  icon={BookOpen}
                  title="Set up Chart of Accounts"
                  desc="20 default GL accounts (assets, liabilities, equity, revenue, expenses)"
                  checked={seedData.accounts}
                  onChange={v => setSeedData(s => ({ ...s, accounts: v }))}
                />
                <SeedOption
                  icon={Users}
                  title="Add sample customers"
                  desc="3 demo customers with loyalty points"
                  checked={seedData.customers}
                  onChange={v => setSeedData(s => ({ ...s, customers: v }))}
                />
              </div>

              <p className="text-center text-xs text-stone-400">
                All demo data can be deleted later from the dashboard.
              </p>

              {error && <ErrorBanner message={error} />}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('receipt_tax')}
                  className="px-5 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-all"
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
            <div className="text-center space-y-6">
              <div>
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto shadow-xl shadow-amber-200">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800 mt-5">Your store is ready! 🎉</h1>
                <p className="text-stone-500 mt-2 text-sm leading-relaxed max-w-sm mx-auto">
                  Setup complete. Here's what was configured:
                </p>
              </div>

              {/* Summary */}
              <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm text-left space-y-3">
                <SummaryRow icon={Store} label="Store name" value={storeSetup.name} />
                {storeSetup.storeType && (
                  <SummaryRow
                    icon={Globe}
                    label="Store type"
                    value={STORE_TYPES.find(t => t.id === storeSetup.storeType)?.label ?? storeSetup.storeType}
                  />
                )}
                <SummaryRow
                  icon={Globe}
                  label="Currency & timezone"
                  value={`${storeSetup.currency} · ${storeSetup.timezone}`}
                />
                <SummaryRow
                  icon={Receipt}
                  label="Tax rate"
                  value={`${receiptTax.taxRate}%`}
                />
                {seededItems.length > 0 && (
                  <SummaryRow
                    icon={Database}
                    label="Seeded"
                    value={seededItems.join(', ')}
                  />
                )}
              </div>

              <button
                onClick={handleNext}
                disabled={saving}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-base shadow-lg shadow-amber-200 hover:shadow-amber-300 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {saving ? 'Loading…' : <>Go to Dashboard <ArrowRight className="h-5 w-5" /></>}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NextButton({
  onClick, disabled, saving, label, flex1,
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
        'py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2',
        flex1 ? 'flex-1' : 'w-full'
      )}
    >
      {saving
        ? (label?.replace('…', '') ? label : 'Saving…')
        : (label ?? <>Next <ChevronRight className="h-4 w-4" /></>)
      }
    </button>
  )
}

function SeedOption({
  icon: Icon, title, desc, checked, onChange,
}: {
  icon: React.ElementType
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className={cn(
      'flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
      checked ? 'border-amber-300 bg-amber-50' : 'border-stone-100 bg-stone-50 hover:border-stone-200'
    )}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 accent-amber-500 w-4 h-4 shrink-0"
      />
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        checked ? 'bg-amber-100' : 'bg-stone-100'
      )}>
        <Icon className={cn('h-4 w-4', checked ? 'text-amber-600' : 'text-stone-400')} />
      </div>
      <div>
        <p className={cn('text-sm font-semibold', checked ? 'text-stone-800' : 'text-stone-500')}>{title}</p>
        <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
      </div>
    </label>
  )
}

function SummaryRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-400">{label}</p>
        <p className="text-sm font-medium text-stone-700 truncate">{value}</p>
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      {message}
    </p>
  )
}

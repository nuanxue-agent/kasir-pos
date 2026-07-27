'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Loader2, Mail, Lock, User, Building2, ArrowRight, ShoppingBag,
  CheckCircle, ChevronRight, Store,
} from 'lucide-react'

// ── Schemas per step ──────────────────────────────────────────────────────────

const step1Schema = z.object({
  name: z.string().min(2, 'Nama kamu minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
})

const step2Schema = z.object({
  businessName: z.string().min(2, 'Nama usaha minimal 2 karakter'),
  businessType: z.string().min(1, 'Pilih jenis usaha'),
  phone: z.string().optional(),
})

const step3Schema = z.object({
  plan: z.enum(['free', 'pro']),
  agreeTerms: z.literal(true, { message: 'Kamu harus menyetujui syarat & ketentuan' }),
})

type Step1Form = z.infer<typeof step1Schema>
type Step2Form = z.infer<typeof step2Schema>
type Step3Form = z.infer<typeof step3Schema>

// ── Shared style ──────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-3 pl-10 pr-4 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-all focus:border-amber-400 focus:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2 focus:ring-amber-400/20'

const inputNoIconClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-3 px-4 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-all focus:border-amber-400 focus:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2 focus:ring-amber-400/20'

// ── Step labels ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Akun' },
  { id: 2, label: 'Info Toko' },
  { id: 3, label: 'Pilih Paket' },
]

// ── Plan cards ────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free' as const,
    name: 'FREE',
    label: 'Gratis',
    price: 'Rp 0',
    per: '/bulan',
    features: ['1 toko', '2 kasir', '100 produk', 'Laporan dasar'],
    highlight: false,
  },
  {
    id: 'pro' as const,
    name: 'PRO',
    label: 'Pro',
    price: 'Rp 99rb',
    per: '/bulan',
    features: ['3 toko', '10 kasir', 'Produk tak terbatas', 'Laporan lengkap', 'Poin loyalitas'],
    highlight: true,
  },
]

// ── Progress indicator ────────────────────────────────────────────────────────

function ProgressIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0" aria-label="Progress">
      {STEPS.map((step, idx) => {
        const done = current > step.id
        const active = current === step.id
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  done
                    ? 'bg-amber-500 text-white'
                    : active
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-200'
                    : 'border-2 border-stone-200 bg-white text-stone-400'
                }`}
              >
                {done ? <CheckCircle className="h-4 w-4" /> : step.id}
              </div>
              <span
                className={`text-[10px] font-medium ${
                  active ? 'text-amber-600' : done ? 'text-stone-500' : 'text-stone-300'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`mx-2 mb-4 h-0.5 w-10 rounded-full transition-colors ${
                  current > step.id ? 'bg-amber-400' : 'bg-stone-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Accumulated data across steps
  const [step1Data, setStep1Data] = useState<Step1Form | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Form | null>(null)

  // ── Step 1 form ──
  const form1 = useForm<Step1Form>({ resolver: zodResolver(step1Schema) })

  // ── Step 2 form ──
  const form2 = useForm<Step2Form>({ resolver: zodResolver(step2Schema) })

  // ── Step 3 form ──
  const form3 = useForm<Step3Form>({
    resolver: zodResolver(step3Schema),
    defaultValues: { plan: 'free' },
  })

  const onStep1 = (data: Step1Form) => {
    setStep1Data(data)
    setStep(2)
  }

  const onStep2 = (data: Step2Form) => {
    setStep2Data(data)
    setStep(3)
  }

  const onStep3 = async (data: Step3Form) => {
    if (!step1Data || !step2Data) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: step1Data.name,
          email: step1Data.email,
          password: step1Data.password,
          businessName: step2Data.businessName,
          businessType: step2Data.businessType,
          phone: step2Data.phone,
          plan: data.plan,
        }),
      })
      const result = await res.json() as { error?: string; redirect?: string }
      if (!res.ok) { setError(result.error || 'Pendaftaran gagal'); return }
      router.push(result.redirect ?? '/onboarding')
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[var(--shadow-md)]">
          <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight text-[var(--text-1)]">Kasir POS</span>
      </div>

      {/* Progress */}
      <ProgressIndicator current={step} />

      {/* Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-lg)]">

        {/* ── Step 1: Account ── */}
        {step === 1 && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Buat akun gratis</h1>
              <p className="mt-1.5 text-sm text-[var(--text-3)]">Tidak perlu kartu kredit. Siap pakai dalam 5 menit.</p>
            </div>

            <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-[var(--text-2)]">Nama Kamu</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                  <input {...form1.register('name')} type="text" id="name" autoComplete="name" className={inputClass} placeholder="Ahmad Rizky" />
                </div>
                {form1.formState.errors.name && <p className="text-xs text-[var(--danger)]">{form1.formState.errors.name.message}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-[var(--text-2)]">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                  <input {...form1.register('email')} type="email" id="email" autoComplete="email" className={inputClass} placeholder="kamu@email.com" />
                </div>
                {form1.formState.errors.email && <p className="text-xs text-[var(--danger)]">{form1.formState.errors.email.message}</p>}
              </div>

              {/* Password row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--text-2)]">Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                    <input {...form1.register('password')} type="password" id="password" autoComplete="new-password" className={inputClass} placeholder="Min. 8 karakter" />
                  </div>
                  {form1.formState.errors.password && <p className="text-xs text-[var(--danger)]">{form1.formState.errors.password.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--text-2)]">Ulangi Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                    <input {...form1.register('confirmPassword')} type="password" id="confirmPassword" autoComplete="new-password" className={inputClass} placeholder="••••••••" />
                  </div>
                  {form1.formState.errors.confirmPassword && <p className="text-xs text-[var(--danger)]">{form1.formState.errors.confirmPassword.message}</p>}
                </div>
              </div>

              <button
                type="submit"
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600"
              >
                Lanjut — Info Toko
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </form>
          </>
        )}

        {/* ── Step 2: Store Info ── */}
        {step === 2 && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Info toko kamu</h1>
              <p className="mt-1.5 text-sm text-[var(--text-3)]">Kami sesuaikan tampilan untuk bisnis kamu.</p>
            </div>

            <form onSubmit={form2.handleSubmit(onStep2)} className="space-y-4">
              {/* Business name */}
              <div className="space-y-1.5">
                <label htmlFor="businessName" className="block text-sm font-medium text-[var(--text-2)]">Nama Usaha / Toko</label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                  <input {...form2.register('businessName')} type="text" id="businessName" autoComplete="organization" className={inputClass} placeholder="Warung Sari Rasa" />
                </div>
                {form2.formState.errors.businessName && <p className="text-xs text-[var(--danger)]">{form2.formState.errors.businessName.message}</p>}
              </div>

              {/* Business type */}
              <div className="space-y-1.5">
                <label htmlFor="businessType" className="block text-sm font-medium text-[var(--text-2)]">Jenis Usaha</label>
                <div className="relative">
                  <Store className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                  <select
                    {...form2.register('businessType')}
                    id="businessType"
                    className={inputClass}
                    defaultValue=""
                  >
                    <option value="" disabled>Pilih jenis usaha…</option>
                    <option value="warung">Warung / Kantin</option>
                    <option value="retail">Toko Retail</option>
                    <option value="cafe">Kafe / Minuman</option>
                    <option value="resto">Restoran / Rumah Makan</option>
                    <option value="fashion">Fashion / Pakaian</option>
                    <option value="salon">Salon / Kecantikan</option>
                    <option value="other">Lainnya</option>
                  </select>
                </div>
                {form2.formState.errors.businessType && <p className="text-xs text-[var(--danger)]">{form2.formState.errors.businessType.message}</p>}
              </div>

              {/* Phone (optional) */}
              <div className="space-y-1.5">
                <label htmlFor="phone" className="block text-sm font-medium text-[var(--text-2)]">
                  Nomor HP <span className="text-[var(--text-3)] font-normal">(opsional)</span>
                </label>
                <input {...form2.register('phone')} type="tel" id="phone" autoComplete="tel" className={inputNoIconClass} placeholder="08xxxxxxxxxx" />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-2)] hover:border-amber-300 hover:text-amber-700 transition-all"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  className="group flex flex-[2] items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600"
                >
                  Lanjut — Pilih Paket
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Step 3: Choose Plan ── */}
        {step === 3 && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Pilih paket kamu</h1>
              <p className="mt-1.5 text-sm text-[var(--text-3)]">Bisa upgrade kapan saja. Mulai gratis, tidak perlu kartu kredit.</p>
            </div>

            <form onSubmit={form3.handleSubmit(onStep3)} className="space-y-5">
              {error && (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--danger-subtle)] bg-[var(--danger-subtle)] px-4 py-3 text-sm text-[var(--danger)]">
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--danger)]" />
                  {error}
                </div>
              )}

              {/* Plan cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PLANS.map(plan => {
                  const selected = form3.watch('plan') === plan.id
                  return (
                    <label
                      key={plan.id}
                      htmlFor={`plan-${plan.id}`}
                      className={`relative cursor-pointer rounded-xl border-2 p-5 transition-all ${
                        selected
                          ? 'border-amber-400 bg-amber-50 shadow-md shadow-amber-100'
                          : 'border-stone-200 bg-white hover:border-amber-200'
                      }`}
                    >
                      <input
                        {...form3.register('plan')}
                        type="radio"
                        id={`plan-${plan.id}`}
                        value={plan.id}
                        className="sr-only"
                      />
                      {plan.highlight && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                          Populer
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-stone-700">{plan.name}</span>
                        <div className={`h-4 w-4 rounded-full border-2 transition-all flex items-center justify-center ${selected ? 'border-amber-500 bg-amber-500' : 'border-stone-300'}`}>
                          {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-2xl font-bold text-stone-800">{plan.price}</span>
                        <span className="text-xs text-stone-400">{plan.per}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-center gap-2 text-xs text-stone-600">
                            <CheckCircle className="h-3 w-3 shrink-0 text-amber-500" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </label>
                  )
                })}
              </div>
              {form3.formState.errors.plan && <p className="text-xs text-[var(--danger)]">{form3.formState.errors.plan.message}</p>}

              {/* Terms & conditions */}
              <div className="space-y-1">
                <div className="flex items-start gap-2.5">
                  <input
                    {...form3.register('agreeTerms')}
                    type="checkbox"
                    id="agreeTerms"
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-amber-500"
                  />
                  <label htmlFor="agreeTerms" className="text-sm text-[var(--text-2)] leading-relaxed cursor-pointer select-none">
                    Saya menyetujui{' '}
                    <Link href="#" className="text-amber-600 hover:underline">Syarat &amp; Ketentuan</Link>
                    {' '}dan{' '}
                    <Link href="#" className="text-amber-600 hover:underline">Kebijakan Privasi</Link>
                    {' '}Kasir POS.
                  </label>
                </div>
                {form3.formState.errors.agreeTerms && (
                  <p className="text-xs text-[var(--danger)] pl-6">{form3.formState.errors.agreeTerms.message}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-lg border border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-2)] hover:border-amber-300 hover:text-amber-700 transition-all"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group flex flex-[2] items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Mendaftar…</>
                  ) : (
                    <>Buat Akun Gratis<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <p className="text-center text-sm text-[var(--text-3)]">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-medium text-amber-600 hover:text-amber-700 transition-colors">
          Masuk di sini
        </Link>
      </p>
    </div>
  )
}

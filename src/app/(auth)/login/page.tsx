'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, Mail, Lock, ArrowRight, ShoppingBag, Zap, Star } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
  rememberMe: z.boolean().optional(),
})

type LoginForm = z.infer<typeof loginSchema>

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-3 pl-10 pr-4 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-all focus:border-amber-400 focus:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2 focus:ring-amber-400/20'

const DEMO_ACCOUNTS = [
  { label: 'Demo Owner', email: 'owner@demo.com', password: 'demo123', role: 'Pemilik' },
  { label: 'Demo Kasir', email: 'cashier@demo.com', password: 'demo123', role: 'Kasir' },
]

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  })

  // Pre-fill from landing page CTA (?email=...&demo=1)
  useEffect(() => {
    const email = searchParams.get('email')
    const isDemo = searchParams.get('demo') === '1'
    if (email) setValue('email', email)
    if (isDemo) setValue('password', 'demo123')
  }, [searchParams, setValue])

  const doLogin = async (email: string, password: string, rememberMe?: boolean) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe: rememberMe ?? false }),
    })
    const result = (await res.json()) as { success?: boolean; error?: string }
    if (!res.ok || !result.success) throw new Error(result.error || 'Email atau password salah')
    router.push('/dashboard')
    router.refresh()
  }

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    setError(null)
    try {
      await doLogin(data.email, data.password, data.rememberMe)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  const loginAsDemo = async (account: (typeof DEMO_ACCOUNTS)[0]) => {
    setDemoLoading(account.email)
    setError(null)
    try {
      await doLogin(account.email, account.password)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Demo login gagal.')
    } finally {
      setDemoLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Language switcher */}
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[var(--shadow-md)]">
          <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight text-[var(--text-1)]">Kasir POS</span>
      </div>

      {/* ── Demo Mode Banner ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" data-testid="demo-banner">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              🎯 Coba dengan akun demo: <span className="font-mono">owner@demo.com</span> / <span className="font-mono">demo123</span>
            </p>
            <p className="mt-0.5 text-xs text-amber-600">Akses penuh ke semua fitur — tidak perlu mendaftar.</p>
          </div>
          <button
            type="button"
            onClick={() => loginAsDemo(DEMO_ACCOUNTS[0])}
            disabled={isLoading || !!demoLoading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="btn-demo-quick"
          >
            {demoLoading === DEMO_ACCOUNTS[0].email ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Masuk sebagai Demo
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-lg)]">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">
            Masuk ke akun Anda
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-3)]">
            Sistem kasir modern untuk bisnis Anda
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-2)]">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                className={inputClass}
                placeholder="kamu@email.com"
              />
            </div>
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text-2)]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--text-3)] transition-colors hover:text-amber-600"
              >
                Lupa password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                {...register('password')}
                type="password"
                id="password"
                autoComplete="current-password"
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>

          {/* Remember me */}
          <div className="flex items-center gap-2.5">
            <input
              {...register('rememberMe')}
              type="checkbox"
              id="rememberMe"
              className="h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400 focus:ring-offset-0 accent-amber-500"
            />
            <label htmlFor="rememberMe" className="text-sm text-[var(--text-2)] select-none cursor-pointer">
              Ingat saya selama 30 hari
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading || !!demoLoading}
            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                Masuk
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Demo accounts */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--bg-card)] px-3 text-[var(--text-3)]">atau coba demo</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map(account => (
              <button
                key={account.email}
                type="button"
                onClick={() => loginAsDemo(account)}
                disabled={isLoading || !!demoLoading}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-left transition-all hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {demoLoading === account.email ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" />
                ) : (
                  <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--text-1)]">
                    {account.label}
                  </p>
                  <p className="text-[10px] text-[var(--text-3)]">{account.role}</p>
                </div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-[var(--text-3)]">
            Demo: <span className="font-mono">demo123</span>
          </p>
        </div>
      </div>

      {/* Social proof */}
      <div className="flex items-center justify-center gap-1.5" data-testid="social-proof-login">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        ))}
        <span className="ml-1 text-xs text-stone-500">Dipercaya oleh 500+ toko</span>
      </div>

      <p className="text-center text-sm text-[var(--text-3)]">
        Belum punya akun?{' '}
        <Link
          href="/signup"
          className="font-medium text-amber-600 transition-colors hover:text-amber-700"
        >
          Daftar
        </Link>
      </p>
    </div>
  )
}

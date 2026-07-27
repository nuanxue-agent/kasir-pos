'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, Mail, Lock, ArrowRight, ShoppingBag } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

type LoginForm = z.infer<typeof loginSchema>

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-3 pl-10 pr-4 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-all focus:border-amber-400 focus:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2 focus:ring-amber-400/20'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json() as any
      if (!res.ok || !result.success) { setError(result.error || 'Email atau password salah'); return }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo — visible on desktop too for a self-contained feel */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[var(--shadow-md)]">
          <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight text-[var(--text-1)]">Lakoo</span>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-lg)]">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Masuk ke akun Anda</h1>
          <p className="mt-1.5 text-sm text-[var(--text-3)]">Sistem kasir modern untuk bisnis Anda</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--danger-subtle)] bg-[var(--danger-subtle)] px-4 py-3 text-sm text-[var(--danger)]">
              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--danger)]" />
              {error}
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-2)]">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                className={inputClass}
                placeholder="kamu@email.com"
              />
            </div>
            {errors.email && <p className="text-xs text-[var(--danger)]">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text-2)]">Password</label>
              <Link href="#" className="text-xs text-[var(--text-3)] hover:text-amber-600 transition-colors">
                Lupa password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                {...register('password')}
                type="password"
                id="password"
                autoComplete="current-password"
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            {errors.password && <p className="text-xs text-[var(--danger)]">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Memproses…</>
            ) : (
              <>Masuk<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-[var(--text-3)]">
        Belum punya akun?{' '}
        <Link href="/signup" className="font-medium text-amber-600 hover:text-amber-700 transition-colors">
          Daftar
        </Link>
      </p>
    </div>
  )
}

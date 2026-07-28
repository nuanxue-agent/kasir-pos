'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, Lock, ShoppingBag, ArrowRight } from 'lucide-react'

const schema = z
  .object({
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Password tidak cocok',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input,var(--bg-subtle))] py-3 pl-10 pr-4 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-all focus:border-[var(--accent)] focus:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    if (!token) {
      setError('Token tidak ditemukan. Minta link reset baru.')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      })
      const result = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Terjadi kesalahan')
      router.push('/login?reset=success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center shadow-[var(--shadow-lg)]">
        <p className="text-sm text-red-500 dark:text-red-400">
          Token tidak ditemukan. Link mungkin sudah kadaluarsa.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
        >
          Minta link reset baru
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-lg)]">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">
          Buat Password Baru
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-3)]">
          Masukkan password baru untuk akun Anda.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-[var(--text-2)]">
            Password Baru
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              {...register('password')}
              type="password"
              id="password"
              autoComplete="new-password"
              className={inputClass}
              placeholder="Minimal 6 karakter"
            />
          </div>
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-[var(--text-2)]"
          >
            Konfirmasi Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              {...register('confirmPassword')}
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              className={inputClass}
              placeholder="Ulangi password baru"
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              Simpan Password Baru
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[var(--shadow-md)]">
          <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight text-[var(--text-1)]">Lakoo</span>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-lg)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>

      <p className="text-center text-sm text-[var(--text-3)]">
        Kembali ke{' '}
        <Link
          href="/login"
          className="font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
        >
          halaman masuk
        </Link>
      </p>
    </div>
  )
}

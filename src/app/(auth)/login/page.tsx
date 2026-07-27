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
      const result = await res.json()
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
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">Selamat datang kembali</h1>
        <p className="mt-1.5 text-sm text-stone-500">Masuk ke akun Lakoo kamu.</p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-stone-700">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm text-stone-800 placeholder-stone-400 transition-all focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                placeholder="kamu@email.com"
              />
            </div>
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-stone-700">Password</label>
              <Link href="#" className="text-xs text-stone-400 hover:text-amber-600 transition-colors">Lupa password?</Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                {...register('password')}
                type="password"
                id="password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm text-stone-800 placeholder-stone-400 transition-all focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                placeholder="••••••••"
              />
            </div>
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Memproses…</>
            ) : (
              <>Masuk<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-stone-500">
        Belum punya akun?{' '}
        <Link href="/signup" className="font-medium text-amber-600 hover:text-amber-700 transition-colors">
          Daftar gratis
        </Link>
      </p>
    </div>
  )
}

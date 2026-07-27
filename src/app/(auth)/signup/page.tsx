'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, Mail, Lock, User, Building2, ArrowRight } from 'lucide-react'

const signupSchema = z.object({
  businessName: z.string().min(2, 'Nama usaha minimal 2 karakter'),
  name: z.string().min(2, 'Nama kamu minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
})

type SignupForm = z.infer<typeof signupSchema>

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm text-stone-800 placeholder-stone-400 transition-all focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/20'

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json() as any
      if (!res.ok) { setError(result.error || 'Pendaftaran gagal'); return }
      // Auto-logged in — go straight to onboarding
      router.push(result.redirect ?? '/onboarding')
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">Buat akun gratis</h1>
        <p className="mt-1.5 text-sm text-stone-500">Tidak perlu kartu kredit. Siap pakai dalam 5 menit.</p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          {/* Business name */}
          <div className="space-y-1.5">
            <label htmlFor="businessName" className="block text-sm font-medium text-stone-700">Nama Usaha / Toko</label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input {...register('businessName')} type="text" id="businessName" autoComplete="organization" className={inputClass} placeholder="Warung Sari Rasa" />
            </div>
            {errors.businessName && <p className="text-xs text-red-500">{errors.businessName.message}</p>}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-stone-700">Nama Kamu</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input {...register('name')} type="text" id="name" autoComplete="name" className={inputClass} placeholder="Ahmad Rizky" />
            </div>
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-stone-700">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input {...register('email')} type="email" id="email" autoComplete="email" className={inputClass} placeholder="kamu@email.com" />
            </div>
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          {/* Password row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-stone-700">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input {...register('password')} type="password" id="password" autoComplete="new-password" className={inputClass} placeholder="Min. 8 karakter" />
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700">Ulangi Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input {...register('confirmPassword')} type="password" id="confirmPassword" autoComplete="new-password" className={inputClass} placeholder="••••••••" />
              </div>
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Mendaftar…</>
            ) : (
              <>Buat Akun Gratis<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
            )}
          </button>

          <p className="text-center text-xs text-stone-400">
            Dengan mendaftar kamu setuju dengan{' '}
            <Link href="#" className="text-amber-600 hover:underline">Syarat & Ketentuan</Link> kami.
          </p>
        </form>
      </div>

      <p className="text-center text-sm text-stone-500">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-medium text-amber-600 hover:text-amber-700 transition-colors">
          Masuk di sini
        </Link>
      </p>
    </div>
  )
}

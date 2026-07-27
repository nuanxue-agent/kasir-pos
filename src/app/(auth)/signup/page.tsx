'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, Mail, Lock, User, Building2, ArrowRight, ShieldCheck } from 'lucide-react'

const signupSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  name: z.string().min(2, 'Your name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type SignupForm = z.infer<typeof signupSchema>

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Registration failed')
        return
      }

      router.push('/login')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Create your account</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Free to start. No credit card required.
        </p>
      </div>

      {/* Card */}
      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06]" />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          {/* Business Name */}
          <div className="space-y-1.5">
            <label htmlFor="businessName" className="block text-sm font-medium text-slate-300">
              Business Name
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                {...register('businessName')}
                type="text"
                id="businessName"
                autoComplete="organization"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-indigo-500/50 focus:bg-indigo-500/[0.04] focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                placeholder="Warung Sari Rasa"
              />
            </div>
            {errors.businessName && (
              <p className="text-xs text-red-400">{errors.businessName.message}</p>
            )}
          </div>

          {/* Your Name */}
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-slate-300">
              Your Name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                {...register('name')}
                type="text"
                id="name"
                autoComplete="name"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-indigo-500/50 focus:bg-indigo-500/[0.04] focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                placeholder="Ahmad Rizky"
              />
            </div>
            {errors.name && (
              <p className="text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-indigo-500/50 focus:bg-indigo-500/[0.04] focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                placeholder="you@example.com"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          {/* Password + confirm in a 2-col row on wider viewports */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  {...register('password')}
                  type="password"
                  id="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-indigo-500/50 focus:bg-indigo-500/[0.04] focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                  placeholder="8+ characters"
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  {...register('confirmPassword')}
                  type="password"
                  id="confirmPassword"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-indigo-500/50 focus:bg-indigo-500/[0.04] focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                  placeholder="••••••••"
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>

          <p className="text-center text-xs text-slate-500">
            By creating an account you agree to our{' '}
            <Link href="#" className="text-slate-400 hover:text-white transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="#" className="text-slate-400 hover:text-white transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>

      {/* Security badge */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-400" />
          <p className="text-xs leading-relaxed text-slate-400">
            Your data is encrypted at rest. Passwords are hashed with bcrypt before storage.
          </p>
        </div>
      </div>

      {/* Login link */}
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-indigo-400 transition-colors hover:text-indigo-300">
          Sign in
        </Link>
      </p>
    </div>
  )
}

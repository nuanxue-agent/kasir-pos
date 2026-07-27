'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ErrorBoundaryPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: ErrorBoundaryPageProps) {
  useEffect(() => {
    // Log to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      console.error('[Dashboard Error]', error)
    }
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-stone-800 mb-2">Something went wrong</h2>
      <p className="text-stone-400 text-sm mb-6 max-w-sm">
        {error.message?.includes('fetch') || error.message?.includes('network')
          ? 'Network error. Check your connection and try again.'
          : 'An unexpected error occurred. Please try again.'}
      </p>
      {error.digest && (
        <p className="text-xs text-stone-300 mb-4 font-mono">Error ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="px-4 py-2 bg-stone-100 text-stone-600 text-sm font-semibold rounded-xl hover:bg-stone-200 transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  )
}

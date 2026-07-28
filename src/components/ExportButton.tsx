'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { exportToPDF, exportToExcel } from '@/lib/export'
import type { ExportColumn } from '@/lib/export'

interface ExportButtonProps {
  type: 'pdf' | 'excel'
  label: string
  data: Record<string, unknown>[]
  columns: ExportColumn[]
  filename: string
  /** ISO 4217 currency code, e.g. 'IDR', 'USD'. Defaults to 'IDR'. */
  currency?: string
  /** Optional title shown in the PDF header. Defaults to filename. */
  title?: string
  className?: string
}

export function ExportButton({
  type,
  label,
  data,
  columns,
  filename,
  currency = 'IDR',
  title,
  className,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (loading) return
    setLoading(true)
    try {
      if (type === 'pdf') {
        await exportToPDF(title ?? filename, columns, data, filename, currency)
      } else {
        await exportToExcel(
          [{ name: (title ?? filename).slice(0, 31), columns, rows: data }],
          filename,
        )
      }
    } catch (err) {
      console.error('[ExportButton] export failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const isPdf = type === 'pdf'

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      aria-label={`${label} (${type.toUpperCase()})`}
      className={cn(
        // Base
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        // PDF variant — amber fill
        isPdf && [
          'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800',
          'disabled:bg-amber-300',
        ],
        // Excel variant — stone outline
        !isPdf && [
          'border border-stone-300 bg-[var(--bg-card)] text-stone-700',
          'hover:bg-stone-50 active:bg-stone-100',
          'disabled:border-stone-200 disabled:text-stone-400',
        ],
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{loading ? 'Mengekspor…' : label}</span>
    </button>
  )
}

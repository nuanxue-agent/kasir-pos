'use client'

import { Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { printPage } from '@/lib/print'

interface PrintButtonProps {
  /** Optional additional class names */
  className?: string
  /** Title passed to the print dialog / PDF filename */
  title?: string
}

export function PrintButton({ className, title = document?.title ?? 'Laporan' }: PrintButtonProps) {
  function handlePrint() {
    printPage(title, '')
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all',
        'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]',
        'active:scale-95',
        className,
      )}
      aria-label="Cetak halaman"
    >
      <Printer className="h-3.5 w-3.5 shrink-0" />
      Cetak / Export PDF
    </button>
  )
}

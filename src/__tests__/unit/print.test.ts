/**
 * Unit tests for print / PDF export feature.
 * Uses window.print() — no external PDF library required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── 1. printPage function exists and is callable ─────────────────────────────
describe('printPage', () => {
  beforeEach(() => {
    // Provide a minimal DOM environment for the function
    vi.stubGlobal('window', {
      print: vi.fn(),
    })
    document.title = 'Test'
  })

  it('is exported as a named export from src/lib/print', async () => {
    const mod = await import('@/lib/print')
    expect(typeof mod.printPage).toBe('function')
  })

  it('calls window.print() when invoked', async () => {
    const printMock = vi.fn()
    vi.stubGlobal('window', { print: printMock })

    // Re-import so module picks up stubbed window
    const { printPage } = await import('@/lib/print')
    printPage('Test Title', '')
    expect(printMock).toHaveBeenCalledOnce()
  })

  it('restores document.title after printing', async () => {
    const original = 'Original Title'
    document.title = original
    vi.stubGlobal('window', { print: vi.fn() })

    const { printPage } = await import('@/lib/print')
    printPage('Print Title', '')
    expect(document.title).toBe(original)
  })
})

// ── 2. PrintButton component renders ────────────────────────────────────────
describe('PrintButton', () => {
  it('module exports a PrintButton component', async () => {
    const mod = await import('@/components/ui/PrintButton')
    expect(typeof mod.PrintButton).toBe('function')
  })
})

// ── 3. Print CSS classes are defined in globals ──────────────────────────────
describe('Print CSS classes', () => {
  it('globals.css contains the @media print block', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(process.cwd(), 'src/app/globals.css')
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toContain('@media print')
    expect(css).toContain('.no-print')
    expect(css).toContain('.print-break')
  })
})

// ── 4. No external PDF library dependencies ──────────────────────────────────
describe('No external PDF library dependencies', () => {
  it('print.ts does not import jsPDF', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/print.ts'), 'utf-8')
    expect(src).not.toContain('jspdf')
    expect(src).not.toContain('jsPDF')
    expect(src).not.toContain('puppeteer')
    expect(src).not.toContain('html2pdf')
    expect(src).not.toContain('pdfmake')
  })

  it('PrintButton.tsx does not import jsPDF or puppeteer', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ui/PrintButton.tsx'),
      'utf-8',
    )
    expect(src).not.toContain('jspdf')
    expect(src).not.toContain('jsPDF')
    expect(src).not.toContain('puppeteer')
    expect(src).not.toContain('html2pdf')
  })
})

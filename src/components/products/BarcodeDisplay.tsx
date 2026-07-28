'use client'

import { useMemo } from 'react'
import { generateBarcodeSVG } from '@/lib/code128'
import { Printer } from 'lucide-react'

interface BarcodeDisplayProps {
  sku: string
  productName?: string
  showPrintButton?: boolean
}

export default function BarcodeDisplay({
  sku,
  productName,
  showPrintButton = true,
}: BarcodeDisplayProps) {
  const svgContent = useMemo(
    () => generateBarcodeSVG(sku, { moduleWidth: 2, height: 56, showText: true, fontSize: 10 }),
    [sku],
  )

  const handlePrint = () => {
    // Build a 2×4 grid of barcodes for printing
    const singleSVG = generateBarcodeSVG(sku, {
      moduleWidth: 2,
      height: 56,
      showText: true,
      fontSize: 10,
    })
    const labelHtml = `
      <div style="display:inline-block;border:1px solid #e5e7eb;padding:8px;margin:4px;text-align:center;border-radius:4px">
        ${singleSVG}
        ${productName ? `<div style="font-size:11px;font-family:sans-serif;margin-top:2px;color:#374151;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${productName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
      </div>`
    const grid = Array(8).fill(labelHtml).join('')
    const win = window.open('', '_blank', 'width=700,height=600')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print Barcode — ${(productName ?? sku).replace(/</g, '&lt;')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; padding: 24px; background: #fff; }
    h2 { font-size: 14px; margin-bottom: 12px; color: #111; }
    .grid { display: grid; grid-template-columns: repeat(4, auto); gap: 4px; }
    @media print {
      button { display: none !important; }
      body { padding: 8px; }
    }
  </style>
</head>
<body>
  <h2>Barcode: ${(productName ?? sku).replace(/</g, '&lt;')} &nbsp;·&nbsp; SKU: ${sku.replace(/</g, '&lt;')}</h2>
  <div class="grid">${grid}</div>
  <br/>
  <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#f59e0b;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨 Print</button>
</body>
</html>`)
    win.document.close()
  }

  if (!sku) {
    return (
      <p className="text-xs text-[var(--text-3)] italic">Masukkan SKU untuk menampilkan barcode</p>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        className="rounded border border-stone-100 bg-[var(--bg-card)] p-2"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      {showPrintButton && (
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-amber-400 hover:text-amber-600"
        >
          <Printer className="h-3.5 w-3.5" />
          Print Barcode
        </button>
      )}
    </div>
  )
}

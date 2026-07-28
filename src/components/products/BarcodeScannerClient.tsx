'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { generateBarcodeSVG } from '@/lib/code128'
import {
  Camera,
  CameraOff,
  Search,
  Printer,
  Package,
  CheckSquare,
  Square,
  ShoppingCart,
  AlertTriangle,
  Loader2,
  ScanLine,
  Tag,
  History,
  X,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  cost: number
  stock: number
  trackStock: boolean
  sku?: string | null
  barcode?: string | null
  image?: string | null
  category?: { id: string; name: string; color?: string | null } | null
}

interface LabelConfig {
  showProductName: boolean
  showPrice: boolean
  showBarcode: boolean
  showStoreName: boolean
  storeName: string
  copies: number
}

interface ScanLogEntry {
  id: string
  barcode: string
  productId: string | null
  productName: string | null
  scannedAt: string
  action: 'LOOKUP' | 'ADD_TO_CART' | 'NOT_FOUND'
}

interface BarcodeScannerClientProps {
  storeId: string
  currency: string
  storeName: string
  initialProducts: Product[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildLabelHtml(
  product: Product,
  config: LabelConfig,
  currency: string,
  copies: number,
): string {
  const code = product.barcode ?? product.sku ?? product.id
  const barcodeSvg = generateBarcodeSVG(code, {
    moduleWidth: 1.5,
    height: 40,
    showText: true,
    fontSize: 8,
  })
  const label = `
    <div style="display:inline-block;border:1px solid #d1d5db;padding:6px 8px;margin:3px;
                text-align:center;border-radius:3px;width:160px;font-family:sans-serif;
                background:#fff;vertical-align:top">
      ${config.showStoreName && config.storeName ? `<div style="font-size:9px;color:#6b7280;margin-bottom:2px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">${escHtml(config.storeName)}</div>` : ''}
      ${config.showProductName ? `<div style="font-size:10px;font-weight:600;color:#111827;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:144px">${escHtml(product.name)}</div>` : ''}
      ${config.showBarcode ? barcodeSvg : ''}
      ${config.showPrice ? `<div style="font-size:12px;font-weight:700;color:#111827;margin-top:3px">${formatCurrency(product.price, currency)}</div>` : ''}
    </div>`
  return Array(copies).fill(label).join('')
}

// ── Camera scanner hook ────────────────────────────────────────────────────

function useCameraScanner(onDetect: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [permError, setPermError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // interval-based scan simulation — real apps would use a WASM barcode lib
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async () => {
    setPermError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setActive(true)
    } catch (e: any) {
      setPermError(
        e?.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Gunakan input manual.'
          : 'Kamera tidak tersedia. Gunakan input manual.',
      )
    }
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (intervalRef.current) clearInterval(intervalRef.current)
    setActive(false)
  }, [])

  useEffect(() => () => { stop() }, [stop])

  return { videoRef, active, permError, start, stop }
}

// ── Scan Log Table ─────────────────────────────────────────────────────────

function ScanLogTable({ log }: { log: ScanLogEntry[] }) {
  if (log.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text-3)]">
        Belum ada riwayat scan.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-semibold text-stone-500">
            <th className="px-3 py-2">Barcode</th>
            <th className="px-3 py-2">Produk</th>
            <th className="px-3 py-2">Aksi</th>
            <th className="px-3 py-2">Waktu</th>
          </tr>
        </thead>
        <tbody>
          {log.map(entry => (
            <tr key={entry.id} className="border-b border-stone-100 last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{entry.barcode}</td>
              <td className="px-3 py-2">{entry.productName ?? <span className="italic text-stone-400">Tidak ditemukan</span>}</td>
              <td className="px-3 py-2">
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  entry.action === 'ADD_TO_CART' && 'bg-green-100 text-green-700',
                  entry.action === 'LOOKUP' && 'bg-blue-100 text-blue-700',
                  entry.action === 'NOT_FOUND' && 'bg-red-100 text-red-700',
                )}>
                  {entry.action === 'ADD_TO_CART' ? 'Tambah ke Kasir' : entry.action === 'LOOKUP' ? 'Cari' : 'Tidak Ditemukan'}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-stone-400">
                {new Date(entry.scannedAt).toLocaleTimeString('id-ID')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Label Designer ─────────────────────────────────────────────────────────

function LabelDesigner({
  products,
  currency,
  storeName: defaultStoreName,
}: {
  products: Product[]
  currency: string
  storeName: string
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [config, setConfig] = useState<LabelConfig>({
    showProductName: true,
    showPrice: true,
    showBarcode: true,
    showStoreName: true,
    storeName: defaultStoreName,
    copies: 4,
  })
  const [search, setSearch] = useState('')

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectAll = () => setSelected(new Set(filtered.map(p => p.id)))
  const clearAll = () => setSelected(new Set())

  const handlePrint = () => {
    const toPrint = products.filter(p => selected.has(p.id))
    if (toPrint.length === 0) return
    const labelsHtml = toPrint
      .map(p => buildLabelHtml(p, config, currency, config.copies))
      .join('')
    const win = window.open('', '_blank', 'width=800,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print Label — ${toPrint.length} produk</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; padding: 16px; background: #fff; }
    .grid { display: flex; flex-wrap: wrap; gap: 4px; }
    @media print {
      button { display: none !important; }
      body { padding: 4px; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" style="margin-bottom:12px;padding:8px 20px;background:#f59e0b;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨 Print Label</button>
  <div class="grid">${labelsHtml}</div>
</body>
</html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Config panel */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-stone-700">Konfigurasi Label</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([
            ['showProductName', 'Nama Produk'],
            ['showPrice', 'Harga'],
            ['showBarcode', 'Barcode'],
            ['showStoreName', 'Nama Toko'],
          ] as [keyof LabelConfig, string][]).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config[key] as boolean}
                onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                className="rounded"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-stone-500">Nama Toko</label>
            <input
              value={config.storeName}
              onChange={e => setConfig(prev => ({ ...prev, storeName: e.target.value }))}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
              placeholder="Nama toko..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-stone-500">Salinan per Produk</label>
            <input
              type="number"
              min={1}
              max={20}
              value={config.copies}
              onChange={e => setConfig(prev => ({ ...prev, copies: Math.max(1, parseInt(e.target.value) || 1) }))}
              className="w-20 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Product selection */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari produk..."
            className="w-full rounded-lg border border-stone-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <button onClick={selectAll} className="rounded-lg border border-stone-200 px-3 py-2 text-xs hover:bg-stone-100">
          Pilih Semua
        </button>
        <button onClick={clearAll} className="rounded-lg border border-stone-200 px-3 py-2 text-xs hover:bg-stone-100">
          Hapus Pilihan
        </button>
        <button
          onClick={handlePrint}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-40"
        >
          <Printer className="h-3.5 w-3.5" />
          Print {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-xl border border-stone-200">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">Tidak ada produk.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-stone-200 bg-stone-50 text-left text-xs font-semibold text-stone-500">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Produk</th>
                <th className="px-3 py-2">SKU/Barcode</th>
                <th className="px-3 py-2">Harga</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50"
                >
                  <td className="px-3 py-2">
                    {selected.has(p.id)
                      ? <CheckSquare className="h-4 w-4 text-amber-500" />
                      : <Square className="h-4 w-4 text-stone-300" />}
                  </td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-stone-500">{p.barcode ?? p.sku ?? '—'}</td>
                  <td className="px-3 py-2">{formatCurrency(p.price, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

type Tab = 'scanner' | 'labels' | 'log'

export default function BarcodeScannerClient({
  storeId,
  currency,
  storeName,
  initialProducts,
}: BarcodeScannerClientProps) {
  const [tab, setTab] = useState<Tab>('scanner')
  const [manualInput, setManualInput] = useState('')
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([])
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { videoRef, active: cameraActive, permError, start: startCamera, stop: stopCamera } =
    useCameraScanner(handleScan)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleScan(code: string) {
    if (!code.trim()) return
    setLoading(true)
    setNotFound(false)
    setScannedProduct(null)
    try {
      const res = await fetch(`/api/products/barcode/${encodeURIComponent(code.trim())}`, {
        headers: { 'x-store-id': storeId },
      })
      const data = await res.json() as Product & { id?: string; name?: string }
      if (res.ok && data.id) {
        setScannedProduct(data as Product)
        addLog(code, data.id, data.name ?? null, 'LOOKUP')
      } else {
        setNotFound(true)
        addLog(code, null, null, 'NOT_FOUND')
      }
    } catch {
      setNotFound(true)
      addLog(code, null, null, 'NOT_FOUND')
    } finally {
      setLoading(false)
    }
  }

  function addLog(
    barcode: string,
    productId: string | null,
    productName: string | null,
    action: ScanLogEntry['action'],
  ) {
    const entry: ScanLogEntry = {
      id: Math.random().toString(36).slice(2),
      barcode,
      productId,
      productName,
      scannedAt: new Date().toISOString(),
      action,
    }
    setScanLog(prev => [entry, ...prev].slice(0, 100))
  }

  function handleAddToCart(product: Product) {
    const url = `/dashboard/pos?barcode=${encodeURIComponent(product.barcode ?? product.sku ?? product.id)}&productId=${product.id}`
    addLog(product.barcode ?? product.sku ?? product.id, product.id, product.name, 'ADD_TO_CART')
    showToast(`Menambahkan ${product.name} ke kasir…`)
    window.location.href = url
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (manualInput.trim()) {
      handleScan(manualInput.trim())
      setManualInput('')
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'scanner', label: 'Scanner', icon: <ScanLine className="h-4 w-4" /> },
    { id: 'labels', label: 'Label', icon: <Tag className="h-4 w-4" /> },
    { id: 'log', label: 'Riwayat', icon: <History className="h-4 w-4" /> },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium',
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toast.msg}
          <button onClick={() => setToast(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <ScanLine className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Barcode Scanner & Label</h1>
          <p className="text-sm text-stone-500">Scan produk, cari stok, cetak label harga</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-white text-amber-600 shadow-sm'
                : 'text-stone-500 hover:text-stone-700',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Scanner Tab */}
      {tab === 'scanner' && (
        <div className="space-y-4">
          {/* Camera */}
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-stone-800">Kamera</h2>
              <button
                onClick={cameraActive ? stopCamera : startCamera}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium',
                  cameraActive
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                )}
              >
                {cameraActive ? <><CameraOff className="h-4 w-4" /> Stop</> : <><Camera className="h-4 w-4" /> Aktifkan Kamera</>}
              </button>
            </div>
            {permError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {permError}
              </div>
            )}
            {cameraActive && (
              <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-32 w-64 rounded-lg border-2 border-amber-400 opacity-70" />
                </div>
                <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/70">
                  Arahkan barcode ke dalam kotak
                </p>
              </div>
            )}
            {!cameraActive && !permError && (
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-stone-200 text-stone-400">
                <div className="text-center">
                  <Camera className="mx-auto mb-1 h-8 w-8" />
                  <p className="text-sm">Kamera tidak aktif</p>
                </div>
              </div>
            )}
          </div>

          {/* Manual input */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                ref={inputRef}
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="Ketik atau scan barcode/SKU…"
                className="w-full rounded-xl border border-stone-200 py-2.5 pl-10 pr-4 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!manualInput.trim() || loading}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Cari
            </button>
          </form>

          {/* Result */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
          )}

          {notFound && !loading && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              Produk tidak ditemukan untuk barcode tersebut.
            </div>
          )}

          {scannedProduct && !loading && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
                    <Package className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-stone-900">{scannedProduct.name}</p>
                    <p className="text-sm text-stone-500">
                      {scannedProduct.sku && <span className="mr-2">SKU: {scannedProduct.sku}</span>}
                      {scannedProduct.barcode && <span>Barcode: {scannedProduct.barcode}</span>}
                    </p>
                    <p className="mt-1 text-lg font-bold text-amber-600">
                      {formatCurrency(scannedProduct.price, currency)}
                    </p>
                    {scannedProduct.trackStock && (
                      <p className={cn('text-sm', scannedProduct.stock <= 0 ? 'text-red-500' : 'text-green-600')}>
                        Stok: {scannedProduct.stock} unit
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleAddToCart(scannedProduct)}
                  className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Ke Kasir
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Labels Tab */}
      {tab === 'labels' && (
        <LabelDesigner products={initialProducts} currency={currency} storeName={storeName} />
      )}

      {/* Log Tab */}
      {tab === 'log' && <ScanLogTable log={scanLog} />}
    </div>
  )
}

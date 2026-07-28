'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Camera, CameraOff, ChevronDown, Scan, Flashlight, FlashlightOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
  active: boolean
  products?: Array<{ sku?: string | null; barcode?: string | null }>
}

interface CameraDevice {
  deviceId: string
  label: string
}

type ScannerStatus = 'initializing' | 'scanning' | 'camera-denied' | 'no-camera' | 'error'

export default function BarcodeScanner({
  onScan,
  onClose,
  active,
  products = [],
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hidInputRef = useRef<HTMLInputElement>(null)
  const manualInputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<ScannerStatus>('initializing')
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [showCameraSelect, setShowCameraSelect] = useState(false)
  const [manualValue, setManualValue] = useState('')

  // Torch/flashlight state
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  // HID scanner state
  const hidBuffer = useRef('')
  const hidTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHidKeyTime = useRef(0)

  // ZXing reader ref — typed as any since we dynamic-import
  const readerRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── Cleanup helper ────────────────────────────────────────────────────────

  const stopScanner = useCallback(() => {
    try {
      readerRef.current?.reset()
    } catch {
      /* ignore */
    }
    readerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setTorchOn(false)
    setTorchSupported(false)
  }, [])

  // ── Torch toggle ──────────────────────────────────────────────────────────

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as any] })
      setTorchOn(next)
    } catch {
      // torch not supported on this device/browser
    }
  }, [torchOn])

  // ── Start camera scanner ──────────────────────────────────────────────────

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!videoRef.current) return

      stopScanner()
      setStatus('initializing')

      try {
        // Dynamic import — no SSR leakage
        const { BrowserMultiFormatReader, BrowserCodeReader } = await import('@zxing/browser')

        // Enumerate cameras first
        const devices = await BrowserCodeReader.listVideoInputDevices()
        if (devices.length === 0) {
          setStatus('no-camera')
          return
        }

        const mapped: CameraDevice[] = devices.map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 6)}`,
        }))
        setCameras(mapped)

        const targetId = deviceId ?? mapped[0].deviceId
        if (!deviceId) setSelectedCamera(targetId)

        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        // Request stream ourselves so we can stash it for cleanup
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: targetId }, facingMode: 'environment' },
        })
        streamRef.current = stream
        videoRef.current.srcObject = stream

        // Check torch support via ImageCapture API
        const track = stream.getVideoTracks()[0]
        if (track) {
          try {
            const capabilities = track.getCapabilities() as any
            if (capabilities?.torch) setTorchSupported(true)
          } catch {
            /* not supported */
          }
        }

        setStatus('scanning')

        // Auto-focus the manual input when camera is ready
        setTimeout(() => manualInputRef.current?.focus(), 300)

        // Decode continuously from video element
        reader.decodeFromVideoElement(videoRef.current, (result, err) => {
          if (result) {
            const text = result.getText()
            if (text) {
              onScan(text)
            }
          }
          // err is a NotFoundException on every empty frame — suppress
        })
      } catch (err: any) {
        const name = err?.name ?? ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('camera-denied')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setStatus('no-camera')
        } else {
          console.error('[BarcodeScanner] camera error:', err)
          setStatus('error')
        }
        // Still focus manual input so user can type/scan even without camera
        setTimeout(() => manualInputRef.current?.focus(), 300)
      }
    },
    [onScan, stopScanner],
  )

  // ── Mount / active change ─────────────────────────────────────────────────

  useEffect(() => {
    if (!active) return
    startCamera(selectedCamera || undefined)
    return () => {
      stopScanner()
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camera switch
  const handleCameraSwitch = (deviceId: string) => {
    setSelectedCamera(deviceId)
    setShowCameraSelect(false)
    startCamera(deviceId)
  }

  // ── Manual barcode input handler ──────────────────────────────────────────

  const handleManualSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      // Match against product SKU or barcode
      const matched = products.find(
        p => (p.sku && p.sku === trimmed) || (p.barcode && p.barcode === trimmed),
      )
      if (matched || trimmed.length >= 4) {
        onScan(trimmed)
        setManualValue('')
      }
    },
    [products, onScan],
  )

  const handleManualKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleManualSubmit(manualValue)
      }
    },
    [manualValue, handleManualSubmit],
  )

  // ── HID barcode scanner (keyboard wedge) ──────────────────────────────────

  useEffect(() => {
    if (!active) return

    const onKey = (e: KeyboardEvent) => {
      // If target is a regular text input that isn't our HID input, skip
      const target = e.target as HTMLElement
      const isOtherInput =
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        target !== hidInputRef.current
      if (isOtherInput) return

      const now = Date.now()
      const gap = now - lastHidKeyTime.current
      lastHidKeyTime.current = now

      if (e.key === 'Enter') {
        const buf = hidBuffer.current
        hidBuffer.current = ''
        if (hidTimer.current) {
          clearTimeout(hidTimer.current)
          hidTimer.current = null
        }
        if (buf.length >= 4) {
          onScan(buf)
        }
        return
      }

      if (e.key.length === 1) {
        // HID scanners type very fast — accept if gap < 50ms or buffer already building
        if (gap < 50 || hidBuffer.current.length > 0) {
          hidBuffer.current += e.key
          if (hidTimer.current) clearTimeout(hidTimer.current)
          hidTimer.current = setTimeout(() => {
            hidBuffer.current = ''
          }, 300)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (hidTimer.current) clearTimeout(hidTimer.current)
    }
  }, [active, onScan])

  // ── Keyboard trap (Escape closes) ─────────────────────────────────────────

  useEffect(() => {
    if (!active) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [active, onClose])

  if (!active) return null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode Scanner"
    >
      {/* Header */}
      <div className="pt-safe-top flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Scan className="h-5 w-5 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Scan Barcode</h2>
        </div>
        <div className="flex items-center gap-2">
          {cameras.length > 1 && status === 'scanning' && (
            <div className="relative">
              <button
                onClick={() => setShowCameraSelect(v => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-card)]/10 px-3 py-1.5 text-xs text-white transition-colors hover:bg-[var(--bg-card)]/20"
              >
                <Camera className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {cameras.find(c => c.deviceId === selectedCamera)?.label ?? 'Camera'}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {showCameraSelect && (
                <div className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-stone-900 shadow-xl">
                  {cameras.map(cam => (
                    <button
                      key={cam.deviceId}
                      onClick={() => handleCameraSwitch(cam.deviceId)}
                      className={cn(
                        'w-full px-4 py-2.5 text-left text-xs transition-colors',
                        cam.deviceId === selectedCamera
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-white/80 hover:bg-[var(--bg-card)]/10',
                      )}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Torch toggle — only shown when supported */}
          {torchSupported && status === 'scanning' && (
            <button
              onClick={toggleTorch}
              className={cn(
                'rounded-full p-2 transition-colors',
                torchOn
                  ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/40'
                  : 'bg-[var(--bg-card)]/10 text-white hover:bg-[var(--bg-card)]/20',
              )}
              aria-label={torchOn ? 'Matikan senter' : 'Nyalakan senter'}
              title={torchOn ? 'Matikan senter' : 'Nyalakan senter'}
            >
              {torchOn ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-full bg-[var(--bg-card)]/10 p-2 text-white transition-colors hover:bg-[var(--bg-card)]/20"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Viewfinder area */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
        <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          {/* Video feed */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              status !== 'scanning' && 'opacity-0',
            )}
          />

          {/* Corner brackets overlay */}
          {status === 'scanning' && (
            <>
              {/* Top-left */}
              <span className="absolute top-4 left-4 h-8 w-8 rounded-tl-lg border-t-2 border-l-2 border-amber-400" />
              {/* Top-right */}
              <span className="absolute top-4 right-4 h-8 w-8 rounded-tr-lg border-t-2 border-r-2 border-amber-400" />
              {/* Bottom-left */}
              <span className="absolute bottom-4 left-4 h-8 w-8 rounded-bl-lg border-b-2 border-l-2 border-amber-400" />
              {/* Bottom-right */}
              <span className="absolute right-4 bottom-4 h-8 w-8 rounded-br-lg border-r-2 border-b-2 border-amber-400" />

              {/* Scanning line animation */}
              <span className="animate-scan-line absolute right-6 left-6 h-0.5 rounded-full bg-amber-400/80 shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]" />
            </>
          )}

          {/* Status overlays */}
          {status === 'initializing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <p className="text-sm text-white/70">Starting camera…</p>
            </div>
          )}

          {status === 'camera-denied' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <CameraOff className="h-10 w-10 text-red-400/80" />
              <p className="text-sm font-medium text-white">Camera access denied</p>
              <p className="text-xs text-white/50">
                Allow camera permission in your browser settings, or use a USB/Bluetooth barcode
                scanner.
              </p>
            </div>
          )}

          {status === 'no-camera' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <CameraOff className="h-10 w-10 text-stone-400/80" />
              <p className="text-sm font-medium text-white">No camera found</p>
              <p className="text-xs text-white/50">
                Connect a camera or use a USB/Bluetooth barcode scanner.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <CameraOff className="h-10 w-10 text-red-400/80" />
              <p className="text-sm font-medium text-white">Camera error</p>
              <button
                onClick={() => startCamera(selectedCamera || undefined)}
                className="mt-1 rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-600"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Manual barcode input fallback */}
        <div className="mt-4 w-full max-w-sm">
          <div className="relative">
            <input
              ref={manualInputRef}
              type="text"
              value={manualValue}
              onChange={e => setManualValue(e.target.value)}
              onKeyDown={handleManualKeyDown}
              placeholder="atau ketik/scan barcode"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="atau ketik/scan barcode"
              className="w-full rounded-xl border border-white/15 bg-[var(--bg-card)]/10 px-4 py-3 text-sm text-white placeholder-white/40 transition-colors focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 focus:outline-none"
            />
            {manualValue && (
              <button
                onClick={() => handleManualSubmit(manualValue)}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
              >
                OK
              </button>
            )}
          </div>
        </div>

        {/* HID hint */}
        <div className="mt-3 flex w-full max-w-sm items-center gap-2 rounded-xl border border-white/10 bg-[var(--bg-card)]/5 px-4 py-2.5">
          <Scan className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-white/60">
            {status === 'camera-denied' || status === 'no-camera'
              ? 'HID mode active — scan with your USB/Bluetooth scanner'
              : 'Camera + HID scanner both active'}
          </p>
        </div>

        {/* Hidden input to absorb HID scanner input on mobile (soft-keyboard fallback) */}
        <input ref={hidInputRef} aria-hidden="true" tabIndex={-1} className="sr-only" readOnly />
      </div>
    </div>
  )
}

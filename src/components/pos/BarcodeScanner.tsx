'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Camera, CameraOff, ChevronDown, Scan } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
  active: boolean
}

interface CameraDevice {
  deviceId: string
  label: string
}

type ScannerStatus = 'initializing' | 'scanning' | 'camera-denied' | 'no-camera' | 'error'

export default function BarcodeScanner({ onScan, onClose, active }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hidInputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<ScannerStatus>('initializing')
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [showCameraSelect, setShowCameraSelect] = useState(false)

  // HID scanner state
  const hidBuffer = useRef('')
  const hidTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHidKeyTime = useRef(0)

  // ZXing reader ref — typed as any since we dynamic-import
  const readerRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── Cleanup helper ────────────────────────────────────────────────────────

  const stopScanner = useCallback(() => {
    try { readerRef.current?.reset() } catch { /* ignore */ }
    readerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // ── Start camera scanner ──────────────────────────────────────────────────

  const startCamera = useCallback(async (deviceId?: string) => {
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

      setStatus('scanning')

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
    }
  }, [onScan, stopScanner])

  // ── Mount / active change ─────────────────────────────────────────────────

  useEffect(() => {
    if (!active) return
    startCamera(selectedCamera || undefined)
    return () => { stopScanner() }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camera switch
  const handleCameraSwitch = (deviceId: string) => {
    setSelectedCamera(deviceId)
    setShowCameraSelect(false)
    startCamera(deviceId)
  }

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
        if (hidTimer.current) { clearTimeout(hidTimer.current); hidTimer.current = null }
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
          hidTimer.current = setTimeout(() => { hidBuffer.current = '' }, 300)
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
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
      <div className="flex items-center justify-between px-4 pt-safe-top pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Scan className="h-5 w-5 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Scan Barcode</h2>
        </div>
        <div className="flex items-center gap-2">
          {cameras.length > 1 && status === 'scanning' && (
            <div className="relative">
              <button
                onClick={() => setShowCameraSelect(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
              >
                <Camera className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {cameras.find(c => c.deviceId === selectedCamera)?.label ?? 'Camera'}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {showCameraSelect && (
                <div className="absolute right-0 mt-1 w-56 bg-stone-900 border border-white/10 rounded-xl overflow-hidden shadow-xl z-10">
                  {cameras.map(cam => (
                    <button
                      key={cam.deviceId}
                      onClick={() => handleCameraSwitch(cam.deviceId)}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-xs transition-colors',
                        cam.deviceId === selectedCamera
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-white/80 hover:bg-white/10'
                      )}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Viewfinder area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">

          {/* Video feed */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={cn(
              'absolute inset-0 w-full h-full object-cover',
              status !== 'scanning' && 'opacity-0'
            )}
          />

          {/* Corner brackets overlay */}
          {status === 'scanning' && (
            <>
              {/* Top-left */}
              <span className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-amber-400 rounded-tl-lg" />
              {/* Top-right */}
              <span className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-amber-400 rounded-tr-lg" />
              {/* Bottom-left */}
              <span className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-amber-400 rounded-bl-lg" />
              {/* Bottom-right */}
              <span className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-amber-400 rounded-br-lg" />

              {/* Scanning line animation */}
              <span className="absolute left-6 right-6 h-0.5 bg-amber-400/80 rounded-full animate-scan-line shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]" />
            </>
          )}

          {/* Status overlays */}
          {status === 'initializing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <div className="w-8 h-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
              <p className="text-white/70 text-sm">Starting camera…</p>
            </div>
          )}

          {status === 'camera-denied' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <CameraOff className="h-10 w-10 text-red-400/80" />
              <p className="text-white text-sm font-medium">Camera access denied</p>
              <p className="text-white/50 text-xs">Allow camera permission in your browser settings, or use a USB/Bluetooth barcode scanner.</p>
            </div>
          )}

          {status === 'no-camera' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <CameraOff className="h-10 w-10 text-stone-400/80" />
              <p className="text-white text-sm font-medium">No camera found</p>
              <p className="text-white/50 text-xs">Connect a camera or use a USB/Bluetooth barcode scanner.</p>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <CameraOff className="h-10 w-10 text-red-400/80" />
              <p className="text-white text-sm font-medium">Camera error</p>
              <button
                onClick={() => startCamera(selectedCamera || undefined)}
                className="mt-1 px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* HID hint */}
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
          <Scan className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-white/60 text-xs">
            {status === 'camera-denied' || status === 'no-camera'
              ? 'HID mode active — scan with your USB/Bluetooth scanner'
              : 'Camera + HID scanner both active'}
          </p>
        </div>

        {/* Hidden input to absorb HID scanner input on mobile (soft-keyboard fallback) */}
        <input
          ref={hidInputRef}
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          readOnly
        />
      </div>
    </div>
  )
}

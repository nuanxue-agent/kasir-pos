import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Toast pub/sub logic (extracted from Toaster.tsx for testing) ──────────────

type ToastType = 'success' | 'error' | 'warning' | 'info'
interface Toast { id: string; type: ToastType; title: string; message?: string; duration?: number }
type ToastListener = (t: Toast) => void

function createToastBus() {
  const listeners = new Set<ToastListener>()
  const toasts: Toast[] = []

  function emit(t: Toast) {
    toasts.push(t)
    listeners.forEach(l => l(t))
  }

  function subscribe(l: ToastListener) {
    listeners.add(l)
    return () => listeners.delete(l)
  }

  function dismiss(id: string) {
    const idx = toasts.findIndex(t => t.id === id)
    if (idx !== -1) toasts.splice(idx, 1)
  }

  const toast = {
    success: (title: string, message?: string, duration = 4000) =>
      emit({ id: `t-${Date.now()}-s`, type: 'success', title, message, duration }),
    error: (title: string, message?: string, duration = 6000) =>
      emit({ id: `t-${Date.now()}-e`, type: 'error', title, message, duration }),
    warning: (title: string, message?: string, duration = 5000) =>
      emit({ id: `t-${Date.now()}-w`, type: 'warning', title, message, duration }),
    info: (title: string, message?: string, duration = 4000) =>
      emit({ id: `t-${Date.now()}-i`, type: 'info', title, message, duration }),
  }

  return { toast, subscribe, dismiss, toasts }
}

describe('Toast pub/sub', () => {
  let bus: ReturnType<typeof createToastBus>

  beforeEach(() => {
    bus = createToastBus()
  })

  it('emits success toast', () => {
    const received: Toast[] = []
    bus.subscribe(t => received.push(t))
    bus.toast.success('Saved')
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('success')
    expect(received[0].title).toBe('Saved')
  })

  it('emits error toast with message', () => {
    const received: Toast[] = []
    bus.subscribe(t => received.push(t))
    bus.toast.error('Failed', 'Network error')
    expect(received[0].type).toBe('error')
    expect(received[0].message).toBe('Network error')
  })

  it('emits warning toast', () => {
    const received: Toast[] = []
    bus.subscribe(t => received.push(t))
    bus.toast.warning('Low stock', '5 items remaining')
    expect(received[0].type).toBe('warning')
  })

  it('emits info toast', () => {
    const received: Toast[] = []
    bus.subscribe(t => received.push(t))
    bus.toast.info('Tip')
    expect(received[0].type).toBe('info')
  })

  it('multiple listeners all receive the toast', () => {
    const a: Toast[] = []
    const b: Toast[] = []
    bus.subscribe(t => a.push(t))
    bus.subscribe(t => b.push(t))
    bus.toast.success('Hello')
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('unsubscribing stops receiving toasts', () => {
    const received: Toast[] = []
    const unsub = bus.subscribe(t => received.push(t))
    bus.toast.success('First')
    unsub()
    bus.toast.success('Second')
    expect(received).toHaveLength(1)
  })

  it('dismiss removes a toast', () => {
    bus.toast.success('Dismiss me')
    expect(bus.toasts).toHaveLength(1)
    const id = bus.toasts[0].id
    bus.dismiss(id)
    expect(bus.toasts).toHaveLength(0)
  })

  it('dismiss non-existent id is a no-op', () => {
    bus.toast.success('Keep me')
    expect(() => bus.dismiss('nonexistent')).not.toThrow()
    expect(bus.toasts).toHaveLength(1)
  })

  it('default durations are set', () => {
    const received: Toast[] = []
    bus.subscribe(t => received.push(t))
    bus.toast.success('s')
    bus.toast.error('e')
    bus.toast.warning('w')
    bus.toast.info('i')
    expect(received[0].duration).toBe(4000)
    expect(received[1].duration).toBe(6000)
    expect(received[2].duration).toBe(5000)
    expect(received[3].duration).toBe(4000)
  })

  it('custom duration is respected', () => {
    const received: Toast[] = []
    bus.subscribe(t => received.push(t))
    bus.toast.success('Long toast', undefined, 10000)
    expect(received[0].duration).toBe(10000)
  })
})

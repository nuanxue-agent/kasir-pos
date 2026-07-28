'use client'

import { useState, useCallback } from 'react'
import { Users, Split, ShoppingCart, Check, Loader2, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SplitMethod = 'EQUAL' | 'CUSTOM' | 'BY_ITEM'
export type SplitStatus = 'PENDING' | 'PARTIAL' | 'PAID'
export type GroupOrderStatus = 'OPEN' | 'LOCKED' | 'SUBMITTED'

export interface OrderItem {
  id: string
  name: string
  price: number
  qty: number
  subtotal: number
}

export interface SplitBillPayer {
  id: string
  name: string
  amount: number
  paid: boolean
  paidAt: string | null
  paymentMethod: string | null
  items?: string[]
}

export interface SplitBill {
  id: string
  orderId: string
  storeId: string
  splitCount: number
  method: SplitMethod
  status: SplitStatus
  payers: SplitBillPayer[]
  createdAt: string
}

export interface GroupOrderItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  addedBy: string
}

export interface GroupOrder {
  id: string
  storeId: string
  tableNumber: string
  hostName: string
  items: GroupOrderItem[]
  status: GroupOrderStatus
  createdAt: string
}

// ─── Pure calculation helpers (exported for testing) ─────────────────────────

export function calcEqualSplit(total: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(total / count)
  const remainder = total - base * count
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? base + remainder : base
  )
}

export function validateCustomSplit(amounts: number[], total: number): string | null {
  if (amounts.length === 0) return 'Minimal 1 pembayar'
  const sum = amounts.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - total) > 1) {
    return `Jumlah split (${sum.toLocaleString('id-ID')}) harus sama dengan total (${total.toLocaleString('id-ID')})`
  }
  return null
}

export function calcRemainingBalance(payers: SplitBillPayer[]): number {
  return payers.filter(p => !p.paid).reduce((sum, p) => sum + p.amount, 0)
}

export function deriveSplitStatus(payers: SplitBillPayer[]): SplitStatus {
  if (payers.length === 0) return 'PENDING'
  if (payers.every(p => p.paid)) return 'PAID'
  if (payers.some(p => p.paid)) return 'PARTIAL'
  return 'PENDING'
}

export function aggregateGroupItems(items: GroupOrderItem[]): GroupOrderItem[] {
  const map = new Map<string, GroupOrderItem>()
  for (const item of items) {
    if (map.has(item.productId)) {
      const existing = map.get(item.productId)!
      map.set(item.productId, { ...existing, qty: existing.qty + item.qty })
    } else {
      map.set(item.productId, { ...item })
    }
  }
  return Array.from(map.values())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'IDR') {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

// ─── Split Bill Panel ─────────────────────────────────────────────────────────

interface SplitBillPanelProps {
  orderId: string
  storeId: string
  orderTotal: number
  orderItems: OrderItem[]
  currency?: string
  onSplitSaved?: (split: SplitBill) => void
}

export function SplitBillPanel({
  orderId,
  orderTotal,
  orderItems,
  currency = 'IDR',
  onSplitSaved,
}: SplitBillPanelProps) {
  const [method, setMethod] = useState<SplitMethod>('EQUAL')
  const [count, setCount] = useState(2)
  const [payers, setPayers] = useState<SplitBillPayer[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SplitBill | null>(null)
  const [expandedPayer, setExpandedPayer] = useState<string | null>(null)

  const buildPayers = useCallback((): SplitBillPayer[] => {
    if (method === 'EQUAL') {
      const amounts = calcEqualSplit(orderTotal, count)
      return amounts.map((amount, i) => ({
        id: `payer-${i}`,
        name: `Tamu ${i + 1}`,
        amount,
        paid: false,
        paidAt: null,
        paymentMethod: null,
      }))
    }
    return Array.from({ length: count }, (_, i) => ({
      id: `payer-${i}`,
      name: `Tamu ${i + 1}`,
      amount: 0,
      paid: false,
      paidAt: null,
      paymentMethod: null,
      items: [],
    }))
  }, [method, count, orderTotal])

  const handleInit = () => {
    setError(null)
    setSaved(null)
    setPayers(buildPayers())
  }

  const updatePayerName = (id: string, name: string) =>
    setPayers(ps => ps.map(p => p.id === id ? { ...p, name } : p))

  const updatePayerAmount = (id: string, amount: number) =>
    setPayers(ps => ps.map(p => p.id === id ? { ...p, amount } : p))

  const toggleItemForPayer = (payerId: string, itemId: string) => {
    setPayers(ps => ps.map(p => {
      if (p.id !== payerId) return p
      const items = p.items ?? []
      const next = items.includes(itemId) ? items.filter(i => i !== itemId) : [...items, itemId]
      const amount = orderItems.filter(oi => next.includes(oi.id)).reduce((s, oi) => s + oi.subtotal, 0)
      return { ...p, items: next, amount }
    }))
  }

  const markPaid = (id: string, paymentMethod: string) =>
    setPayers(ps => ps.map(p =>
      p.id === id ? { ...p, paid: true, paidAt: new Date().toISOString(), paymentMethod } : p
    ))

  const handleSave = async () => {
    setError(null)
    if (method === 'CUSTOM') {
      const validErr = validateCustomSplit(payers.map(p => p.amount), orderTotal)
      if (validErr) { setError(validErr); return }
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, count, payers }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Gagal menyimpan') }
      const { data } = await (res.json() as Promise<any>)
      setSaved(data)
      onSplitSaved?.(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remaining = calcRemainingBalance(payers)
  const status = deriveSplitStatus(payers)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Split className="h-4 w-4" />
        <span>Split Tagihan</span>
        <span className="ml-auto text-muted-foreground">{fmt(orderTotal, currency)}</span>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg border p-1 text-xs">
        {(['EQUAL', 'CUSTOM', 'BY_ITEM'] as SplitMethod[]).map(m => (
          <button
            key={m}
            onClick={() => { setMethod(m); setPayers([]) }}
            className={cn(
              'rounded-md px-2 py-1.5 font-medium transition-colors',
              method === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
            )}
          >
            {m === 'EQUAL' ? 'Rata' : m === 'CUSTOM' ? 'Custom' : 'Per Item'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Jumlah orang:</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCount(c => Math.max(2, c - 1)); setPayers([]) }}
            className="rounded border p-1 hover:bg-muted disabled:opacity-40"
            disabled={count <= 2}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-6 text-center text-sm font-medium">{count}</span>
          <button
            onClick={() => { setCount(c => Math.min(20, c + 1)); setPayers([]) }}
            className="rounded border p-1 hover:bg-muted disabled:opacity-40"
            disabled={count >= 20}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <button
          onClick={handleInit}
          className="ml-auto rounded-md bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
        >
          Bagi Sekarang
        </button>
      </div>

      {payers.length > 0 && (
        <div className="space-y-2">
          {payers.map(payer => (
            <div key={payer.id} className="rounded-lg border">
              <div
                className="flex items-center gap-2 p-3 cursor-pointer"
                onClick={() => setExpandedPayer(expandedPayer === payer.id ? null : payer.id)}
              >
                <div className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold',
                  payer.paid ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                )}>
                  {payer.paid ? <Check className="h-3 w-3" /> : payer.name.slice(-1)}
                </div>
                <input
                  className="flex-1 bg-transparent text-sm font-medium outline-none"
                  value={payer.name}
                  onChange={e => updatePayerName(payer.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
                {method === 'CUSTOM' ? (
                  <input
                    type="number"
                    className="w-28 rounded border px-2 py-0.5 text-right text-sm"
                    value={payer.amount || ''}
                    onChange={e => updatePayerAmount(payer.id, Number(e.target.value))}
                    onClick={e => e.stopPropagation()}
                    placeholder="0"
                  />
                ) : (
                  <span className="text-sm font-medium">{fmt(payer.amount, currency)}</span>
                )}
                {expandedPayer === payer.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>

              {method === 'BY_ITEM' && expandedPayer === payer.id && (
                <div className="border-t px-3 pb-3 pt-2 space-y-1">
                  {orderItems.map(item => (
                    <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(payer.items ?? []).includes(item.id)}
                        onChange={() => toggleItemForPayer(payer.id, item.id)}
                        className="rounded"
                      />
                      <span className="flex-1">{item.name} x{item.qty}</span>
                      <span className="text-muted-foreground">{fmt(item.subtotal, currency)}</span>
                    </label>
                  ))}
                </div>
              )}

              {!payer.paid && expandedPayer === payer.id && (
                <div className="border-t px-3 pb-3 pt-2 flex gap-2">
                  {['Cash', 'QRIS', 'Transfer'].map(pm => (
                    <button
                      key={pm}
                      onClick={() => markPaid(payer.id, pm)}
                      className="flex-1 rounded-md border py-1 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Sisa belum bayar:</span>
            <span className={cn('font-medium', remaining === 0 ? 'text-green-600' : 'text-orange-600')}>
              {fmt(remaining, currency)}
            </span>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {!saved ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Simpan Split
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <Check className="h-4 w-4" />
              Split disimpan · Status: {status}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group Order Panel ────────────────────────────────────────────────────────

interface GroupOrderPanelProps {
  storeId: string
  tableNumber: string
  currency?: string
  onSubmit?: (order: GroupOrder) => void
}

export function GroupOrderPanel({ storeId, tableNumber, currency = 'IDR', onSubmit }: GroupOrderPanelProps) {
  const [hostName, setHostName] = useState('')
  const [groupOrder, setGroupOrder] = useState<GroupOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createGroup = async () => {
    if (!hostName.trim()) { setError('Nama tuan rumah harus diisi'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/group-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, tableNumber, hostName }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Gagal membuat group order') }
      const { data } = await (res.json() as Promise<any>)
      setGroupOrder(data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  const lockAndSubmit = async () => {
    if (!groupOrder) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/group-orders/${groupOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SUBMITTED' }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Gagal submit') }
      const { data } = await (res.json() as Promise<any>)
      setGroupOrder(data)
      onSubmit?.(data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  const aggregated = groupOrder ? aggregateGroupItems(groupOrder.items) : []
  const groupTotal = aggregated.reduce((s, i) => s + i.price * i.qty, 0)

  if (!groupOrder) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4" />
          <span>Group Order — Meja {tableNumber}</span>
        </div>
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            placeholder="Nama tuan rumah"
            value={hostName}
            onChange={e => setHostName(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            onClick={createGroup}
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Buat Group Order
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" />
        <span>Group Order #{groupOrder.id.slice(-6)}</span>
        <span className={cn(
          'ml-auto rounded-full px-2 py-0.5 text-xs font-medium',
          groupOrder.status === 'OPEN' && 'bg-blue-100 text-blue-700',
          groupOrder.status === 'LOCKED' && 'bg-yellow-100 text-yellow-700',
          groupOrder.status === 'SUBMITTED' && 'bg-green-100 text-green-700',
        )}>
          {groupOrder.status}
        </span>
      </div>

      <div className="rounded-lg border divide-y">
        {aggregated.length === 0 ? (
          <p className="px-3 py-4 text-xs text-center text-muted-foreground">Belum ada item.</p>
        ) : (
          aggregated.map(item => (
            <div key={item.productId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1">{item.name}</span>
              <span className="text-muted-foreground">x{item.qty}</span>
              <span className="font-medium">{fmt(item.price * item.qty, currency)}</span>
            </div>
          ))
        )}
        {aggregated.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted">
            <span>Total</span>
            <span>{fmt(groupTotal, currency)}</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {groupOrder.status === 'OPEN' && (
        <button
          onClick={lockAndSubmit}
          disabled={loading || aggregated.length === 0}
          className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          Submit ke Kasir
        </button>
      )}

      {groupOrder.status === 'SUBMITTED' && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          <Check className="h-4 w-4" />
          Order sudah dikirim ke kasir
        </div>
      )}
    </div>
  )
}

// ─── Combined page client ─────────────────────────────────────────────────────

interface SplitBillClientProps {
  storeId: string
  currency?: string
}

export default function SplitBillClient({ storeId, currency = 'IDR' }: SplitBillClientProps) {
  const [tab, setTab] = useState<'split' | 'group'>('split')
  const [orderId, setOrderId] = useState('')
  const [orderTotal, setOrderTotal] = useState(0)
  const [tableNumber, setTableNumber] = useState('')

  const mockItems: OrderItem[] = [
    { id: 'item-1', name: 'Nasi Goreng', price: 25000, qty: 2, subtotal: 50000 },
    { id: 'item-2', name: 'Es Teh', price: 8000, qty: 3, subtotal: 24000 },
    { id: 'item-3', name: 'Ayam Goreng', price: 35000, qty: 1, subtotal: 35000 },
  ]

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold">Split Bill dan Group Order</h1>
        <p className="text-sm text-muted-foreground">Bagi tagihan atau buat pesanan bersama</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
        {(['split', 'group'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2',
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {t === 'split' ? <Split className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            {t === 'split' ? 'Split Tagihan' : 'Group Order'}
          </button>
        ))}
      </div>

      {tab === 'split' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">ID Order</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Order ID"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
            />
            <input
              type="number"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Total tagihan"
              value={orderTotal || ''}
              onChange={e => setOrderTotal(Number(e.target.value))}
            />
          </div>
          {orderId && orderTotal > 0 && (
            <SplitBillPanel
              orderId={orderId}
              storeId={storeId}
              orderTotal={orderTotal}
              orderItems={mockItems}
              currency={currency}
            />
          )}
        </div>
      )}

      {tab === 'group' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Nomor Meja</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Nomor meja"
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value)}
            />
          </div>
          {tableNumber && (
            <GroupOrderPanel
              storeId={storeId}
              tableNumber={tableNumber}
              currency={currency}
            />
          )}
        </div>
      )}
    </div>
  )
}

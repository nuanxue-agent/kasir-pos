'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Star, Clock, CreditCard, Phone, Mail, MapPin, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, Package } from 'lucide-react'
import { toast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type POStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

interface Vendor {
  id: string
  storeId: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  paymentTerms: string | null
  leadTimeDays: number
  rating: number
  active: number
  totalPurchases?: number
  totalOrders?: number
  lastOrderDate?: string | null
  avgRating?: number | null
}

interface PurchaseOrder {
  id: string
  number: string
  supplierId: string
  supplierName: string
  status: POStatus
  subtotal: number
  taxAmt: number
  total: number
  note: string | null
  expectedDate: string | null
  createdAt: string
}

interface POApproval {
  id: string
  poId: string
  userId: string
  action: 'APPROVED' | 'REJECTED'
  notes: string | null
  createdAt: string
  userName?: string
}

interface VendorPortalClientProps {
  storeId: string
  userRole: string
}

// ── Status config ─────────────────────────────────────────────────────────────

const PO_STATUS_CONFIG: Record<POStatus, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: 'Draft',     color: 'text-gray-600',  bg: 'bg-gray-100',   border: 'border-gray-200' },
  SUBMITTED: { label: 'Submitted', color: 'text-blue-700',  bg: 'bg-blue-50',    border: 'border-blue-200' },
  APPROVED:  { label: 'Approved',  color: 'text-green-700', bg: 'bg-green-50',   border: 'border-green-200' },
  ORDERED:   { label: 'Ordered',   color: 'text-purple-700',bg: 'bg-purple-50',  border: 'border-purple-200' },
  RECEIVED:  { label: 'Received',  color: 'text-teal-700',  bg: 'bg-teal-50',    border: 'border-teal-200' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700',   bg: 'bg-red-50',     border: 'border-red-200' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function StarRating({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={cn('h-3.5 w-3.5', i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
      ))}
      <span className="ml-1 text-xs text-gray-500">{value > 0 ? value.toFixed(1) : '–'}</span>
    </span>
  )
}

function POStatusBadge({ status }: { status: POStatus }) {
  const c = PO_STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border', c.bg, c.color, c.border)}>
      {c.label}
    </span>
  )
}

// ── Vendor Form ───────────────────────────────────────────────────────────────

interface VendorFormProps {
  initial?: Partial<Vendor>
  storeId: string
  onSave: () => void
  onCancel: () => void
}

function VendorForm({ initial, storeId, onSave, onCancel }: VendorFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? '')
  const [leadTimeDays, setLeadTimeDays] = useState(String(initial?.leadTimeDays ?? 7))
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) { toast.error('Nama vendor minimal 2 karakter'); return }
    setSaving(true)
    try {
      const url = initial?.id
        ? `/api/vendors/${initial.id}?storeId=${storeId}`
        : `/api/vendors?storeId=${storeId}`
      const method = initial?.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || null, phone: phone || null, address: address || null, paymentTerms: paymentTerms || null, leadTimeDays: Number(leadTimeDays) }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan')
      toast.success(initial?.id ? 'Vendor diperbarui' : 'Vendor ditambahkan')
      onSave()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Nama Vendor *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="CV. Supplier Jaya" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="vendor@example.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Telepon</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="0812-3456-7890" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Alamat</label>
          <input value={address} onChange={e => setAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Jl. Raya No. 1, Jakarta" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Syarat Pembayaran</label>
          <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">-- Pilih --</option>
            <option value="COD">COD (Tunai)</option>
            <option value="NET7">NET 7 hari</option>
            <option value="NET14">NET 14 hari</option>
            <option value="NET30">NET 30 hari</option>
            <option value="NET60">NET 60 hari</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Lead Time (hari)</label>
          <input type="number" min="0" max="365" value={leadTimeDays} onChange={e => setLeadTimeDays(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </form>
  )
}

// ── PO Approval Panel ─────────────────────────────────────────────────────────

interface POApprovalPanelProps {
  po: PurchaseOrder
  storeId: string
  userRole: string
  onUpdate: () => void
}

function POApprovalPanel({ po, storeId, userRole, onUpdate }: POApprovalPanelProps) {
  const [approvals, setApprovals] = useState<POApproval[]>([])
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)

  const canApprove = ['OWNER', 'MANAGER'].includes(userRole)

  const loadApprovals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/approvals?storeId=${storeId}`)
      if (res.ok) setApprovals(await res.json())
    } finally {
      setLoading(false)
    }
  }, [po.id, storeId])

  useEffect(() => { loadApprovals() }, [loadApprovals])

  async function act(action: 'approve' | 'reject' | 'submit') {
    setActing(true)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/${action}?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Gagal')
      toast.success(action === 'approve' ? 'PO disetujui' : action === 'reject' ? 'PO ditolak' : 'PO disubmit')
      setNotes('')
      onUpdate()
      loadApprovals()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Log Persetujuan</span>
        <POStatusBadge status={po.status} />
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Memuat...</p>
      ) : approvals.length === 0 ? (
        <p className="text-xs text-gray-400">Belum ada log persetujuan</p>
      ) : (
        <ul className="space-y-1">
          {approvals.map(a => (
            <li key={a.id} className="flex items-start gap-2 text-xs">
              {a.action === 'APPROVED'
                ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              }
              <span className="text-gray-600">
                <span className="font-medium">{a.action}</span>{a.notes ? ` — ${a.notes}` : ''}{' '}
                <span className="text-gray-400">{new Date(a.createdAt).toLocaleDateString('id-ID')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {po.status === 'DRAFT' && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => act('submit')} disabled={acting} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Submit untuk Persetujuan
          </button>
        </div>
      )}

      {po.status === 'SUBMITTED' && canApprove && (
        <div className="space-y-2 pt-1">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" placeholder="Catatan (opsional)..." />
          <div className="flex gap-2">
            <button onClick={() => act('approve')} disabled={acting} className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <CheckCircle className="h-3.5 w-3.5" /> Setujui
            </button>
            <button onClick={() => act('reject')} disabled={acting} className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
              <XCircle className="h-3.5 w-3.5" /> Tolak
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function VendorPortalClient({ storeId, userRole }: VendorPortalClientProps) {
  const [tab, setTab] = useState<'vendors' | 'orders'>('vendors')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [expandedPO, setExpandedPO] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('')

  const canManage = ['OWNER', 'MANAGER'].includes(userRole)

  const loadVendors = useCallback(async () => {
    setLoading(true)
    try {
      const q = search ? `&search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/vendors?storeId=${storeId}${q}`)
      if (res.ok) setVendors(await res.json())
    } finally {
      setLoading(false)
    }
  }, [storeId, search])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const q = statusFilter ? `&status=${statusFilter}` : ''
      const res = await fetch(`/api/purchase-orders?storeId=${storeId}${q}&limit=50`)
      if (res.ok) {
        const data = await res.json() as any
        setOrders(data.orders ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [storeId, statusFilter])

  useEffect(() => {
    if (tab === 'vendors') loadVendors()
    else loadOrders()
  }, [tab, loadVendors, loadOrders])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Portal Vendor</h1>
          <p className="text-sm text-gray-500">Kelola supplier dan alur persetujuan Purchase Order</p>
        </div>
        {tab === 'vendors' && canManage && (
          <button onClick={() => { setEditVendor(null); setShowForm(true) }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Tambah Vendor
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 w-fit">
        {(['vendors', 'orders'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors', tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
            {t === 'vendors' ? 'Vendor' : 'Purchase Order'}
          </button>
        ))}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">{editVendor ? 'Edit Vendor' : 'Tambah Vendor Baru'}</h2>
          <VendorForm
            initial={editVendor ?? undefined}
            storeId={storeId}
            onSave={() => { setShowForm(false); setEditVendor(null); loadVendors() }}
            onCancel={() => { setShowForm(false); setEditVendor(null) }}
          />
        </div>
      )}

      {/* Vendors Tab */}
      {tab === 'vendors' && (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari vendor..." className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : vendors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">Belum ada vendor terdaftar</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Vendor', 'Kontak', 'Pembayaran', 'Lead Time', 'Rating', 'Total PO', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendors.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{v.name}</div>
                        {v.address && <div className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3 w-3" />{v.address}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {v.email && <div className="flex items-center gap-1 text-xs text-gray-600"><Mail className="h-3 w-3" />{v.email}</div>}
                        {v.phone && <div className="flex items-center gap-1 text-xs text-gray-600"><Phone className="h-3 w-3" />{v.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {v.paymentTerms
                          ? <span className="inline-flex items-center gap-1 text-xs text-gray-600"><CreditCard className="h-3 w-3" />{v.paymentTerms}</span>
                          : <span className="text-xs text-gray-400">–</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-gray-600"><Clock className="h-3 w-3" />{v.leadTimeDays} hari</span>
                      </td>
                      <td className="px-4 py-3">
                        <StarRating value={v.avgRating ?? v.rating ?? 0} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{v.totalOrders ?? 0} PO</td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <button onClick={() => { setEditVendor(v); setShowForm(true) }} className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Purchase Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Status:</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as POStatus | '')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Semua</option>
              {(Object.keys(PO_STATUS_CONFIG) as POStatus[]).map(s => (
                <option key={s} value={s}>{PO_STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Memuat...</p>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">Tidak ada purchase order</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(po => (
                <div key={po.id} className="rounded-xl border border-gray-200 bg-white">
                  <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setExpandedPO(expandedPO === po.id ? null : po.id)}>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-gray-800">{po.number}</span>
                      <POStatusBadge status={po.status} />
                      <span className="text-sm text-gray-600">{po.supplierName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{fmt(po.total)}</span>
                      {expandedPO === po.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>
                  {expandedPO === po.id && (
                    <div className="border-t border-gray-100 px-4 pb-4">
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500 sm:grid-cols-4">
                        <div><span className="font-medium text-gray-700">Subtotal</span><br />{fmt(po.subtotal)}</div>
                        <div><span className="font-medium text-gray-700">Pajak</span><br />{fmt(po.taxAmt)}</div>
                        <div><span className="font-medium text-gray-700">Total</span><br />{fmt(po.total)}</div>
                        <div><span className="font-medium text-gray-700">Tgl Ekspektasi</span><br />{po.expectedDate ?? '–'}</div>
                      </div>
                      {po.note && <p className="mt-2 text-xs text-gray-500">Catatan: {po.note}</p>}
                      <POApprovalPanel
                        po={po}
                        storeId={storeId}
                        userRole={userRole}
                        onUpdate={loadOrders}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

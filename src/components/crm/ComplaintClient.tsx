'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Filter,
  ChevronDown,
  User,
  Package,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface ComplaintClientProps {
  storeId: string
  currency: string
}

type ComplaintCategory = 'PRODUCT_QUALITY' | 'SERVICE' | 'DELIVERY' | 'BILLING' | 'OTHER'
type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type ComplaintStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

interface Complaint {
  id: string
  storeId: string
  customerId: string | null
  customerName: string | null
  orderId: string | null
  category: ComplaintCategory
  description: string
  priority: ComplaintPriority
  status: ComplaintStatus
  assignedTo: string | null
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
}

interface ComplaintStats {
  totalComplaints: number
  newCount: number
  assignedCount: number
  inProgressCount: number
  resolvedCount: number
  closedCount: number
  avgResolutionHours: number | null
  byCategory: Record<ComplaintCategory, number>
  byPriority: Record<ComplaintPriority, number>
}

const CATEGORY_CONFIG: Record<ComplaintCategory, { label: string; icon: React.ReactNode; color: string }> = {
  PRODUCT_QUALITY: { label: 'Kualitas Produk', icon: <Package className="h-3.5 w-3.5" />, color: 'text-red-600 bg-red-50' },
  SERVICE: { label: 'Layanan', icon: <User className="h-3.5 w-3.5" />, color: 'text-blue-600 bg-blue-50' },
  DELIVERY: { label: 'Pengiriman', icon: <TrendingUp className="h-3.5 w-3.5" />, color: 'text-purple-600 bg-purple-50' },
  BILLING: { label: 'Tagihan', icon: <AlertCircle className="h-3.5 w-3.5" />, color: 'text-amber-600 bg-amber-50' },
  OTHER: { label: 'Lainnya', icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'text-gray-600 bg-gray-50' },
}

const PRIORITY_CONFIG: Record<ComplaintPriority, { label: string; color: string }> = {
  LOW: { label: 'Rendah', color: 'text-gray-600 bg-gray-50' },
  MEDIUM: { label: 'Sedang', color: 'text-blue-600 bg-blue-50' },
  HIGH: { label: 'Tinggi', color: 'text-amber-600 bg-amber-50' },
  URGENT: { label: 'Mendesak', color: 'text-red-600 bg-red-50' },
}

const STATUS_CONFIG: Record<ComplaintStatus, { label: string; icon: React.ReactNode; color: string }> = {
  NEW: { label: 'Baru', icon: <AlertCircle className="h-3.5 w-3.5" />, color: 'text-red-600 bg-red-50' },
  ASSIGNED: { label: 'Ditugaskan', icon: <User className="h-3.5 w-3.5" />, color: 'text-blue-600 bg-blue-50' },
  IN_PROGRESS: { label: 'Dikerjakan', icon: <Clock className="h-3.5 w-3.5" />, color: 'text-purple-600 bg-purple-50' },
  RESOLVED: { label: 'Diselesaikan', icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-emerald-600 bg-emerald-50' },
  CLOSED: { label: 'Ditutup', icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-gray-600 bg-gray-50' },
}

export default function ComplaintClient({ storeId, currency }: ComplaintClientProps) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'ALL'>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<ComplaintPriority | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | 'ALL'>('ALL')

  const [formData, setFormData] = useState({
    customerName: '',
    orderId: '',
    category: 'PRODUCT_QUALITY' as ComplaintCategory,
    description: '',
    priority: 'MEDIUM' as ComplaintPriority,
  })

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ['complaints', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/complaints?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch complaints')
      return (await res.json()) as Complaint[]
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['complaint-stats', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/stats?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return (await res.json()) as ComplaintStats
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/complaints?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = (await res.json()) as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints', storeId] })
      queryClient.invalidateQueries({ queryKey: ['complaint-stats', storeId] })
      toast.success('Keluhan berhasil dicatat')
      setShowForm(false)
      setFormData({
        customerName: '',
        orderId: '',
        category: 'PRODUCT_QUALITY',
        description: '',
        priority: 'MEDIUM',
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Complaint> }) => {
      const res = await fetch(`/api/complaints/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = (await res.json()) as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints', storeId] })
      queryClient.invalidateQueries({ queryKey: ['complaint-stats', storeId] })
      toast.success('Status berhasil diperbarui')
      setEditingId(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.description.trim()) {
      toast.error('Deskripsi keluhan wajib diisi')
      return
    }
    createMutation.mutate(formData)
  }

  const handleStatusChange = (id: string, status: ComplaintStatus) => {
    updateMutation.mutate({ id, data: { status } })
  }

  const handleResolve = (id: string, resolution: string) => {
    updateMutation.mutate({ id, data: { status: 'RESOLVED', resolution } })
  }

  const filteredComplaints = complaints.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (priorityFilter !== 'ALL' && c.priority !== priorityFilter) return false
    if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false
    return true
  })

  const formatDuration = (createdAt: string, resolvedAt: string | null) => {
    if (!resolvedAt) return '—'
    const diff = new Date(resolvedAt).getTime() - new Date(createdAt).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}h ${hours % 24}j`
    return `${hours}j`
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Keluhan Pelanggan</h1>
          <p className="text-sm text-[var(--text-3)]">Kelola dan selesaikan keluhan pelanggan</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Tutup' : 'Tambah Keluhan'}
        </button>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="text-sm text-[var(--text-3)]">Total Keluhan</div>
            <div className="mt-1 text-2xl font-bold text-[var(--text-1)]">{stats.totalComplaints}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="text-sm text-[var(--text-3)]">Belum Ditangani</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{stats.newCount}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="text-sm text-[var(--text-3)]">Dalam Proses</div>
            <div className="mt-1 text-2xl font-bold text-blue-600">{stats.inProgressCount}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="text-sm text-[var(--text-3)]">Rata-rata Penyelesaian</div>
            <div className="mt-1 text-2xl font-bold text-[var(--text-1)]">
              {stats.avgResolutionHours ? `${Math.round(stats.avgResolutionHours)}j` : '—'}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Catat Keluhan Baru</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Nama Pelanggan</label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="Opsional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Order ID</label>
                <input
                  type="text"
                  value={formData.orderId}
                  onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="Opsional"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Kategori</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as ComplaintCategory })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                >
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Prioritas</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as ComplaintPriority })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Deskripsi Keluhan *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                placeholder="Jelaskan keluhan pelanggan..."
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)]"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | 'ALL')}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)]"
        >
          <option value="ALL">Semua Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as ComplaintPriority | 'ALL')}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)]"
        >
          <option value="ALL">Semua Prioritas</option>
          {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ComplaintCategory | 'ALL')}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)]"
        >
          <option value="ALL">Semua Kategori</option>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-[var(--text-3)]" />
            <p className="mt-2 text-sm text-[var(--text-3)]">Belum ada keluhan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--border)] bg-[var(--bg-2)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Pelanggan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Deskripsi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Prioritas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredComplaints.map((complaint) => {
                  const categoryConfig = CATEGORY_CONFIG[complaint.category]
                  const priorityConfig = PRIORITY_CONFIG[complaint.priority]
                  const statusConfig = STATUS_CONFIG[complaint.status]

                  return (
                    <tr key={complaint.id} className="hover:bg-[var(--bg-2)]">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-[var(--text-1)]">
                          {complaint.customerName || 'Anonim'}
                        </div>
                        {complaint.orderId && (
                          <div className="text-xs text-[var(--text-3)]">Order: {complaint.orderId}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                            categoryConfig.color,
                          )}
                        >
                          {categoryConfig.icon}
                          {categoryConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs truncate text-sm text-[var(--text-2)]">{complaint.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                            priorityConfig.color,
                          )}
                        >
                          {priorityConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {editingId === complaint.id ? (
                          <select
                            value={complaint.status}
                            onChange={(e) => {
                              handleStatusChange(complaint.id, e.target.value as ComplaintStatus)
                            }}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1 text-xs text-[var(--text-1)]"
                          >
                            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                              <option key={key} value={key}>
                                {cfg.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                              statusConfig.color,
                            )}
                          >
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-[var(--text-3)]">
                          {new Date(complaint.createdAt).toLocaleDateString('id-ID')}
                        </div>
                        {complaint.resolvedAt && (
                          <div className="text-xs text-emerald-600">
                            Waktu: {formatDuration(complaint.createdAt, complaint.resolvedAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === complaint.id ? (
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-[var(--primary)] hover:underline"
                          >
                            Tutup
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingId(complaint.id)}
                            className="text-xs text-[var(--primary)] hover:underline"
                          >
                            Ubah Status
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

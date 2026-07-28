'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, Plus, Copy, Check, ChevronDown, ExternalLink, Trash2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  aggregateRatings,
  filterBySource,
  selectFeatured,
  generateEmbedCode,
  generateScriptTag,
  isValidStatusTransition,
} from '@/lib/testimonials'
import type { Testimonial, TestimonialSource, TestimonialStatus } from '@/lib/testimonials'

// Re-export pure functions for unit tests
export {
  aggregateRatings,
  filterBySource,
  selectFeatured,
  generateEmbedCode,
  generateScriptTag,
  isValidStatusTransition,
}
export type { Testimonial, TestimonialSource, TestimonialStatus }

interface Props {
  storeId: string
  currency: string
}

const SOURCE_LABELS: Record<TestimonialSource, string> = {
  IN_APP: 'In-App',
  GOOGLE: 'Google',
  TOKOPEDIA: 'Tokopedia',
  SHOPEE: 'Shopee',
  MANUAL: 'Manual',
}

const STATUS_COLORS: Record<TestimonialStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  FEATURED: 'bg-purple-100 text-purple-800',
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5',
            i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--border)]',
          )}
        />
      ))}
    </div>
  )
}

function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        >
          <Star
            className={cn(
              'w-6 h-6 transition-colors',
              i <= (hover || value) ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--border)]',
            )}
          />
        </button>
      ))}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-[var(--bg-2)] transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function TestimonialClient({ storeId }: Props) {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'list' | 'featured' | 'embed'>('list')
  const [statusFilter, setStatusFilter] = useState<TestimonialStatus | 'ALL'>('ALL')
  const [sourceFilter, setSourceFilter] = useState<TestimonialSource | 'ALL'>('ALL')
  const [showAdd, setShowAdd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Add form state
  const [form, setForm] = useState({
    customerName: '',
    content: '',
    rating: 5,
    source: 'MANUAL' as TestimonialSource,
    mediaUrl: '',
  })

  const fetchTestimonials = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/testimonials?storeId=${storeId}`)
      const data = (await res.json()) as any
      if (Array.isArray(data)) setTestimonials(data)
    } catch {
      toast.error('Gagal memuat testimoni')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { fetchTestimonials() }, [fetchTestimonials])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName.trim() || !form.content.trim()) {
      toast.error('Nama dan konten wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/testimonials?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await res.json()) as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Testimoni ditambahkan')
      setShowAdd(false)
      setForm({ customerName: '', content: '', rating: 5, source: 'MANUAL', mediaUrl: '' })
      fetchTestimonials()
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (id: string, currentStatus: TestimonialStatus, newStatus: TestimonialStatus) => {
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      toast.error(`Tidak bisa transisi dari ${currentStatus} ke ${newStatus}`)
      return
    }
    const res = await fetch(`/api/testimonials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const data = (await res.json()) as any
    if (data.error) { toast.error(data.error); return }
    toast.success('Status diperbarui')
    fetchTestimonials()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus testimoni ini?')) return
    const res = await fetch(`/api/testimonials/${id}`, { method: 'DELETE' })
    const data = (await res.json()) as any
    if (data.error) { toast.error(data.error); return }
    toast.success('Testimoni dihapus')
    fetchTestimonials()
  }

  // Derived data
  const filtered = filterBySource(
    statusFilter === 'ALL' ? testimonials : testimonials.filter(t => t.status === statusFilter),
    sourceFilter,
  )
  const stats = aggregateRatings(testimonials.filter(t => t.status !== 'REJECTED'))
  const featured = selectFeatured(testimonials)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const embedCode = generateEmbedCode(baseUrl, { storeId })
  const scriptTag = generateScriptTag(baseUrl, storeId)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Testimoni Pelanggan</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola dan tampilkan ulasan terbaik</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Tambah Testimoni
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-xs text-[var(--text-3)] mb-1">Total</div>
          <div className="text-2xl font-bold text-[var(--text-1)]">{testimonials.length}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-xs text-[var(--text-3)] mb-1">Rata-rata Rating</div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-bold text-[var(--text-1)]">{stats.average}</span>
            <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-xs text-[var(--text-3)] mb-1">Menunggu Review</div>
          <div className="text-2xl font-bold text-yellow-500">
            {testimonials.filter(t => t.status === 'PENDING').length}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-xs text-[var(--text-3)] mb-1">Featured</div>
          <div className="text-2xl font-bold text-purple-500">
            {testimonials.filter(t => t.status === 'FEATURED').length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-2)] w-fit">
        {(['list', 'featured', 'embed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'list' ? 'Semua' : t === 'featured' ? 'Featured' : 'Embed Code'}
          </button>
        ))}
      </div>

      {/* LIST TAB */}
      {tab === 'list' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)]"
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="FEATURED">Featured</option>
            </select>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)]"
            >
              <option value="ALL">Semua Sumber</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
              Memuat...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-3)]">
              <MessageSquare className="w-10 h-10 opacity-30" />
              <p>Belum ada testimoni</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(t => (
                <div key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-[var(--text-1)]">{t.customerName}</span>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[t.status as TestimonialStatus])}>
                          {t.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--bg-2)] text-[var(--text-3)]">
                          {SOURCE_LABELS[t.source as TestimonialSource]}
                        </span>
                      </div>
                      <StarRating rating={t.rating} />
                      <p className="mt-2 text-sm text-[var(--text-2)] leading-relaxed">{t.content}</p>
                      {t.mediaUrl && (
                        <a
                          href={t.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" /> Media
                        </a>
                      )}
                      <div className="mt-1 text-xs text-[var(--text-3)]">
                        {new Date(t.createdAt).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {t.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(t.id, t.status as TestimonialStatus, 'APPROVED')}
                            className="px-2.5 py-1 text-xs rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleStatusChange(t.id, t.status as TestimonialStatus, 'REJECTED')}
                            className="px-2.5 py-1 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {t.status === 'APPROVED' && (
                        <button
                          onClick={() => handleStatusChange(t.id, t.status as TestimonialStatus, 'FEATURED')}
                          className="px-2.5 py-1 text-xs rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                        >
                          Feature
                        </button>
                      )}
                      {t.status === 'FEATURED' && (
                        <button
                          onClick={() => handleStatusChange(t.id, t.status as TestimonialStatus, 'APPROVED')}
                          className="px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-2)] text-[var(--text-2)] hover:bg-[var(--border)] transition-colors"
                        >
                          Unfeature
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FEATURED TAB */}
      {tab === 'featured' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-3)]">
            Menampilkan {featured.length} testimoni terbaik berdasarkan rating dan status.
          </p>
          {featured.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-3)]">
              <Star className="w-10 h-10 opacity-30" />
              <p>Belum ada testimoni featured. Approve dan feature testimoni terbaik.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map(t => (
                <div
                  key={t.id}
                  className={cn(
                    'rounded-xl border p-5 space-y-3',
                    t.status === 'FEATURED'
                      ? 'border-purple-300 bg-purple-50 dark:bg-purple-900/10'
                      : 'border-[var(--border)] bg-[var(--bg-card)]',
                  )}
                >
                  <StarRating rating={t.rating} size="lg" />
                  <p className="text-sm text-[var(--text-2)] leading-relaxed italic">"{t.content}"</p>
                  <div>
                    <div className="font-semibold text-sm text-[var(--text-1)]">{t.customerName}</div>
                    <div className="text-xs text-[var(--text-3)]">{SOURCE_LABELS[t.source as TestimonialSource]}</div>
                  </div>
                  {t.status === 'FEATURED' && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 font-medium">
                      ★ Featured
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EMBED TAB */}
      {tab === 'embed' && (
        <div className="space-y-6">
          <p className="text-sm text-[var(--text-2)]">
            Salin kode di bawah untuk menampilkan widget testimoni di website eksternal Anda.
          </p>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-[var(--text-1)]">Script Tag (Auto-load)</h3>
              <CopyButton text={scriptTag} />
            </div>
            <pre className="text-xs bg-[var(--bg-2)] rounded-lg p-3 overflow-x-auto text-[var(--text-2)] whitespace-pre-wrap break-all">
              {scriptTag}
            </pre>
            <p className="text-xs text-[var(--text-3)]">
              Tambahkan ke halaman HTML Anda. Widget akan muncul di elemen dengan <code>id="kasir-testimonials"</code>.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-[var(--text-1)]">Full Embed Code</h3>
              <CopyButton text={embedCode} />
            </div>
            <pre className="text-xs bg-[var(--bg-2)] rounded-lg p-3 overflow-x-auto text-[var(--text-2)] whitespace-pre-wrap break-all">
              {embedCode}
            </pre>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
            <h3 className="font-semibold text-sm text-[var(--text-1)]">Widget API Endpoint</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-[var(--bg-2)] rounded-lg px-3 py-2 text-[var(--text-2)] break-all">
                {baseUrl}/api/testimonials/widget?storeId={storeId}
              </code>
              <CopyButton text={`${baseUrl}/api/testimonials/widget?storeId=${storeId}`} />
            </div>
            <p className="text-xs text-[var(--text-3)]">
              Endpoint publik JSON — gunakan untuk integrasi custom atau fetch langsung.
            </p>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-6 space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-1)]">Tambah Testimoni</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nama Pelanggan *</label>
                <input
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)]"
                  placeholder="Budi Santoso"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Konten *</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)] resize-none"
                  placeholder="Produknya sangat bagus..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Rating</label>
                <RatingInput value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Sumber</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value as TestimonialSource }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)]"
                >
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">URL Media (opsional)</label>
                <input
                  value={form.mediaUrl}
                  onChange={e => setForm(f => ({ ...f, mediaUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)]"
                  placeholder="https://..."
                  type="url"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

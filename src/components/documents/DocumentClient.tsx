'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Upload,
  Search,
  Plus,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  FileImage,
  Tag,
  Calendar,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

export type DocumentType = 'CONTRACT' | 'INVOICE' | 'RECEIPT' | 'REPORT' | 'OTHER'

export interface Document {
  id: string
  storeId: string
  name: string
  type: DocumentType
  url: string
  size: number
  uploadedBy: string
  createdAt: string
  expiresAt?: string | null
  tags: string[]
}

interface DocumentClientProps {
  storeId: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TYPE_CONFIG: Record<DocumentType, { label: string; color: string }> = {
  CONTRACT: { label: 'Kontrak', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  INVOICE:  { label: 'Invoice', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  RECEIPT:  { label: 'Kwitansi', color: 'bg-green-50 text-green-700 border-green-200' },
  REPORT:   { label: 'Laporan', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  OTHER:    { label: 'Lainnya', color: 'bg-gray-50 text-gray-600 border-gray-200' },
}

const TYPE_TABS: { value: DocumentType | ''; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'CONTRACT', label: 'Kontrak' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'RECEIPT', label: 'Kwitansi' },
  { value: 'REPORT', label: 'Laporan' },
  { value: 'OTHER', label: 'Lainnya' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isExpiringSoon(expiresAt: string | null | undefined, days = 30): boolean {
  if (!expiresAt) return false
  const exp = new Date(expiresAt).getTime()
  const now = Date.now()
  return exp > now && exp - now < days * 24 * 60 * 60 * 1000
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}

export function parseTags(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw.map(t => t.trim()).filter(Boolean)
  return raw.split(',').map(t => t.trim()).filter(Boolean)
}

export function filterDocuments(
  docs: Document[],
  search: string,
  type: DocumentType | '',
  tag: string,
): Document[] {
  const q = search.toLowerCase()
  return docs.filter(d => {
    if (type && d.type !== type) return false
    if (tag && !d.tags.includes(tag)) return false
    if (q && !d.name.toLowerCase().includes(q) && !d.tags.some(t => t.toLowerCase().includes(q))) return false
    return true
  })
}

export function validateDocumentType(type: string): type is DocumentType {
  return ['CONTRACT', 'INVOICE', 'RECEIPT', 'REPORT', 'OTHER'].includes(type)
}

// ── API fetchers ──────────────────────────────────────────────────────────────

async function fetchDocuments(storeId: string): Promise<Document[]> {
  const res = await fetch(`/api/documents?storeId=${storeId}`)
  if (!res.ok) throw new Error('Gagal memuat dokumen')
  const data = await res.json() as { items?: any[] }
  return data.items ?? []
}

async function deleteDocument(id: string, storeId: string): Promise<void> {
  const res = await fetch(`/api/documents/${id}?storeId=${storeId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Gagal menghapus dokumen')
}

async function generateDocument(
  storeId: string,
  type: 'INVOICE' | 'RECEIPT' | 'REPORT',
): Promise<Document> {
  const res = await fetch('/api/documents/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, type }),
  })
  if (!res.ok) throw new Error('Gagal membuat dokumen')
  return res.json()
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  storeId,
  onClose,
  onUploaded,
}: {
  storeId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocumentType>('OTHER')
  const [expiresAt, setExpiresAt] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('storeId', storeId)
      form.append('type', docType)
      if (expiresAt) form.append('expiresAt', expiresAt)
      form.append('tags', JSON.stringify(parseTags(tagsInput)))

      const res = await fetch('/api/documents', { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Upload gagal')
        throw new Error(d.error ?? 'Upload gagal')
      }
      onUploaded()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Upload Dokumen</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-hover)]">
            <X size={18} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors',
            dragging
              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
              : 'border-[var(--border)] hover:border-[var(--accent)]/50',
          )}
        >
          <Upload size={28} className="mb-2 text-[var(--text-3)]" />
          {file ? (
            <p className="text-sm font-medium text-[var(--text-1)]">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--text-2)]">Seret file ke sini</p>
              <p className="text-xs text-[var(--text-3)]">atau klik untuk memilih</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
            onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
          />
        </div>

        <div className="mt-4 space-y-3">
          {/* Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Tipe Dokumen</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as DocumentType)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map(t => (
                <option key={t} value={t}>{DOC_TYPE_CONFIG[t].label}</option>
              ))}
            </select>
          </div>

          {/* Expires */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Kadaluarsa (opsional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Tag (pisahkan koma)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="kontrak, 2025, vendor"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            Batal
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 rounded-xl bg-[var(--accent)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? 'Mengupload…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const isPdf = doc.url.toLowerCase().includes('.pdf') || doc.name.toLowerCase().endsWith('.pdf')
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(doc.name)

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 p-4">
      <div className="mb-3 flex w-full max-w-4xl items-center justify-between">
        <p className="truncate text-sm font-medium text-white">{doc.name}</p>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/20">
          <X size={20} className="text-white" />
        </button>
      </div>
      <div className="h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white">
        {isPdf ? (
          <embed src={doc.url} type="application/pdf" className="h-full w-full" />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.url} alt={doc.name} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
            <FileText size={48} />
            <p className="text-sm">Preview tidak tersedia untuk tipe file ini</p>
            <a
              href={doc.url}
              download={doc.name}
              className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generate Modal ────────────────────────────────────────────────────────────

function GenerateModal({
  storeId,
  onClose,
  onGenerated,
}: {
  storeId: string
  onClose: () => void
  onGenerated: () => void
}) {
  const [type, setType] = useState<'INVOICE' | 'RECEIPT' | 'REPORT'>('INVOICE')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    setGenerating(true)
    setError('')
    try {
      await generateDocument(storeId, type)
      onGenerated()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const descriptions: Record<string, string> = {
    INVOICE: 'Buat invoice baru dari template standar',
    RECEIPT: 'Buat kwitansi dari data pesanan terakhir',
    REPORT: 'Buat laporan ringkasan bulan berjalan',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Buat dari Template</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-hover)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          {(['INVOICE', 'RECEIPT', 'REPORT'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'w-full rounded-xl border p-3 text-left transition-colors',
                type === t
                  ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                  : 'border-[var(--border)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <p className="text-sm font-medium text-[var(--text-1)]">{DOC_TYPE_CONFIG[t].label}</p>
              <p className="text-xs text-[var(--text-3)]">{descriptions[t]}</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            Batal
          </button>
          <button
            onClick={handle}
            disabled={generating}
            className="flex-1 rounded-xl bg-[var(--accent)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {generating ? 'Membuat…' : 'Buat Dokumen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DocumentClient({ storeId }: DocumentClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('')
  const [tagFilter, setTagFilter] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [preview, setPreview] = useState<Document | null>(null)

  const { data: docs = [], isLoading } = useQuery<Document[]>({
    queryKey: ['documents', storeId],
    queryFn: () => fetchDocuments(storeId),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id, storeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', storeId] }),
  })

  const filtered = filterDocuments(docs, search, typeFilter, tagFilter)

  // Collect all tags for filter chips
  const allTags = Array.from(new Set(docs.flatMap(d => d.tags))).sort()

  // Expiry alerts
  const expiring = docs.filter(d => isExpiringSoon(d.expiresAt))

  const refresh = () => qc.invalidateQueries({ queryKey: ['documents', storeId] })

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Dokumen</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            {docs.length} dokumen tersimpan
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-hover)]"
          >
            <FileText size={15} />
            Buat dari Template
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Upload size={15} />
            Upload
          </button>
        </div>
      </div>

      {/* Expiry alerts */}
      {expiring.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {expiring.length} dokumen akan kadaluarsa dalam 30 hari
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              {expiring.map(d => d.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="text"
            placeholder="Cari nama atau tag…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Type tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPE_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setTypeFilter(tab.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              typeFilter === tab.value
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-muted)] text-[var(--text-2)] hover:bg-[var(--bg-hover)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                tagFilter === tag
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent)]/50',
              )}
            >
              <Tag size={10} />
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-[var(--text-3)]">Memuat dokumen…</div>
      ) : filtered.length === 0 ? (
        <div className="space-y-2 py-16 text-center">
          <FileText size={40} className="mx-auto text-[var(--text-3)]" />
          <p className="font-medium text-[var(--text-2)]">Belum ada dokumen</p>
          <p className="text-sm text-[var(--text-3)]">
            Klik &quot;Upload&quot; untuk menambahkan dokumen
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const cfg = DOC_TYPE_CONFIG[doc.type]
            const expiring = isExpiringSoon(doc.expiresAt)
            const expired = isExpired(doc.expiresAt)

            return (
              <div
                key={doc.id}
                className={cn(
                  'flex items-center gap-4 rounded-xl border bg-[var(--bg-surface)] p-4 transition-shadow hover:shadow-sm',
                  expiring ? 'border-amber-300' : expired ? 'border-red-300' : 'border-[var(--border)]',
                )}
              >
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)]">
                  <FileText size={20} className="text-[var(--text-2)]" />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--text-1)]">{doc.name}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                        cfg.color,
                      )}
                    >
                      {cfg.label}
                    </span>
                    {expiring && (
                      <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <AlertTriangle size={10} />
                        Segera kadaluarsa
                      </span>
                    )}
                    {expired && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        Kadaluarsa
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-[var(--text-3)]">
                    <span>{formatFileSize(doc.size)}</span>
                    <span>{formatDate(doc.createdAt)}</span>
                    {doc.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        Exp: {formatDate(doc.expiresAt)}
                      </span>
                    )}
                    {doc.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag size={10} />
                        {doc.tags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setPreview(doc)}
                    className="rounded-lg p-2 text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-1)]"
                    title="Preview"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Hapus "${doc.name}"?`)) deleteMutation.mutate(doc.id)
                    }}
                    className="rounded-lg p-2 text-[var(--text-3)] hover:bg-red-50 hover:text-red-500"
                    title="Hapus"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          storeId={storeId}
          onClose={() => setShowUpload(false)}
          onUploaded={refresh}
        />
      )}
      {showGenerate && (
        <GenerateModal
          storeId={storeId}
          onClose={() => setShowGenerate(false)}
          onGenerated={refresh}
        />
      )}
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

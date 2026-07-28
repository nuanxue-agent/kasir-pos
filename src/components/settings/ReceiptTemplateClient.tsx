'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Printer,
  Plus,
  Pencil,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Loader2,
  FileText,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FontSize = 'SMALL' | 'MEDIUM' | 'LARGE'
export type PaperWidth = '58mm' | '80mm'
export type TemplateType = 'POS' | 'DELIVERY' | 'RETURNS'

export interface ReceiptTemplate {
  id: string
  storeId: string
  name: string
  type: TemplateType
  headerText: string
  footerText: string
  showLogo: boolean
  showTax: boolean
  showBarcode: boolean
  fontSize: FontSize
  paperWidth: PaperWidth
  active: boolean
  createdAt: string
}

interface ReceiptTemplateClientProps {
  storeId: string
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export const FONT_SIZE_MAP: Record<FontSize, { label: string; px: number }> = {
  SMALL:  { label: 'Kecil',   px: 10 },
  MEDIUM: { label: 'Sedang',  px: 12 },
  LARGE:  { label: 'Besar',   px: 14 },
}

export const PAPER_WIDTH_OPTIONS: PaperWidth[] = ['58mm', '80mm']

export const PAPER_WIDTH_MAP: Record<PaperWidth, { label: string; cols: number }> = {
  '58mm': { label: '58 mm (Standar)', cols: 32 },
  '80mm': { label: '80 mm (Lebar)',   cols: 48 },
}

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  POS:      'Kasir (POS)',
  DELIVERY: 'Pengiriman',
  RETURNS:  'Retur',
}

/** Validate required fields on a receipt template. Returns error message or null. */
export function validateTemplate(
  t: Partial<ReceiptTemplate>,
): string | null {
  if (!t.name?.trim()) return "Field 'name' wajib diisi"
  if (!t.type) return "Field 'type' wajib diisi"
  if (!PAPER_WIDTH_OPTIONS.includes(t.paperWidth as PaperWidth))
    return `paperWidth harus salah satu dari: ${PAPER_WIDTH_OPTIONS.join(', ')}`
  if (!(['SMALL', 'MEDIUM', 'LARGE'] as FontSize[]).includes(t.fontSize as FontSize))
    return "fontSize harus SMALL, MEDIUM, atau LARGE"
  return null
}

/** Pick the active template for a given type, fallback to first matching type. */
export function getActiveTemplate(
  templates: ReceiptTemplate[],
  type: TemplateType,
): ReceiptTemplate | null {
  return (
    templates.find(t => t.type === type && t.active) ??
    templates.find(t => t.type === type) ??
    null
  )
}

/** Build a default template skeleton for a given type. */
export function buildDefaultTemplate(
  storeId: string,
  type: TemplateType,
): Omit<ReceiptTemplate, 'id' | 'createdAt'> {
  return {
    storeId,
    name: `Template ${TEMPLATE_TYPE_LABELS[type]}`,
    type,
    headerText: 'Terima kasih telah berbelanja!',
    footerText: 'Barang yang sudah dibeli tidak dapat dikembalikan.',
    showLogo: true,
    showTax: true,
    showBarcode: false,
    fontSize: 'MEDIUM',
    paperWidth: '80mm',
    active: true,
  }
}

// ─── Receipt Preview ──────────────────────────────────────────────────────────

function ReceiptPreview({ tpl }: { tpl: Partial<ReceiptTemplate> }) {
  const width = tpl.paperWidth === '58mm' ? 220 : 300
  const fs = FONT_SIZE_MAP[(tpl.fontSize as FontSize) ?? 'MEDIUM'].px

  return (
    <div
      className="mx-auto rounded-lg border border-dashed border-[var(--border)] bg-white p-4 font-mono shadow-sm"
      style={{ width, fontSize: fs }}
    >
      {/* Header */}
      {tpl.showLogo && (
        <div
          className="mb-1 rounded border border-dashed border-gray-300 bg-gray-100 text-center text-[9px] text-gray-400"
          style={{ padding: '6px 0' }}
        >
          [LOGO TOKO]
        </div>
      )}
      <div className="mb-1 text-center font-bold" style={{ fontSize: fs + 2 }}>
        Nama Toko
      </div>
      <div className="mb-1 text-center text-gray-500" style={{ fontSize: fs - 1 }}>
        Jl. Contoh No. 1, Jakarta
      </div>
      {tpl.headerText && (
        <div className="mb-2 text-center italic text-gray-600" style={{ fontSize: fs - 1 }}>
          {tpl.headerText}
        </div>
      )}

      {/* Divider */}
      <div className="mb-2 border-t border-dashed border-gray-300" />

      {/* Items */}
      <div className="mb-1 flex justify-between">
        <span>Nasi Goreng x1</span>
        <span>Rp 25.000</span>
      </div>
      <div className="mb-1 flex justify-between">
        <span>Es Teh x2</span>
        <span>Rp 10.000</span>
      </div>
      <div className="mb-2 border-t border-dashed border-gray-300" />

      {/* Totals */}
      {tpl.showTax && (
        <div className="flex justify-between text-gray-500">
          <span>PPN 11%</span>
          <span>Rp 3.850</span>
        </div>
      )}
      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>Rp {tpl.showTax ? '38.850' : '35.000'}</span>
      </div>

      {/* Barcode */}
      {tpl.showBarcode && (
        <div className="mt-2 text-center">
          <div className="mx-auto inline-block border border-gray-300 px-3 py-1">
            <div className="flex gap-px">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-black"
                  style={{ width: i % 3 === 0 ? 2 : 1, height: 24 }}
                />
              ))}
            </div>
            <div className="mt-0.5 text-center" style={{ fontSize: 7 }}>
              TRX-20250101-001
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {tpl.footerText && (
        <>
          <div className="mt-2 border-t border-dashed border-gray-300" />
          <div className="mt-1 text-center text-gray-500" style={{ fontSize: fs - 1 }}>
            {tpl.footerText}
          </div>
        </>
      )}

      {/* Paper width label */}
      <div className="mt-2 text-center text-[8px] text-gray-300">
        {tpl.paperWidth ?? '80mm'} — {tpl.fontSize ?? 'MEDIUM'}
      </div>
    </div>
  )
}

// ─── Template Form ────────────────────────────────────────────────────────────

const EMPTY_FORM: Omit<ReceiptTemplate, 'id' | 'storeId' | 'createdAt'> = {
  name: '',
  type: 'POS',
  headerText: 'Terima kasih telah berbelanja!',
  footerText: 'Barang yang sudah dibeli tidak dapat dikembalikan.',
  showLogo: true,
  showTax: true,
  showBarcode: false,
  fontSize: 'MEDIUM',
  paperWidth: '80mm',
  active: true,
}

function TemplateForm({
  storeId,
  initial,
  onSaved,
  onCancel,
}: {
  storeId: string
  initial?: ReceiptTemplate
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Omit<ReceiptTemplate, 'id' | 'storeId' | 'createdAt'>>(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          headerText: initial.headerText,
          footerText: initial.footerText,
          showLogo: initial.showLogo,
          showTax: initial.showTax,
          showBarcode: initial.showBarcode,
          fontSize: initial.fontSize,
          paperWidth: initial.paperWidth,
          active: initial.active,
        }
      : { ...EMPTY_FORM },
  )
  const [saving, setSaving] = useState(false)

  function field<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function save() {
    const err = validateTemplate(form)
    if (err) { toast.error(err); return }

    setSaving(true)
    try {
      let res: Response
      if (initial) {
        res = await fetch(`/api/receipt-templates/${initial.id}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch(`/api/receipt-templates?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, ...form }),
        })
      }
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Gagal menyimpan')
      }
      toast.success(initial ? 'Template diperbarui' : 'Template ditambahkan')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Left: form fields */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[var(--text-3)]">
            Nama Template *
          </label>
          <input
            value={form.name}
            onChange={e => field('name', e.target.value)}
            placeholder="cth. Struk Kasir Utama"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Type */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[var(--text-3)]">
            Jenis Struk
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map(t => (
              <button
                key={t}
                onClick={() => field('type', t)}
                className={`rounded-lg border px-2 py-2 text-[10px] font-semibold transition-all ${
                  form.type === t
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:border-amber-200'
                }`}
              >
                {TEMPLATE_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Paper width */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[var(--text-3)]">
            Lebar Kertas
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PAPER_WIDTH_OPTIONS.map(w => (
              <button
                key={w}
                onClick={() => field('paperWidth', w)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                  form.paperWidth === w
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:border-blue-200'
                }`}
              >
                {PAPER_WIDTH_MAP[w].label}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[var(--text-3)]">
            Ukuran Font
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(FONT_SIZE_MAP) as FontSize[]).map(s => (
              <button
                key={s}
                onClick={() => field('fontSize', s)}
                className={`rounded-lg border px-2 py-2 text-[10px] font-semibold transition-all ${
                  form.fontSize === s
                    ? 'border-violet-400 bg-violet-50 text-violet-700'
                    : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:border-violet-200'
                }`}
              >
                {FONT_SIZE_MAP[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Header / footer text */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[var(--text-3)]">
            Teks Header
          </label>
          <input
            value={form.headerText}
            onChange={e => field('headerText', e.target.value)}
            placeholder="cth. Terima kasih telah berbelanja!"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[var(--text-3)]">
            Teks Footer
          </label>
          <input
            value={form.footerText}
            onChange={e => field('footerText', e.target.value)}
            placeholder="cth. Barang tidak dapat dikembalikan."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-1)] focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          {(
            [
              { key: 'showLogo',    label: 'Tampilkan Logo Toko' },
              { key: 'showTax',     label: 'Tampilkan Rincian Pajak' },
              { key: 'showBarcode', label: 'Tampilkan Barcode / QR' },
            ] as { key: keyof typeof form; label: string }[]
          ).map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2"
            >
              <span className="text-xs text-[var(--text-2)]">{label}</span>
              <button
                onClick={() => field(key, !form[key] as any)}
                aria-label={label}
              >
                {form[key] ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-[var(--text-3)]" />
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {initial ? 'Perbarui Template' : 'Simpan Template'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Right: live preview */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
          Pratinjau Struk
        </p>
        <ReceiptPreview tpl={form} />
      </div>
    </div>
  )
}

// ─── Template Row ─────────────────────────────────────────────────────────────

function TemplateRow({
  tpl,
  storeId,
  onUpdated,
  onEdit,
}: {
  tpl: ReceiptTemplate
  storeId: string
  onUpdated: () => void
  onEdit: (t: ReceiptTemplate) => void
}) {
  const [toggling, setToggling] = useState(false)

  async function toggle(patch: Partial<ReceiptTemplate>) {
    setToggling(true)
    try {
      const res = await fetch(`/api/receipt-templates/${tpl.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Gagal memperbarui')
      }
      onUpdated()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)]">
        <FileText className="h-4 w-4 text-[var(--text-3)]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-1)] truncate">{tpl.name}</span>
          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">
            {TEMPLATE_TYPE_LABELS[tpl.type]}
          </span>
          {tpl.active && (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <Star className="h-2.5 w-2.5" /> Aktif
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">
          {PAPER_WIDTH_MAP[tpl.paperWidth].label} · Font {FONT_SIZE_MAP[tpl.fontSize].label}
          {tpl.showLogo && ' · Logo'}
          {tpl.showTax && ' · Pajak'}
          {tpl.showBarcode && ' · Barcode'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onEdit(tpl)}
          title="Edit template"
          className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-3)] hover:border-amber-300 hover:text-amber-600"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => toggle({ active: !tpl.active })}
          disabled={toggling}
          aria-label={tpl.active ? 'Nonaktifkan' : 'Aktifkan'}
        >
          {tpl.active ? (
            <ToggleRight className="h-6 w-6 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-[var(--text-3)]" />
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReceiptTemplateClient({ storeId }: ReceiptTemplateClientProps) {
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ReceiptTemplate | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/receipt-templates?storeId=${storeId}`)
      if (res.ok) {
        const data = await res.json() as ReceiptTemplate[]
        setTemplates(data)
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { load() }, [load])

  function handleSaved() {
    setShowForm(false)
    setEditing(null)
    load()
  }

  function handleEdit(tpl: ReceiptTemplate) {
    setEditing(tpl)
    setShowForm(true)
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[var(--bg-subtle)]" />
        ))}
      </div>
    )
  }

  const grouped: Record<TemplateType, ReceiptTemplate[]> = {
    POS: templates.filter(t => t.type === 'POS'),
    DELIVERY: templates.filter(t => t.type === 'DELIVERY'),
    RETURNS: templates.filter(t => t.type === 'RETURNS'),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-amber-500" />
          <div>
            <h3 className="text-sm font-bold text-[var(--text-1)]">Template Struk</h3>
            <p className="text-xs text-[var(--text-3)]">
              Sesuaikan tampilan struk untuk printer termal 58mm / 80mm
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Template
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <p className="mb-4 text-sm font-bold text-amber-800">
            {editing ? 'Edit Template' : 'Template Baru'}
          </p>
          <TemplateForm
            storeId={storeId}
            initial={editing ?? undefined}
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </div>
      )}

      {/* Template list by type */}
      {templates.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-12 text-center">
          <Printer className="mx-auto mb-2 h-8 w-8 text-[var(--text-3)]" />
          <p className="text-sm font-semibold text-[var(--text-2)]">Belum ada template struk</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            Buat template untuk menyesuaikan tampilan struk printer Anda
          </p>
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600"
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            Buat Template Pertama
          </button>
        </div>
      ) : (
        (Object.keys(grouped) as TemplateType[]).map(type => {
          const list = grouped[type]
          if (list.length === 0) return null
          return (
            <div key={type}>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                {TEMPLATE_TYPE_LABELS[type]}
              </h4>
              <div className="space-y-2">
                {list.map(t => (
                  <TemplateRow
                    key={t.id}
                    tpl={t}
                    storeId={storeId}
                    onUpdated={load}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

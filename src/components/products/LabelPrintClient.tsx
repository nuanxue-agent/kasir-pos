'use client'

import { useState, useCallback } from 'react'
import { Printer, Plus, Trash2, Eye, Tag, Loader2, CheckCircle2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  validateLabelFields,
  validateLabelDimensions,
  calcTotalPrintQty,
  countBulkProducts,
  getActiveTemplates,
} from '@/lib/label-print'
import type { LabelField, LabelTemplate, PrintJobProduct } from '@/lib/label-print'

export {
  validateLabelFields,
  validateLabelDimensions,
  calcTotalPrintQty,
  countBulkProducts,
  getActiveTemplates,
} from '@/lib/label-print'

interface Product {
  id: string
  name: string
  price: number
  sku?: string
}

interface LabelPrintClientProps {
  storeId: string
  currency: string
  products: Product[]
  initialTemplates: LabelTemplate[]
}

const FIELD_TYPE_LABELS: Record<LabelField['type'], string> = {
  name: 'Product Name',
  price: 'Price',
  barcode: 'Barcode',
  qr: 'QR Code',
  sku: 'SKU',
  custom: 'Custom Text',
}

const DEFAULT_FIELDS: LabelField[] = [
  { type: 'name', x: 4, y: 6, fontSize: 10 },
  { type: 'price', x: 4, y: 18, fontSize: 12 },
  { type: 'barcode', x: 4, y: 28, fontSize: 8 },
]

function LabelPreview({ template, product, currency }: { template: LabelTemplate; product?: Product; currency: string }) {
  const scale = Math.min(240 / template.width, 160 / template.height)
  const pw = template.width * scale
  const ph = template.height * scale

  return (
    <div className="flex items-center justify-center p-4 bg-[var(--bg-1)] rounded-lg border border-[var(--border)]">
      <div
        className="relative bg-white border-2 border-gray-300 shadow-md overflow-hidden"
        style={{ width: pw, height: ph }}
      >
        {template.fields.map((field, idx) => {
          const x = field.x * scale
          const y = field.y * scale
          const fs = Math.max(6, field.fontSize * scale * 0.6)

          let content = ''
          if (field.type === 'name') content = product?.name ?? 'Product Name'
          else if (field.type === 'price') content = formatCurrency(product?.price ?? 15000, currency)
          else if (field.type === 'sku') content = product?.sku ?? 'SKU-001'
          else if (field.type === 'barcode') content = '|||||||||||'
          else if (field.type === 'qr') content = '▪▪▪▪▪'
          else if (field.type === 'custom') content = field.value ?? 'Custom'

          const isBarcode = field.type === 'barcode'
          const isQr = field.type === 'qr'

          return (
            <div
              key={idx}
              className="absolute whitespace-nowrap"
              style={{
                left: x,
                top: y,
                fontSize: fs,
                fontFamily: isBarcode ? 'monospace' : 'sans-serif',
                fontWeight: isBarcode || isQr ? 'bold' : 'normal',
                letterSpacing: isBarcode ? '2px' : undefined,
                color: '#000',
              }}
            >
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LabelPrintClient({ storeId, currency, products, initialTemplates }: LabelPrintClientProps) {
  const [templates, setTemplates] = useState<LabelTemplate[]>(initialTemplates)
  const [activeTab, setActiveTab] = useState<'print' | 'templates'>('print')

  // Print job state
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    getActiveTemplates(initialTemplates)[0]?.id ?? ''
  )
  const [selectedProducts, setSelectedProducts] = useState<PrintJobProduct[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [printing, setPrinting] = useState(false)

  // Template editor state
  const [editingTemplate, setEditingTemplate] = useState<LabelTemplate | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateWidth, setNewTemplateWidth] = useState(60)
  const [newTemplateHeight, setNewTemplateHeight] = useState(40)
  const [newTemplateFields, setNewTemplateFields] = useState<LabelField[]>(DEFAULT_FIELDS)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const activeTemplates = getActiveTemplates(templates)
  const currentTemplate = templates.find(t => t.id === selectedTemplate)

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(productSearch.toLowerCase())
  )

  const toggleProduct = useCallback((productId: string) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.productId === productId)
      if (exists) return prev.filter(p => p.productId !== productId)
      return [...prev, { productId, qty: 1 }]
    })
  }, [])

  const updateQty = useCallback((productId: string, qty: number) => {
    setSelectedProducts(prev =>
      prev.map(p => p.productId === productId ? { ...p, qty: Math.max(1, qty) } : p)
    )
  }, [])

  const handlePrint = async () => {
    if (!selectedTemplate) { toast.error('Select a template first'); return }
    if (selectedProducts.length === 0) { toast.error('Select at least one product'); return }

    setPrinting(true)
    try {
      const res = await fetch(`/api/label-print-jobs?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate, products: selectedProducts }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }

      toast.success(`Print job created — ${calcTotalPrintQty(selectedProducts)} labels queued`)
      window.print()

      // Mark as printed
      await fetch(`/api/label-print-jobs/${data.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PRINTED' }),
      })
      setSelectedProducts([])
    } catch {
      toast.error('Failed to create print job')
    } finally {
      setPrinting(false)
    }
  }

  const handleCreateTemplate = async () => {
    const dimCheck = validateLabelDimensions(newTemplateWidth, newTemplateHeight)
    if (!dimCheck.valid) { toast.error(dimCheck.error!); return }
    const fieldCheck = validateLabelFields(newTemplateFields)
    if (!fieldCheck.valid) { toast.error(fieldCheck.error!); return }
    if (!newTemplateName.trim()) { toast.error('Template name is required'); return }

    setCreatingTemplate(true)
    try {
      const res = await fetch(`/api/label-templates?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          width: newTemplateWidth,
          height: newTemplateHeight,
          fields: newTemplateFields,
        }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }

      const created: LabelTemplate = {
        id: data.id,
        storeId,
        name: newTemplateName,
        width: newTemplateWidth,
        height: newTemplateHeight,
        fields: newTemplateFields,
        active: true,
      }
      setTemplates(prev => [...prev, created])
      setNewTemplateName('')
      setNewTemplateWidth(60)
      setNewTemplateHeight(40)
      setNewTemplateFields(DEFAULT_FIELDS)
      setShowCreateForm(false)
      toast.success('Template created')
    } catch {
      toast.error('Failed to create template')
    } finally {
      setCreatingTemplate(false)
    }
  }

  const handleToggleActive = async (template: LabelTemplate) => {
    setSavingTemplate(true)
    try {
      const res = await fetch(`/api/label-templates/${template.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !template.active }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, active: !t.active } : t))
      toast.success(template.active ? 'Template deactivated' : 'Template activated')
    } catch {
      toast.error('Failed to update template')
    } finally {
      setSavingTemplate(false)
    }
  }

  const addField = () => {
    setNewTemplateFields(prev => [...prev, { type: 'name', x: 4, y: 4, fontSize: 10 }])
  }

  const removeField = (idx: number) => {
    setNewTemplateFields(prev => prev.filter((_, i) => i !== idx))
  }

  const updateField = (idx: number, patch: Partial<LabelField>) => {
    setNewTemplateFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Tag className="h-6 w-6 text-[var(--primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Label & Barcode Print</h1>
            <p className="text-sm text-[var(--text-3)]">Print product labels with barcode and QR code</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['print', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
            )}
          >
            {tab === 'print' ? 'Print Labels' : 'Templates'}
          </button>
        ))}
      </div>

      {/* Print Tab */}
      {activeTab === 'print' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Product Selection */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 space-y-4">
              <h2 className="font-semibold text-[var(--text-1)]">Select Products</h2>

              <input
                type="text"
                placeholder="Search by name or SKU…"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm"
              />

              <div className="max-h-72 overflow-y-auto space-y-1">
                {filteredProducts.map(product => {
                  const sel = selectedProducts.find(p => p.productId === product.id)
                  return (
                    <div
                      key={product.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors',
                        sel ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--bg-1)]'
                      )}
                      onClick={() => toggleProduct(product.id)}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={!!sel}
                        className="accent-[var(--primary)]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-1)] truncate">{product.name}</p>
                        {product.sku && (
                          <p className="text-xs text-[var(--text-3)]">SKU: {product.sku}</p>
                        )}
                      </div>
                      <span className="text-sm text-[var(--text-2)] shrink-0">
                        {formatCurrency(product.price, currency)}
                      </span>
                      {sel && (
                        <input
                          type="number"
                          min={1}
                          value={sel.qty}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateQty(product.id, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 text-sm text-center rounded border border-[var(--border)] bg-[var(--bg-card)]"
                        />
                      )}
                    </div>
                  )
                })}
                {filteredProducts.length === 0 && (
                  <p className="text-sm text-[var(--text-3)] text-center py-4">No products found</p>
                )}
              </div>
            </div>

            {/* Selected summary */}
            {selectedProducts.length > 0 && (
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-[var(--text-1)]">Print Queue</h3>
                  <div className="flex items-center gap-4 text-sm text-[var(--text-3)]">
                    <span>{countBulkProducts(selectedProducts)} products</span>
                    <span className="font-medium text-[var(--text-1)]">
                      {calcTotalPrintQty(selectedProducts)} labels total
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {selectedProducts.map(sp => {
                    const p = products.find(x => x.id === sp.productId)
                    if (!p) return null
                    return (
                      <div key={sp.productId} className="flex items-center gap-3 text-sm">
                        <span className="flex-1 text-[var(--text-1)] truncate">{p.name}</span>
                        <span className="text-[var(--text-3)]">×{sp.qty}</span>
                        <button
                          onClick={() => toggleProduct(sp.productId)}
                          className="text-[var(--text-3)] hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Template + Preview */}
          <div className="space-y-4">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 space-y-4">
              <h2 className="font-semibold text-[var(--text-1)]">Label Template</h2>

              {activeTemplates.length === 0 ? (
                <p className="text-sm text-[var(--text-3)]">No active templates. Create one in the Templates tab.</p>
              ) : (
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm"
                >
                  {activeTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.width}×{t.height}mm)
                    </option>
                  ))}
                </select>
              )}

              {currentTemplate && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-3)] flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Preview
                  </p>
                  <LabelPreview
                    template={currentTemplate}
                    product={products[0]}
                    currency={currency}
                  />
                  <p className="text-xs text-[var(--text-3)] text-center">
                    {currentTemplate.width}mm × {currentTemplate.height}mm · {currentTemplate.fields.length} fields
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handlePrint}
              disabled={printing || !selectedTemplate || selectedProducts.length === 0}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-colors',
                printing || !selectedTemplate || selectedProducts.length === 0
                  ? 'bg-[var(--border)] text-[var(--text-3)] cursor-not-allowed'
                  : 'bg-[var(--primary)] text-white hover:opacity-90'
              )}
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {printing ? 'Processing…' : `Print ${calcTotalPrintQty(selectedProducts) || ''} Labels`}
            </button>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-3)]">{templates.length} template(s)</p>
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--primary)] text-white text-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          </div>

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-[var(--text-1)]">New Template</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs text-[var(--text-3)] mb-1">Name</label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                    placeholder="e.g. Standard 60×40"
                    className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-3)] mb-1">Width (mm)</label>
                  <input
                    type="number"
                    value={newTemplateWidth}
                    onChange={e => setNewTemplateWidth(Number(e.target.value))}
                    min={10} max={300}
                    className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-3)] mb-1">Height (mm)</label>
                  <input
                    type="number"
                    value={newTemplateHeight}
                    onChange={e => setNewTemplateHeight(Number(e.target.value))}
                    min={10} max={300}
                    className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)]"
                  />
                </div>
              </div>

              {/* Fields editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-[var(--text-3)]">Fields</label>
                  <button
                    onClick={addField}
                    className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Field
                  </button>
                </div>
                <div className="space-y-2">
                  {newTemplateFields.map((field, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <select
                        value={field.type}
                        onChange={e => updateField(idx, { type: e.target.value as LabelField['type'] })}
                        className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-1)] text-xs text-[var(--text-1)]"
                      >
                        {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={field.x}
                        onChange={e => updateField(idx, { x: Number(e.target.value) })}
                        placeholder="X"
                        className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-1)] text-xs text-[var(--text-1)]"
                      />
                      <input
                        type="number"
                        value={field.y}
                        onChange={e => updateField(idx, { y: Number(e.target.value) })}
                        placeholder="Y"
                        className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-1)] text-xs text-[var(--text-1)]"
                      />
                      <input
                        type="number"
                        value={field.fontSize}
                        onChange={e => updateField(idx, { fontSize: Number(e.target.value) })}
                        placeholder="Size"
                        className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-1)] text-xs text-[var(--text-1)]"
                      />
                      {field.type === 'custom' && (
                        <input
                          type="text"
                          value={field.value ?? ''}
                          onChange={e => updateField(idx, { value: e.target.value })}
                          placeholder="Text"
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-1)] text-xs text-[var(--text-1)]"
                        />
                      )}
                      <button onClick={() => removeField(idx)} className="text-[var(--text-3)] hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              {newTemplateFields.length > 0 && (
                <LabelPreview
                  template={{ id: 'preview', storeId, name: '', width: newTemplateWidth, height: newTemplateHeight, fields: newTemplateFields, active: true }}
                  product={products[0]}
                  currency={currency}
                />
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-sm rounded-md border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-1)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTemplate}
                  disabled={creatingTemplate}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-60"
                >
                  {creatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Template
                </button>
              </div>
            </div>
          )}

          {/* Template list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(template => (
              <div
                key={template.id}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--text-1)]">{template.name}</p>
                    <p className="text-xs text-[var(--text-3)]">
                      {template.width}×{template.height}mm · {template.fields.length} fields
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      template.active
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-[var(--border)] text-[var(--text-3)]'
                    )}
                  >
                    {template.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <LabelPreview template={template} product={products[0]} currency={currency} />

                <button
                  onClick={() => handleToggleActive(template)}
                  disabled={savingTemplate}
                  className="w-full py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-1)] transition-colors"
                >
                  {template.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-[var(--text-3)] col-span-3 text-center py-8">
                No templates yet. Create one above.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

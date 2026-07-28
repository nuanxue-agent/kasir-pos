'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Grid3X3, RefreshCw, Save, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VariantAttribute {
  id: string
  storeId: string
  productId: string
  name: string
  values: string[]
}

interface ProductVariant {
  id: string
  storeId: string
  productId: string
  sku: string
  attributes: Record<string, string>
  price: number
  stock: number
  active: boolean
}

interface Product {
  id: string
  name: string
  price: number
}

interface VariantMatrixClientProps {
  storeId: string
  currency: string
  products: Product[]
  initialAttributes: VariantAttribute[]
  initialVariants: ProductVariant[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateSku(productName: string, attributes: Record<string, string>): string {
  const base = productName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
  const attrPart = Object.values(attributes)
    .map(v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))
    .join('-')
  return attrPart ? `${base}-${attrPart}` : base
}

export function generateMatrix(
  attributes: VariantAttribute[],
): Array<Record<string, string>> {
  if (attributes.length === 0) return []
  const [first, ...rest] = attributes
  if (rest.length === 0) {
    return first.values.map(v => ({ [first.name]: v }))
  }
  const sub = generateMatrix(rest)
  return first.values.flatMap(v =>
    sub.map(combo => ({ [first.name]: v, ...combo }))
  )
}

export function applyPriceOverride(
  basePrice: number,
  overrides: Record<string, number>,
  variantKey: string,
): number {
  return overrides[variantKey] ?? basePrice
}

export function aggregateStock(variants: ProductVariant[]): number {
  return variants.reduce((sum, v) => sum + (v.active ? v.stock : 0), 0)
}

export function validateBulkUpdate(
  updates: Array<{ id: string; price?: number; stock?: number }>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (const u of updates) {
    if (!u.id) errors.push('Each update must have an id')
    if (u.price !== undefined && u.price < 0) errors.push(`Price cannot be negative (id: ${u.id})`)
    if (u.stock !== undefined && u.stock < 0) errors.push(`Stock cannot be negative (id: ${u.id})`)
  }
  return { valid: errors.length === 0, errors }
}

// ── Attribute Editor ──────────────────────────────────────────────────────────

function AttributeEditor({
  attribute,
  onUpdate,
  onDelete,
}: {
  attribute: VariantAttribute
  onUpdate: (id: string, values: string[]) => void
  onDelete: (id: string) => void
}) {
  const [input, setInput] = useState('')

  const addValue = () => {
    const v = input.trim()
    if (!v || attribute.values.includes(v)) return
    onUpdate(attribute.id, [...attribute.values, v])
    setInput('')
  }

  const removeValue = (val: string) => {
    onUpdate(attribute.id, attribute.values.filter(v => v !== val))
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 capitalize">{attribute.name}</span>
        <button
          onClick={() => onDelete(attribute.id)}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {attribute.values.map(v => (
          <span
            key={v}
            className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium"
          >
            {v}
            <button onClick={() => removeValue(v)} className="hover:text-blue-900">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Add value…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addValue()}
        />
        <button
          onClick={addValue}
          className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ── Matrix Cell ───────────────────────────────────────────────────────────────

function MatrixCell({
  variant,
  currency,
  onChange,
}: {
  variant: ProductVariant
  currency: string
  onChange: (id: string, patch: Partial<Pick<ProductVariant, 'price' | 'stock' | 'active'>>) => void
}) {
  return (
    <div className={cn(
      'p-2 rounded-lg border text-xs space-y-1.5 transition-all',
      variant.active
        ? 'border-gray-200 bg-white'
        : 'border-gray-100 bg-gray-50 opacity-60',
    )}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-gray-500 truncate text-[10px]">{variant.sku}</span>
        <button
          onClick={() => onChange(variant.id, { active: !variant.active })}
          className={cn(
            'relative w-8 h-4 rounded-full transition-colors flex-shrink-0',
            variant.active ? 'bg-blue-500' : 'bg-gray-300',
          )}
          title={variant.active ? 'Deactivate' : 'Activate'}
        >
          <span className={cn(
            'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
            variant.active && 'translate-x-4',
          )} />
        </button>
      </div>
      <div>
        <label className="text-[10px] text-gray-400">Price</label>
        <input
          type="number"
          min="0"
          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={variant.price}
          onChange={e => onChange(variant.id, { price: Number(e.target.value) })}
        />
      </div>
      <div>
        <label className="text-[10px] text-gray-400">Stock</label>
        <input
          type="number"
          min="0"
          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={variant.stock}
          onChange={e => onChange(variant.id, { stock: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VariantMatrixClient({
  storeId,
  currency,
  products,
  initialAttributes,
  initialVariants,
}: VariantMatrixClientProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? '')
  const [attributes, setAttributes] = useState<VariantAttribute[]>(
    initialAttributes.filter(a => a.productId === (products[0]?.id ?? ''))
  )
  const [variants, setVariants] = useState<ProductVariant[]>(
    initialVariants.filter(v => v.productId === (products[0]?.id ?? ''))
  )
  const [newAttrName, setNewAttrName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAttrPanel, setShowAttrPanel] = useState(true)
  const [dirty, setDirty] = useState(false)

  const selectedProduct = products.find(p => p.id === selectedProductId)

  // Load attributes and variants when product changes
  const loadProductData = useCallback(async (productId: string) => {
    if (!productId) return
    setLoading(true)
    try {
      const [attrRes, varRes] = await Promise.all([
        fetch(`/api/variant-attributes?storeId=${storeId}&productId=${productId}`),
        fetch(`/api/product-variants?storeId=${storeId}&productId=${productId}`),
      ])
      const [attrData, varData] = await Promise.all([
        attrRes.json() as Promise<any>,
        varRes.json() as Promise<any>,
      ])
      setAttributes(Array.isArray(attrData) ? attrData : [])
      setVariants(Array.isArray(varData) ? varData : [])
      setDirty(false)
    } catch {
      toast.error('Failed to load variant data')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (selectedProductId) loadProductData(selectedProductId)
  }, [selectedProductId, loadProductData])

  // Determine row/col axes (first two attributes)
  const rowAttr = attributes[0]
  const colAttr = attributes[1]

  // Generate or get variants for the matrix
  const matrixCombos = generateMatrix(attributes)

  const getVariant = (combo: Record<string, string>): ProductVariant | undefined => {
    return variants.find(v =>
      Object.entries(combo).every(([k, val]) => v.attributes[k] === val)
    )
  }

  const handleAddAttribute = async () => {
    const name = newAttrName.trim().toLowerCase()
    if (!name || !selectedProductId) return
    if (attributes.some(a => a.name === name)) {
      toast.error(`Attribute "${name}" already exists`)
      return
    }
    try {
      const res = await fetch('/api/variant-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productId: selectedProductId, name, values: [] }),
      })
      if (!res.ok) { const d = await res.json() as any; throw new Error(d.error ?? 'Failed') }
      const created = await res.json() as any
      setAttributes(prev => [...prev, created])
      setNewAttrName('')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add attribute')
    }
  }

  const handleUpdateAttributeValues = async (attrId: string, values: string[]) => {
    setAttributes(prev => prev.map(a => a.id === attrId ? { ...a, values } : a))
    try {
      await fetch(`/api/variant-attributes?id=${attrId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, action: 'updateValues', id: attrId, values }),
      })
    } catch {
      toast.error('Failed to save attribute values')
    }
  }

  const handleDeleteAttribute = async (attrId: string) => {
    setAttributes(prev => prev.filter(a => a.id !== attrId))
  }

  const handleGenerateVariants = async () => {
    if (!selectedProduct || matrixCombos.length === 0) return
    setSaving(true)
    try {
      const toCreate = matrixCombos.filter(combo => !getVariant(combo))
      if (toCreate.length === 0) { toast.success('All variants already exist'); return }

      const created: ProductVariant[] = []
      for (const combo of toCreate) {
        const sku = generateSku(selectedProduct.name, combo)
        const res = await fetch('/api/product-variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            productId: selectedProductId,
            sku,
            attributes: combo,
            price: selectedProduct.price,
            stock: 0,
            active: true,
          }),
        })
        if (res.ok) {
          const v = await res.json() as any
          created.push(v)
        }
      }
      setVariants(prev => [...prev, ...created])
      toast.success(`Generated ${created.length} variants`)
      setDirty(false)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate variants')
    } finally {
      setSaving(false)
    }
  }

  const handleVariantChange = (id: string, patch: Partial<Pick<ProductVariant, 'price' | 'stock' | 'active'>>) => {
    setVariants(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v))
    setDirty(true)
  }

  const handleSaveAll = async () => {
    if (!dirty) return
    setSaving(true)
    const { valid, errors } = validateBulkUpdate(variants.map(v => ({ id: v.id, price: v.price, stock: v.stock })))
    if (!valid) { toast.error(errors[0]); setSaving(false); return }
    try {
      const res = await fetch('/api/product-variants/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          updates: variants.map(v => ({ id: v.id, price: v.price, stock: v.stock, active: v.active })),
        }),
      })
      if (!res.ok) { const d = await res.json() as any; throw new Error(d.error ?? 'Failed') }
      toast.success('All variants saved')
      setDirty(false)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const totalStock = aggregateStock(variants)
  const activeCount = variants.filter(v => v.active).length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Grid3X3 className="w-6 h-6 text-blue-500" />
            Product Variants
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage size, color, and other attribute combinations with a visual pricing grid</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          )}
        </div>
      </div>

      {/* Product Selector */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Product</label>
        <select
          className="w-full max-w-sm border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={selectedProductId}
          onChange={e => setSelectedProductId(e.target.value)}
        >
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {selectedProduct && (
          <div className="mt-3 flex gap-4 text-sm text-gray-500">
            <span>Base price: <strong className="text-gray-800">{formatCurrency(selectedProduct.price, currency)}</strong></span>
            <span>Active variants: <strong className="text-gray-800">{activeCount}</strong></span>
            <span>Total stock: <strong className="text-gray-800">{totalStock}</strong></span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Attribute Panel */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowAttrPanel(v => !v)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-800">Attributes ({attributes.length})</span>
              {showAttrPanel ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showAttrPanel && (
              <div className="p-4 pt-0 space-y-3 border-t border-gray-100">
                {attributes.length === 0 && (
                  <p className="text-sm text-gray-400 italic py-2">No attributes yet. Add size, color, or other dimensions.</p>
                )}
                {attributes.map(attr => (
                  <AttributeEditor
                    key={attr.id}
                    attribute={attr}
                    onUpdate={handleUpdateAttributeValues}
                    onDelete={handleDeleteAttribute}
                  />
                ))}

                {/* Add new attribute */}
                <div className="flex gap-2 pt-1">
                  <input
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="New attribute name (e.g. size, color, weight)…"
                    value={newAttrName}
                    onChange={e => setNewAttrName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddAttribute()}
                  />
                  <button
                    onClick={handleAddAttribute}
                    disabled={!newAttrName.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>

                {/* Generate button */}
                {matrixCombos.length > 0 && (
                  <div className="pt-2">
                    <button
                      onClick={handleGenerateVariants}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Generate {matrixCombos.length} Variants
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Matrix Grid */}
          {variants.length > 0 && rowAttr && colAttr && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">
                  Pricing Grid — {rowAttr.name} × {colAttr.name}
                </h2>
                {dirty && (
                  <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                )}
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 font-semibold text-gray-600 capitalize bg-gray-50 rounded-tl-lg">
                        {rowAttr.name} \ {colAttr.name}
                      </th>
                      {colAttr.values.map(col => (
                        <th key={col} className="p-2 text-center font-semibold text-gray-700 bg-gray-50 capitalize min-w-[120px]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowAttr.values.map(row => (
                      <tr key={row} className="border-t border-gray-100">
                        <td className="p-2 font-semibold text-gray-700 capitalize bg-gray-50 whitespace-nowrap">
                          {row}
                        </td>
                        {colAttr.values.map(col => {
                          const combo = { [rowAttr.name]: row, [colAttr.name]: col }
                          const variant = getVariant(combo)
                          return (
                            <td key={col} className="p-1.5 align-top">
                              {variant ? (
                                <MatrixCell
                                  variant={variant}
                                  currency={currency}
                                  onChange={handleVariantChange}
                                />
                              ) : (
                                <div className="p-2 rounded-lg border border-dashed border-gray-200 text-center text-gray-300 text-[10px] h-full min-h-[80px] flex items-center justify-center">
                                  —
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Single-axis list (only one attribute) */}
          {variants.length > 0 && rowAttr && !colAttr && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">Variants — {rowAttr.name}</h2>
              </div>
              <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {variants.map(v => (
                  <MatrixCell
                    key={v.id}
                    variant={v}
                    currency={currency}
                    onChange={handleVariantChange}
                  />
                ))}
              </div>
            </div>
          )}

          {variants.length === 0 && attributes.length > 0 && matrixCombos.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-gray-200 rounded-2xl">
              <Grid3X3 className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">No variants yet</p>
              <p className="text-sm text-gray-400 mt-1">Click "Generate Variants" to create the full matrix</p>
            </div>
          )}

          {attributes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-gray-200 rounded-2xl">
              <Grid3X3 className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">Add attributes to get started</p>
              <p className="text-sm text-gray-400 mt-1">Create size, color, or other dimensions in the panel above</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

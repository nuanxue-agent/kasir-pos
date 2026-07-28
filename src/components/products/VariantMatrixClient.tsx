'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, X, Loader2, Grid3X3, RefreshCw, Save } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProductAttribute {
  id: string
  storeId: string
  productId: string
  name: string
  values: string[]
}

export interface ProductVariant {
  id?: string
  storeId?: string
  productId: string
  attributes: Record<string, string>
  sku: string
  price: number
  stock: number
  active?: boolean
}

export interface VariantMatrixClientProps {
  storeId: string
  currency: string
  productId: string
  productName: string
  initialAttributes: ProductAttribute[]
  initialVariants: ProductVariant[]
}

// ── Pure helpers (also exported for tests) ─────────────────────────────────

/** Generate all combinations of attribute values (cartesian product). */
export function generateCombinations(
  attributes: Array<{ name: string; values: string[] }>,
): Record<string, string>[] {
  if (attributes.length === 0) return []
  const filtered = attributes.filter(a => a.values.length > 0)
  if (filtered.length === 0) return []

  return filtered.reduce<Record<string, string>[]>(
    (acc, attr) => {
      if (acc.length === 0) return attr.values.map(v => ({ [attr.name]: v }))
      return acc.flatMap(combo => attr.values.map(v => ({ ...combo, [attr.name]: v })))
    },
    [],
  )
}

/** Build a lookup key from an attributes object (sorted keys for consistency). */
export function attrKey(attrs: Record<string, string>): string {
  return Object.keys(attrs)
    .sort()
    .map(k => `${k}:${attrs[k]}`)
    .join('|')
}

/** Find a variant by its attribute combination. */
export function findVariant(
  variants: ProductVariant[],
  attrs: Record<string, string>,
): ProductVariant | undefined {
  const key = attrKey(attrs)
  return variants.find(v => attrKey(v.attributes) === key)
}

/** Auto-generate a SKU from product prefix + attribute values. */
export function generateSKU(productId: string, attrs: Record<string, string>): string {
  const prefix = productId.slice(0, 6).toUpperCase()
  const suffix = Object.values(attrs)
    .map(v => v.slice(0, 3).toUpperCase().replace(/\s+/g, ''))
    .join('-')
  return `${prefix}-${suffix}`
}

/** Apply bulk price update to all variants sharing a given attribute key=value. */
export function bulkUpdatePrice(
  variants: ProductVariant[],
  attrName: string,
  attrValue: string,
  price: number,
): ProductVariant[] {
  return variants.map(v =>
    v.attributes[attrName] === attrValue ? { ...v, price } : v,
  )
}

/** Apply bulk stock update to all variants sharing a given attribute key=value. */
export function bulkUpdateStock(
  variants: ProductVariant[],
  attrName: string,
  attrValue: string,
  stock: number,
): ProductVariant[] {
  return variants.map(v =>
    v.attributes[attrName] === attrValue ? { ...v, stock } : v,
  )
}

// ── Attribute Editor ───────────────────────────────────────────────────────

function AttributeEditor({
  attributes,
  onAdd,
  onRemove,
  onUpdateValues,
  saving,
}: {
  attributes: ProductAttribute[]
  onAdd: (name: string, values: string[]) => Promise<void>
  onRemove: (id: string) => void
  onUpdateValues: (id: string, values: string[]) => Promise<void>
  saving: boolean
}) {
  const [newName, setNewName] = useState('')
  const [newValues, setNewValues] = useState('')
  const [addError, setAddError] = useState('')

  const handleAdd = async () => {
    const name = newName.trim()
    const values = newValues
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
    if (!name) { setAddError('Attribute name required'); return }
    if (values.length === 0) { setAddError('At least one value required'); return }
    if (attributes.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      setAddError('Attribute name already exists')
      return
    }
    setAddError('')
    await onAdd(name, values)
    setNewName('')
    setNewValues('')
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-700">Atribut Produk</h3>

      {attributes.map(attr => (
        <div key={attr.id} className="flex items-start gap-2 p-3 rounded-xl border border-stone-200 bg-stone-50">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-stone-700 mb-1">{attr.name}</p>
            <input
              type="text"
              defaultValue={attr.values.join(', ')}
              onBlur={e => {
                const vals = e.target.value.split(',').map(v => v.trim()).filter(Boolean)
                if (vals.length > 0) onUpdateValues(attr.id, vals)
              }}
              className="w-full text-xs px-2 py-1 rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="e.g. S, M, L, XL"
            />
          </div>
          <button
            onClick={() => onRemove(attr.id)}
            className="mt-1 p-1 text-stone-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Add new attribute */}
      <div className="p-3 rounded-xl border border-dashed border-stone-300 bg-white space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nama atribut (e.g. Ukuran)"
            className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>
        <input
          type="text"
          value={newValues}
          onChange={e => setNewValues(e.target.value)}
          placeholder="Nilai dipisah koma (e.g. S, M, L, XL)"
          className="w-full text-xs px-2 py-1.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        {addError && <p className="text-xs text-red-500">{addError}</p>}
        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Tambah Atribut
        </button>
      </div>
    </div>
  )
}

// ── Bulk Update Bar ────────────────────────────────────────────────────────

function BulkUpdateBar({
  attributes,
  onBulkPrice,
  onBulkStock,
}: {
  attributes: ProductAttribute[]
  onBulkPrice: (attrName: string, attrValue: string, price: number) => void
  onBulkStock: (attrName: string, attrValue: string, stock: number) => void
}) {
  const [selectedAttr, setSelectedAttr] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')

  const currentAttr = attributes.find(a => a.name === selectedAttr)

  return (
    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
        <RefreshCw className="h-3 w-3" /> Update Massal
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedAttr}
          onChange={e => { setSelectedAttr(e.target.value); setSelectedValue('') }}
          className="text-xs px-2 py-1 rounded-lg border border-amber-200 bg-white focus:outline-none"
        >
          <option value="">Pilih atribut</option>
          {attributes.map(a => (
            <option key={a.id} value={a.name}>{a.name}</option>
          ))}
        </select>

        <select
          value={selectedValue}
          onChange={e => setSelectedValue(e.target.value)}
          disabled={!currentAttr}
          className="text-xs px-2 py-1 rounded-lg border border-amber-200 bg-white focus:outline-none disabled:opacity-50"
        >
          <option value="">Pilih nilai</option>
          {currentAttr?.values.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <input
          type="number"
          value={bulkPrice}
          onChange={e => setBulkPrice(e.target.value)}
          placeholder="Harga"
          className="w-24 text-xs px-2 py-1 rounded-lg border border-amber-200 bg-white focus:outline-none"
        />
        <button
          onClick={() => {
            if (selectedAttr && selectedValue && bulkPrice !== '') {
              onBulkPrice(selectedAttr, selectedValue, Number(bulkPrice))
              setBulkPrice('')
            }
          }}
          disabled={!selectedAttr || !selectedValue || bulkPrice === ''}
          className="text-xs px-2 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors"
        >
          Set Harga
        </button>

        <input
          type="number"
          value={bulkStock}
          onChange={e => setBulkStock(e.target.value)}
          placeholder="Stok"
          className="w-20 text-xs px-2 py-1 rounded-lg border border-amber-200 bg-white focus:outline-none"
        />
        <button
          onClick={() => {
            if (selectedAttr && selectedValue && bulkStock !== '') {
              onBulkStock(selectedAttr, selectedValue, Number(bulkStock))
              setBulkStock('')
            }
          }}
          disabled={!selectedAttr || !selectedValue || bulkStock === ''}
          className="text-xs px-2 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors"
        >
          Set Stok
        </button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function VariantMatrixClient({
  storeId,
  currency,
  productId,
  productName,
  initialAttributes,
  initialVariants,
}: VariantMatrixClientProps) {
  const [attributes, setAttributes] = useState<ProductAttribute[]>(initialAttributes)
  const [variants, setVariants] = useState<ProductVariant[]>(() => {
    // Seed from initial or generate from combinations
    const combos = generateCombinations(initialAttributes)
    return combos.map(attrs => {
      const existing = findVariant(initialVariants, attrs)
      return existing ?? {
        productId,
        attributes: attrs,
        sku: generateSKU(productId, attrs),
        price: 0,
        stock: 0,
        active: true,
      }
    })
  })
  const [saving, setSaving] = useState(false)
  const [attrSaving, setAttrSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Re-generate matrix whenever attributes change
  const rebuildMatrix = useCallback(
    (attrs: ProductAttribute[], existingVariants: ProductVariant[]) => {
      const combos = generateCombinations(attrs)
      setVariants(
        combos.map(combo => {
          const existing = findVariant(existingVariants, combo)
          return existing ?? {
            productId,
            attributes: combo,
            sku: generateSKU(productId, combo),
            price: 0,
            stock: 0,
            active: true,
          }
        }),
      )
    },
    [productId],
  )

  // ── Attribute handlers ──────────────────────────────────────────────────

  const handleAddAttribute = async (name: string, values: string[]) => {
    setAttrSaving(true)
    setError('')
    try {
      const res = await fetch('/api/product-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productId, name, values }),
      })
      if (!res.ok) {
        const j = (await res.json()) as any
        throw new Error(j.error ?? 'Failed to add attribute')
      }
      const created = (await res.json()) as any
      const newAttr: ProductAttribute = { id: created.id, storeId, productId, name, values }
      const newAttrs = [...attributes, newAttr]
      setAttributes(newAttrs)
      rebuildMatrix(newAttrs, variants)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAttrSaving(false)
    }
  }

  const handleRemoveAttribute = (id: string) => {
    const newAttrs = attributes.filter(a => a.id !== id)
    setAttributes(newAttrs)
    rebuildMatrix(newAttrs, variants)
  }

  const handleUpdateAttributeValues = async (id: string, values: string[]) => {
    setAttrSaving(true)
    try {
      await fetch(`/api/product-attributes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      const newAttrs = attributes.map(a => (a.id === id ? { ...a, values } : a))
      setAttributes(newAttrs)
      rebuildMatrix(newAttrs, variants)
    } finally {
      setAttrSaving(false)
    }
  }

  // ── Variant cell handlers ───────────────────────────────────────────────

  const updateVariantCell = (
    attrs: Record<string, string>,
    field: 'price' | 'stock' | 'sku',
    value: string,
  ) => {
    const key = attrKey(attrs)
    setVariants(prev =>
      prev.map(v =>
        attrKey(v.attributes) === key
          ? { ...v, [field]: field === 'sku' ? value : Number(value) }
          : v,
      ),
    )
  }

  // ── Bulk handlers ───────────────────────────────────────────────────────

  const handleBulkPrice = (attrName: string, attrValue: string, price: number) => {
    setVariants(prev => bulkUpdatePrice(prev, attrName, attrValue, price))
  }

  const handleBulkStock = (attrName: string, attrValue: string, stock: number) => {
    setVariants(prev => bulkUpdateStock(prev, attrName, attrValue, stock))
  }

  // ── Save all variants ───────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/product-variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productId, variants }),
      })
      if (!res.ok) {
        const j = (await res.json()) as any
        throw new Error(j.error ?? 'Failed to save variants')
      }
      const j = (await res.json()) as any
      setSuccess(`${j.created} varian tersimpan`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render matrix ───────────────────────────────────────────────────────

  const [rowAttr, colAttr] = attributes.slice(0, 2)
  const hasMatrix = rowAttr && colAttr
  const rowValues = rowAttr?.values ?? []
  const colValues = colAttr?.values ?? []
  const extraAttrs = attributes.slice(2)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-stone-500" />
            Matriks Varian
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">{productName}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || variants.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Semua Varian
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <X className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          ✓ {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Attribute editor */}
        <div className="lg:col-span-1 space-y-4">
          <AttributeEditor
            attributes={attributes}
            onAdd={handleAddAttribute}
            onRemove={handleRemoveAttribute}
            onUpdateValues={handleUpdateAttributeValues}
            saving={attrSaving}
          />
          {attributes.length >= 2 && (
            <BulkUpdateBar
              attributes={attributes}
              onBulkPrice={handleBulkPrice}
              onBulkStock={handleBulkStock}
            />
          )}
        </div>

        {/* Right: Matrix grid */}
        <div className="lg:col-span-2">
          {variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 rounded-2xl border-2 border-dashed border-stone-200 text-stone-400">
              <Grid3X3 className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Tambahkan atribut untuk membuat matriks varian</p>
            </div>
          ) : hasMatrix ? (
            // 2D matrix view
            <div className="overflow-x-auto rounded-2xl border border-stone-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100">
                    <th className="px-3 py-2 text-left font-semibold text-stone-600 border-b border-stone-200">
                      {rowAttr.name} \ {colAttr.name}
                    </th>
                    {colValues.map(cv => (
                      <th
                        key={cv}
                        className="px-3 py-2 text-center font-semibold text-stone-600 border-b border-l border-stone-200 min-w-[140px]"
                      >
                        {cv}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowValues.map((rv, ri) => (
                    <tr key={rv} className={ri % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                      <td className="px-3 py-2 font-semibold text-stone-700 border-b border-stone-100 whitespace-nowrap">
                        {rv}
                      </td>
                      {colValues.map(cv => {
                        const baseAttrs: Record<string, string> = {
                          [rowAttr.name]: rv,
                          [colAttr.name]: cv,
                        }
                        // For extra attrs beyond 2, we render the first combination
                        const variant = findVariant(variants, baseAttrs) ??
                          variants.find(v =>
                            v.attributes[rowAttr.name] === rv &&
                            v.attributes[colAttr.name] === cv,
                          )

                        if (!variant) return <td key={cv} className="border-b border-l border-stone-100" />

                        const cellKey = attrKey(variant.attributes)
                        return (
                          <td
                            key={cv}
                            className="px-2 py-2 border-b border-l border-stone-100"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-stone-400 text-[10px] w-8">Harga</span>
                                <input
                                  type="number"
                                  value={variant.price}
                                  onChange={e =>
                                    updateVariantCell(variant.attributes, 'price', e.target.value)
                                  }
                                  className="w-full px-1.5 py-0.5 rounded border border-stone-200 bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-stone-400"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-stone-400 text-[10px] w-8">Stok</span>
                                <input
                                  type="number"
                                  value={variant.stock}
                                  onChange={e =>
                                    updateVariantCell(variant.attributes, 'stock', e.target.value)
                                  }
                                  className="w-full px-1.5 py-0.5 rounded border border-stone-200 bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-stone-400"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-stone-400 text-[10px] w-8">SKU</span>
                                <input
                                  type="text"
                                  value={variant.sku}
                                  onChange={e =>
                                    updateVariantCell(variant.attributes, 'sku', e.target.value)
                                  }
                                  className="w-full px-1.5 py-0.5 rounded border border-stone-200 bg-white text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-stone-400"
                                />
                              </div>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // 1D list view (only one attribute)
            <div className="rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-stone-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-stone-600 border-b border-stone-200">
                      {attributes[0]?.name}
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-stone-600 border-b border-stone-200">Harga</th>
                    <th className="px-4 py-2 text-left font-semibold text-stone-600 border-b border-stone-200">Stok</th>
                    <th className="px-4 py-2 text-left font-semibold text-stone-600 border-b border-stone-200">SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => {
                    const label = Object.values(v.attributes).join(' / ')
                    return (
                      <tr key={attrKey(v.attributes)} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                        <td className="px-4 py-2 font-medium text-stone-700 border-b border-stone-100">{label}</td>
                        <td className="px-2 py-2 border-b border-stone-100">
                          <input
                            type="number"
                            value={v.price}
                            onChange={e => updateVariantCell(v.attributes, 'price', e.target.value)}
                            className="w-24 px-2 py-1 rounded border border-stone-200 bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
                          />
                        </td>
                        <td className="px-2 py-2 border-b border-stone-100">
                          <input
                            type="number"
                            value={v.stock}
                            onChange={e => updateVariantCell(v.attributes, 'stock', e.target.value)}
                            className="w-20 px-2 py-1 rounded border border-stone-200 bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
                          />
                        </td>
                        <td className="px-2 py-2 border-b border-stone-100">
                          <input
                            type="text"
                            value={v.sku}
                            onChange={e => updateVariantCell(v.attributes, 'sku', e.target.value)}
                            className="w-32 px-2 py-1 rounded border border-stone-200 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-stone-400"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {variants.length > 0 && (
            <p className="text-xs text-stone-400 mt-2">
              {variants.length} kombinasi varian
              {attributes.length > 0 && ` dari ${attributes.map(a => `${a.name} (${a.values.length})`).join(' × ')}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

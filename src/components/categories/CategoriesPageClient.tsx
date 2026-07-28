'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Check, Tag } from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

interface Category {
  id: string
  storeId: string
  name: string
  description: string | null
  color: string
  parentId: string | null
  sortOrder: number
  active: boolean
}

interface Props { storeId: string }

const COLORS = ['#6b7280','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899']

const inputCls = 'w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-[var(--text-3)] transition-all'

export default function CategoriesPageClient({ storeId }: Props) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: '', description: '', color: '#6b7280', parentId: '' })
  const [saving, setSaving] = useState(false)

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories', storeId],
    queryFn: () => fetch(`/api/categories?storeId=${storeId}`).then(r => r.json() as any),
    enabled: !!storeId,
  })

  function resetForm() {
    setForm({ name: '', description: '', color: '#6b7280', parentId: '' })
    setEditItem(null)
    setShowForm(false)
  }

  function openEdit(cat: Category) {
    setForm({ name: cat.name, description: cat.description ?? '', color: cat.color ?? '#6b7280', parentId: cat.parentId ?? '' })
    setEditItem(cat)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Nama kategori wajib diisi')
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description || null,
        color: form.color,
        parentId: form.parentId || null,
      }
      const url = editItem
        ? `/api/categories/${editItem.id}?storeId=${storeId}`
        : `/api/categories?storeId=${storeId}`
      const res = await fetch(url, {
        method: editItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success(editItem ? 'Kategori diperbarui' : 'Kategori ditambahkan')
      qc.invalidateQueries({ queryKey: ['categories', storeId] })
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/categories/${id}?storeId=${storeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Kategori dihapus')
      qc.invalidateQueries({ queryKey: ['categories', storeId] })
    },
    onError: () => toast.error('Gagal menghapus'),
  })

  async function handleToggleActive(cat: Category) {
    const res = await fetch(`/api/categories/${cat.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !cat.active }),
    })
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ['categories', storeId] })
    } else {
      toast.error('Gagal mengubah status')
    }
  }

  const topLevel = (categories as Category[]).filter(c => !c.parentId)
  const getChildren = (parentId: string) => (categories as Category[]).filter(c => c.parentId === parentId)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Kategori Produk</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Kelola kategori untuk mengorganisir produk</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Tambah
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 mb-5 shadow-sm">
          <h2 className="font-semibold text-[var(--text-1)] mb-4 text-sm">
            {editItem ? 'Edit Kategori' : 'Kategori Baru'}
          </h2>
          <div className="space-y-3">
            <input
              className={inputCls}
              placeholder="Nama kategori *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Deskripsi (opsional)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            {/* Parent category */}
            <select
              className={inputCls}
              value={form.parentId}
              onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
            >
              <option value="">— Tanpa induk (kategori utama) —</option>
              {topLevel.filter(c => c.id !== editItem?.id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {/* Color picker */}
            <div>
              <p className="text-xs text-[var(--text-3)] mb-1.5">Warna</p>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color }))}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      borderColor: form.color === color ? 'white' : 'transparent',
                      outline: form.color === color ? `2px solid ${color}` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <Check size={14} /> {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1.5 border border-[var(--border)] text-[var(--text-2)] px-4 py-2 rounded-xl text-sm hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={14} /> Batal
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16 text-[var(--text-3)]">Memuat…</div>
      ) : (categories as Category[]).length === 0 ? (
        <div className="text-center py-16">
          <Tag size={40} className="mx-auto mb-3 text-[var(--text-3)] opacity-40" />
          <p className="text-[var(--text-2)] font-medium">Belum ada kategori</p>
          <p className="text-[var(--text-3)] text-sm mt-1">Tambah kategori untuk mengorganisir produk Anda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topLevel.map(cat => (
            <div key={cat.id}>
              <CategoryRow
                cat={cat}
                onEdit={openEdit}
                onDelete={id => deleteMut.mutate(id)}
                onToggleActive={handleToggleActive}
              />
              {getChildren(cat.id).map(child => (
                <div key={child.id} className="ml-6 mt-1">
                  <CategoryRow
                    cat={child}
                    onEdit={openEdit}
                    onDelete={id => deleteMut.mutate(id)}
                    onToggleActive={handleToggleActive}
                    isChild
                  />
                </div>
              ))}
            </div>
          ))}
          {/* orphaned children (parent deleted) */}
          {(categories as Category[]).filter(c => c.parentId && !topLevel.find(t => t.id === c.parentId)).map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              onEdit={openEdit}
              onDelete={id => deleteMut.mutate(id)}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryRow({
  cat,
  onEdit,
  onDelete,
  onToggleActive,
  isChild = false,
}: {
  cat: Category
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  onToggleActive: (c: Category) => void
  isChild?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 ${!cat.active ? 'opacity-50' : ''}`}>
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: cat.color ?? '#6b7280' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-1)] truncate">
          {isChild && <span className="text-[var(--text-3)] mr-1">↳</span>}
          {cat.name}
        </p>
        {cat.description && (
          <p className="text-xs text-[var(--text-3)] truncate">{cat.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onToggleActive(cat)}
          title={cat.active ? 'Nonaktifkan' : 'Aktifkan'}
          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${cat.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
        >
          {cat.active ? 'Aktif' : 'Nonaktif'}
        </button>
        <button
          onClick={() => onEdit(cat)}
          className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => {
            if (confirm(`Hapus kategori "${cat.name}"?`)) onDelete(cat.id)
          }}
          className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

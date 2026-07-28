'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MapPin,
  Plus,
  RefreshCw,
  ArrowRightLeft,
  Package,
  CheckCircle,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  generateBinCode,
  calcCapacityUtilization,
  calcAvailableSpace,
  validateTransfer,
  findBinsByProduct,
  type BinLocation,
  type BinProduct,
  type BinTransfer,
} from '@/lib/bin-locations'

// Re-export pure helpers so existing import paths in tests still work
export {
  generateBinCode,
  calcCapacityUtilization,
  calcAvailableSpace,
  validateTransfer,
  findBinsByProduct,
  type BinLocation,
  type BinProduct,
  type BinTransfer,
} from '@/lib/bin-locations'

interface BinLocationClientProps {
  storeId: string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="w-full h-2 rounded-full bg-[var(--color-border)]">
      <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BinLocationClient({ storeId }: BinLocationClientProps) {
  const [loading, setLoading] = useState(true)
  const [bins, setBins] = useState<BinLocation[]>([])
  const [transfers, setTransfers] = useState<BinTransfer[]>([])
  const [activeTab, setActiveTab] = useState<'bins' | 'transfers'>('bins')
  const [search, setSearch] = useState('')
  const [showAddBin, setShowAddBin] = useState(false)
  const [showAddTransfer, setShowAddTransfer] = useState(false)
  const [expandedBinId, setExpandedBinId] = useState<string | null>(null)
  const [binProducts, setBinProducts] = useState<Record<string, BinProduct[]>>({})

  const [newBin, setNewBin] = useState({
    warehouseId: '',
    aisle: '',
    rack: '',
    shelf: '',
    bin: '',
    capacity: 0,
  })

  const [newTransfer, setNewTransfer] = useState({
    fromBinId: '',
    toBinId: '',
    productId: '',
    qty: 0,
    note: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [binsRes, transfersRes] = await Promise.all([
        fetch(`/api/bin-locations?storeId=${storeId}`),
        fetch(`/api/bin-transfers?storeId=${storeId}`),
      ])
      if (binsRes.ok) setBins((await binsRes.json()) as BinLocation[])
      if (transfersRes.ok) setTransfers((await transfersRes.json()) as BinTransfer[])
    } catch {
      toast.error('Gagal memuat data lokasi bin')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { load() }, [load])

  const loadBinProducts = async (binId: string) => {
    if (binProducts[binId]) return
    try {
      const res = await fetch(`/api/bin-locations/${binId}/products`)
      if (res.ok) {
        const data = (await res.json()) as BinProduct[]
        setBinProducts(prev => ({ ...prev, [binId]: data }))
      }
    } catch {
      toast.error('Gagal memuat produk bin')
    }
  }

  const handleToggleBin = (binId: string) => {
    if (expandedBinId === binId) {
      setExpandedBinId(null)
    } else {
      setExpandedBinId(binId)
      loadBinProducts(binId)
    }
  }

  const handleAddBin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/bin-locations?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBin),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menambah bin'); return }
      toast.success(`Bin ${data.code} ditambahkan`)
      setNewBin({ warehouseId: '', aisle: '', rack: '', shelf: '', bin: '', capacity: 0 })
      setShowAddBin(false)
      load()
    } catch {
      toast.error('Gagal menambah bin')
    }
  }

  const handleAddTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/bin-transfers?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTransfer, qty: Number(newTransfer.qty) }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal transfer bin'); return }
      toast.success('Transfer berhasil')
      setNewTransfer({ fromBinId: '', toBinId: '', productId: '', qty: 0, note: '' })
      setShowAddTransfer(false)
      setBinProducts({})
      load()
    } catch {
      toast.error('Gagal transfer bin')
    }
  }

  const handleToggleActive = async (bin: BinLocation) => {
    try {
      const res = await fetch(`/api/bin-locations/${bin.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !bin.active }),
      })
      if (!res.ok) { toast.error('Gagal mengubah status'); return }
      toast.success(bin.active ? 'Bin dinonaktifkan' : 'Bin diaktifkan')
      load()
    } catch {
      toast.error('Gagal mengubah status bin')
    }
  }

  const filteredBins = bins.filter(b =>
    b.code.toLowerCase().includes(search.toLowerCase()) ||
    b.aisle.toLowerCase().includes(search.toLowerCase()) ||
    b.rack.toLowerCase().includes(search.toLowerCase()),
  )

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
  const btnPrimary = "inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
  const btnSecondary = "inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm hover:bg-[var(--color-hover)] transition-colors"

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Lokasi Bin Gudang</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">Manajemen lokasi penyimpanan: gang, rak, tingkat, bin</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className={btnSecondary}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Muat Ulang
          </button>
          <button onClick={() => setShowAddTransfer(true)} className={btnSecondary}>
            <ArrowRightLeft className="h-4 w-4" />
            Transfer
          </button>
          <button onClick={() => setShowAddBin(true)} className={btnPrimary}>
            <Plus className="h-4 w-4" />
            Tambah Bin
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {(['bins', 'transfers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {tab === 'bins' ? `Bin (${bins.length})` : `Transfer (${transfers.length})`}
          </button>
        ))}
      </div>

      {/* Add Bin Form */}
      {showAddBin && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Tambah Lokasi Bin</h2>
          <form onSubmit={handleAddBin} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">ID Gudang</label>
              <input className={inputCls} value={newBin.warehouseId} required
                onChange={e => setNewBin(p => ({ ...p, warehouseId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Gang (Aisle)</label>
              <input className={inputCls} value={newBin.aisle} required placeholder="A"
                onChange={e => setNewBin(p => ({ ...p, aisle: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Rak (Rack)</label>
              <input className={inputCls} value={newBin.rack} required placeholder="01"
                onChange={e => setNewBin(p => ({ ...p, rack: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Tingkat (Shelf)</label>
              <input className={inputCls} value={newBin.shelf} required placeholder="B"
                onChange={e => setNewBin(p => ({ ...p, shelf: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Bin</label>
              <input className={inputCls} value={newBin.bin} required placeholder="001"
                onChange={e => setNewBin(p => ({ ...p, bin: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Kapasitas</label>
              <input type="number" min={0} className={inputCls} value={newBin.capacity}
                onChange={e => setNewBin(p => ({ ...p, capacity: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2 md:col-span-3 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAddBin(false)} className={btnSecondary}>Batal</button>
              <button type="submit" className={btnPrimary}>Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* Transfer Form */}
      {showAddTransfer && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Transfer Stok Antar Bin</h2>
          <form onSubmit={handleAddTransfer} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Dari Bin</label>
              <select className={inputCls} value={newTransfer.fromBinId} required
                onChange={e => setNewTransfer(p => ({ ...p, fromBinId: e.target.value }))}>
                <option value="">Pilih bin sumber</option>
                {bins.filter(b => b.active).map(b => (
                  <option key={b.id} value={b.id}>{b.code} (stok: {b.currentQty})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Ke Bin</label>
              <select className={inputCls} value={newTransfer.toBinId} required
                onChange={e => setNewTransfer(p => ({ ...p, toBinId: e.target.value }))}>
                <option value="">Pilih bin tujuan</option>
                {bins.filter(b => b.active && b.id !== newTransfer.fromBinId).map(b => (
                  <option key={b.id} value={b.id}>{b.code} (tersedia: {calcAvailableSpace(b.currentQty, b.capacity)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">ID Produk</label>
              <input className={inputCls} value={newTransfer.productId} required
                onChange={e => setNewTransfer(p => ({ ...p, productId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Qty</label>
              <input type="number" min={1} className={inputCls} value={newTransfer.qty} required
                onChange={e => setNewTransfer(p => ({ ...p, qty: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Catatan</label>
              <input className={inputCls} value={newTransfer.note}
                onChange={e => setNewTransfer(p => ({ ...p, note: e.target.value }))} />
            </div>
            <div className="col-span-2 md:col-span-3 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAddTransfer(false)} className={btnSecondary}>Batal</button>
              <button type="submit" className={btnPrimary}>Transfer</button>
            </div>
          </form>
        </div>
      )}

      {/* Bins Tab */}
      {activeTab === 'bins' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)]" />
            <input
              className={cn(inputCls, 'pl-9')}
              placeholder="Cari kode bin, gang, atau rak..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">Memuat...</div>
          ) : filteredBins.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">Belum ada lokasi bin</div>
          ) : (
            <div className="space-y-2">
              {filteredBins.map(b => {
                const pct = calcCapacityUtilization(b.currentQty, b.capacity)
                const expanded = expandedBinId === b.id
                return (
                  <div key={b.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                    <div
                      className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
                      onClick={() => handleToggleBin(b.id)}
                    >
                      <MapPin className="h-4 w-4 text-[var(--color-primary)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm text-[var(--color-text-primary)]">{b.code}</span>
                          {!b.active && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-border)] text-[var(--color-text-secondary)]">Nonaktif</span>
                          )}
                        </div>
                        <div className="mt-1 space-y-1">
                          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
                            <span>{b.currentQty} / {b.capacity} unit ({pct}%)</span>
                            <span>{calcAvailableSpace(b.currentQty, b.capacity)} tersedia</span>
                          </div>
                          <UtilBar pct={pct} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleActive(b) }}
                          className={cn('p-1.5 rounded-lg transition-colors', b.active
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]')}
                          title={b.active ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          {b.active ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        </button>
                        {expanded ? <ChevronUp className="h-4 w-4 text-[var(--color-text-secondary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--color-text-secondary)]" />}
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-[var(--color-border)] px-4 py-3">
                        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">Produk di Bin</p>
                        {(binProducts[b.id] ?? []).length === 0 ? (
                          <p className="text-xs text-[var(--color-text-secondary)]">Tidak ada produk di bin ini</p>
                        ) : (
                          <div className="space-y-1">
                            {(binProducts[b.id] ?? []).map(bp => (
                              <div key={bp.id} className="flex items-center gap-2 text-xs text-[var(--color-text-primary)]">
                                <Package className="h-3 w-3 text-[var(--color-text-secondary)]" />
                                <span className="flex-1">{bp.productName ?? bp.productId}</span>
                                {bp.sku && <span className="text-[var(--color-text-secondary)]">{bp.sku}</span>}
                                <span className="font-medium">{bp.qty} unit</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Transfers Tab */}
      {activeTab === 'transfers' && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">Memuat...</div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">Belum ada riwayat transfer</div>
          ) : (
            transfers.map(t => (
              <div key={t.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <ArrowRightLeft className="h-4 w-4 text-[var(--color-primary)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-[var(--color-text-primary)]">{t.fromBinCode ?? t.fromBinId}</span>
                      <ArrowRightLeft className="h-3 w-3 text-[var(--color-text-secondary)]" />
                      <span className="font-mono text-[var(--color-text-primary)]">{t.toBinCode ?? t.toBinId}</span>
                    </div>
                    <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      {t.productName ?? t.productId} · {t.qty} unit
                      {t.note && ` · ${t.note}`}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] shrink-0">
                    {new Date(t.createdAt).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

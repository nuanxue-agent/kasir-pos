'use client'

import { useState, useMemo, useRef } from 'react'
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  Keyboard,
  MessageSquare,
  BookOpen,
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Settings,
  Paperclip,
  Send,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Category = 'POS' | 'Inventory' | 'Reports' | 'HR' | 'Settings'

interface FaqItem {
  id: string
  category: Category
  question: string
  answer: string
}

interface Shortcut {
  key: string
  description: string
  context: string
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<Category, { icon: React.ElementType; color: string }> = {
  POS: { icon: ShoppingCart, color: 'text-amber-600 bg-amber-50' },
  Inventory: { icon: Package, color: 'text-blue-600 bg-blue-50' },
  Reports: { icon: BarChart3, color: 'text-green-600 bg-green-50' },
  HR: { icon: Users, color: 'text-purple-600 bg-purple-50' },
  Settings: { icon: Settings, color: 'text-stone-600 bg-stone-100' },
}

const FAQ_ITEMS: FaqItem[] = [
  // POS
  {
    id: 'pos-1',
    category: 'POS',
    question: 'Bagaimana cara memulai sesi kasir?',
    answer:
      'Buka menu POS dari sidebar, lalu klik tombol "Mulai Shift". Masukkan jumlah uang awal di laci kas, kemudian klik "Konfirmasi". Setelah itu Anda siap menerima transaksi.',
  },
  {
    id: 'pos-2',
    category: 'POS',
    question: 'Bagaimana cara menambah diskon ke transaksi?',
    answer:
      'Di layar POS, setelah menambahkan produk ke keranjang, klik ikon "%" di samping total. Anda bisa memasukkan diskon dalam persen atau nominal rupiah. Diskon juga bisa diterapkan per item dengan menekan lama pada produk.',
  },
  {
    id: 'pos-3',
    category: 'POS',
    question: 'Apa itu split payment dan cara menggunakannya?',
    answer:
      'Split payment memungkinkan pelanggan membayar dengan beberapa metode sekaligus (misalnya tunai + QRIS). Di layar checkout, pilih "Bayar", lalu aktifkan toggle "Split Payment". Tambahkan jumlah untuk setiap metode hingga totalnya terpenuhi.',
  },
  {
    id: 'pos-4',
    category: 'POS',
    question: 'Bagaimana cara mencetak struk ulang?',
    answer:
      'Buka menu Pesanan, temukan transaksi yang diinginkan, lalu klik ikon printer di kolom aksi. Anda juga bisa mengirim struk digital via WhatsApp dari halaman detail pesanan.',
  },
  {
    id: 'pos-5',
    category: 'POS',
    question: 'Bagaimana cara memproses retur/refund?',
    answer:
      'Buka detail pesanan dari menu Pesanan, klik tombol "Retur". Pilih item yang dikembalikan dan jumlahnya, tentukan metode refund (tunai atau kredit), lalu konfirmasi. Stok akan otomatis diperbarui.',
  },
  // Inventory
  {
    id: 'inv-1',
    category: 'Inventory',
    question: 'Bagaimana cara menambah produk baru?',
    answer:
      'Masuk ke menu Produk → klik "Tambah Produk". Isi nama, SKU, harga jual, harga beli, dan stok awal. Untuk produk dengan varian (ukuran/warna), aktifkan toggle "Varian" dan tambahkan opsi varian.',
  },
  {
    id: 'inv-2',
    category: 'Inventory',
    question: 'Apa itu stock opname dan cara melakukannya?',
    answer:
      'Stock opname adalah penghitungan fisik stok untuk mencocokkan dengan sistem. Buka Inventori → Stock Opname → klik "Mulai Opname". Scan atau masukkan jumlah aktual setiap produk, lalu klik "Selesaikan". Sistem akan mencatat selisih secara otomatis.',
  },
  {
    id: 'inv-3',
    category: 'Inventory',
    question: 'Bagaimana cara mengatur batas stok minimum?',
    answer:
      'Di halaman detail produk, scroll ke bagian "Pengaturan Stok". Masukkan angka di kolom "Stok Minimum". Sistem akan mengirim notifikasi dan menampilkan peringatan ketika stok mencapai batas ini.',
  },
  {
    id: 'inv-4',
    category: 'Inventory',
    question: 'Bagaimana cara import produk massal?',
    answer:
      'Di halaman Produk, klik tombol "Import" di pojok kanan atas. Unduh template CSV, isi data produk Anda, lalu upload file. Sistem akan memvalidasi data dan menampilkan pratinjau sebelum mengimpor.',
  },
  // Reports
  {
    id: 'rep-1',
    category: 'Reports',
    question: 'Laporan apa saja yang tersedia?',
    answer:
      'Kasir menyediakan laporan: Penjualan (harian/mingguan/bulanan), Produk Terlaris, Laporan Pajak, Arus Kas, Laba Rugi, Neraca, Performa Staf, Analitik Pelanggan, dan Prediksi Churn.',
  },
  {
    id: 'rep-2',
    category: 'Reports',
    question: 'Bagaimana cara mengekspor laporan?',
    answer:
      'Di halaman laporan mana pun, klik tombol "Ekspor" di pojok kanan atas. Pilih format (PDF, Excel, atau CSV), tentukan rentang tanggal, lalu klik "Unduh".',
  },
  {
    id: 'rep-3',
    category: 'Reports',
    question: 'Bagaimana cara membuat budget dan melihat variansinya?',
    answer:
      'Buka Laporan → Budget Planner. Klik "Buat Budget Baru", pilih periode, dan masukkan target untuk setiap kategori akun. Setelah disimpan, sistem akan membandingkan aktual vs budget secara otomatis.',
  },
  // HR
  {
    id: 'hr-1',
    category: 'HR',
    question: 'Bagaimana cara menambah karyawan?',
    answer:
      'Buka menu HR → klik "Tambah Karyawan". Isi data pribadi, jabatan, departemen, dan gaji. Anda juga bisa mengundang karyawan via email agar mereka bisa login ke sistem dengan peran yang sesuai.',
  },
  {
    id: 'hr-2',
    category: 'HR',
    question: 'Bagaimana cara menghitung payroll?',
    answer:
      'Di menu HR → Payroll, pilih periode penggajian. Sistem akan mengkalkulasi gaji dasar + tunjangan + lembur - potongan secara otomatis berdasarkan data absensi dan pengaturan tiap karyawan. Klik "Proses Payroll" untuk mengonfirmasi.',
  },
  {
    id: 'hr-3',
    category: 'HR',
    question: 'Bagaimana cara mengelola jadwal shift?',
    answer:
      'Buka HR → Jadwal. Klik tanggal di kalender untuk menambah shift baru. Pilih karyawan, waktu mulai dan selesai. Karyawan akan mendapat notifikasi untuk shift yang dijadwalkan.',
  },
  // Settings
  {
    id: 'set-1',
    category: 'Settings',
    question: 'Bagaimana cara mengubah tarif pajak?',
    answer:
      'Buka Pengaturan → tab Toko. Cari kolom "Tarif Pajak (%)" dan masukkan nilai persentase baru. Simpan perubahan. Tarif ini akan berlaku untuk semua transaksi baru.',
  },
  {
    id: 'set-2',
    category: 'Settings',
    question: 'Bagaimana cara mengaktifkan program loyalitas?',
    answer:
      'Buka Pengaturan → scroll ke bagian Loyalitas. Aktifkan toggle "Program Loyalitas", atur rasio poin (misal: 1 poin per Rp 10.000), dan tentukan nilai tukar poin. Simpan untuk mengaktifkan.',
  },
  {
    id: 'set-3',
    category: 'Settings',
    question: 'Bagaimana cara menambah metode pembayaran?',
    answer:
      'Buka Pengaturan → tab Pembayaran. Anda akan melihat daftar metode yang tersedia (Tunai, QRIS, Transfer, Kartu). Aktifkan toggle di samping metode yang ingin digunakan.',
  },
  {
    id: 'set-4',
    category: 'Settings',
    question: 'Bagaimana cara mengatur multi-store?',
    answer:
      'Fitur multi-store tersedia di paket Pro ke atas. Buka Pengaturan → Toko, lalu klik "Tambah Cabang". Setiap cabang memiliki stok dan laporan terpisah, namun dapat dikelola dari satu akun induk.',
  },
]

const KEYBOARD_SHORTCUTS: Shortcut[] = [
  // Global
  { key: 'Ctrl + K', description: 'Buka Quick Actions / Command Palette', context: 'Global' },
  { key: 'Ctrl + /', description: 'Buka Pusat Bantuan', context: 'Global' },
  { key: 'Escape', description: 'Tutup modal / panel aktif', context: 'Global' },
  // POS
  { key: 'F2', description: 'Fokus ke kolom pencarian produk', context: 'POS' },
  { key: 'F4', description: 'Proses pembayaran / checkout', context: 'POS' },
  { key: 'F8', description: 'Buka laci kas', context: 'POS' },
  { key: 'F9', description: 'Tahan / parkir transaksi', context: 'POS' },
  { key: 'Ctrl + D', description: 'Tambah diskon ke transaksi', context: 'POS' },
  { key: 'Ctrl + Z', description: 'Hapus item terakhir dari keranjang', context: 'POS' },
  // Navigation
  { key: 'G + D', description: 'Pergi ke Dashboard', context: 'Navigasi' },
  { key: 'G + P', description: 'Pergi ke POS', context: 'Navigasi' },
  { key: 'G + I', description: 'Pergi ke Inventori', context: 'Navigasi' },
  { key: 'G + R', description: 'Pergi ke Laporan', context: 'Navigasi' },
  { key: 'G + S', description: 'Pergi ke Pengaturan', context: 'Navigasi' },
  // Tables / Lists
  { key: 'J / K', description: 'Navigasi baris atas/bawah di tabel', context: 'Tabel' },
  { key: 'Enter', description: 'Buka detail baris yang dipilih', context: 'Tabel' },
  { key: 'Ctrl + F', description: 'Fokus ke pencarian tabel', context: 'Tabel' },
  { key: 'Ctrl + E', description: 'Ekspor data tabel saat ini', context: 'Tabel' },
]

const CATEGORIES: Category[] = ['POS', 'Inventory', 'Reports', 'HR', 'Settings']

// ─── Sub-components ────────────────────────────────────────────────────────────

function ShortcutModal({ onClose }: { onClose: () => void }) {
  const grouped = useMemo(() => {
    const map: Record<string, Shortcut[]> = {}
    for (const s of KEYBOARD_SHORTCUTS) {
      if (!map[s.context]) map[s.context] = []
      map[s.context].push(s)
    }
    return map
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border,#e7e5e4)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold text-stone-800">Pintasan Keyboard</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto p-5">
          {Object.entries(grouped).map(([context, shortcuts]) => (
            <div key={context}>
              <p className="mb-2 text-[11px] font-bold tracking-widest text-stone-400 uppercase">
                {context}
              </p>
              <div className="space-y-1.5">
                {shortcuts.map(s => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-stone-50"
                  >
                    <span className="text-sm text-stone-600">{s.description}</span>
                    <kbd className="rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 font-mono text-xs font-medium text-stone-700">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ContactForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ subject: '', description: '', category: '' as Category | '' })
  const [fileName, setFileName] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const inputCls =
    'w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card,#fafaf9)] px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subject.trim() || !form.description.trim()) return
    setSending(true)
    // Simulate API call
    await new Promise(r => setTimeout(r, 900))
    setSending(false)
    setSent(true)
    toast.success('Permintaan bantuan terkirim!')
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" />
        </div>
        <div>
          <p className="text-base font-bold text-stone-800">Terkirim!</p>
          <p className="mt-1 text-sm text-stone-500">
            Tim kami akan merespons dalam 1×24 jam kerja.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
        >
          Tutup
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-stone-500">
          Kategori Masalah
        </label>
        <select
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
          className={inputCls}
        >
          <option value="">Pilih kategori…</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-stone-500">Judul *</label>
        <input
          value={form.subject}
          onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
          className={inputCls}
          placeholder="Ringkasan masalah Anda"
          required
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-stone-500">Deskripsi *</label>
        <textarea
          rows={4}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className={inputCls}
          placeholder="Jelaskan masalah secara detail…"
          required
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-stone-500">
          Screenshot (opsional)
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500 transition-colors hover:border-amber-400 hover:text-amber-600"
        >
          <Paperclip className="h-4 w-4" />
          {fileName || 'Pilih gambar…'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => setFileName(e.target.files?.[0]?.name ?? '')}
        />
      </div>
      <button
        type="submit"
        disabled={sending || !form.subject.trim() || !form.description.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {sending ? 'Mengirim…' : 'Kirim Permintaan'}
      </button>
    </form>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function HelpCenterClient() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [tab, setTab] = useState<'faq' | 'contact'>('faq')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return FAQ_ITEMS.filter(item => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory
      if (!matchCat) return false
      if (!q) return true
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    })
  }, [search, activeCategory])

  return (
    <>
      {showShortcuts && <ShortcutModal onClose={() => setShowShortcuts(false)} />}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200">
              <HelpCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-800">Pusat Bantuan</h1>
              <p className="text-sm text-stone-500">FAQ, panduan, dan kontak dukungan</p>
            </div>
          </div>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Pintasan
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-xl border border-[var(--border,#e7e5e4)] bg-stone-100/60 p-1">
          {(
            [
              { id: 'faq', label: 'FAQ & Artikel', icon: BookOpen },
              { id: 'contact', label: 'Hubungi Support', icon: MessageSquare },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-[var(--bg-card)] text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'faq' ? (
          <>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari pertanyaan…"
                className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card)] py-3 pr-10 pl-10 text-sm text-stone-800 placeholder-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
                aria-label="Cari FAQ"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Hapus pencarian"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Category filters */}
            <div className="mb-4 flex flex-wrap gap-2">
              {(['All', ...CATEGORIES] as const).map(cat => {
                const meta = cat === 'All' ? null : CATEGORY_META[cat]
                const Icon = meta?.icon
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      activeCategory === cat
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-[var(--border,#e7e5e4)] bg-[var(--bg-card)] text-stone-600 hover:border-stone-300',
                    )}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {cat === 'All' ? 'Semua' : cat}
                  </button>
                )
              })}
            </div>

            {/* FAQ list */}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 py-14 text-center">
                <HelpCircle className="mx-auto mb-3 h-8 w-8 text-stone-300" />
                <p className="text-sm font-medium text-stone-500">Tidak ada hasil ditemukan</p>
                <p className="mt-1 text-xs text-stone-400">
                  Coba kata kunci lain atau pilih kategori berbeda
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(item => {
                  const meta = CATEGORY_META[item.category]
                  const Icon = meta.icon
                  const isOpen = openId === item.id
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card)] shadow-sm"
                    >
                      <button
                        onClick={() => setOpenId(isOpen ? null : item.id)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                        aria-expanded={isOpen}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs',
                            meta.color,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 text-sm leading-snug font-medium text-stone-800">
                          {item.question}
                        </span>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="border-t border-stone-100 px-4 pt-3 pb-4">
                          <p className="text-sm leading-relaxed text-stone-600">{item.answer}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--bg-card)] p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base font-bold text-stone-800">Hubungi Tim Support</h2>
              <p className="mt-0.5 text-sm text-stone-500">
                Kami siap membantu Anda dalam 1×24 jam kerja.
              </p>
            </div>
            <ContactForm onClose={() => setTab('faq')} />
          </div>
        )}
      </div>
    </>
  )
}

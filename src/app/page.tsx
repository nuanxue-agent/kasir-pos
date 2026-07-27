import Link from 'next/link'
import {
  ShoppingBag, BarChart3, Package, Users, CheckCircle, ArrowRight,
  Star, Wifi, WifiOff, Store, FileText, Zap,
} from 'lucide-react'

// Demo credentials used site-wide
export const DEMO_EMAIL = 'owner@demo.com'
export const DEMO_PASSWORD = 'demo123'
export const DEMO_LOGIN_HREF = `/login?email=${encodeURIComponent(DEMO_EMAIL)}&demo=1`

// Feature list used in tests
export const FEATURES = [
  { id: 'pos',        title: 'Kasir (POS)',         icon: ShoppingBag },
  { id: 'inventory',  title: 'Manajemen Stok',       icon: Package },
  { id: 'reports',    title: 'Laporan & Analitik',   icon: BarChart3 },
  { id: 'multistore', title: 'Multi-Toko',           icon: Store },
  { id: 'offline',    title: 'Offline-Ready',        icon: WifiOff },
  { id: 'customers',  title: 'Data Pelanggan',       icon: Users },
]

// Pricing tiers used in tests
export const PRICING_TIERS = [
  {
    id: 'free',
    name: 'FREE',
    price: 0,
    label: 'Gratis',
    per: '/bulan',
    desc: 'Cocok untuk mulai.',
    features: ['1 toko', '2 kasir', '100 produk', 'Laporan dasar'],
    cta: 'Mulai Gratis',
    ctaHref: '/signup',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'PRO',
    price: 99000,
    label: 'Rp 99rb',
    per: '/bulan',
    desc: 'Untuk usaha yang berkembang.',
    features: ['3 toko', '10 kasir', 'Produk tak terbatas', 'Laporan lengkap', 'Poin loyalitas', 'Prioritas dukungan'],
    cta: 'Coba Pro',
    ctaHref: '/signup?plan=pro',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'ENTERPRISE',
    price: 299000,
    label: 'Rp 299rb',
    per: '/bulan',
    desc: 'Untuk usaha besar.',
    features: ['Toko tak terbatas', 'Kasir tak terbatas', 'API akses', 'Custom integrasi', 'Dukungan khusus'],
    cta: 'Hubungi Kami',
    ctaHref: '/signup?plan=enterprise',
    highlight: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fffdf7] text-[#1c1917]">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-[#fffdf7]/90 backdrop-blur-md border-b border-amber-100">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-200">
              <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#1c1917]">Kasir POS</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#fitur" className="text-sm text-stone-500 hover:text-amber-600 transition-colors">Fitur</a>
            <a href="#screenshot" className="text-sm text-stone-500 hover:text-amber-600 transition-colors">Tampilan</a>
            <a href="#harga" className="text-sm text-stone-500 hover:text-amber-600 transition-colors">Harga</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-stone-500 hover:text-[#1c1917] transition-colors hidden sm:block">
              Masuk
            </Link>
            <Link
              href={DEMO_LOGIN_HREF}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all hover:scale-[1.02]"
            >
              Coba Demo Gratis
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-amber-700">
            <span className="text-amber-500">✦</span>
            Gratis untuk 1 toko — Tanpa kartu kredit
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold leading-[1.1] tracking-tight">
            Kasir POS —{' '}
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              Solusi Kasir Modern
            </span>
            {' '}untuk UMKM Indonesia
          </h1>

          <p className="mt-6 text-lg text-stone-500 leading-relaxed max-w-xl mx-auto">
            Kelola penjualan, stok, laporan, dan multi-toko — semuanya dari satu aplikasi.
            Bekerja online maupun offline.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={DEMO_LOGIN_HREF}
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-amber-200 hover:shadow-amber-300 hover:scale-[1.02] transition-all"
              data-testid="cta-demo"
            >
              Coba Demo Gratis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/signup"
              className="rounded-xl border border-stone-200 px-7 py-3.5 text-sm font-semibold text-stone-600 hover:border-amber-300 hover:text-amber-700 transition-all"
            >
              Mulai Gratis — Tanpa Kartu Kredit
            </Link>
          </div>

          {/* Social proof */}
          <div className="mt-8 flex items-center justify-center gap-1.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
            <span className="ml-2 text-sm text-stone-500" data-testid="social-proof">
              Dipercaya oleh 500+ toko di Indonesia
            </span>
          </div>
        </div>

        {/* App preview mock */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="relative rounded-2xl border border-amber-100 bg-white shadow-2xl shadow-amber-100/60 overflow-hidden">
            {/* Fake browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-stone-50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/70" />
                <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/70" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1 text-xs text-stone-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  kasir-pos-alpha.vercel.app — Kasir POS
                </div>
              </div>
            </div>
            {/* Mock POS UI */}
            <div className="grid grid-cols-3 min-h-[280px] bg-[#fffdf7]">
              {/* Products grid */}
              <div className="col-span-2 p-4 grid grid-cols-3 gap-3">
                {['Ayam Bakar', 'Es Teh Manis', 'Mie Goreng', 'Kopi Hitam', 'Pisang Goreng', 'Keripik'].map((name, i) => (
                  <div key={name} className="rounded-xl border border-amber-100 bg-white p-3 flex flex-col gap-2 shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-lg">
                      {['🍗','🧋','🍜','☕','🍌','🍿'][i]}
                    </div>
                    <p className="text-xs font-medium text-stone-700 leading-tight">{name}</p>
                    <p className="text-xs font-bold text-amber-600">Rp{[35,8,22,10,10,12][i]}k</p>
                  </div>
                ))}
              </div>
              {/* Cart */}
              <div className="border-l border-amber-100 bg-white p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Pesanan</p>
                <div className="space-y-2">
                  {[['Ayam Bakar','Rp35k'],['Es Teh Manis','Rp8k']].map(([n,p]) => (
                    <div key={n} className="flex justify-between items-center text-xs">
                      <span className="text-stone-600">{n}</span>
                      <span className="font-medium text-stone-800">{p}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto border-t border-stone-100 pt-3">
                  <div className="flex justify-between text-sm font-bold text-stone-800">
                    <span>Total</span><span>Rp43k</span>
                  </div>
                  <div className="mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-center text-xs font-semibold text-white">
                    Bayar
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-amber-100 bg-amber-50/50">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="grid grid-cols-3 divide-x divide-amber-100">
            {[
              ['10.000+', 'Transaksi dicatat'],
              ['500+', 'Toko aktif'],
              ['99.9%', 'Uptime'],
            ].map(([val, label]) => (
              <div key={label} className="px-6 text-center">
                <div className="text-3xl font-bold text-amber-600">{val}</div>
                <div className="mt-1 text-sm text-stone-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="fitur" className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">Fitur</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Semua yang kamu butuhkan</h2>
            <p className="mt-3 text-stone-500">Dirancang khusus untuk UMKM yang ingin rapi tanpa ribet.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ id, title, icon: Icon }) => {
              const descs: Record<string, string> = {
                pos:        'Catat transaksi dalam hitungan detik. Dukung tunai, transfer, dan QRIS.',
                inventory:  'Stok berkurang otomatis. Notifikasi kalau barang hampir habis.',
                reports:    'Lihat omzet, produk terlaris, dan laporan harian kapan saja.',
                multistore: 'Kelola banyak cabang toko dari satu dashboard terpusat.',
                offline:    'Tetap bisa transaksi meski koneksi internet putus. Sinkronisasi otomatis.',
                customers:  'Simpan data pelanggan, kelola poin loyalitas, dan beri reward.',
              }
              const colors: Record<string, string> = {
                pos: 'bg-amber-50 text-amber-600', inventory: 'bg-orange-50 text-orange-600',
                reports: 'bg-amber-50 text-amber-600', multistore: 'bg-orange-50 text-orange-600',
                offline: 'bg-stone-100 text-stone-600', customers: 'bg-amber-50 text-amber-600',
              }
              return (
                <div key={id} className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-amber-200 transition-all">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${colors[id]} mb-4`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-stone-800 mb-2">{title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{descs[id]}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Screenshots (placeholder) ── */}
      <section id="screenshot" className="px-6 py-24 bg-amber-50/40">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">Tampilan Aplikasi</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Antarmuka yang bersih & intuitif</h2>
            <p className="mt-3 text-stone-500">Dirancang agar siapa pun bisa langsung pakai tanpa pelatihan.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { label: 'Dashboard Penjualan', color: 'from-amber-400/30 to-orange-400/20', icon: BarChart3, desc: 'Ringkasan omzet & transaksi hari ini' },
              { label: 'Layar Kasir (POS)', color: 'from-amber-500/25 to-amber-300/15', icon: ShoppingBag, desc: 'Pilih produk → tambah ke keranjang → bayar' },
              { label: 'Laporan Bulanan', color: 'from-orange-400/30 to-amber-400/20', icon: FileText, desc: 'Grafik penjualan, produk terlaris, margin' },
            ].map(({ label, color, icon: Icon, desc }) => (
              <div key={label} className="rounded-2xl border border-amber-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
                {/* placeholder colored "screenshot" */}
                <div className={`h-44 bg-gradient-to-br ${color} flex items-center justify-center`}>
                  <div className="text-center">
                    <Icon className="mx-auto h-10 w-10 text-amber-500/60 mb-2" />
                    <span className="text-xs text-amber-700/60 font-medium">{label}</span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-stone-700">{label}</p>
                  <p className="text-xs text-stone-400 mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href={DEMO_LOGIN_HREF}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-amber-200 hover:shadow-amber-300 hover:scale-[1.02] transition-all"
            >
              <Zap className="h-4 w-4" />
              Coba Demo Gratis Sekarang
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">Cara Kerja</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Siap pakai dalam 5 menit</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { n: '01', title: 'Daftar gratis', desc: 'Buat akun dalam 30 detik. Tidak perlu kartu kredit.' },
              { n: '02', title: 'Input produk', desc: 'Tambahkan nama, harga, dan stok barang jualan kamu.' },
              { n: '03', title: 'Mulai jualan', desc: 'Buka kasir dari HP atau laptop, catat transaksi, lihat laporan.' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-bold text-white shadow-lg shadow-amber-200">
                  {n}
                </div>
                <h3 className="font-semibold text-stone-800 mb-2">{title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="harga" className="px-6 py-24 bg-amber-50/40">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">Harga</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Harga yang masuk akal</h2>
            <p className="mt-3 text-stone-500">Tidak ada biaya tersembunyi. Batalkan kapan saja.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PRICING_TIERS.map(({ id, name, label, per, desc, features, cta, ctaHref, highlight }) => (
              <div
                key={id}
                data-testid={`pricing-${id}`}
                className={`relative rounded-2xl p-8 ${highlight
                  ? 'bg-gradient-to-b from-amber-500 to-orange-500 text-white shadow-2xl shadow-amber-200 scale-[1.02]'
                  : 'bg-white border border-stone-100 shadow-sm'}`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-600 shadow">
                    Paling Populer
                  </div>
                )}
                <div className={`text-sm font-semibold uppercase tracking-widest ${highlight ? 'text-amber-100' : 'text-stone-400'}`}>
                  {name}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{label}</span>
                  <span className={`text-sm ${highlight ? 'text-amber-100' : 'text-stone-400'}`}>{per}</span>
                </div>
                <p className={`mt-2 text-sm ${highlight ? 'text-amber-100' : 'text-stone-500'}`}>{desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle className={`h-4 w-4 shrink-0 ${highlight ? 'text-white' : 'text-amber-500'}`} />
                      <span className={highlight ? 'text-white' : 'text-stone-600'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={ctaHref}
                  className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all ${
                    highlight
                      ? 'bg-white text-amber-600 hover:bg-amber-50'
                      : 'border border-stone-200 text-stone-700 hover:border-amber-300 hover:text-amber-700'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-6 py-24 bg-gradient-to-br from-amber-500 to-orange-500">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Siap rapikan tokomu?</h2>
          <p className="mt-4 text-amber-100 text-lg">
            Bergabung dengan 500+ pemilik toko yang sudah pakai Kasir POS. Gratis untuk mulai.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <Link href="/signup" className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition-colors shadow-lg">
              Mulai Sekarang — Gratis
            </Link>
            <Link
              href={DEMO_LOGIN_HREF}
              className="rounded-xl border border-white/30 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Coba Demo Gratis
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-100 px-6 py-10">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <ShoppingBag className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-stone-800">Kasir POS</span>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-stone-400">
            <a href="#fitur" className="hover:text-amber-600 transition-colors">Fitur</a>
            <a href="#screenshot" className="hover:text-amber-600 transition-colors">Tampilan</a>
            <a href="#harga" className="hover:text-amber-600 transition-colors">Harga</a>
            <Link href="/login" className="hover:text-amber-600 transition-colors">Masuk</Link>
            <Link href="/signup" className="hover:text-amber-600 transition-colors">Daftar</Link>
            <a href="#" className="hover:text-amber-600 transition-colors">Syarat &amp; Ketentuan</a>
            <a href="#" className="hover:text-amber-600 transition-colors">Privasi</a>
          </div>
          <p className="text-xs text-stone-400">© 2026 Kasir POS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

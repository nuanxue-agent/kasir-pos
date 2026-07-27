import { ShoppingBag, BarChart3, Users, Package, Star, Shield } from 'lucide-react'

const features = [
  { icon: ShoppingBag, label: 'Kasir Cepat', sub: 'Transaksi dalam hitungan detik' },
  { icon: BarChart3, label: 'Laporan Harian', sub: 'Omzet & produk terlaris' },
  { icon: Users, label: 'Multi Kasir', sub: 'Pemilik · Manajer · Kasir' },
  { icon: Package, label: 'Stok Otomatis', sub: 'Notif kalau barang hampir habis' },
  { icon: Star, label: 'Poin Pelanggan', sub: 'Program loyalitas sederhana' },
  { icon: Shield, label: 'Data Aman', sub: 'Enkripsi end-to-end' },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-1)]">
      <div className="flex min-h-screen">
        {/* ── Left panel ── */}
        <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-amber-500 to-orange-500 p-12">
          {/* Subtle dot pattern */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
              backgroundSize: '28px 28px',
            }}
          />

          {/* Logo */}
          <div className="relative z-10">
            <a href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">Lakoo</span>
            </a>
          </div>

          {/* Center content */}
          <div className="relative z-10 space-y-8">
            <div>
              <h2 className="text-3xl font-bold leading-tight text-white">
                Jualan makin gampang,{' '}
                <span className="text-amber-100">untung makin besar.</span>
              </h2>
              <p className="mt-3 text-amber-100 text-sm leading-relaxed">
                Ribuan pemilik warung dan toko kecil sudah pakai Lakoo untuk catat penjualan sehari-hari.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3">
              {features.map(({ icon: Icon, label, sub }) => (
                <div
                  key={label}
                  className="rounded-xl bg-white/10 border border-white/20 p-4 backdrop-blur-sm"
                >
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-xs text-amber-100 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8">
              {[['500+', 'toko aktif'], ['10rb+', 'transaksi'], ['99.9%', 'uptime']].map(([v, l]) => (
                <div key={l}>
                  <div className="text-xl font-bold text-white">{v}</div>
                  <div className="text-xs text-amber-100">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div className="relative z-10">
            <blockquote className="rounded-xl bg-white/10 border border-white/20 p-4 backdrop-blur-sm">
              <p className="text-sm text-white leading-relaxed">
                &ldquo;Sejak pakai Lakoo, pencatatan jadi lebih rapi dan saya bisa lihat omzet setiap hari dari HP.&rdquo;
              </p>
              <footer className="mt-3 flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-white/30 flex items-center justify-center text-white text-xs font-bold">B</div>
                <div>
                  <span className="text-xs font-medium text-white">Bu Ratna</span>
                  <span className="text-xs text-amber-100"> · Warung Makan Barokah</span>
                </div>
              </footer>
            </blockquote>
          </div>
        </div>

        {/* ── Right panel: form ── */}
        <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
                <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-lg font-bold text-[var(--text-1)]">Lakoo</span>
            </a>
          </div>

          <div className="w-full max-w-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

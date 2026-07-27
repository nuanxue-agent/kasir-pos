import { ShoppingCart, BarChart3, Users, Zap, Shield, Globe } from 'lucide-react'

const features = [
  { icon: ShoppingCart, label: 'Fast POS Terminal', sub: 'Sub-50ms transactions' },
  { icon: BarChart3, label: 'Real-time Analytics', sub: 'Live sales dashboards' },
  { icon: Users, label: 'Role-Based Access', sub: 'Owner · Manager · Cashier' },
  { icon: Zap, label: 'Works Offline', sub: 'Syncs when reconnected' },
  { icon: Shield, label: 'Secure by Default', sub: 'JWT + encrypted sessions' },
  { icon: Globe, label: 'Any Database', sub: 'D1, Postgres, SQLite' },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Background grid */}
      <div
        className="fixed inset-0 -z-10 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />

      <div className="flex min-h-screen">
        {/* ── Left panel (hidden on mobile) ── */}
        <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden border-r border-white/[0.06] p-12">
          {/* Radial gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-[#0a0a0f] to-violet-950/40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_40%,rgba(99,102,241,0.15),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(139,92,246,0.1),transparent)]" />

          {/* Logo */}
          <div className="relative z-10">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">Kasir</span>
            </a>
          </div>

          {/* Center content */}
          <div className="relative z-10 space-y-8">
            <div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight">
                The POS that{' '}
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  moves as fast
                </span>{' '}
                as you do.
              </h2>
              <p className="mt-3 text-slate-400">
                Trusted by thousands of businesses for reliable, modern point-of-sale.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3">
              {features.map(({ icon: Icon, label, sub }) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur-sm transition-all hover:border-indigo-500/20 hover:bg-white/[0.05]"
                >
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-slate-500">{sub}</div>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-6">
              {[
                { value: '10k+', label: 'transactions' },
                { value: '99.9%', label: 'uptime' },
                { value: '50ms', label: 'response' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div className="text-lg font-bold text-white">{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom quote */}
          <div className="relative z-10">
            <blockquote className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur-sm">
              <p className="text-sm text-slate-300">
                "Kasir cut our checkout time in half. The multi-store dashboard alone is worth it."
              </p>
              <footer className="mt-2 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600" />
                <span className="text-xs text-slate-500">Ahmad R. · Warung Makan Barokah</span>
              </footer>
            </blockquote>
          </div>
        </div>

        {/* ── Right panel: form ── */}
        <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">Kasir</span>
            </a>
          </div>

          <div className="w-full max-w-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

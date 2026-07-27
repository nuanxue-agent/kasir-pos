import Link from 'next/link'
import {
  Store,
  Users,
  BarChart3,
  ShoppingCart,
  CreditCard,
  Database,
  Check,
  Zap,
  Shield,
  Globe,
  ArrowRight,
  Github,
} from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Background grid pattern */}
      <div
        className="fixed inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />
      {/* Radial gradient top */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.15),transparent)]" />

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <ShoppingCart className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Kasir</span>
          </div>

          {/* Center links */}
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#features" className="text-sm text-slate-400 transition-colors hover:text-white">
              Features
            </Link>
            <Link href="#pricing" className="text-sm text-slate-400 transition-colors hover:text-white">
              Pricing
            </Link>
            <Link
              href="https://github.com"
              className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <Github className="h-4 w-4" />
              GitHub
            </Link>
          </div>

          {/* CTA buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm text-slate-400 transition-colors hover:text-white sm:block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30"
            >
              Start Free
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative px-6 pb-24 pt-20 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm text-indigo-300">
              <span className="text-indigo-400">✦</span>
              Now with D1 Database
            </div>

            <h1 className="text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl">
              The Modern POS for{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
                Growing Businesses
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-400">
              Multi-tenant, role-based, lightning fast. Built for teams that need a POS that works
              as hard as they do — any database, any scale.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.02]"
              >
                Start for Free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/10 hover:border-white/20"
              >
                View Demo
              </Link>
            </div>
          </div>

          {/* Floating POS mockup */}
          <div className="mt-20 sm:mt-28">
            <div className="relative mx-auto max-w-4xl">
              {/* Glow behind card */}
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-indigo-500/20 blur-3xl" />
              <div className="relative rounded-2xl border border-white/10 bg-[#0f0f1a]/90 p-6 shadow-2xl backdrop-blur-sm ring-1 ring-white/5">
                {/* Window chrome */}
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <div className="h-3 w-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/5 px-3 py-1 text-xs text-slate-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    Kasir POS — Store 1
                  </div>
                  <div className="w-16" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Left: product grid */}
                  <div className="col-span-2 space-y-3">
                    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                      <div className="h-4 w-4 rounded bg-indigo-500/40" />
                      <div className="h-3 w-32 rounded bg-white/10" />
                    </div>
                    <div className="grid grid-cols-4 gap-2.5">
                      {[
                        'bg-indigo-500/20',
                        'bg-violet-500/20',
                        'bg-blue-500/20',
                        'bg-indigo-500/20',
                        'bg-violet-500/20',
                        'bg-blue-500/20',
                        'bg-indigo-500/20',
                        'bg-violet-500/20',
                      ].map((color, i) => (
                        <div
                          key={i}
                          className={`aspect-square rounded-xl border border-white/5 ${color} flex flex-col items-center justify-center gap-1 p-2`}
                        >
                          <div className="h-4 w-4 rounded bg-white/20" />
                          <div className="h-1.5 w-8 rounded bg-white/10" />
                          <div className="h-1.5 w-5 rounded bg-indigo-400/40" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: cart */}
                  <div className="flex flex-col gap-3">
                    <div className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-2">
                      <div className="text-xs font-medium text-slate-400">Order #1042</div>
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="h-2 w-16 rounded bg-white/15" />
                          <div className="h-2 w-8 rounded bg-indigo-400/30" />
                        </div>
                      ))}
                      <div className="mt-2 border-t border-white/5 pt-2 flex items-center justify-between">
                        <div className="h-2 w-8 rounded bg-white/30" />
                        <div className="h-2 w-12 rounded bg-indigo-400/60" />
                      </div>
                    </div>
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-center text-xs font-semibold text-indigo-300">
                      Charge Rp 85.000
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-center text-xs font-medium text-slate-400">
                      Hold Order
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-y border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
            {[
              { value: '10,000+', label: 'Transactions' },
              { value: '99.9%', label: 'Uptime' },
              { value: '50ms', label: 'Response Time' },
            ].map((stat) => (
              <div key={stat.label} className="px-6 text-center first:pl-0 last:pr-0">
                <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-400">
              Features
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Everything to run your business
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Powerful tools designed for modern retail, built to scale with you.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Store,
                title: 'Multi-Store',
                description:
                  'Manage unlimited outlets from a single dashboard. Switch between stores in one click.',
              },
              {
                icon: Users,
                title: 'Role-Based Access',
                description:
                  'Owner, Manager, Cashier — each with precisely scoped permissions. No over-privileging.',
              },
              {
                icon: BarChart3,
                title: 'Real-time Reports',
                description:
                  'Live sales dashboards, inventory snapshots, and customer insights as they happen.',
              },
              {
                icon: Zap,
                title: 'Fast POS Terminal',
                description:
                  'Sub-50ms transaction processing. Works offline and syncs when you reconnect.',
              },
              {
                icon: CreditCard,
                title: 'Multiple Payments',
                description:
                  'Cash, card, QRIS, transfer — accept any payment method your customers prefer.',
              },
              {
                icon: Database,
                title: 'Any Database',
                description:
                  'Cloudflare D1, PostgreSQL, SQLite, or Supabase. Plug in whatever you already run.',
              },
            ].map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/[0.05]"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 transition-all group-hover:border-indigo-500/40 group-hover:bg-indigo-500/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-400">
              How it works
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Up and running in minutes
            </h2>
          </div>

          <div className="mt-16 relative">
            {/* Connecting line */}
            <div className="absolute left-1/2 top-8 hidden h-[calc(100%-4rem)] w-px -translate-x-1/2 bg-gradient-to-b from-indigo-500/40 via-violet-500/20 to-transparent lg:block" />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Create your account',
                  description:
                    'Sign up in 30 seconds. No credit card required. Your workspace is ready immediately.',
                },
                {
                  step: '02',
                  title: 'Add your products',
                  description:
                    'Import a CSV or add items manually. Set prices, categories, and stock levels.',
                },
                {
                  step: '03',
                  title: 'Start selling',
                  description:
                    'Open the POS terminal from any device. Accept payments and track every sale in real time.',
                },
              ].map(({ step, title, description }) => (
                <div key={step} className="relative flex flex-col items-center text-center">
                  <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-2xl font-bold text-indigo-400 shadow-lg shadow-indigo-500/10">
                    {step}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-400">
              Pricing
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              No hidden fees. No surprises. Cancel any time.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* FREE */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
              <div className="text-sm font-semibold uppercase tracking-widest text-slate-400">Free</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">Rp 0</span>
                <span className="text-slate-400">/mo</span>
              </div>
              <p className="mt-3 text-sm text-slate-500">Perfect to get started.</p>
              <ul className="mt-8 space-y-3">
                {['1 store', '2 staff', '100 products', 'Basic reports'].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    <span className="text-slate-300">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Get started
              </Link>
            </div>

            {/* PRO — highlighted */}
            <div className="relative rounded-2xl border border-indigo-500/40 bg-indigo-950/20 p-8 shadow-2xl shadow-indigo-500/10 ring-1 ring-indigo-500/20">
              {/* Glow */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-indigo-500/30">
                  Most Popular
                </span>
              </div>
              <div className="text-sm font-semibold uppercase tracking-widest text-indigo-400">Pro</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">Rp 99k</span>
                <span className="text-slate-400">/mo</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">For growing businesses.</p>
              <ul className="mt-8 space-y-3">
                {[
                  '3 stores',
                  '10 staff',
                  'Unlimited products',
                  'Advanced reports',
                  'Priority support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 flex-shrink-0 text-indigo-400" />
                    <span className="text-slate-200">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.01]"
              >
                Get started
              </Link>
            </div>

            {/* ENTERPRISE */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
              <div className="text-sm font-semibold uppercase tracking-widest text-slate-400">Enterprise</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">Rp 299k</span>
                <span className="text-slate-400">/mo</span>
              </div>
              <p className="mt-3 text-sm text-slate-500">For large operations.</p>
              <ul className="mt-8 space-y-3">
                {[
                  'Unlimited stores',
                  'Unlimited staff',
                  'Unlimited products',
                  'API access',
                  'Custom integrations',
                  'Dedicated support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    <span className="text-slate-300">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/60 via-violet-900/40 to-indigo-900/60 border border-indigo-500/20 px-8 py-20 text-center shadow-2xl shadow-indigo-500/10">
            {/* Background glow */}
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(99,102,241,0.15),transparent)]" />
            <div
              className="absolute inset-0 -z-10 opacity-[0.04]"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)`,
                backgroundSize: '32px 32px',
              }}
            />

            <div className="mx-auto max-w-2xl">
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Ready to modernize your POS?
              </h2>
              <p className="mt-4 text-lg text-slate-300">
                Join thousands of businesses already running on Kasir. Free to start, scales as you grow.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/signup"
                  className="group flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-[#0a0a0f] shadow-xl transition-all hover:bg-slate-100 hover:scale-[1.02]"
                >
                  Start for Free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] px-6 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                  <ShoppingCart className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-bold tracking-tight">Kasir</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">Modern POS for growing businesses.</p>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'GitHub', href: 'https://github.com' },
                { label: 'Login', href: '/login' },
                { label: 'Sign Up', href: '/signup' },
              ].map(({ label, href }) => (
                <Link key={label} href={href} className="text-sm text-slate-500 transition-colors hover:text-white">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-10 border-t border-white/[0.06] pt-8 text-center text-sm text-slate-600">
            © 2026 Kasir. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

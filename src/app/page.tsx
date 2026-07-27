import Link from 'next/link'
import { Store, Users, BarChart3, ShoppingCart, CreditCard, Database, Check } from 'lucide-react'

export const runtime = 'edge'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-20 sm:py-32 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_50rem_at_top,theme(colors.indigo.900),theme(colors.slate.950))] opacity-20" />
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-5xl font-bold tracking-tight sm:text-7xl bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              The Modern POS for Growing Businesses
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Multi-tenant, role-based, works with any database. Built for teams that move fast.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/signup"
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
              >
                Start Free Trial
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-gray-700 px-6 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
              >
                See Demo
              </Link>
            </div>
          </div>

          {/* Mockup */}
          <div className="mt-16 sm:mt-24">
            <div className="relative rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-8 shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="text-sm text-gray-400">Kasir POS Terminal</div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-3">
                  <div className="h-12 bg-slate-700/50 rounded-lg" />
                  <div className="grid grid-cols-3 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="aspect-square bg-indigo-900/30 rounded-lg" />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-32 bg-slate-700/50 rounded-lg" />
                  <div className="h-12 bg-indigo-600/30 rounded-lg" />
                  <div className="h-12 bg-green-600/30 rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to run your business
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Powerful features designed for modern retail operations
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Store className="w-8 h-8" />}
              title="Multi-Store"
              description="Manage multiple outlets from one dashboard"
            />
            <FeatureCard
              icon={<Users className="w-8 h-8" />}
              title="Role-Based Access"
              description="Owner, Manager, Cashier with proper permissions"
            />
            <FeatureCard
              icon={<BarChart3 className="w-8 h-8" />}
              title="Real-time Reports"
              description="Sales, inventory, and customer insights"
            />
            <FeatureCard
              icon={<ShoppingCart className="w-8 h-8" />}
              title="Fast POS Terminal"
              description="Optimized for speed, works offline"
            />
            <FeatureCard
              icon={<CreditCard className="w-8 h-8" />}
              title="Multiple Payments"
              description="Cash, card, QRIS, transfer"
            />
            <FeatureCard
              icon={<Database className="w-8 h-8" />}
              title="Any Database"
              description="SQLite, PostgreSQL, or Supabase"
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-6 py-24 sm:py-32 lg:px-8 bg-slate-900/50">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Choose the plan that fits your business
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <PricingCard
              name="FREE"
              price="Rp 0"
              period="/mo"
              features={[
                '1 store',
                '2 staff',
                '100 products',
                'Basic reports',
              ]}
            />
            <PricingCard
              name="PRO"
              price="Rp 99.000"
              period="/mo"
              features={[
                '3 stores',
                '10 staff',
                'Unlimited products',
                'Advanced reports',
                'Priority support',
              ]}
              highlighted
            />
            <PricingCard
              name="ENTERPRISE"
              price="Rp 299.000"
              period="/mo"
              features={[
                'Unlimited stores',
                'Unlimited staff',
                'Unlimited products',
                'API access',
                'Custom integrations',
                'Dedicated support',
              ]}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 lg:px-8 border-t border-gray-800">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            <div className="col-span-2">
              <div className="text-2xl font-bold">Kasir</div>
              <p className="mt-2 text-sm text-gray-400">
                Modern POS for growing businesses
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="#features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/docs" className="hover:text-white transition-colors">Docs</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Links</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="https://github.com" className="hover:text-white transition-colors">GitHub</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Login</Link></li>
                <li><Link href="/signup" className="hover:text-white transition-colors">Sign Up</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-400">
            © 2026 Kasir. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-slate-900/50 p-6 hover:border-gray-700 transition-colors">
      <div className="text-indigo-400 mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  )
}

function PricingCard({ 
  name, 
  price, 
  period, 
  features, 
  highlighted = false 
}: { 
  name: string
  price: string
  period: string
  features: string[]
  highlighted?: boolean
}) {
  return (
    <div className={`rounded-lg border p-8 ${
      highlighted 
        ? 'border-indigo-600 bg-indigo-950/20 ring-2 ring-indigo-600' 
        : 'border-gray-800 bg-slate-900/50'
    }`}>
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline">
        <span className="text-4xl font-bold">{price}</span>
        <span className="ml-1 text-gray-400">{period}</span>
      </div>
      <ul className="mt-8 space-y-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <Check className="w-5 h-5 text-indigo-400 flex-shrink-0" />
            <span className="text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`mt-8 block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition-colors ${
          highlighted
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-slate-800 text-white hover:bg-slate-700'
        }`}
      >
        Get Started
      </Link>
    </div>
  )
}

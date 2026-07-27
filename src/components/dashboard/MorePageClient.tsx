'use client'

import Link from 'next/link'
import {
  Package,
  Tag,
  Users,
  Percent,
  Boxes,
  BarChart3,
  Landmark,
  Receipt,
  BookOpen,
  UserCog,
  Handshake,
  Settings,
} from 'lucide-react'

export const MORE_NAV_ITEMS = [
  { label: 'Produk',       href: '/dashboard/products',   icon: Package   },
  { label: 'Kategori',     href: '/dashboard/categories', icon: Tag       },
  { label: 'Pelanggan',    href: '/dashboard/customers',  icon: Users     },
  { label: 'Diskon',       href: '/dashboard/discounts',  icon: Percent   },
  { label: 'Stok',         href: '/dashboard/inventory',  icon: Boxes     },
  { label: 'Laporan',      href: '/dashboard/reports',    icon: BarChart3 },
  { label: 'Shift & Kas',  href: '/dashboard/shifts',     icon: Landmark  },
  { label: 'Pengeluaran',  href: '/dashboard/expenses',   icon: Receipt   },
  { label: 'Akuntansi',    href: '/dashboard/accounting', icon: BookOpen  },
  { label: 'SDM',          href: '/dashboard/hr',         icon: UserCog   },
  { label: 'CRM',          href: '/dashboard/crm',        icon: Handshake },
  { label: 'Pengaturan',   href: '/dashboard/settings',   icon: Settings  },
]

export default function MorePageClient() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] px-4 pt-6 pb-24">
      <h1 className="text-lg font-semibold text-[var(--text-1)] mb-5">Menu Lainnya</h1>

      <div className="grid grid-cols-2 gap-3">
        {MORE_NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 transition-colors hover:bg-[var(--bg-card)] active:scale-[0.98]"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <Icon className="h-5 w-5 text-amber-500" />
            </div>
            <span className="text-sm font-medium text-[var(--text-1)] leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

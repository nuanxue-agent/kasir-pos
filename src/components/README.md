# Components

Organized by domain:

- `dashboard/` — main dashboard shell, stats, charts
- `pos/` — point of sale terminal
- `products/` — product management, variants, bundles, recipes
- `inventory/` — stock management, expiry, stock-take
- `hr/` — employees, payroll, shifts, leave, training
- `crm/` — customers, loyalty, referrals, subscriptions, segments
- `reports/` — analytics, P&L, cash flow, consolidation
- `settings/` — store settings, users, integrations
- `ui/` — shared primitives (ThemeToggle, etc.)

## Other domains

- `accounting/` — journal entries, GL, bank reconciliation
- `analytics/` — business intelligence views
- `delivery/` — delivery orders and driver management
- `discounts/` — discount rules and coupon management
- `documents/` — document storage and management
- `ecommerce/` — online store integration
- `expenses/` — expense tracking and approval
- `franchise/` — multi-outlet franchise management
- `help/` — help center and onboarding guides
- `invoices/` — invoice creation and management
- `loyalty/` — loyalty points and tier management
- `manufacturing/` — bill of materials, production orders
- `notifications/` — in-app and push notification center
- `onboarding/` — new store setup wizard
- `orders/` — order history and management
- `purchase-orders/` — supplier PO creation and receiving
- `purchasing/` — purchase requisitions
- `reservations/` — table and appointment reservations
- `shifts/` — shift management and cash drawer
- `staff/` — staff management (alias for hr/)
- `suppliers/` — supplier directory
- `tables/` — table layout for dine-in
- `variants/` — product variant matrix

## Shared components (root)

- `ExportButton.tsx` — generic CSV/XLSX export trigger
- `LocaleSwitcher.tsx` — language/locale switcher
- `OfflineBanner.tsx` — PWA offline indicator
- `PWAInstallPrompt.tsx` — install-to-home-screen prompt
- `StoreSwitcher.tsx` — multi-store selector
- `providers.tsx` — root context providers (theme, session, etc.)

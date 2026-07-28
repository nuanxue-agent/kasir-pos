# src/lib — Utility Modules

Shared back-end utilities used across API routes and server components.

| File                                 | Purpose                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `index.ts`                           | Barrel re-export — import from `@/lib` instead of individual files                              |
| `db.ts`                              | Cloudflare D1 query helpers (`query`, `queryOne`, `exec`, `batchExec`, `newId`, `nowISO`)       |
| `auth.ts`                            | Session creation/validation, cookie helpers, `auth()` server shortcut                           |
| `permissions.ts`                     | Role hierarchy (`SUPER_ADMIN > OWNER > MANAGER > CASHIER`) and access checks                    |
| `audit.ts`                           | Write/read `AuditLog` entries; used for compliance and activity history                         |
| `currency.ts`                        | Multi-currency support: exchange rates, `convertAmount`, `formatCurrencyForeign`                |
| `utils.ts`                           | General helpers: `cn()` (Tailwind merge), `formatCurrency`, `formatDate`, `generateOrderNumber` |
| `promotions-engine.ts`               | Pure promotion calculation functions — no I/O, fully testable                                   |
| `accounting.ts`                      | Chart of accounts, journal entries, ledger helpers                                              |
| `code128.ts`                         | Code 128 barcode generation (used by receipt printer)                                           |
| `export.ts`                          | CSV/XLSX export helpers                                                                         |
| `gift-cards.ts`                      | Gift card creation, redemption, and balance tracking                                            |
| `inventory-costing.ts`               | FIFO/AVCO costing methods for inventory valuation                                               |
| `kitchen-display.ts`                 | KDS order queue management                                                                      |
| `loyalty.ts`                         | Loyalty point accrual and redemption logic                                                      |
| `marketing.ts` — `rfm.ts`            | RFM segmentation, marketing campaign helpers                                                    |
| `plan.ts`                            | Subscription plan definitions and feature gates                                                 |
| `print.ts`                           | Receipt print job formatting and ESC/POS helpers                                                |
| `prisma.ts`                          | Legacy stub — Prisma is not used; kept to avoid import errors during migration                  |
| `product-import.ts`                  | Bulk product import (CSV parse → DB upsert)                                                     |
| `push-notifications.ts`              | Web Push notification helpers                                                                   |
| `receipt.ts` — `receipt-settings.ts` | Receipt template rendering and per-store receipt config                                         |
| `referrals.ts`                       | Referral code creation and reward tracking                                                      |
| `tier-progress.ts`                   | Loyalty tier upgrade/downgrade logic                                                            |
| `variants.ts`                        | Product variant matrix generation                                                               |
| `webhook-utils.ts`                   | Webhook signing, delivery, and retry helpers                                                    |

## Usage

```ts
// Preferred — import from barrel
import { query, newId, formatCurrency, canAccess } from '@/lib'

// Still works — direct import
import { logAudit } from '@/lib/audit'
```

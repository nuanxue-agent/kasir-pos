# kasir-app

A fully-featured, multi-tenant POS system built with Next.js 16, Prisma 7, and PostgreSQL.

## Quick Start

### 1. Database

**Option A — Supabase (easiest, free)**
1. Create a project at https://supabase.com
2. Copy the connection string from Settings → Database → Connection string (URI mode)
3. Paste into `.env` as `DATABASE_URL`

**Option B — PostgreSQL local**
```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16
createdb kasir

# Ubuntu
sudo apt install postgresql && sudo service postgresql start
sudo -u postgres createdb kasir
```

**Option C — Docker**
```bash
docker run -d --name kasir-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=kasir \
  -p 5432:5432 postgres:16-alpine
```

### 2. Setup
```bash
cp .env.example .env
# Edit .env and set your DATABASE_URL

npm install
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
npm run dev
```

### 3. Demo accounts
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@kasir.dev | admin123 |
| Owner | owner@demo.com | owner123 |
| Cashier | cashier@demo.com | cashier123 (PIN: 1234) |

## Features
- Multi-tenant architecture
- Role-based access (Super Admin, Owner, Manager, Cashier)
- Products, categories, variants
- POS terminal with cart
- Orders and receipts
- Inventory tracking
- Customer management with loyalty
- Discounts and coupons
- Reports and analytics
- Staff management
- Store settings

## Stack
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Prisma 7
- **Auth**: next-auth v5 (credentials + PIN)
- **State**: Zustand (cart), React Query (server)
- **UI**: Tailwind CSS + lucide-react
- **Charts**: Recharts

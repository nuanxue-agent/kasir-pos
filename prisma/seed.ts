import { PrismaClient, UserRole } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const free = await prisma.plan.upsert({
    where: { name: 'FREE' },
    update: {},
    create: {
      name: 'FREE', maxStores: 1, maxStaff: 2, maxProducts: 100,
      hasAdvancedReports: false, hasLoyalty: false, hasApi: false,
      priceMonthly: 0, priceYearly: 0,
    },
  })

  const pro = await prisma.plan.upsert({
    where: { name: 'PRO' },
    update: {},
    create: {
      name: 'PRO', maxStores: 3, maxStaff: 10, maxProducts: -1,
      hasAdvancedReports: true, hasLoyalty: true, hasApi: false,
      priceMonthly: 99000, priceYearly: 990000,
    },
  })

  await prisma.plan.upsert({
    where: { name: 'ENTERPRISE' },
    update: {},
    create: {
      name: 'ENTERPRISE', maxStores: -1, maxStaff: -1, maxProducts: -1,
      hasAdvancedReports: true, hasLoyalty: true, hasApi: true,
      priceMonthly: 299000, priceYearly: 2990000,
    },
  })

  const superAdminPass = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { email: 'admin@kasir.dev' },
    update: {},
    create: {
      name: 'Super Admin', email: 'admin@kasir.dev',
      password: superAdminPass, role: UserRole.SUPER_ADMIN, isSuperAdmin: true,
    },
  })

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      name: 'Demo Store', slug: 'demo-store',
      email: 'owner@demo.com', planId: pro.id, status: 'ACTIVE',
    },
  })

  const store = await prisma.store.upsert({
    where: { id: 'store-demo-001' },
    update: {},
    create: {
      id: 'store-demo-001', tenantId: tenant.id,
      name: 'Demo Store - Main Branch',
      address: 'Jl. Sudirman No. 1, Jakarta',
      phone: '021-1234567', taxRate: 0.11, currency: 'IDR',
      receiptNote: 'Thank you for shopping with us!',
    },
  })

  const ownerPass = await bcrypt.hash('owner123', 12)
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {},
    create: {
      name: 'Store Owner', email: 'owner@demo.com',
      password: ownerPass, role: UserRole.OWNER, tenantId: tenant.id,
    },
  })
  await prisma.storeUser.upsert({
    where: { storeId_userId: { storeId: store.id, userId: owner.id } },
    update: {},
    create: { storeId: store.id, userId: owner.id, role: UserRole.OWNER },
  })

  const managerPass = await bcrypt.hash('manager123', 12)
  const manager = await prisma.user.upsert({
    where: { email: 'manager@demo.com' },
    update: {},
    create: {
      name: 'Siti Manager', email: 'manager@demo.com',
      password: managerPass, role: UserRole.MANAGER, tenantId: tenant.id,
    },
  })
  await prisma.storeUser.upsert({
    where: { storeId_userId: { storeId: store.id, userId: manager.id } },
    update: {},
    create: { storeId: store.id, userId: manager.id, role: UserRole.MANAGER },
  })

  const cashierPass = await bcrypt.hash('cashier123', 12)
  const cashierPin = await bcrypt.hash('1234', 12)
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@demo.com' },
    update: {},
    create: {
      name: 'Budi Cashier', email: 'cashier@demo.com',
      password: cashierPass, pin: cashierPin,
      role: UserRole.CASHIER, tenantId: tenant.id,
    },
  })
  await prisma.storeUser.upsert({
    where: { storeId_userId: { storeId: store.id, userId: cashier.id } },
    update: {},
    create: { storeId: store.id, userId: cashier.id, role: UserRole.CASHIER },
  })

  const [catFood, catDrinks, catSnacks] = await Promise.all([
    prisma.category.upsert({ where: { id: 'cat-food' }, update: {}, create: { id: 'cat-food', storeId: store.id, name: 'Food', color: '#f59e0b', icon: '🍔', sortOrder: 1 } }),
    prisma.category.upsert({ where: { id: 'cat-drinks' }, update: {}, create: { id: 'cat-drinks', storeId: store.id, name: 'Drinks', color: '#3b82f6', icon: '🥤', sortOrder: 2 } }),
    prisma.category.upsert({ where: { id: 'cat-snacks' }, update: {}, create: { id: 'cat-snacks', storeId: store.id, name: 'Snacks', color: '#8b5cf6', icon: '🍿', sortOrder: 3 } }),
  ])

  const products = [
    { id: 'p-001', name: 'Nasi Goreng', price: 25000, cost: 10000, categoryId: catFood.id, stock: 999, sku: 'FOOD-001' },
    { id: 'p-002', name: 'Mie Goreng', price: 22000, cost: 8000, categoryId: catFood.id, stock: 999, sku: 'FOOD-002' },
    { id: 'p-003', name: 'Ayam Bakar', price: 35000, cost: 15000, categoryId: catFood.id, stock: 50, sku: 'FOOD-003' },
    { id: 'p-004', name: 'Es Teh Manis', price: 8000, cost: 2000, categoryId: catDrinks.id, stock: 999, sku: 'DRK-001' },
    { id: 'p-005', name: 'Jus Jeruk', price: 15000, cost: 5000, categoryId: catDrinks.id, stock: 999, sku: 'DRK-002' },
    { id: 'p-006', name: 'Air Mineral', price: 5000, cost: 2000, categoryId: catDrinks.id, stock: 100, sku: 'DRK-003' },
    { id: 'p-007', name: 'Keripik Singkong', price: 12000, cost: 5000, categoryId: catSnacks.id, stock: 80, sku: 'SNK-001' },
    { id: 'p-008', name: 'Kacang Goreng', price: 10000, cost: 4000, categoryId: catSnacks.id, stock: 60, sku: 'SNK-002' },
  ]

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, storeId: store.id, trackStock: true, lowStock: 10 },
    })
  }

  await prisma.discount.upsert({
    where: { id: 'disc-001' },
    update: {},
    create: {
      id: 'disc-001', storeId: store.id, name: 'Welcome 10%',
      code: 'WELCOME10', type: 'PERCENTAGE', value: 10, minOrder: 50000, active: true,
    },
  })

  console.log('\n✅ Seed complete!')
  console.log('\n🔑 Demo accounts:')
  console.log('  Super Admin:  admin@kasir.dev    / admin123')
  console.log('  Owner:        owner@demo.com     / owner123')
  console.log('  Manager:      manager@demo.com   / manager123')
  console.log('  Cashier:      cashier@demo.com   / cashier123  (PIN: 1234)')
}

main().catch(console.error).finally(() => prisma.$disconnect())

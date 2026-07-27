-- Seed demo data for Kasir POS
-- Plans
INSERT OR IGNORE INTO Plan (id, name, maxStores, maxStaff, maxProducts, hasAdvancedReports, hasLoyalty, hasApi, priceMonthly, priceYearly, active, createdAt)
VALUES
  ('plan_free', 'FREE', 1, 2, 100, 0, 0, 0, 0, 0, 1, '2025-01-01T00:00:00.000Z'),
  ('plan_pro', 'PRO', 3, 10, 999999, 1, 1, 0, 99000, 990000, 1, '2025-01-01T00:00:00.000Z'),
  ('plan_ent', 'ENTERPRISE', 999, 999, 999999, 1, 1, 1, 299000, 2990000, 1, '2025-01-01T00:00:00.000Z');

-- Demo Tenant
INSERT OR IGNORE INTO Tenant (id, name, slug, email, planId, status, createdAt, updatedAt)
VALUES ('tenant_demo', 'Demo Warung', 'demo-warung', 'demo@kasir.app', 'plan_pro', 'ACTIVE', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- Demo Store
INSERT OR IGNORE INTO Store (id, tenantId, name, address, phone, taxRate, currency, timezone, active, createdAt, updatedAt)
VALUES ('store_demo', 'tenant_demo', 'Warung Demo', 'Jl. Demo No. 1, Jakarta', '08123456789', 0.11, 'IDR', 'Asia/Jakarta', 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- Users (passwords are bcrypt of 'demo123')
-- Owner: owner@demo.com / demo123
-- Cashier: cashier@demo.com / demo123
INSERT OR IGNORE INTO User (id, tenantId, name, email, password, role, active, isSuperAdmin, createdAt, updatedAt)
VALUES 
  ('user_owner', 'tenant_demo', 'Demo Owner', 'owner@demo.com', '$2b$12$RNLc4IRwe4kxfBNw5Kz1ZenSzoWbrTK2OETcFjUe9H08kK8AlswtC', 'OWNER', 1, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('user_cashier', 'tenant_demo', 'Demo Cashier', 'cashier@demo.com', '$2b$12$RNLc4IRwe4kxfBNw5Kz1ZenSzoWbrTK2OETcFjUe9H08kK8AlswtC', 'CASHIER', 1, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- StoreUser
INSERT OR IGNORE INTO StoreUser (id, storeId, userId, role)
VALUES 
  ('su_owner', 'store_demo', 'user_owner', 'OWNER'),
  ('su_cashier', 'store_demo', 'user_cashier', 'CASHIER');

-- Categories
INSERT OR IGNORE INTO Category (id, storeId, name, color, icon, sortOrder, active, createdAt, updatedAt)
VALUES
  ('cat_makanan', 'store_demo', 'Makanan', '#f59e0b', '🍚', 1, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('cat_minuman', 'store_demo', 'Minuman', '#3b82f6', '🥤', 2, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('cat_snack', 'store_demo', 'Snack', '#8b5cf6', '🍿', 3, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- Products
INSERT OR IGNORE INTO Product (id, storeId, categoryId, name, description, sku, price, cost, trackStock, stock, lowStock, active, createdAt, updatedAt)
VALUES
  ('prod_01', 'store_demo', 'cat_makanan', 'Nasi Goreng', 'Nasi goreng spesial', 'SKU-001', 25000, 12000, 1, 50, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_02', 'store_demo', 'cat_makanan', 'Mie Goreng', 'Mie goreng enak', 'SKU-002', 22000, 10000, 1, 40, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_03', 'store_demo', 'cat_makanan', 'Ayam Bakar', 'Ayam bakar bumbu rujak', 'SKU-003', 35000, 18000, 1, 30, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_04', 'store_demo', 'cat_minuman', 'Es Teh Manis', 'Teh manis dingin', 'SKU-004', 8000, 2000, 1, 100, 10, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_05', 'store_demo', 'cat_minuman', 'Jus Alpukat', 'Jus alpukat segar', 'SKU-005', 18000, 7000, 1, 30, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_06', 'store_demo', 'cat_minuman', 'Kopi Hitam', 'Kopi hitam tubruk', 'SKU-006', 10000, 3000, 1, 80, 10, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_07', 'store_demo', 'cat_snack', 'Keripik Singkong', 'Keripik renyah', 'SKU-007', 12000, 5000, 1, 60, 10, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_08', 'store_demo', 'cat_snack', 'Pisang Goreng', '3 pcs pisang goreng', 'SKU-008', 10000, 4000, 1, 3, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- Discount
INSERT OR IGNORE INTO Discount (id, storeId, name, code, type, value, minOrder, usedCount, active, createdAt, updatedAt)
VALUES ('disc_01', 'store_demo', 'Diskon 10%', 'DISC10', 'PERCENTAGE', 10, 50000, 0, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- Demo customers
INSERT OR IGNORE INTO Customer (id, storeId, name, phone, email, points, createdAt, updatedAt)
VALUES
  ('cust_01', 'store_demo', 'Budi Santoso', '081234567890', 'budi@email.com', 150, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('cust_02', 'store_demo', 'Siti Rahayu', '082345678901', 'siti@email.com', 80, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- ─── Additional seed data (sprint-17) ───────────────────────────────────────

-- 5 more products (brings total to 13)
INSERT OR IGNORE INTO Product (id, storeId, categoryId, name, description, sku, price, cost, trackStock, stock, lowStock, active, createdAt, updatedAt)
VALUES
  ('prod_09', 'store_demo', 'cat_makanan', 'Soto Ayam',       'Soto ayam kuah bening',          'SKU-009', 28000, 13000, 1, 25, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_10', 'store_demo', 'cat_makanan', 'Gado-Gado',       'Gado-gado bumbu kacang',          'SKU-010', 22000, 10000, 1, 20, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_11', 'store_demo', 'cat_minuman', 'Es Campur',       'Es campur serba ada',             'SKU-011', 15000,  5000, 1, 40, 8, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_12', 'store_demo', 'cat_minuman', 'Teh Tarik',       'Teh tarik ala mamak',             'SKU-012', 12000,  4000, 1, 50, 8, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod_13', 'store_demo', 'cat_snack',  'Tempe Mendoan',   '3 pcs tempe mendoan crispy',       'SKU-013',  8000,  3000, 1, 35, 5, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

-- 2 more demo customers
INSERT OR IGNORE INTO Customer (id, storeId, name, phone, email, points, createdAt, updatedAt)
VALUES
  ('cust_03', 'store_demo', 'Ahmad Fauzi',       '083456789012', 'ahmad.fauzi@email.com',   200, '2025-06-15T00:00:00.000Z', '2025-06-15T00:00:00.000Z'),
  ('cust_04', 'store_demo', 'Dewi Kusumawati',   '084567890123', 'dewi.kusuma@email.com',   120, '2025-07-01T00:00:00.000Z', '2025-07-01T00:00:00.000Z');

-- 1 demo employee
INSERT OR IGNORE INTO Employee (id, storeId, userId, name, nik, position, department, baseSalary, employmentStatus, employmentType, joinDate, phone, email, active, createdAt, updatedAt)
VALUES ('emp_01', 'store_demo', 'user_cashier', 'Rizky Pratama', '3271012345678901', 'Kasir', 'Operasional', 3500000, 'ACTIVE', 'FULL_TIME', '2025-01-15', '085678901234', 'rizky@warungdemo.com', 1, '2025-01-15T00:00:00.000Z', '2025-01-15T00:00:00.000Z');

-- 2 demo shifts (one closed yesterday, one open today)
INSERT OR IGNORE INTO Shift (id, storeId, userId, openedAt, closedAt, openingCash, closingCash, expectedCash, note, status, createdAt, updatedAt)
VALUES
  ('shift_01', 'store_demo', 'user_cashier',
   datetime('now', '-1 day', 'start of day', '+8 hours'),
   datetime('now', '-1 day', 'start of day', '+17 hours'),
   200000, 850000, 850000,
   'Shift pagi kemarin berjalan lancar', 'CLOSED',
   datetime('now', '-1 day', 'start of day', '+8 hours'),
   datetime('now', '-1 day', 'start of day', '+17 hours')),
  ('shift_02', 'store_demo', 'user_cashier',
   datetime('now', 'start of day', '+8 hours'),
   NULL, 200000, NULL, NULL,
   NULL, 'OPEN',
   datetime('now', 'start of day', '+8 hours'),
   datetime('now', 'start of day', '+8 hours'));

-- 3 demo orders from last 7 days
INSERT OR IGNORE INTO "Order" (id, storeId, number, status, userId, customerId, discountId, subtotal, discountAmt, taxAmt, total, note, createdAt, updatedAt)
VALUES
  ('order_01', 'store_demo', 'ORD-001', 'COMPLETED', 'user_cashier', 'cust_01', NULL,
   55000, 0, 6050, 61050, NULL,
   datetime('now', '-5 days'), datetime('now', '-5 days')),
  ('order_02', 'store_demo', 'ORD-002', 'COMPLETED', 'user_cashier', 'cust_02', NULL,
   43000, 0, 4730, 47730, NULL,
   datetime('now', '-3 days'), datetime('now', '-3 days')),
  ('order_03', 'store_demo', 'ORD-003', 'COMPLETED', 'user_cashier', 'cust_03', NULL,
   78000, 0, 8580, 86580, NULL,
   datetime('now', '-1 day'), datetime('now', '-1 day'));

-- Order items
INSERT OR IGNORE INTO OrderItem (id, orderId, productId, variantId, name, variantName, price, qty, discount, subtotal)
VALUES
  ('oi_01a', 'order_01', 'prod_01', NULL, 'Nasi Goreng',   NULL, 25000, 1, 0, 25000),
  ('oi_01b', 'order_01', 'prod_03', NULL, 'Ayam Bakar',    NULL, 35000, 1, 0, 35000),
  ('oi_02a', 'order_02', 'prod_02', NULL, 'Mie Goreng',    NULL, 22000, 1, 0, 22000),
  ('oi_02b', 'order_02', 'prod_04', NULL, 'Es Teh Manis',  NULL,  8000, 1, 0,  8000),
  ('oi_02c', 'order_02', 'prod_07', NULL, 'Keripik Singkong', NULL, 12000, 1, 0, 12000),
  ('oi_03a', 'order_03', 'prod_09', NULL, 'Soto Ayam',     NULL, 28000, 2, 0, 56000),
  ('oi_03b', 'order_03', 'prod_06', NULL, 'Kopi Hitam',    NULL, 10000, 1, 0, 10000),
  ('oi_03c', 'order_03', 'prod_08', NULL, 'Pisang Goreng', NULL, 10000, 1, 0, 10000),
  ('oi_03d', 'order_03', 'prod_13', NULL, 'Tempe Mendoan', NULL,  8000, 1, 0,  8000);

-- Payments for orders
INSERT OR IGNORE INTO Payment (id, orderId, method, amount, reference, change, createdAt)
VALUES
  ('pay_01', 'order_01', 'CASH',   70000, NULL, 8950, datetime('now', '-5 days')),
  ('pay_02', 'order_02', 'QRIS',   47730, 'QRIS-20250724-002', 0, datetime('now', '-3 days')),
  ('pay_03', 'order_03', 'CASH',  100000, NULL, 13420, datetime('now', '-1 day'));

-- 1 demo expense
INSERT OR IGNORE INTO Expense (id, storeId, userId, category, description, amount, date, note, createdAt, updatedAt)
VALUES ('exp_01', 'store_demo', 'user_owner', 'Bahan Baku', 'Pembelian bahan baku mingguan (sayuran, bumbu, minyak)', 250000, date('now', '-2 days'), 'Belanja pasar pagi', datetime('now', '-2 days'), datetime('now', '-2 days'));

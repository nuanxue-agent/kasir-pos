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

-- Supplier table
CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "taxId" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);

-- Purchase Order table
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "expectedDate" TEXT,
  "subtotal" REAL NOT NULL DEFAULT 0,
  "taxAmt" REAL NOT NULL DEFAULT 0,
  "total" REAL NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
);

-- Purchase Order Line items
CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "qty" REAL NOT NULL,
  "unitCost" REAL NOT NULL,
  "receivedQty" REAL NOT NULL DEFAULT 0,
  "subtotal" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id"),
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
);

-- Goods Receipt (when PO items are actually received)
CREATE TABLE IF NOT EXISTS "GoodsReceipt" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id")
);

CREATE TABLE IF NOT EXISTS "GoodsReceiptLine" (
  "id" TEXT PRIMARY KEY,
  "receiptId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" REAL NOT NULL,
  FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id"),
  FOREIGN KEY ("lineId") REFERENCES "PurchaseOrderLine"("id")
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_po_store ON "PurchaseOrder"("storeId");
CREATE INDEX IF NOT EXISTS idx_po_supplier ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS idx_pol_order ON "PurchaseOrderLine"("orderId");
CREATE INDEX IF NOT EXISTS idx_supplier_store ON "Supplier"("storeId");

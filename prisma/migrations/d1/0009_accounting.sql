-- Chart of Accounts
CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "normalBalance" TEXT NOT NULL,
  "parentId" TEXT,
  "balance" REAL NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT 1,
  "isSystem" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("parentId") REFERENCES "Account"("id"),
  UNIQUE("storeId", "code")
);

-- Journal Entry
CREATE TABLE IF NOT EXISTS "JournalEntry" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("userId") REFERENCES "User"("id")
);

-- Journal Entry Lines
CREATE TABLE IF NOT EXISTS "JournalLine" (
  "id" TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" REAL NOT NULL DEFAULT 0,
  "credit" REAL NOT NULL DEFAULT 0,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
);

CREATE INDEX IF NOT EXISTS idx_journal_store ON "JournalEntry"("storeId");
CREATE INDEX IF NOT EXISTS idx_journal_date ON "JournalEntry"("date");
CREATE INDEX IF NOT EXISTS idx_journal_status ON "JournalEntry"("status");
CREATE INDEX IF NOT EXISTS idx_journal_line_entry ON "JournalLine"("entryId");
CREATE INDEX IF NOT EXISTS idx_journal_line_account ON "JournalLine"("accountId");
CREATE INDEX IF NOT EXISTS idx_account_store ON "Account"("storeId");
CREATE INDEX IF NOT EXISTS idx_account_type ON "Account"("type");

-- Seed default Chart of Accounts (Indonesian PSAK-compatible)
INSERT OR IGNORE INTO "Account" ("id","storeId","code","name","type","normalBalance","balance","active","isSystem","createdAt","updatedAt") VALUES
-- ASSETS (100-199)
('acc_cash','store_demo','111','Kas','ASSET','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_bank','store_demo','112','Bank','ASSET','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_ar','store_demo','113','Piutang Usaha','ASSET','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_inv','store_demo','114','Persediaan','ASSET','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_prepaid','store_demo','115','Biaya Dibayar Dimuka','ASSET','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_ppe','store_demo','120','Peralatan & Mesin','ASSET','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),

-- LIABILITIES (200-299)
('acc_ap','store_demo','210','Hutang Usaha','LIABILITY','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_tax','store_demo','211','Hutang Pajak','LIABILITY','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_loan','store_demo','220','Pinjaman Jangka Panjang','LIABILITY','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),

-- EQUITY (300-399)
('acc_capital','store_demo','310','Modal','EQUITY','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_retained','store_demo','320','Laba Ditahan','EQUITY','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_drawings','store_demo','330','Prive','EQUITY','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),

-- REVENUE (400-499)
('acc_sales','store_demo','410','Penjualan','REVENUE','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_service','store_demo','420','Pendapatan Jasa','REVENUE','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_other_inc','store_demo','490','Pendapatan Lain-lain','REVENUE','CREDIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),

-- EXPENSES (500-699)
('acc_cogs','store_demo','510','Harga Pokok Penjualan','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_salaries','store_demo','520','Gaji & Upah','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_rent','store_demo','530','Sewa','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_utilities','store_demo','540','Listrik & Air','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_marketing','store_demo','550','Marketing & Iklan','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_supplies','store_demo','560','Perlengkapan Kantor','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_depreciation','store_demo','570','Penyusutan','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_interest','store_demo','580','Bunga Pinjaman','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
('acc_other_exp','store_demo','690','Biaya Lain-lain','EXPENSE','DEBIT',0,1,1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z');

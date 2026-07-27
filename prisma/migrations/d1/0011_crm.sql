-- CRM: Leads / Pipeline
CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "value" REAL NOT NULL DEFAULT 0,
  "probability" INTEGER NOT NULL DEFAULT 10,
  "expectedCloseDate" TEXT,
  "assignedTo" TEXT,
  "customerId" TEXT,
  "notes" TEXT,
  "tags" TEXT,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
);

-- CRM Activities (calls, emails, meetings, follow-ups)
CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'NOTE',
  "title" TEXT NOT NULL,
  "note" TEXT,
  "dueDate" TEXT,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
);

CREATE INDEX IF NOT EXISTS idx_lead_store ON "Lead"("storeId");
CREATE INDEX IF NOT EXISTS idx_lead_status ON "Lead"("status");
CREATE INDEX IF NOT EXISTS idx_lead_assigned ON "Lead"("assignedTo");
CREATE INDEX IF NOT EXISTS idx_activity_lead ON "LeadActivity"("leadId");
CREATE INDEX IF NOT EXISTS idx_activity_due ON "LeadActivity"("dueDate");

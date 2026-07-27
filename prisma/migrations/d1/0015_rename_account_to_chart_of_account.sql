-- Rename Account table to ChartOfAccount to avoid conflict with NextAuth's Account table
ALTER TABLE "Account" RENAME TO "ChartOfAccount";

-- Recreate indexes under the new table name
DROP INDEX IF EXISTS idx_account_store;
DROP INDEX IF EXISTS idx_account_type;
CREATE INDEX IF NOT EXISTS idx_chart_of_account_store ON "ChartOfAccount"("storeId");
CREATE INDEX IF NOT EXISTS idx_chart_of_account_type ON "ChartOfAccount"("type");

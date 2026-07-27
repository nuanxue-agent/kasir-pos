-- Add modules column to Store table
-- Stores a JSON array of enabled module keys
-- Default: all modules enabled
ALTER TABLE "Store" ADD COLUMN "modules" TEXT NOT NULL DEFAULT '["pos","inventory","customers","discounts","reports"]';

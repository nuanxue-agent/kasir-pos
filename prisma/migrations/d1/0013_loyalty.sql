CREATE TABLE IF NOT EXISTS LoyaltyTier (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  name TEXT NOT NULL,
  minPoints INTEGER NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#f59e0b',
  icon TEXT NOT NULL DEFAULT '⭐',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS LoyaltyRedemption (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  orderId TEXT,
  pointsRedeemed INTEGER NOT NULL,
  discountGiven REAL NOT NULL,
  createdAt TEXT NOT NULL
);

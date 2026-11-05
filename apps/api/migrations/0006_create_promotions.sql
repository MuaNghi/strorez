-- Storez: Tạo bảng khuyến mãi / mã giảm giá
-- Migration additive

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  min_order_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  max_discount_amount INTEGER, -- NULL = không giới hạn (cho PERCENT)
  usage_limit INTEGER, -- NULL = không giới hạn
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index cho tra cứu mã
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_is_active ON promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(starts_at, ends_at);

-- Bảng ghi sử dụng mã giảm giá (để enforce per_user_limit)
CREATE TABLE IF NOT EXISTS promotion_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  order_id TEXT NOT NULL,
  discount_amount INTEGER NOT NULL CHECK (discount_amount >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_usages_promotion_id ON promotion_usages(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_user_id ON promotion_usages(user_id);
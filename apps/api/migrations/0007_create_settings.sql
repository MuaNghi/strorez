-- Storez: Tạo bảng cài đặt hệ thống
-- Migration additive - chỉ một bản ghi (singleton)

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT 'Storez',
  store_description TEXT NOT NULL DEFAULT 'Cửa hàng trực tuyến hiện đại',
  store_logo TEXT NOT NULL DEFAULT '',
  store_favicon TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  -- Cấu hình giao diện
  primary_color TEXT NOT NULL DEFAULT '#f36b35',
  secondary_color TEXT NOT NULL DEFAULT '#4f46e5',
  -- Cấu hình đơn hàng
  free_shipping_threshold INTEGER NOT NULL DEFAULT 1000000 CHECK (free_shipping_threshold >= 0),
  cod_fee INTEGER NOT NULL DEFAULT 0 CHECK (cod_fee >= 0),
  -- Cấu hình SEO/social
  meta_title TEXT NOT NULL DEFAULT 'Storez - Mua sắm dễ dàng mỗi ngày',
  meta_description TEXT NOT NULL DEFAULT 'Cửa hàng trực tuyến đa dạng sản phẩm, giá tốt, giao hàng nhanh.',
  og_image TEXT NOT NULL DEFAULT '',
  -- Cấu hình khác
  maintenance_mode INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_mode IN (0, 1)),
  maintenance_message TEXT NOT NULL DEFAULT 'Cửa hàng đang bảo trì, vui lòng quay lại sau.',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chèn bản ghi mặc định (INSERT OR IGNORE để không ghi đè nếu đã có)
INSERT OR IGNORE INTO settings (id) VALUES (1);
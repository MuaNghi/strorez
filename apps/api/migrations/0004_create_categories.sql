-- Storez: Tạo bảng danh mục sản phẩm
-- Migration additive

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index cho is_active và sort_order
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);

-- Chèn dữ liệu mẫu cho danh mục
INSERT INTO categories (name, description, image, sort_order) VALUES
  ('Thiết bị âm thanh', 'Tai nghe, loa, micro và thiết bị âm thanh chuyên nghiệp', '', 1),
  ('Đồng hồ & Phụ kiện', 'Đồng hồ thông minh, dây đeo, sạc dự phòng', '', 2),
  ('Máy tính & Phụ kiện', 'Bàn phím, chuột, màn hình, ổ cứng, giá đỡ', '', 3),
  ('Sạc & Cáp', 'Sạc nhanh, cáp dữ liệu, hub USB, power bank', '', 4),
  ('Thiết bị văn phòng', 'Webcam, đèn bàn, balo, giấy, bút', '', 5);
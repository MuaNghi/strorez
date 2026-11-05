ALTER TABLE products ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN details TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN fruit_type TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN drying_method TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN ingredients TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN net_weight_g INTEGER;
ALTER TABLE products ADD COLUMN origin TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN responsible_party TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN packaging TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN produced_on TEXT;
ALTER TABLE products ADD COLUMN expiry_info TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN storage_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN data_status TEXT NOT NULL DEFAULT 'SAMPLE'
  CHECK (data_status IN ('SAMPLE', 'VERIFIED'));
ALTER TABLE products ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0
  CHECK (is_featured IN (0, 1));

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  weight_g INTEGER NOT NULL CHECK (weight_g > 0),
  flavor TEXT NOT NULL DEFAULT '',
  packaging TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price > 0),
  sale_price INTEGER CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price <= price)),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_variants_product_active
  ON product_variants(product_id, is_active);

ALTER TABLE order_items ADD COLUMN variant_id INTEGER;
ALTER TABLE order_items ADD COLUMN variant_sku TEXT NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN variant_label TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_order_items_variant_id ON order_items(variant_id);
CREATE INDEX idx_products_fruit_type ON products(fruit_type);
CREATE INDEX idx_products_drying_method ON products(drying_method);

INSERT OR IGNORE INTO categories (name, description, image, sort_order) VALUES
  ('Xoài sấy', 'Sản phẩm từ xoài sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 10),
  ('Chuối sấy', 'Sản phẩm từ chuối sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 11),
  ('Mít sấy', 'Sản phẩm từ mít sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 12),
  ('Dứa sấy', 'Sản phẩm từ dứa sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 13),
  ('Thanh long sấy', 'Sản phẩm từ thanh long sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 14),
  ('Dâu tây sấy', 'Sản phẩm từ dâu tây sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 15),
  ('Ổi sấy', 'Sản phẩm từ ổi sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 16),
  ('Đu đủ sấy', 'Sản phẩm từ đu đủ sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 17),
  ('Vải sấy', 'Sản phẩm từ vải sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 18),
  ('Nhãn sấy', 'Sản phẩm từ nhãn sấy; thông tin từng sản phẩm sẽ được xác minh trước khi mở bán.', '', 19);

UPDATE categories SET is_active = 0
WHERE name NOT IN (
  'Xoài sấy', 'Chuối sấy', 'Mít sấy', 'Dứa sấy', 'Thanh long sấy',
  'Dâu tây sấy', 'Ổi sấy', 'Đu đủ sấy', 'Vải sấy', 'Nhãn sấy'
);

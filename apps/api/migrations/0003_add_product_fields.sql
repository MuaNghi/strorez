-- Storez: Thêm cột category_id, stock, is_active vào bảng products
-- Migration additive - không xóa dữ liệu hiện có

-- Thêm cột category_id (FK đến categories)
ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Thêm cột stock (tồn kho), mặc định 0
ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);

-- Thêm cột is_active (trạng thái hiển thị), mặc định true
ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

-- Index cho category_id
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- Index cho is_active (lọc sản phẩm hiển thị)
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
WITH sample_products (
  name, description, price, image, category_name, short_description,
  fruit_type, drying_method, ingredients, net_weight_g, sku
) AS (
  VALUES
    ('Khoai môn sấy giòn 100g', 'Khoai môn sấy giòn, khối lượng 100g.', 49000, '/products/Khoai môn sấy.png', 'Rau củ sấy', 'Khoai môn sấy giòn, khối lượng 100g.', 'Khoai môn', 'Sấy giòn', 'Khoai môn', 100, 'STZ-RC-KM-100'),
    ('Nấm hương sấy giòn 55g', 'Nấm hương sấy giòn, khối lượng 55g.', 53990, '/products/nam-huong-say-illustration.svg', 'Rau củ sấy', 'Nấm hương sấy giòn, khối lượng 55g.', 'Nấm hương', 'Sấy giòn', 'Nấm hương', 55, 'STZ-RC-NH-055'),
    ('Rau củ hỗn hợp sấy giòn Shary 45g', 'Rau củ hỗn hợp sấy giòn Shary, khối lượng 45g.', 42000, '/products/rau-cu-hon-hop-illustration.svg', 'Thập cẩm sấy', 'Rau củ hỗn hợp sấy giòn, khối lượng 45g.', 'Rau củ hỗn hợp', 'Sấy giòn', 'Khoai lang vàng, khoai lang tím, củ cải xanh, cà rốt, bí đỏ, củ cải đỏ, khoai môn, đậu que và các thành phần khác', 45, 'STZ-RC-HH-045'),
    ('Khoai lang vàng sấy 100g', 'Khoai lang vàng sấy, khối lượng 100g.', 37800, '/products/Khoai lang vàng sấy.png', 'Rau củ sấy', 'Khoai lang vàng sấy, khối lượng 100g.', 'Khoai lang vàng', 'Sấy giòn', 'Khoai lang vàng', 100, 'STZ-RC-KLV-100'),
    ('Khoai lang tím sấy 100g', 'Khoai lang tím sấy, khối lượng 100g.', 42120, '/products/Khoai lang tím sấy.png', 'Rau củ sấy', 'Khoai lang tím sấy, khối lượng 100g.', 'Khoai lang tím', 'Sấy', 'Khoai lang tím', 100, 'STZ-RC-KLT-100')
)
INSERT INTO products (
  name, description, price, image, category_id, stock, is_active,
  short_description, fruit_type, drying_method, ingredients, net_weight_g,
  data_status, is_featured, verification_source
)
SELECT
  p.name, p.description, p.price, p.image, c.id, 0, 1,
  p.short_description, p.fruit_type, p.drying_method, p.ingredients,
  p.net_weight_g, 'SAMPLE', 0, ''
FROM sample_products p
JOIN categories c ON c.name = p.category_name AND c.is_active = 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = p.name);

WITH sample_variants (name, sku, weight_g, price) AS (
  VALUES
    ('Khoai môn sấy giòn 100g', 'STZ-RC-KM-100', 100, 49000),
    ('Nấm hương sấy giòn 55g', 'STZ-RC-NH-055', 55, 53990),
    ('Rau củ hỗn hợp sấy giòn Shary 45g', 'STZ-RC-HH-045', 45, 42000),
    ('Khoai lang vàng sấy 100g', 'STZ-RC-KLV-100', 100, 37800),
    ('Khoai lang tím sấy 100g', 'STZ-RC-KLT-100', 100, 42120)
)
INSERT INTO product_variants (
  product_id, sku, weight_g, price, sale_price, stock, is_active
)
SELECT p.id, v.sku, v.weight_g, v.price, NULL, 0, 1
FROM sample_variants v
JOIN products p ON p.name = v.name
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = v.sku);

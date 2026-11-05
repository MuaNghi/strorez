-- Import the ten explicitly approved SAMPLE products with their requested
-- demo prices and stock. Product names and variant SKUs make this idempotent.
WITH fruit_products (
  name, description, price, image, fruit_type, drying_method, net_weight_g
) AS (
  VALUES
    ('Xoài sấy dẻo 250g', 'Xoài sấy dẻo, khối lượng 250g.', 89000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-e08308ce-f981-40ab-a154-8f284fc37e2f__pdHuJTn1.jpg', 'Xoài', 'Sấy dẻo', 250),
    ('Xoài sấy giòn 100g', 'Xoài sấy giòn, khối lượng 100g.', 69000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-cc09ac0f-283a-418f-827e-2c50e1fcc4d5_gK-QRmOZr.jpg', 'Xoài', 'Sấy giòn', 100),
    ('Chuối sấy giòn 200g', 'Chuối sấy giòn, khối lượng 200g.', 49000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-c3b0cdfb-a582-4af7-bbe1-cc95ebf39451_kNWe1ym8v.jpg', 'Chuối', 'Sấy giòn', 200),
    ('Mít sấy giòn 100g', 'Mít sấy giòn, khối lượng 100g.', 59000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-5730f050-2d78-4fef-90a3-2bb1b7996a63_ckPIfKwEI.jpg', 'Mít', 'Sấy giòn', 100),
    ('Dứa sấy dẻo 200g', 'Dứa sấy dẻo, khối lượng 200g.', 69000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-16e66b9f-4471-4450-98cd-d7220a102afe_kwN6iyim0.jpg', 'Dứa', 'Sấy dẻo', 200),
    ('Thanh long sấy thăng hoa 50g', 'Thanh long sấy thăng hoa, khối lượng 50g.', 89000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-c597290d-1122-41fc-bec5-3dcf4fd30ad7_CC8czdg9s.jpg', 'Thanh long', 'Sấy thăng hoa', 50),
    ('Dâu tây sấy thăng hoa 50g', 'Dâu tây sấy thăng hoa, khối lượng 50g.', 99000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-aa79b85f-a6be-4e9a-b98d-1b5540a294d1_hcSz60obf.jpg', 'Dâu tây', 'Sấy thăng hoa', 50),
    ('Ổi sấy dẻo 200g', 'Ổi sấy dẻo, khối lượng 200g.', 55000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-eb232d85-b9aa-4261-b251-5657a235da47_1WZfEtxgJ.jpg', 'Ổi', 'Sấy dẻo', 200),
    ('Đu đủ sấy dẻo 250g', 'Đu đủ sấy dẻo, khối lượng 250g.', 59000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-a139a2ff-3fb3-4d7c-b3ef-045dbd356485_zb3TUMLQ1.jpg', 'Đu đủ', 'Sấy dẻo', 250),
    ('Vải sấy 200g', 'Vải sấy, khối lượng 200g.', 75000, 'https://ik.imagekit.io/nekmf5lcd/storez/products/product-9ea82d02-7156-4c0d-a3a3-49b492b20c00__jNwubXRtv.jpg', 'Vải', 'Sấy', 200)
)
INSERT INTO products (
  name, description, price, image, category_id, stock, is_active,
  short_description, fruit_type, drying_method, net_weight_g, data_status,
  is_featured
)
SELECT
  f.name, f.description, f.price, f.image,
  (SELECT id FROM categories WHERE name = 'Hoa quả sấy' AND is_active = 1),
  0, 1, f.description, f.fruit_type, f.drying_method, f.net_weight_g,
  'SAMPLE', 0
FROM fruit_products f
WHERE NOT EXISTS (
  SELECT 1 FROM product_variants WHERE sku = CASE f.name
    WHEN 'Xoài sấy dẻo 250g' THEN 'STZ-XSD-250'
    WHEN 'Xoài sấy giòn 100g' THEN 'STZ-XSG-100'
    WHEN 'Chuối sấy giòn 200g' THEN 'STZ-CSG-200'
    WHEN 'Mít sấy giòn 100g' THEN 'STZ-MSG-100'
    WHEN 'Dứa sấy dẻo 200g' THEN 'STZ-DSD-200'
    WHEN 'Thanh long sấy thăng hoa 50g' THEN 'STZ-TLSTH-050'
    WHEN 'Dâu tây sấy thăng hoa 50g' THEN 'STZ-DTSTH-050'
    WHEN 'Ổi sấy dẻo 200g' THEN 'STZ-OSD-200'
    WHEN 'Đu đủ sấy dẻo 250g' THEN 'STZ-DPSD-250'
    WHEN 'Vải sấy 200g' THEN 'STZ-VS-200'
  END
)
AND NOT EXISTS (SELECT 1 FROM products WHERE name = f.name);

WITH fruit_variants (name, sku, weight_g, price, stock) AS (
  VALUES
    ('Xoài sấy dẻo 250g', 'STZ-XSD-250', 250, 89000, 50),
    ('Xoài sấy giòn 100g', 'STZ-XSG-100', 100, 69000, 40),
    ('Chuối sấy giòn 200g', 'STZ-CSG-200', 200, 49000, 60),
    ('Mít sấy giòn 100g', 'STZ-MSG-100', 100, 59000, 45),
    ('Dứa sấy dẻo 200g', 'STZ-DSD-200', 200, 69000, 35),
    ('Thanh long sấy thăng hoa 50g', 'STZ-TLSTH-050', 50, 89000, 25),
    ('Dâu tây sấy thăng hoa 50g', 'STZ-DTSTH-050', 50, 99000, 20),
    ('Ổi sấy dẻo 200g', 'STZ-OSD-200', 200, 55000, 40),
    ('Đu đủ sấy dẻo 250g', 'STZ-DPSD-250', 250, 59000, 30),
    ('Vải sấy 200g', 'STZ-VS-200', 200, 75000, 30)
)
INSERT INTO product_variants (
  product_id, sku, weight_g, price, sale_price, stock, is_active
)
SELECT p.id, f.sku, f.weight_g, f.price, NULL, f.stock, 1
FROM fruit_variants f
JOIN products p ON p.name = f.name
WHERE NOT EXISTS (
  SELECT 1 FROM product_variants WHERE sku = f.sku
);

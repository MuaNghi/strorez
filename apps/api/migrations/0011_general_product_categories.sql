INSERT INTO categories (name, description, image, sort_order, is_active) VALUES
  ('Hoa quả sấy', 'Các loại hoa quả sấy dẻo, sấy giòn và sấy lạnh.', '', 1, 1),
  ('Rau củ sấy', 'Các loại rau củ sấy.', '', 2, 1),
  ('Hạt sấy', 'Các loại hạt sấy.', '', 3, 1),
  ('Thập cẩm sấy', 'Các sản phẩm phối trộn nhiều loại hoa quả, rau củ hoặc hạt sấy.', '', 4, 1),
  ('Khác', 'Các sản phẩm sấy chưa thuộc nhóm danh mục khác.', '', 5, 1)
ON CONFLICT(name) DO UPDATE SET
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = 1;

UPDATE products
SET category_id = (
  SELECT target.id
  FROM categories AS old_category
  JOIN categories AS target
    ON target.name = CASE
      WHEN lower(old_category.name || ' ' || products.name || ' ' || products.fruit_type) LIKE '%thập cẩm%'
        THEN 'Thập cẩm sấy'
      WHEN lower(old_category.name || ' ' || products.name || ' ' || products.fruit_type) LIKE '%khoai%'
        OR lower(old_category.name) LIKE '%rau%'
        THEN 'Rau củ sấy'
      WHEN lower(old_category.name) LIKE '%hạt%'
        THEN 'Hạt sấy'
      WHEN lower(old_category.name) LIKE '%sấy%'
        THEN 'Hoa quả sấy'
      ELSE 'Khác'
    END
  WHERE old_category.id = products.category_id
)
WHERE category_id IN (
  SELECT id FROM categories
  WHERE is_active = 1
    AND name NOT IN ('Hoa quả sấy', 'Rau củ sấy', 'Hạt sấy', 'Thập cẩm sấy', 'Khác')
);

UPDATE categories
SET is_active = 0, updated_at = CURRENT_TIMESTAMP
WHERE name NOT IN ('Hoa quả sấy', 'Rau củ sấy', 'Hạt sấy', 'Thập cẩm sấy', 'Khác');

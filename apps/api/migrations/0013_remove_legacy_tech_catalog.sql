DELETE FROM products
WHERE id BETWEEN 1 AND 12
  AND name IN (
    'Tai nghe không dây', 'Đồng hồ thông minh', 'Bàn phím cơ',
    'Chuột gaming', 'Loa Bluetooth', 'Balo laptop', 'Sạc nhanh 65W',
    'Webcam Full HD', 'Màn hình 27"', 'Ổ cứng SSD 1TB',
    'Đèn bàn LED', 'Giá đỡ laptop'
  )
  AND stock = 0
  AND NOT EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM reviews
    WHERE reviews.product_id = products.id
  );

DELETE FROM categories
WHERE id BETWEEN 1 AND 5
  AND name IN (
    'Thiết bị âm thanh', 'Đồng hồ & Phụ kiện',
    'Máy tính & Phụ kiện', 'Sạc & Cáp', 'Thiết bị văn phòng'
  )
  AND is_active = 0
  AND NOT EXISTS (
    SELECT 1 FROM products
    WHERE products.category_id = categories.id
  );

# Báo cáo triển khai Store lên Cloudflare

## 1. Tổng quan

Store là ứng dụng cửa hàng demo dạng monorepo npm workspaces. Frontend React được build bằng Vite; API dùng Hono chạy trên Cloudflare Workers. Worker đồng thời phục vụ các file frontend đã build, vì vậy dự án hiện không cần triển khai Cloudflare Pages riêng.npm run db:init:remote -w apps/api

Các dịch vụ Cloudflare được sử dụng:

- **Workers**: chạy API và phục vụ giao diện web.
- **Workers Static Assets**: phân phối nội dung trong `apps/web/dist`.
- **D1**: lưu danh sách sản phẩm.
- **KV**: lưu giỏ hàng theo mã do trình duyệt tạo; thời hạn hiện là 30 ngày.
tạo báo cáo chi tiết cách triển khai dự án này lên cloudflare lưu báo cáo tại docv/
Cấu hình triển khai nằm trong `apps/api/wrangler.toml`. Đường dẫn asset được khai báo là `../web/dist`; route `/api/*` được chuyển đến Worker trước khi xử lý asset, các đường dẫn khác hỗ trợ SPA fallback.

## 2. Điều kiện cần có

- Tài khoản Cloudflare có quyền tạo Workers, D1 và KV.
- Node.js và npm đã cài trên máy triển khai.
- Mã nguồn dự án và dependencies đã sẵn sàng (`npm install` tại thư mục gốc).
- Wrangler đã đăng nhập đúng tài khoản Cloudflare trước khi tạo tài nguyên hoặc deploy.

Đăng nhập và kiểm tra tài khoản, chạy từ thư mục `apps/api`:

```bash
npx wrangler login
npx wrangler whoami
```

## 3. Tạo hoặc xác minh tài nguyên Cloudflare

Kiểm tra các tài nguyên hiện có trước để tránh tạo trùng:

```bash
cd apps/api
npx wrangler d1 list
npx wrangler kv namespace list
```

Nếu chưa có database hoặc namespace cho ứng dụng, tạo chúng:

```bash
npx wrangler d1 create store-db
npx wrangler kv namespace create CART
```

Lệnh tạo D1 và KV trả về ID. Mở `apps/api/wrangler.toml` và đảm bảo các binding khớp với tài nguyên của đúng tài khoản:

```toml
[[d1_databases]]
binding = "DB"
database_name = "store-db"
database_id = "<D1_DATABASE_ID>"

[[kv_namespaces]]
binding = "CART"
id = "<KV_NAMESPACE_ID>"
```

Trong workspace hiện tại đã có ID được điền sẵn. Chỉ thay chúng nếu kết quả kiểm tra cho thấy ID không thuộc database/namespace dự định dùng. Các ID này không phải API secret, nhưng không được nhầm ID local với tài nguyên production.

## 4. Khởi tạo D1 production

Chỉ khởi tạo database production mới, đang rỗng. Từ `apps/api`, chạy schema và seed riêng từng bước:

```bash
npx wrangler d1 execute store-db --remote --file=./schema.sql
npx wrangler d1 execute store-db --remote --file=./seed.sql
```

**Cảnh báo dữ liệu:** `schema.sql` bắt đầu bằng `DROP TABLE IF EXISTS products`, nên chạy lại sẽ xóa bảng sản phẩm hiện tại và dữ liệu trong đó. `seed.sql` chèn 12 sản phẩm nhưng không chống chèn trùng. Vì vậy, không chạy lại các lệnh trên đối với database đang có dữ liệu.

Script `npm run db:init:remote` hiện chạy cả hai file theo thứ tự và do đó cũng có thể xóa dữ liệu production. Không dùng script này như một lệnh cập nhật thông thường. Trước khi thay đổi schema của database đã dùng, cần có bản sao lưu và quy trình migration có kiểm soát; repository hiện chưa có bộ migration production.

`npm run db:init` không có `--remote`, nên chỉ khởi tạo D1 local.

## 5. Kiểm tra và build

Tại thư mục gốc dự án:

```bash
npm run typecheck
npm run build
```

`npm run build` gọi TypeScript kiểm tra frontend rồi tạo `apps/web/dist`. Wrangler cần thư mục này vì `assets.directory` trỏ tới đó. Lệnh deploy ở bước tiếp theo tự build lại frontend, nên build riêng trước đây chủ yếu để phát hiện lỗi sớm.

## 6. Deploy

Chạy từ thư mục gốc:

```bash
npm run deploy
```

Script gốc thực hiện tuần tự:

1. `npm run build` để tạo frontend production.
2. `npm run deploy -w apps/api` để gọi `wrangler deploy` cho Worker.

Khi hoàn tất, Wrangler hiển thị URL Worker, thường có dạng `https://store.<subdomain>.workers.dev`. Tên Worker lấy từ `name = "store"` trong `apps/api/wrangler.toml`. Hãy dùng URL thực tế mà lệnh deploy trả về.

## 7. Kiểm tra sau triển khai

Các lệnh dưới đây dùng PowerShell; thay `<WORKER_URL>` bằng URL vừa nhận:

```powershell
$baseUrl = "<WORKER_URL>"
Invoke-WebRequest "$baseUrl/"
$products = Invoke-RestMethod "$baseUrl/api/products"
$headers = @{ "x-cart-id" = "deploy-check-123" }
Invoke-RestMethod "$baseUrl/api/cart" -Headers $headers
```

Kết quả mong đợi:

- `/` trả giao diện Store.
- `/api/products` trả JSON danh sách sản phẩm; database mới được seed sẽ có 12 sản phẩm.
- `/api/cart` trả giỏ rỗng ban đầu với `items`, `total`, `count`.

Có thể kiểm tra thao tác thêm sản phẩm bằng mã giỏ kiểm thử riêng:

```powershell
$body = @{ productId = 1 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$baseUrl/api/cart/items" `
  -Headers $headers -ContentType "application/json" -Body $body
```

Giỏ hàng kiểm thử được lưu trong KV production; xóa nó sau khi kiểm tra nếu cần. Không dùng mã giỏ thật của người dùng để smoke test.

## 8. Tên miền riêng và vận hành

Có thể gắn custom domain cho Worker từ phần cấu hình Domains & Routes của Cloudflare. Sau khi DNS và domain được Cloudflare xác nhận, kiểm tra lại cả trang chủ lẫn `/api/products` trên domain mới. Vì frontend gọi API qua đường dẫn tương đối `/api`, phục vụ chung origin không cần cấu hình một API host riêng.

Để phát hành phiên bản mới, cập nhật mã nguồn rồi chạy lại `npm run deploy`. Không cần khởi tạo lại D1 hoặc KV khi chỉ deploy code/frontend.

## 9. Giới hạn trước khi dùng thực tế

- Thanh toán hiện chỉ là demo phía giao diện; chưa tạo đơn hàng hay tích hợp cổng thanh toán.
- Chưa có tài khoản người dùng, phân quyền quản trị, tồn kho hoặc lịch sử đơn hàng.
- Giỏ hàng được định danh bằng `x-cart-id` do client tạo, không phải danh tính đã xác thực.
- `seed.sql` là dữ liệu mẫu, ảnh dùng dịch vụ ảnh placeholder.
- Chưa có quy trình migration production; schema hiện tại có lệnh xóa bảng khi chạy lại.
- Chưa khai báo môi trường staging/production riêng trong Wrangler. Cần bổ sung cấu hình tách biệt trước khi vận hành nhiều môi trường.

Do đó, cấu hình phù hợp để demo hoặc triển khai thử nghiệm; cần bổ sung nghiệp vụ đơn hàng, bảo vệ dữ liệu và quy trình migration trước khi dùng làm cửa hàng production.

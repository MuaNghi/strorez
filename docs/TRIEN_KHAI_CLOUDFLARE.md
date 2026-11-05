# Báo cáo triển khai Storez lên Cloudflare

## 1. Tổng quan

Storez là ứng dụng cửa hàng dạng monorepo npm workspaces. Frontend React được build bằng Vite; API dùng Hono chạy trên Cloudflare Workers. Worker đồng thời phục vụ các file frontend đã build, vì vậy dự án hiện không cần triển khai Cloudflare Pages riêng.

Các dịch vụ Cloudflare được sử dụng:

- - **Workers**: chạy API và phục vụ giao diện web.
- **Workers Static Assets**: phân phối nội dung trong `apps/web/dist`.
- **D1**: lưu danh sách sản phẩm.
- **KV**: lưu giỏ hàng theo mã do trình duyệt tạo; thời hạn hiện là 30 ngày.
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

## 4. Khởi tạo và cập nhật D1

Các migration trong `apps/api/migrations` tạo những bảng và cột cho đơn hàng, vai trò, tồn kho, danh mục, đánh giá, khuyến mãi, cài đặt, metadata trái cây, biến thể và nguồn xác minh. Với một database mới, khởi tạo schema nền, tài khoản, phiên đăng nhập, sản phẩm mẫu rồi áp dụng migration:

```bash
npm run db:init
```

Lệnh trên chỉ tác động D1 local. Để khởi tạo một database production mới, đang rỗng:

```bash
npm run db:init:remote
```

**Cảnh báo:** chỉ dùng `db:init` hoặc `db:init:remote` cho database mới. `schema.sql` có `DROP TABLE IF EXISTS products`, còn `seed.sql` chèn sản phẩm mẫu; chạy lại có thể xóa dữ liệu sản phẩm hoặc chèn trùng.

Với database đã khởi tạo và đang có dữ liệu, chỉ áp dụng các migration chưa chạy:

```bash
npm run db:migrate
npm run db:migrate:remote
```

Trước khi áp dụng migration lên production, hãy sao lưu D1 và kiểm tra migration trên môi trường local/staging. Không chạy lại các file schema/seed nền trên database đang sử dụng.

Các migration production cần được rà soát trước khi áp dụng. `0008` không ghi đè tồn kho hay tạo mã khuyến mãi mẫu; `0009` bổ sung schema và danh mục nhưng giữ nguyên các bản ghi sản phẩm; `0011` bổ sung nhóm danh mục tổng quát và ẩn các danh mục cũ; `0012_seed_fruit_catalog.sql` thêm 10 sản phẩm SAMPLE cùng ảnh, giá và tồn kho đã chọn. Migration nhập sản phẩm dùng SKU để tránh chèn trùng khi chạy lại. Luôn sao lưu D1 và xác nhận các giá/tồn kho SAMPLE có thể xuất hiện công khai trước khi áp dụng `0012`.

Để chức năng tải ảnh trong Admin hoạt động trên Worker production, cấu hình các giá trị ImageKit dưới dạng Worker secrets (không lưu trong mã nguồn):

```bash
npx wrangler secret put IMAGEKIT_PRIVATE_KEY
npx wrangler secret put IMAGEKIT_URL_ENDPOINT
```

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

- `/` trả giao diện Storez.
- `/api/products` trả object gồm `data` và `pagination`. Sản phẩm phải đang bật và thuộc danh mục đang hoạt động; dữ liệu `SAMPLE` được hiển thị như yêu cầu hiện tại, còn dữ liệu `VERIFIED` cần có `verification_source`. Giá và tồn kho SAMPLE là dữ liệu tham khảo, không phải thông tin đã xác minh.
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

## 9. Quản trị cửa hàng

Đăng ký tài khoản trong cửa hàng, sau đó cấp quyền quản trị cho email đó trên đúng D1 database. Ví dụ với production, chạy từ `apps/api`:

```bash
npx wrangler d1 execute store-db --remote --command "UPDATE users SET role = 'ADMIN' WHERE email = 'admin@example.com'"
```

Khu vực quản trị cung cấp tổng quan, quản lý sản phẩm/danh mục/kho, biến thể và tồn kho từng quy cách, đơn hàng, khách hàng, thanh toán demo, mã khuyến mãi, đánh giá và cài đặt cửa hàng. Sản phẩm chỉ xuất hiện ở cửa hàng khi quản trị viên bổ sung nguồn xác minh và đánh dấu dữ liệu đã xác minh. Mọi API `/api/admin/*` đều yêu cầu phiên đăng nhập có vai trò `ADMIN`.

## 10. Giới hạn trước khi dùng thực tế

- Thanh toán chuyển khoản hiện là demo; chưa tích hợp hoặc xác nhận thanh toán qua cổng thanh toán thật.
- Trạng thái thanh toán trong trang quản trị chỉ ghi nhận demo; cần tích hợp và đối soát với cổng thanh toán trước khi dùng thực tế.
- Giỏ hàng được định danh bằng `x-cart-id` do client tạo, không phải danh tính đã xác thực.
- `seed.sql` là dữ liệu mẫu. Mười sản phẩm ở migration `0012_seed_fruit_catalog.sql` mang trạng thái `SAMPLE`; giá và tồn kho của chúng là số liệu demo được hiển thị công khai, không phải thông tin đã xác minh.
- Migration đã được quản lý bằng Wrangler D1; tuy nhiên schema nền vẫn có thao tác xóa bảng khi khởi tạo lại, nên chỉ chạy các lệnh `db:init*` trên database mới.
- Chưa khai báo môi trường staging/production riêng trong Wrangler. Cần bổ sung cấu hình tách biệt trước khi vận hành nhiều môi trường.
- Catalog trái cây và ảnh cần được kiểm chứng trước khi xem là thông tin bán hàng chính thức; không nhập thành phần, hạn sử dụng hoặc nguồn gốc suy đoán.
- Chatbot chỉ tư vấn sản phẩm thuộc danh mục đang hoạt động; tra cứu đơn hàng yêu cầu đăng nhập và giới hạn theo chủ đơn. Không gửi thông tin cá nhân của khách hàng sang dịch vụ AI. Nội dung y tế và chính sách chưa có dữ liệu được trả lời theo hướng không khẳng định.

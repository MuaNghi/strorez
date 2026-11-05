
import { Hono } from 'hono'
import type { Context } from 'hono'
import auth, { getSessionUser } from './auth'

type Env = {
  Bindings: {
    DB: D1Database
    CART: KVNamespace
    OPENROUTER_API_KEY: string
    IMAGEKIT_PRIVATE_KEY: string
    IMAGEKIT_URL_ENDPOINT: string
  }
}

type Product = {
  id: number
  name: string
  description: string
  price: number
  image: string
  category_id: number | null
  stock: number
  is_active: number
  created_at: string
  short_description: string
  details: string
  fruit_type: string
  drying_method: string
  ingredients: string
  net_weight_g: number | null
  origin: string
  responsible_party: string
  packaging: string
  produced_on: string | null
  expiry_info: string
  storage_instructions: string
  data_status: 'SAMPLE' | 'VERIFIED'
  verification_source: string
  is_featured: number
  display_price?: number
  variants?: ProductVariant[]
}

type ProductVariant = {
  id: number
  product_id: number
  sku: string
  weight_g: number
  flavor: string
  packaging: string
  price: number
  sale_price: number | null
  stock: number
  is_active: number
}

type ProductVariantInput = Omit<ProductVariant, 'id'>

type Category = {
  id: number
  name: string
  description: string
  image: string
  is_active: number
  sort_order: number
  created_at: string
  updated_at: string
}

type Promotion = {
  id: number
  code: string
  name: string
  description: string
  discount_type: 'PERCENT' | 'FIXED'
  discount_value: number
  min_order_amount: number
  max_discount_amount: number | null
  usage_limit: number | null
  usage_count: number
  per_user_limit: number
  starts_at: string
  ends_at: string
  is_active: number
  created_at: string
  updated_at: string
}

type Settings = {
  id: number
  store_name: string
  store_description: string
  store_logo: string
  store_favicon: string
  contact_email: string
  contact_phone: string
  address: string
  primary_color: string
  secondary_color: string
  free_shipping_threshold: number
  cod_fee: number
  meta_title: string
  meta_description: string
  og_image: string
  maintenance_mode: number
  maintenance_message: string
  updated_at: string
}

type Line = {
  productId: number
  variantId?: number
  qty: number
}

type CartItem = {
  product: Product
  qty: number
  variant: ProductVariant | null
}

type CartData = {
  items: CartItem[]
  total: number
  count: number
}

type ProductMetadata = Pick<
  Product,
  | 'short_description'
  | 'details'
  | 'fruit_type'
  | 'drying_method'
  | 'ingredients'
  | 'net_weight_g'
  | 'origin'
  | 'responsible_party'
  | 'packaging'
  | 'produced_on'
  | 'expiry_info'
  | 'storage_instructions'
  | 'data_status'
  | 'verification_source'
  | 'is_featured'
>

const parseProductMetadata = (
  body: Record<string, unknown>,
): { metadata?: ProductMetadata; error?: string } => {
  const textFields = [
    'short_description',
    'details',
    'fruit_type',
    'drying_method',
    'ingredients',
    'origin',
    'responsible_party',
    'packaging',
    'expiry_info',
    'storage_instructions',
    'verification_source',
  ] as const
  const text: Record<(typeof textFields)[number], string> = {
    short_description: '',
    details: '',
    fruit_type: '',
    drying_method: '',
    ingredients: '',
    origin: '',
    responsible_party: '',
    packaging: '',
    expiry_info: '',
    storage_instructions: '',
    verification_source: '',
  }
  for (const field of textFields) {
    const value = body[field] ?? ''
    if (typeof value !== 'string' || value.length > 2000) {
      return { error: `Thông tin ${field} không hợp lệ.` }
    }
    text[field] = value.trim()
  }

  const weight = body.net_weight_g
  const producedOn = body.produced_on
  const dataStatus = body.data_status ?? 'SAMPLE'
  const featured = body.is_featured ?? 0
  if (
    (weight !== undefined && weight !== null &&
      (typeof weight !== 'number' || !Number.isSafeInteger(weight) || weight <= 0)) ||
    (producedOn !== undefined && producedOn !== null &&
      (typeof producedOn !== 'string' || producedOn.length > 30)) ||
    (dataStatus !== 'SAMPLE' && dataStatus !== 'VERIFIED') ||
    (dataStatus === 'VERIFIED' && !text.verification_source.trim()) ||
    (featured !== 0 && featured !== 1)
  ) {
    return { error: 'Khối lượng, ngày sản xuất hoặc trạng thái xác minh không hợp lệ.' }
  }

  return {
    metadata: {
      ...text,
      net_weight_g: weight === undefined ? null : weight as number | null,
      produced_on: producedOn === undefined ? null : producedOn as string | null,
      data_status: dataStatus,
      is_featured: featured,
    },
  }
}

const app = new Hono<Env>().basePath('/api')

// ==================== AUTH ====================

// Kết nối API đăng ký, đăng nhập, kiểm tra tài khoản và đăng xuất.
app.route('/auth', auth)

// Lấy người dùng đang đăng nhập từ cookie phiên.
const getCurrentUser = async (c: Context<Env>) => {
  const cookie = c.req.header('Cookie') ?? ''

  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('store_session='))
    ?.slice('store_session='.length)

  if (!token) return null

  return getSessionUser(decodeURIComponent(token), c.env.DB)
}

app.use('/admin/*', async (c, next) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  if (user.role !== 'ADMIN') {
    return c.json({ error: 'Bạn không có quyền truy cập khu vực quản trị.' }, 403)
  }
  await next()
})

// ==================== CART ====================

const CART_TTL = 60 * 60 * 24 * 30 // 30 ngày

// Giỏ hàng gắn với cart id do client sinh (lưu ở localStorage).
const cartKey = (c: Context<Env>) => {
  const id = c.req.header('x-cart-id')
  return id && /^[\w-]{8,64}$/.test(id) ? `cart:${id}` : null
}

const readLines = async (c: Context<Env>, key: string) =>
  (await c.env.CART.get<Line[]>(key, 'json')) ?? []

const writeLines = (c: Context<Env>, key: string, lines: Line[]) =>
  c.env.CART.put(key, JSON.stringify(lines), { expirationTtl: CART_TTL })

// Ghép các dòng giỏ hàng với thông tin sản phẩm từ D1.
const hydrate = async (c: Context<Env>, lines: Line[]): Promise<CartData> => {
  if (!lines.length) {
    return { items: [], total: 0, count: 0 }
  }

  const marks = lines.map(() => '?').join(',')

  const { results } = await c.env.DB
    .prepare(`SELECT * FROM products WHERE id IN (${marks}) AND is_active = 1
      AND EXISTS (
        SELECT 1 FROM categories visible_category
        WHERE visible_category.id = products.category_id
          AND visible_category.is_active = 1
      )
      AND (data_status = 'SAMPLE'
        OR (data_status = 'VERIFIED' AND length(trim(verification_source)) > 0))`)
    .bind(...lines.map((line) => line.productId))
    .all<Product>()

  const productIds = [...new Set(results.map((product) => product.id))]
  if (!productIds.length) return { items: [], total: 0, count: 0 }
  const variantMarks = productIds.map(() => '?').join(',')
  const { results: variants } = await c.env.DB
    .prepare(`SELECT * FROM product_variants WHERE product_id IN (${variantMarks}) AND is_active = 1`)
    .bind(...productIds)
    .all<ProductVariant>()

  const byId = new Map(results.map((product) => [product.id, product]))
  const variantsByProduct = new Map<number, ProductVariant[]>()
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) ?? []
    list.push(variant)
    variantsByProduct.set(variant.product_id, list)
  }

  const items = lines.flatMap<CartItem>((line) => {
    const product = byId.get(line.productId)
    if (!product) return []
    const productVariants = variantsByProduct.get(product.id) ?? []
    if (productVariants.length) {
      const variant = productVariants.find((item) => item.id === line.variantId)
      if (!variant) return []
      const effectivePrice = variant.sale_price ?? variant.price
      return [{
        product: { ...product, price: effectivePrice, stock: variant.stock },
        qty: line.qty,
        variant,
      }]
    }
    if (line.variantId) return []
    return [{ product, qty: line.qty, variant: null }]
  })

  return {
    items,
    total: items.reduce(
      (sum, item) => sum + item.product.price * item.qty,
      0,
    ),
    count: items.reduce((sum, item) => sum + item.qty, 0),
  }
}

// ==================== PUBLIC PRODUCTS API ====================

// Lấy danh sách sản phẩm với tìm kiếm, lọc, sắp xếp, phân trang.
// Query params: search, category_id, min_price, max_price, sort, page, limit
app.get('/products', async (c) => {
  const search = c.req.query('search')?.trim() || ''
  const categoryId = c.req.query('category_id')
  const dryingMethod = c.req.query('drying_method')?.trim() || ''
  const weight = c.req.query('weight_g')
  const minPrice = c.req.query('min_price')
  const maxPrice = c.req.query('max_price')
  const sort = c.req.query('sort') || 'id_asc'
  const requestedPage = Number.parseInt(c.req.query('page') || '1', 10)
  const requestedLimit = Number.parseInt(c.req.query('limit') || '20', 10)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(50, Math.max(1, requestedLimit))
    : 20
  const offset = (page - 1) * limit

  const conditions: string[] = [
    "products.is_active = 1",
    `EXISTS (
      SELECT 1 FROM categories visible_category
      WHERE visible_category.id = products.category_id
        AND visible_category.is_active = 1
    )`,
    "(products.data_status = 'SAMPLE' OR (products.data_status = 'VERIFIED' AND length(trim(products.verification_source)) > 0))",
  ]
  const params: (string | number)[] = []

  if (search) {
    conditions.push('(products.name LIKE ? OR products.description LIKE ? OR products.fruit_type LIKE ?)')
    const like = `%${search}%`
    params.push(like, like, like)
  }

  if (categoryId) {
    const catId = parseInt(categoryId, 10)
    if (Number.isInteger(catId) && catId > 0) {
      conditions.push('products.category_id = ?')
      params.push(catId)
    }
  }

  if (dryingMethod) {
    conditions.push('LOWER(products.drying_method) LIKE LOWER(?)')
    params.push(`%${dryingMethod}%`)
  }

  if (weight) {
    const weightGrams = Number(weight)
    if (Number.isSafeInteger(weightGrams) && weightGrams > 0) {
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM product_variants v
          WHERE v.product_id = products.id AND v.is_active = 1 AND v.weight_g = ?
        ) OR (
          products.net_weight_g = ? AND NOT EXISTS (
            SELECT 1 FROM product_variants active_v
            WHERE active_v.product_id = products.id AND active_v.is_active = 1
          )
        )
      )`)
      params.push(weightGrams, weightGrams)
    }
  }

  if (minPrice) {
    const min = parseInt(minPrice, 10)
    if (Number.isInteger(min) && min >= 0) {
      conditions.push(`COALESCE((
        SELECT MIN(COALESCE(v.sale_price, v.price)) FROM product_variants v
        WHERE v.product_id = products.id AND v.is_active = 1
      ), products.price) >= ?`)
      params.push(min)
    }
  }

  if (maxPrice) {
    const max = parseInt(maxPrice, 10)
    if (Number.isInteger(max) && max >= 0) {
      conditions.push(`COALESCE((
        SELECT MIN(COALESCE(v.sale_price, v.price)) FROM product_variants v
        WHERE v.product_id = products.id AND v.is_active = 1
      ), products.price) <= ?`)
      params.push(max)
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  // Sắp xếp
  let orderBy = 'ORDER BY id ASC'
  switch (sort) {
    case 'price_asc':
      orderBy = `ORDER BY COALESCE((
        SELECT MIN(COALESCE(v.sale_price, v.price)) FROM product_variants v
        WHERE v.product_id = products.id AND v.is_active = 1
      ), products.price) ASC`
      break
    case 'price_desc':
      orderBy = `ORDER BY COALESCE((
        SELECT MIN(COALESCE(v.sale_price, v.price)) FROM product_variants v
        WHERE v.product_id = products.id AND v.is_active = 1
      ), products.price) DESC`
      break
    case 'newest':
      orderBy = 'ORDER BY id DESC'
      break
    case 'name_asc':
      orderBy = 'ORDER BY products.name ASC'
      break
    case 'bestseller':
      orderBy = `ORDER BY (
        SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = products.id AND o.order_status != 'CANCELLED'
      ) DESC, products.id ASC`
      break
    default:
      orderBy = 'ORDER BY id ASC'
  }

  // Đếm tổng số
  const countResult = await c.env.DB
    .prepare(`SELECT COUNT(*) as total FROM products ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  // Lấy dữ liệu
  const { results } = await c.env.DB
    .prepare(`
      SELECT products.*,
        categories.name AS category_name,
        COALESCE((
          SELECT MIN(COALESCE(v.sale_price, v.price)) FROM product_variants v
          WHERE v.product_id = products.id AND v.is_active = 1
        ), products.price) AS display_price
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      ${whereClause} ${orderBy} LIMIT ? OFFSET ?
    `)
    .bind(...params, limit, offset)
    .all<Product>()

  const productIds = results.map((product) => product.id)
  const variants = productIds.length
    ? (await c.env.DB.prepare(
      `SELECT * FROM product_variants WHERE is_active = 1 AND product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY weight_g`,
    ).bind(...productIds).all<ProductVariant>()).results
    : []
  const variantsByProduct = new Map<number, ProductVariant[]>()
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) ?? []
    list.push(variant)
    variantsByProduct.set(variant.product_id, list)
  }
  const data = results.flatMap((product) => {
    const productVariants = variantsByProduct.get(product.id) ?? []
    if (productVariants.length) {
      const matching = weight
        ? productVariants.filter((variant) => variant.weight_g === Number(weight))
        : productVariants
      if (weight && !matching.length) return []
      return [{
        ...product,
        price: Math.min(...matching.map((variant) => variant.sale_price ?? variant.price)),
        stock: matching.reduce((sum, variant) => sum + variant.stock, 0),
        variants: matching,
      }]
    }
    return [{ ...product, price: product.display_price ?? product.price, variants: [] }]
  })

  return c.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  })
})

// Lấy chi tiết sản phẩm
app.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'))

  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: 'ID sản phẩm không hợp lệ.' }, 400)
  }

  const product = await c.env.DB
    .prepare(`SELECT * FROM products WHERE id = ? AND is_active = 1
      AND EXISTS (
        SELECT 1 FROM categories visible_category
        WHERE visible_category.id = products.category_id
          AND visible_category.is_active = 1
      )
      AND (data_status = 'SAMPLE'
        OR (data_status = 'VERIFIED' AND length(trim(verification_source)) > 0))`)
    .bind(id)
    .first<Product>()

  if (!product) {
    return c.json({ error: 'Không tìm thấy sản phẩm.' }, 404)
  }

  const { results: variants } = await c.env.DB.prepare(
    'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY weight_g',
  ).bind(id).all<ProductVariant>()

  return c.json({
    ...product,
    stock: variants.length ? variants.reduce((sum, variant) => sum + variant.stock, 0) : product.stock,
    price: variants.length
      ? Math.min(...variants.map((variant) => variant.sale_price ?? variant.price))
      : product.price,
    variants,
  })
})

// Lấy danh sách danh mục (public)
app.get('/categories', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all<Category>()

  return c.json(results)
})

// ==================== CART API ====================

// Lấy nội dung giỏ hàng.
app.get('/cart', async (c) => {
  const key = cartKey(c)

  if (!key) {
    return c.json({ error: 'missing x-cart-id' }, 400)
  }

  const lines = await readLines(c, key)
  return c.json(await hydrate(c, lines))
})

// Thêm một sản phẩm vào giỏ.
app.post('/cart/items', async (c) => {
  const key = cartKey(c)

  if (!key) {
    return c.json({ error: 'missing x-cart-id' }, 400)
  }

  let body: { productId?: number; variantId?: number }

  try {
    body = await c.req.json<{ productId?: number; variantId?: number }>()
  } catch {
    return c.json({ error: 'invalid request body' }, 400)
  }

  const productId = body.productId

  if (!Number.isInteger(productId) || !productId || productId < 1) {
    return c.json({ error: 'invalid productId' }, 400)
  }

  const product = await c.env.DB
    .prepare('SELECT id, stock FROM products WHERE id = ? AND is_active = 1')
    .bind(productId)
    .first<{ id: number; stock: number }>()

  if (!product) {
    return c.json({ error: 'product not found' }, 404)
  }

  const variants = await c.env.DB.prepare(
    'SELECT id, stock FROM product_variants WHERE product_id = ? AND is_active = 1',
  ).bind(productId).all<{ id: number; stock: number }>()
  const hasVariants = variants.results.length > 0
  if (hasVariants && !Number.isSafeInteger(body.variantId)) {
    return c.json({ error: 'Vui lòng chọn quy cách sản phẩm.' }, 400)
  }
  const variant = body.variantId === undefined
    ? null
    : variants.results.find((item) => item.id === body.variantId)
  if (body.variantId !== undefined && !variant) {
    return c.json({ error: 'Quy cách sản phẩm không hợp lệ.' }, 400)
  }
  const available = variant?.stock ?? product.stock
  const line = (await readLines(c, key)).find(
    (item) => item.productId === productId && item.variantId === body.variantId,
  )
  if (available < (line?.qty ?? 0) + 1) {
    return c.json({ error: 'Số lượng trong kho không đủ.' }, 409)
  }

  const lines = await readLines(c, key)

  if (line) {
    if (line.qty >= 99) {
      return c.json({ error: 'maximum quantity is 99' }, 400)
    }

    line.qty += 1
  } else {
    lines.push({ productId, ...(body.variantId !== undefined ? { variantId: body.variantId } : {}), qty: 1 })
  }

  await writeLines(c, key, lines)

  return c.json(await hydrate(c, lines))
})

// Cập nhật số lượng sản phẩm; qty <= 0 thì xóa khỏi giỏ.
app.put('/cart/items/:id', async (c) => {
  const key = cartKey(c)

  if (!key) {
    return c.json({ error: 'missing x-cart-id' }, 400)
  }

  const productId = Number(c.req.param('id'))

  if (!Number.isInteger(productId) || productId < 1) {
    return c.json({ error: 'invalid product id' }, 400)
  }

  let body: { qty?: number; variantId?: number }

  try {
    body = await c.req.json<{ qty?: number; variantId?: number }>()
  } catch {
    return c.json({ error: 'invalid request body' }, 400)
  }

  const qty = body.qty

  if (typeof qty !== 'number' || !Number.isFinite(qty)) {
    return c.json({ error: 'invalid quantity' }, 400)
  }

  let lines = await readLines(c, key)
  const lineMatches = (line: Line) =>
    line.productId === productId && line.variantId === body.variantId

  if (qty > 0) {
    const safeQty = Math.min(Math.floor(qty), 99)
    if (!Number.isSafeInteger(body.variantId) && body.variantId !== undefined) {
      return c.json({ error: 'Quy cách sản phẩm không hợp lệ.' }, 400)
    }
    const product = await c.env.DB.prepare(
      'SELECT stock FROM products WHERE id = ? AND is_active = 1',
    ).bind(productId).first<{ stock: number }>()
    if (!product) return c.json({ error: 'Sản phẩm không còn được bán.' }, 404)
    const variant = body.variantId === undefined
      ? null
      : await c.env.DB.prepare(`
        SELECT stock FROM product_variants
        WHERE id = ? AND product_id = ? AND is_active = 1
      `).bind(body.variantId, productId).first<{ stock: number }>()
    if (body.variantId !== undefined && !variant) {
      return c.json({ error: 'Quy cách sản phẩm không hợp lệ.' }, 404)
    }
    if (safeQty > (variant?.stock ?? product.stock)) {
      return c.json({ error: 'Số lượng vượt quá tồn kho.' }, 409)
    }

    lines = lines.map((line) =>
      lineMatches(line)
        ? { ...line, qty: safeQty }
        : line,
    )
  } else {
    lines = lines.filter((line) => !lineMatches(line))
  }

  await writeLines(c, key, lines)

  return c.json(await hydrate(c, lines))
})

// Xóa toàn bộ giỏ hàng.
app.delete('/cart', async (c) => {
  const key = cartKey(c)

  if (!key) {
    return c.json({ error: 'missing x-cart-id' }, 400)
  }

  await c.env.CART.delete(key)

  return c.json({ items: [], total: 0, count: 0 })
})

// ==================== ADMIN IMAGE UPLOAD API ====================

// Upload ảnh sản phẩm lên ImageKit.
app.post('/admin/images/upload', async (c) => {
  try {
    const user = await getCurrentUser(c)

    if (!user) {
      return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
    }

    if (user.role !== 'ADMIN') {
      return c.json(
        { error: 'Bạn không có quyền thực hiện thao tác này.' },
        403,
      )
    }

    const formData = await c.req.formData()
    const file = formData.get('file') as File | string | null

    if (!file || typeof file === 'string') {
      return c.json({ error: 'Vui lòng chọn một file ảnh.' }, 400)
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      return c.json(
        { error: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.' },
        400,
      )
    }

    const MAX_SIZE = 5 * 1024 * 1024

    if (file.size > MAX_SIZE) {
      return c.json(
        { error: 'Dung lượng ảnh không được vượt quá 5 MB.' },
        400,
      )
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'

    const safeExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
      ? extension
      : 'jpg'

    const fileName = `product-${crypto.randomUUID()}.${safeExtension}`

    const uploadData = new FormData()

    uploadData.append('file', file, fileName)
    uploadData.append('fileName', fileName)
    uploadData.append('folder', '/storez/products')
    uploadData.append('useUniqueFileName', 'true')

    const credentials = btoa(`${c.env.IMAGEKIT_PRIVATE_KEY}:`)

    const response = await fetch(
      'https://upload.imagekit.io/api/v1/files/upload',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
        },
        body: uploadData,
      },
    )

    const result = await response.json().catch(() => null) as {
      url?: string
      fileId?: string
      name?: string
      message?: string
    }

    if (!response.ok) {
      const detail = typeof result?.message === 'string'
        ? result.message.slice(0, 300)
        : ''
      console.error('ImageKit upload failed:', response.status, detail)
      const error = response.status === 403
        ? 'ImageKit từ chối xác thực. Hãy kiểm tra IMAGEKIT_PRIVATE_KEY trong apps/api/.dev.vars: cần là Private Key của đúng tài khoản ImageKit, không phải Public Key. Sau khi cập nhật, khởi động lại API local.'
        : detail
          ? `ImageKit trả về lỗi ${response.status}: ${detail}`
          : `ImageKit trả về lỗi ${response.status}. Vui lòng kiểm tra cấu hình ImageKit.`

      return c.json(
        { error },
        502,
      )
    }

    if (!result.url) {
      return c.json(
        { error: 'ImageKit không trả về đường dẫn ảnh hợp lệ.' },
        502,
      )
    }

    return c.json({
      message: 'Tải ảnh lên thành công.',
      url: result.url,
      fileId: result.fileId,
      name: result.name,
    })
  } catch (error) {
    console.error('Image upload error:', error)

    return c.json(
      { error: 'Đã xảy ra lỗi khi tải ảnh lên.' },
      500,
    )
  }
})

// ==================== END ADMIN IMAGE UPLOAD API ====================

// ==================== ADMIN PRODUCTS API ====================

// Lấy danh sách sản phẩm dành cho Admin (có phân trang, tìm kiếm, lọc).
app.get('/admin/products', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  if (user.role !== 'ADMIN') {
    return c.json({ error: 'Bạn không có quyền truy cập.' }, 403)
  }

  const search = c.req.query('search')?.trim() || ''
  const categoryId = c.req.query('category_id')
  const isActive = c.req.query('is_active')
  const requestedPage = Number.parseInt(c.req.query('page') || '1', 10)
  const requestedLimit = Number.parseInt(c.req.query('limit') || '20', 10)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 20
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (search) {
    conditions.push('(name LIKE ? OR description LIKE ?)')
    const like = `%${search}%`
    params.push(like, like)
  }

  if (categoryId) {
    const catId = parseInt(categoryId, 10)
    if (Number.isInteger(catId) && catId > 0) {
      conditions.push('category_id = ?')
      params.push(catId)
    }
  }

  if (isActive !== undefined && isActive !== '') {
    const active = parseInt(isActive, 10)
    if (active === 0 || active === 1) {
      conditions.push('is_active = ?')
      params.push(active)
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const countResult = await c.env.DB
    .prepare(`SELECT COUNT(*) as total FROM products ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  const { results } = await c.env.DB
    .prepare(`SELECT * FROM products ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<Product>()

  const variants = results.length
    ? (await c.env.DB.prepare(
      `SELECT * FROM product_variants WHERE product_id IN (${results.map(() => '?').join(',')}) ORDER BY weight_g`,
    ).bind(...results.map((product) => product.id)).all<ProductVariant>()).results
    : []
  const variantsByProduct = new Map<number, ProductVariant[]>()
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) ?? []
    list.push(variant)
    variantsByProduct.set(variant.product_id, list)
  }

  return c.json({
    data: results.map((product) => ({
      ...product,
      variants: variantsByProduct.get(product.id) ?? [],
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  })
})

app.put('/admin/products/:id/variants', async (c) => {
  const productId = Number(c.req.param('id'))
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return c.json({ error: 'ID sản phẩm không hợp lệ.' }, 400)
  }

  const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?')
    .bind(productId).first()
  if (!product) return c.json({ error: 'Không tìm thấy sản phẩm.' }, 404)

  let body: { variants?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Danh sách quy cách không hợp lệ.' }, 400)
  }
  if (!Array.isArray(body.variants) || body.variants.length > 30) {
    return c.json({ error: 'Danh sách quy cách phải có tối đa 30 dòng.' }, 400)
  }

  const variants: ProductVariantInput[] = []
  const seenSkus = new Set<string>()
  for (const raw of body.variants) {
    if (!raw || typeof raw !== 'object') {
      return c.json({ error: 'Thông tin quy cách không hợp lệ.' }, 400)
    }
    const item = raw as Record<string, unknown>
    const sku = typeof item.sku === 'string' ? item.sku.trim() : ''
    const flavor = typeof item.flavor === 'string' ? item.flavor.trim() : ''
    const packaging = typeof item.packaging === 'string' ? item.packaging.trim() : ''
    const weight = item.weight_g
    const price = item.price
    const salePrice = item.sale_price
    const stock = item.stock
    if (
      !sku || sku.length > 80 || seenSkus.has(sku) ||
      typeof weight !== 'number' || !Number.isSafeInteger(weight) || weight < 1 ||
      typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 ||
      (salePrice !== null && (typeof salePrice !== 'number' ||
        !Number.isSafeInteger(salePrice) || salePrice < 0 || salePrice > price)) ||
      typeof stock !== 'number' || !Number.isSafeInteger(stock) || stock < 0 ||
      flavor.length > 100 || packaging.length > 100
    ) {
      return c.json({ error: 'SKU, khối lượng, giá, giá khuyến mãi hoặc tồn kho không hợp lệ.' }, 400)
    }
    seenSkus.add(sku)
    variants.push({
      product_id: productId,
      sku,
      weight_g: weight,
      flavor,
      packaging,
      price,
      sale_price: salePrice as number | null,
      stock,
      is_active: 1,
    })
  }

  const duplicate = variants.length
    ? await c.env.DB.prepare(`
      SELECT sku FROM product_variants
      WHERE sku IN (${variants.map(() => '?').join(',')}) AND product_id != ?
      LIMIT 1
    `).bind(...variants.map((variant) => variant.sku), productId).first()
    : null
  if (duplicate) return c.json({ error: 'SKU đã được dùng cho sản phẩm khác.' }, 409)

  const statements = [
    c.env.DB.prepare(
      'UPDATE product_variants SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?',
    ).bind(productId),
    ...variants.map((variant) => c.env.DB.prepare(`
      INSERT INTO product_variants (
        product_id, sku, weight_g, flavor, packaging, price, sale_price, stock, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(sku) DO UPDATE SET
        weight_g = excluded.weight_g, flavor = excluded.flavor,
        packaging = excluded.packaging, price = excluded.price,
        sale_price = excluded.sale_price, stock = excluded.stock,
        is_active = 1, updated_at = CURRENT_TIMESTAMP
    `).bind(
      productId,
      variant.sku,
      variant.weight_g,
      variant.flavor,
      variant.packaging,
      variant.price,
      variant.sale_price,
      variant.stock,
    )),
  ]
  await c.env.DB.batch(statements)
  return c.json({ message: 'Đã lưu quy cách sản phẩm.' })
})

// Thêm sản phẩm mới.
app.post('/admin/products', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  if (user.role !== 'ADMIN') {
    return c.json(
      { error: 'Bạn không có quyền thực hiện thao tác này.' },
      403,
    )
  }

  let body: Record<string, unknown>

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu sản phẩm không hợp lệ.' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description =
    typeof body.description === 'string' ? body.description.trim() : ''
  const image = typeof body.image === 'string' ? body.image.trim() : ''
  const price = body.price
  const categoryId = body.category_id
  const stock = body.stock
  const isActive = body.is_active
  const parsedMetadata = parseProductMetadata(body)
  if (!parsedMetadata.metadata) {
    return c.json({ error: parsedMetadata.error }, 400)
  }
  const metadata = parsedMetadata.metadata

  if (!name || name.length > 200) {
    return c.json({ error: 'Tên sản phẩm không hợp lệ.' }, 400)
  }

  if (description.length > 5000) {
    return c.json({ error: 'Mô tả sản phẩm quá dài.' }, 400)
  }

  if (!image || image.length > 2000) {
    return c.json({ error: 'Đường dẫn ảnh không hợp lệ.' }, 400)
  }

  if (
    typeof price !== 'number' ||
    !Number.isSafeInteger(price) ||
    price <= 0
  ) {
    return c.json({ error: 'Giá sản phẩm phải là số nguyên dương.' }, 400)
  }

  let finalCategoryId: number | null = null
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    const catId = Number(categoryId)
    if (!Number.isSafeInteger(catId) || catId <= 0) {
      return c.json({ error: 'Danh mục không hợp lệ.' }, 400)
    }
    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(catId).first()
    if (!cat) {
      return c.json({ error: 'Danh mục không tồn tại.' }, 400)
    }
    finalCategoryId = catId
  }

  const finalStock = typeof stock === 'number' && Number.isSafeInteger(stock) && stock >= 0 ? stock : 0
  const finalIsActive = isActive === 0 || isActive === 1 ? isActive : 1

  const result = await c.env.DB
    .prepare(`
      INSERT INTO products (
        name, description, price, image, category_id, stock, is_active,
        short_description, details, fruit_type, drying_method, ingredients,
        net_weight_g, origin, responsible_party, packaging, produced_on,
        expiry_info, storage_instructions, data_status, verification_source, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      name, description, price, image, finalCategoryId, finalStock, finalIsActive,
      metadata.short_description, metadata.details, metadata.fruit_type,
      metadata.drying_method, metadata.ingredients, metadata.net_weight_g,
      metadata.origin, metadata.responsible_party, metadata.packaging,
      metadata.produced_on, metadata.expiry_info, metadata.storage_instructions,
      metadata.data_status, metadata.verification_source, metadata.is_featured,
    )
    .run()

  const product = await c.env.DB
    .prepare('SELECT * FROM products WHERE id = ?')
    .bind(Number(result.meta.last_row_id))
    .first<Product>()

  return c.json(
    {
      message: 'Thêm sản phẩm thành công.',
      product,
    },
    201,
  )
})

// Cập nhật sản phẩm.
app.put('/admin/products/:id', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  if (user.role !== 'ADMIN') {
    return c.json(
      { error: 'Bạn không có quyền thực hiện thao tác này.' },
      403,
    )
  }

  const id = Number(c.req.param('id'))

  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: 'ID sản phẩm không hợp lệ.' }, 400)
  }

  let body: Record<string, unknown>

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu sản phẩm không hợp lệ.' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description =
    typeof body.description === 'string' ? body.description.trim() : ''
  const image = typeof body.image === 'string' ? body.image.trim() : ''
  const price = body.price
  const categoryId = body.category_id
  const stock = body.stock
  const isActive = body.is_active
  const parsedMetadata = parseProductMetadata(body)
  if (!parsedMetadata.metadata) {
    return c.json({ error: parsedMetadata.error }, 400)
  }
  const metadata = parsedMetadata.metadata

  if (!name || name.length > 200) {
    return c.json({ error: 'Tên sản phẩm không hợp lệ.' }, 400)
  }

  if (description.length > 5000) {
    return c.json({ error: 'Mô tả sản phẩm quá dài.' }, 400)
  }

  if (!image || image.length > 2000) {
    return c.json({ error: 'Đường dẫn ảnh không hợp lệ.' }, 400)
  }

  if (
    typeof price !== 'number' ||
    !Number.isSafeInteger(price) ||
    price <= 0
  ) {
    return c.json({ error: 'Giá sản phẩm phải là số nguyên dương.' }, 400)
  }

  let finalCategoryId: number | null = null
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    const catId = Number(categoryId)
    if (!Number.isSafeInteger(catId) || catId <= 0) {
      return c.json({ error: 'Danh mục không hợp lệ.' }, 400)
    }
    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(catId).first()
    if (!cat) {
      return c.json({ error: 'Danh mục không tồn tại.' }, 400)
    }
    finalCategoryId = catId
  }

  const finalStock = typeof stock === 'number' && Number.isSafeInteger(stock) && stock >= 0 ? stock : 0
  const finalIsActive = isActive === 0 || isActive === 1 ? isActive : 1

  const result = await c.env.DB
    .prepare(`
      UPDATE products
      SET name = ?, description = ?, price = ?, image = ?, category_id = ?, stock = ?, is_active = ?,
        short_description = ?, details = ?, fruit_type = ?, drying_method = ?,
        ingredients = ?, net_weight_g = ?, origin = ?, responsible_party = ?,
        packaging = ?, produced_on = ?, expiry_info = ?, storage_instructions = ?,
        data_status = ?, verification_source = ?, is_featured = ?
      WHERE id = ?
    `)
    .bind(
      name, description, price, image, finalCategoryId, finalStock, finalIsActive,
      metadata.short_description, metadata.details, metadata.fruit_type,
      metadata.drying_method, metadata.ingredients, metadata.net_weight_g,
      metadata.origin, metadata.responsible_party, metadata.packaging,
      metadata.produced_on, metadata.expiry_info, metadata.storage_instructions,
      metadata.data_status, metadata.verification_source, metadata.is_featured, id,
    )
    .run()

  if (result.meta.changes === 0) {
    const exists = await c.env.DB
      .prepare('SELECT id FROM products WHERE id = ?')
      .bind(id)
      .first()

    if (!exists) {
      return c.json({ error: 'Không tìm thấy sản phẩm.' }, 404)
    }
  }

  const product = await c.env.DB
    .prepare('SELECT * FROM products WHERE id = ?')
    .bind(id)
    .first<Product>()

  return c.json({
    message: 'Cập nhật sản phẩm thành công.',
    product,
  })
})

// Xóa sản phẩm.
app.delete('/admin/products/:id', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  if (user.role !== 'ADMIN') {
    return c.json(
      { error: 'Bạn không có quyền thực hiện thao tác này.' },
      403,
    )
  }

  const id = Number(c.req.param('id'))

  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: 'ID sản phẩm không hợp lệ.' }, 400)
  }

  const product = await c.env.DB
    .prepare('SELECT id FROM products WHERE id = ?')
    .bind(id)
    .first<{ id: number }>()

  if (!product) {
    return c.json({ error: 'Không tìm thấy sản phẩm.' }, 404)
  }

  const orderItems = await c.env.DB
    .prepare(
      'SELECT COUNT(*) AS total FROM order_items WHERE product_id = ?',
    )
    .bind(id)
    .first<{ total: number }>()

  if (Number(orderItems?.total ?? 0) > 0) {
    return c.json(
      {
        error:
          'Không thể xóa sản phẩm đã xuất hiện trong đơn hàng. Hãy giữ lại để bảo toàn lịch sử đơn hàng.',
      },
      409,
    )
  }

  await c.env.DB
    .prepare('DELETE FROM products WHERE id = ?')
    .bind(id)
    .run()

  return c.json({ message: 'Xóa sản phẩm thành công.' })
})

// ==================== END ADMIN PRODUCTS API ====================

// ==================== ADMIN MANAGEMENT API ====================

app.get('/admin/summary', async (c) => {
  const [products, orders, customers, revenue, lowStock, recentOrders] =
    await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS total FROM products').first<{ total: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS total FROM orders').first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'CUSTOMER' AND email NOT LIKE 'deleted+%@deleted.storez.invalid'").first<{ total: number }>(),
      c.env.DB.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE order_status != 'CANCELLED'").first<{ total: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS total FROM products WHERE stock <= 5 AND is_active = 1').first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT id, customer_name, total, order_status, payment_status, created_at
        FROM orders ORDER BY created_at DESC LIMIT 8
      `).all(),
    ])

  return c.json({
    products: products?.total ?? 0,
    orders: orders?.total ?? 0,
    customers: customers?.total ?? 0,
    revenue: revenue?.total ?? 0,
    lowStock: lowStock?.total ?? 0,
    recentOrders: recentOrders.results,
  })
})

app.get('/admin/orders', async (c) => {
  const search = c.req.query('search')?.trim() ?? ''
  const status = c.req.query('status') ?? ''
  const conditions: string[] = []
  const params: string[] = []

  if (search) {
    conditions.push('(orders.id LIKE ? OR orders.customer_name LIKE ? OR orders.phone LIKE ?)')
    const term = `%${search}%`
    params.push(term, term, term)
  }
  if (['PENDING', 'CONFIRMED', 'CANCELLED'].includes(status)) {
    conditions.push('orders.order_status = ?')
    params.push(status)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await c.env.DB.prepare(`
    SELECT orders.*,
      CASE WHEN users.email LIKE 'deleted+%@deleted.storez.invalid' THEN '' ELSE users.email END AS email,
      (SELECT COUNT(*) FROM order_items WHERE order_items.order_id = orders.id) AS item_count
    FROM orders JOIN users ON users.id = orders.user_id
    ${where} ORDER BY orders.created_at DESC LIMIT 200
  `).bind(...params).all()

  return c.json(results)
})

app.patch('/admin/orders/:id', async (c) => {
  const id = c.req.param('id')
  let body: { order_status?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu trạng thái không hợp lệ.' }, 400)
  }

  const nextStatus = body.order_status
  if (!['PENDING', 'CONFIRMED', 'CANCELLED'].includes(String(nextStatus))) {
    return c.json({ error: 'Trạng thái đơn hàng không hợp lệ.' }, 400)
  }

  const order = await c.env.DB.prepare(
    'SELECT order_status FROM orders WHERE id = ?',
  ).bind(id).first<{ order_status: string }>()
  if (!order) return c.json({ error: 'Không tìm thấy đơn hàng.' }, 404)
  if (order.order_status === 'CANCELLED' && nextStatus !== 'CANCELLED') {
    return c.json({ error: 'Đơn đã hủy không thể mở lại.' }, 409)
  }

  const statements = [
    c.env.DB.prepare('UPDATE orders SET order_status = ? WHERE id = ?')
      .bind(nextStatus, id),
  ]
  if (nextStatus === 'CANCELLED' && order.order_status !== 'CANCELLED') {
    const { results } = await c.env.DB.prepare(
      'SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?',
    ).bind(id).all<{ product_id: number; variant_id: number | null; quantity: number }>()
    statements.push(...results.map(({ product_id, variant_id, quantity }) =>
      variant_id !== null
        ? c.env.DB.prepare(`
          UPDATE product_variants SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(quantity, variant_id)
        : c.env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
          .bind(quantity, product_id),
    ))
  }

  await c.env.DB.batch(statements)
  return c.json({ message: 'Đã cập nhật trạng thái đơn hàng.' })
})

app.get('/admin/customers', async (c) => {
  const search = c.req.query('search')?.trim() ?? ''
  const term = `%${search}%`
  const { results } = await c.env.DB.prepare(`
    SELECT users.id, users.name, users.email, users.created_at,
      COUNT(orders.id) AS order_count,
      COALESCE(SUM(CASE WHEN orders.order_status != 'CANCELLED' THEN orders.total ELSE 0 END), 0) AS total_spent
    FROM users LEFT JOIN orders ON orders.user_id = users.id
    WHERE users.role = 'CUSTOMER'
      AND users.email NOT LIKE 'deleted+%@deleted.storez.invalid'
      AND (? = '' OR users.name LIKE ? OR users.email LIKE ?)
    GROUP BY users.id ORDER BY users.created_at DESC LIMIT 200
  `).bind(search, term, term).all()

  return c.json(results)
})

app.delete('/admin/customers/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: 'Mã khách hàng không hợp lệ.' }, 400)
  }

  const customer = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'CUSTOMER' AND email NOT LIKE 'deleted+%@deleted.storez.invalid'",
  ).bind(id).first<{ id: number }>()
  if (!customer) return c.json({ error: 'Không tìm thấy khách hàng.' }, 404)

  const deletedEmail = `deleted+${id}-${crypto.randomUUID()}@deleted.storez.invalid`
  const deletedPassword = `deleted:${crypto.randomUUID()}`
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    c.env.DB.prepare(`
      UPDATE orders
      SET customer_name = 'Khách hàng đã xoá', phone = '', address = ''
      WHERE user_id = ?
    `).bind(id),
    c.env.DB.prepare(`
      UPDATE users SET name = 'Khách hàng đã xoá', email = ?, password_hash = ?
      WHERE id = ? AND role = 'CUSTOMER'
    `).bind(deletedEmail, deletedPassword, id),
  ])

  return c.json({ message: 'Đã xoá thông tin cá nhân và vô hiệu hoá tài khoản; lịch sử đơn hàng được giữ ở dạng ẩn danh.' })
})

app.get('/admin/categories', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT categories.*,
      (SELECT COUNT(*) FROM products WHERE products.category_id = categories.id) AS product_count
    FROM categories ORDER BY sort_order, id
  `).all()
  return c.json(results)
})

app.post('/admin/categories', async (c) => {
  let body: { name?: unknown; description?: unknown; image?: unknown; sort_order?: unknown; is_active?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu danh mục không hợp lệ.' }, 400) }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const image = typeof body.image === 'string' ? body.image.trim() : ''
  const sortOrder = typeof body.sort_order === 'number' && Number.isSafeInteger(body.sort_order) ? body.sort_order : 0
  const active = body.is_active === 0 ? 0 : 1
  if (!name || name.length > 100 || description.length > 1000 || image.length > 2000) {
    return c.json({ error: 'Tên hoặc thông tin danh mục không hợp lệ.' }, 400)
  }
  const result = await c.env.DB.prepare(`
    INSERT INTO categories (name, description, image, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO NOTHING
  `).bind(name, description, image, sortOrder, active).run()
  if (!result.meta.changes) return c.json({ error: 'Tên danh mục đã tồn tại.' }, 409)
  return c.json({ id: result.meta.last_row_id }, 201)
})

app.put('/admin/categories/:id', async (c) => {
  const id = Number(c.req.param('id'))
  let body: { name?: unknown; description?: unknown; image?: unknown; sort_order?: unknown; is_active?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu danh mục không hợp lệ.' }, 400) }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const image = typeof body.image === 'string' ? body.image.trim() : ''
  const sortOrder = body.sort_order
  const active = body.is_active
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 100 ||
      description.length > 1000 || image.length > 2000 ||
      typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder) ||
      (active !== 0 && active !== 1)) {
    return c.json({ error: 'Thông tin danh mục không hợp lệ.' }, 400)
  }
  const duplicate = await c.env.DB.prepare(
    'SELECT id FROM categories WHERE name = ? AND id != ?',
  ).bind(name, id).first()
  if (duplicate) return c.json({ error: 'Tên danh mục đã tồn tại.' }, 409)
  const result = await c.env.DB.prepare(`
    UPDATE categories SET name = ?, description = ?, image = ?, sort_order = ?,
      is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(name, description, image, sortOrder, active, id).run()
  if (!result.meta.changes) {
    const exists = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first()
    if (!exists) return c.json({ error: 'Không tìm thấy danh mục.' }, 404)
  }
  return c.json({ message: 'Đã cập nhật danh mục.' })
})

app.delete('/admin/categories/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'ID danh mục không hợp lệ.' }, 400)
  const inUse = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM products WHERE category_id = ?',
  ).bind(id).first<{ total: number }>()
  if ((inUse?.total ?? 0) > 0) return c.json({ error: 'Danh mục đang có sản phẩm. Hãy chuyển sản phẩm sang danh mục khác trước.' }, 409)
  const result = await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy danh mục.' }, 404)
  return c.json({ message: 'Đã xóa danh mục.' })
})

app.get('/admin/inventory', async (c) => {
  const { results: products } = await c.env.DB.prepare(`
    SELECT products.id, products.name, products.image, products.stock, products.is_active,
      categories.name AS category_name
    FROM products LEFT JOIN categories ON categories.id = products.category_id
    WHERE NOT EXISTS (
      SELECT 1 FROM product_variants
      WHERE product_variants.product_id = products.id AND product_variants.is_active = 1
    )
  `).all<{
    id: number
    name: string
    image: string
    stock: number
    is_active: number
    category_name: string | null
    variant_id?: number
    variant_sku?: string
  }>()
  const { results: variants } = await c.env.DB.prepare(`
    SELECT product_variants.id, products.id AS product_id,
      products.name || ' · ' || product_variants.weight_g || ' g' ||
        CASE WHEN product_variants.flavor = '' THEN '' ELSE ' · ' || product_variants.flavor END AS name,
      products.image, product_variants.stock, product_variants.is_active,
      categories.name AS category_name, product_variants.id AS variant_id,
      product_variants.sku AS variant_sku
    FROM product_variants
    JOIN products ON products.id = product_variants.product_id
    LEFT JOIN categories ON categories.id = products.category_id
  `).all<{
    id: number
    product_id: number
    name: string
    image: string
    stock: number
    is_active: number
    category_name: string | null
    variant_id: number
    variant_sku: string
  }>()
  return c.json([...products, ...variants].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, 'vi')))
})

app.put('/admin/inventory/variants/:id', async (c) => {
  const id = Number(c.req.param('id'))
  let body: { stock?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu tồn kho không hợp lệ.' }, 400) }
  if (!Number.isSafeInteger(id) || id < 1 || typeof body.stock !== 'number' ||
      !Number.isSafeInteger(body.stock) || body.stock < 0) {
    return c.json({ error: 'Số lượng tồn kho phải là số nguyên không âm.' }, 400)
  }
  const result = await c.env.DB.prepare(
    'UPDATE product_variants SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).bind(body.stock, id).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy quy cách sản phẩm.' }, 404)
  return c.json({ message: 'Đã cập nhật tồn kho quy cách.' })
})

app.put('/admin/inventory/:id', async (c) => {
  const id = Number(c.req.param('id'))
  let body: { stock?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu tồn kho không hợp lệ.' }, 400) }
  if (!Number.isSafeInteger(id) || id < 1 || typeof body.stock !== 'number' ||
      !Number.isSafeInteger(body.stock) || body.stock < 0) {
    return c.json({ error: 'Số lượng tồn kho phải là số nguyên không âm.' }, 400)
  }
  const result = await c.env.DB.prepare(
    'UPDATE products SET stock = ? WHERE id = ?',
  ).bind(body.stock, id).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy sản phẩm.' }, 404)
  return c.json({ message: 'Đã cập nhật tồn kho.' })
})

app.get('/admin/payments', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT payments.*, orders.customer_name, orders.phone, orders.order_status
    FROM payments JOIN orders ON orders.id = payments.order_id
    ORDER BY payments.created_at DESC LIMIT 200
  `).all()
  return c.json(results)
})

app.patch('/admin/payments/:id', async (c) => {
  let body: { status?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu thanh toán không hợp lệ.' }, 400) }
  if (body.status !== 'PENDING' && body.status !== 'PAID_DEMO') {
    return c.json({ error: 'Trạng thái thanh toán không hợp lệ.' }, 400)
  }
  const existing = await c.env.DB.prepare(
    'SELECT order_id FROM payments WHERE id = ?',
  ).bind(c.req.param('id')).first<{ order_id: string }>()
  if (!existing) return c.json({ error: 'Không tìm thấy thanh toán.' }, 404)
  const paidAt = body.status === 'PAID_DEMO' ? new Date().toISOString() : null
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE payments SET status = ?, paid_at = ? WHERE id = ?')
      .bind(body.status, paidAt, c.req.param('id')),
    c.env.DB.prepare('UPDATE orders SET payment_status = ? WHERE id = ?')
      .bind(body.status, existing.order_id),
  ])
  return c.json({ message: 'Đã cập nhật trạng thái thanh toán mô phỏng.' })
})

app.get('/admin/promotions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM promotions ORDER BY created_at DESC',
  ).all()
  return c.json(results)
})

app.post('/admin/promotions', async (c) => {
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu khuyến mãi không hợp lệ.' }, 400) }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const type = body.discount_type
  const value = body.discount_value
  const minimum = body.min_order_amount
  const maximum = body.max_discount_amount
  const limit = body.usage_limit
  const perUser = body.per_user_limit
  const starts = typeof body.starts_at === 'string' ? body.starts_at : ''
  const ends = typeof body.ends_at === 'string' ? body.ends_at : ''
  if (!/^[A-Z0-9_-]{3,30}$/.test(code) || !name || name.length > 150 ||
      description.length > 1000 || (type !== 'PERCENT' && type !== 'FIXED') ||
      typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 ||
      (type === 'PERCENT' && value > 100) ||
      typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 0 ||
      (maximum !== null && (typeof maximum !== 'number' || !Number.isSafeInteger(maximum) || maximum < 0)) ||
      (limit !== null && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1)) ||
      typeof perUser !== 'number' || !Number.isSafeInteger(perUser) || perUser < 1 ||
      !Number.isFinite(Date.parse(starts)) || !Number.isFinite(Date.parse(ends)) ||
      Date.parse(ends) <= Date.parse(starts)) {
    return c.json({ error: 'Thông tin khuyến mãi không hợp lệ.' }, 400)
  }
  const result = await c.env.DB.prepare(`
    INSERT INTO promotions (
      code, name, description, discount_type, discount_value, min_order_amount,
      max_discount_amount, usage_limit, per_user_limit, starts_at, ends_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO NOTHING
  `).bind(code, name, description, type, value, minimum, maximum, limit, perUser,
    new Date(starts).toISOString(), new Date(ends).toISOString(),
    body.is_active === 0 ? 0 : 1).run()
  if (!result.meta.changes) return c.json({ error: 'Mã khuyến mãi đã tồn tại.' }, 409)
  return c.json({ id: result.meta.last_row_id }, 201)
})

app.put('/admin/promotions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu khuyến mãi không hợp lệ.' }, 400) }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const type = body.discount_type
  const value = body.discount_value
  const minimum = body.min_order_amount
  const maximum = body.max_discount_amount
  const limit = body.usage_limit
  const perUser = body.per_user_limit
  const starts = typeof body.starts_at === 'string' ? body.starts_at : ''
  const ends = typeof body.ends_at === 'string' ? body.ends_at : ''
  if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z0-9_-]{3,30}$/.test(code) ||
      !name || name.length > 150 || description.length > 1000 ||
      (type !== 'PERCENT' && type !== 'FIXED') ||
      typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 ||
      (type === 'PERCENT' && value > 100) ||
      typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 0 ||
      (maximum !== null && (typeof maximum !== 'number' || !Number.isSafeInteger(maximum) || maximum < 0)) ||
      (limit !== null && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1)) ||
      typeof perUser !== 'number' || !Number.isSafeInteger(perUser) || perUser < 1 ||
      !Number.isFinite(Date.parse(starts)) || !Number.isFinite(Date.parse(ends)) ||
      Date.parse(ends) <= Date.parse(starts) || (body.is_active !== 0 && body.is_active !== 1)) {
    return c.json({ error: 'Thông tin khuyến mãi không hợp lệ.' }, 400)
  }
  const duplicate = await c.env.DB.prepare(
    'SELECT id FROM promotions WHERE code = ? AND id != ?',
  ).bind(code, id).first()
  if (duplicate) return c.json({ error: 'Mã khuyến mãi đã tồn tại.' }, 409)
  const result = await c.env.DB.prepare(`
    UPDATE promotions SET code = ?, name = ?, description = ?, discount_type = ?,
      discount_value = ?, min_order_amount = ?, max_discount_amount = ?,
      usage_limit = ?, per_user_limit = ?, starts_at = ?, ends_at = ?,
      is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(code, name, description, type, value, minimum, maximum, limit, perUser,
    new Date(starts).toISOString(), new Date(ends).toISOString(), body.is_active, id).run()
  if (!result.meta.changes) {
    const exists = await c.env.DB.prepare('SELECT id FROM promotions WHERE id = ?').bind(id).first()
    if (!exists) return c.json({ error: 'Không tìm thấy mã khuyến mãi.' }, 404)
  }
  return c.json({ message: 'Đã cập nhật khuyến mãi.' })
})

app.delete('/admin/promotions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'ID khuyến mãi không hợp lệ.' }, 400)
  const used = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM promotion_usages WHERE promotion_id = ?',
  ).bind(id).first<{ total: number }>()
  if ((used?.total ?? 0) > 0) {
    await c.env.DB.prepare('UPDATE promotions SET is_active = 0 WHERE id = ?').bind(id).run()
    return c.json({ message: 'Mã đã được sử dụng nên được ngừng kích hoạt thay vì xóa.' })
  }
  const result = await c.env.DB.prepare('DELETE FROM promotions WHERE id = ?').bind(id).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy mã khuyến mãi.' }, 404)
  return c.json({ message: 'Đã xóa khuyến mãi.' })
})

app.get('/admin/reviews', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT reviews.*, products.name AS product_name, users.name AS customer_name,
      users.email AS customer_email
    FROM reviews
    JOIN products ON products.id = reviews.product_id
    JOIN users ON users.id = reviews.user_id
    ORDER BY reviews.created_at DESC LIMIT 200
  `).all()
  return c.json(results)
})

app.patch('/admin/reviews/:id', async (c) => {
  const id = Number(c.req.param('id'))
  let body: { is_visible?: unknown; admin_reply?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu đánh giá không hợp lệ.' }, 400) }
  const reply = typeof body.admin_reply === 'string' ? body.admin_reply.trim() : ''
  if (!Number.isSafeInteger(id) || id < 1 ||
      (body.is_visible !== undefined && body.is_visible !== 0 && body.is_visible !== 1) ||
      reply.length > 2000) {
    return c.json({ error: 'Thông tin đánh giá không hợp lệ.' }, 400)
  }
  const existing = await c.env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ?',
  ).bind(id).first()
  if (!existing) return c.json({ error: 'Không tìm thấy đánh giá.' }, 404)
  await c.env.DB.prepare(`
    UPDATE reviews SET
      is_visible = COALESCE(?, is_visible),
      admin_reply = ?,
      replied_at = CASE WHEN ? = '' THEN replied_at ELSE CURRENT_TIMESTAMP END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(body.is_visible ?? null, reply, reply, id).run()
  return c.json({ message: 'Đã cập nhật đánh giá.' })
})

app.get('/admin/settings', async (c) => {
  const settings = await c.env.DB.prepare('SELECT * FROM settings WHERE id = 1').first<Settings>()
  return c.json(settings)
})

app.put('/admin/settings', async (c) => {
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Dữ liệu cài đặt không hợp lệ.' }, 400) }
  const stringFields = [
    'store_name', 'store_description', 'store_logo', 'store_favicon',
    'contact_email', 'contact_phone', 'address', 'primary_color',
    'secondary_color', 'meta_title', 'meta_description', 'og_image',
    'maintenance_message',
  ] as const
  const numberFields = ['free_shipping_threshold', 'cod_fee'] as const
  for (const field of stringFields) {
    if (typeof body[field] !== 'string' || body[field].length > 2000) {
      return c.json({ error: `Cài đặt ${field} không hợp lệ.` }, 400)
    }
  }
  for (const field of numberFields) {
    if (typeof body[field] !== 'number' || !Number.isSafeInteger(body[field]) || (body[field] as number) < 0) {
      return c.json({ error: `Cài đặt ${field} phải là số nguyên không âm.` }, 400)
    }
  }
  if (body.maintenance_mode !== 0 && body.maintenance_mode !== 1) {
    return c.json({ error: 'Chế độ bảo trì không hợp lệ.' }, 400)
  }
  const values = [
    ...stringFields.map((field) => body[field] as string),
    ...numberFields.map((field) => body[field] as number),
    body.maintenance_mode,
  ]
  await c.env.DB.prepare(`
    UPDATE settings SET
      store_name = ?, store_description = ?, store_logo = ?, store_favicon = ?,
      contact_email = ?, contact_phone = ?, address = ?, primary_color = ?,
      secondary_color = ?, meta_title = ?, meta_description = ?, og_image = ?,
      maintenance_message = ?, free_shipping_threshold = ?, cod_fee = ?,
      maintenance_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
  `).bind(...values).run()
  return c.json({ message: 'Đã lưu cài đặt.' })
})

// ==================== END ADMIN MANAGEMENT API ====================

// ==================== ORDERS API ====================

// Tạo đơn hàng từ giỏ hàng hiện tại.
app.post('/orders', async (c) => {
  const user = await getCurrentUser(c)

  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập để đặt hàng.' }, 401)
  }

  const key = cartKey(c)

  if (!key) {
    return c.json({ error: 'Không tìm thấy giỏ hàng.' }, 400)
  }

  let body: {
    customerName?: unknown
    phone?: unknown
    address?: unknown
    paymentMethod?: unknown
    promotionCode?: unknown
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu đơn hàng không hợp lệ.' }, 400)
  }

  const customerName =
    typeof body.customerName === 'string' ? body.customerName.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const address =
    typeof body.address === 'string' ? body.address.trim() : ''
  const paymentMethod = body.paymentMethod
  const promotionCode =
    typeof body.promotionCode === 'string' ? body.promotionCode.trim().toUpperCase() : ''

  if (!customerName || customerName.length > 100) {
    return c.json({ error: 'Vui lòng nhập họ tên hợp lệ.' }, 400)
  }

  if (!/^[0-9+\-\s().]{9,20}$/.test(phone)) {
    return c.json({ error: 'Số điện thoại không hợp lệ.' }, 400)
  }

  if (!address || address.length > 500) {
    return c.json({ error: 'Vui lòng nhập địa chỉ hợp lệ.' }, 400)
  }

  if (
    paymentMethod !== 'COD' &&
    paymentMethod !== 'BANK_TRANSFER_DEMO'
  ) {
    return c.json({ error: 'Phương thức thanh toán không hợp lệ.' }, 400)
  }

  const lines = await readLines(c, key)

  if (!lines.length) {
    return c.json({ error: 'Giỏ hàng đang trống.' }, 400)
  }

  const cart = await hydrate(c, lines)

  if (!cart.items.length || cart.items.length !== lines.length) {
    return c.json(
      { error: 'Một số sản phẩm trong giỏ hàng không còn tồn tại hoặc đã ngừng bán.' },
      400,
    )
  }

  // Kiểm tra tồn kho
  for (const { product, qty } of cart.items) {
    if (product.stock < qty) {
      return c.json(
        { error: `Sản phẩm "${product.name}" chỉ còn ${product.stock} trong kho. Bạn đang đặt ${qty}.` },
        400,
      )
    }
  }

  // Xử lý mã giảm giá
  let discountAmount = 0
  let promotionId: number | null = null
  let promotionUsageId: number | null = null

  if (promotionCode) {
    const now = new Date().toISOString()
    const promo = await c.env.DB
      .prepare(`
        SELECT * FROM promotions
        WHERE code = ? AND is_active = 1
        AND starts_at <= ? AND ends_at >= ?
      `)
      .bind(promotionCode, now, now)
      .first<Promotion>()

    if (!promo) {
      return c.json({ error: 'Mã giảm giá không hợp lệ hoặc đã hết hạn.' }, 400)
    }

    if (promo.usage_limit !== null && promo.usage_count >= promo.usage_limit) {
      return c.json({ error: 'Mã giảm giá đã hết lượt sử dụng.' }, 400)
    }

    if (cart.total < promo.min_order_amount) {
      return c.json(
        { error: `Đơn hàng tối thiểu ${new Intl.NumberFormat('vi-VN').format(promo.min_order_amount)}đ để dùng mã này.` },
        400,
      )
    }

    // Kiểm tra per_user_limit
    const userUsage = await c.env.DB
      .prepare('SELECT COUNT(*) as cnt FROM promotion_usages WHERE promotion_id = ? AND user_id = ?')
      .bind(promo.id, user.id)
      .first<{ cnt: number }>()

    if ((userUsage?.cnt ?? 0) >= promo.per_user_limit) {
      return c.json({ error: 'Bạn đã sử dụng mã này tối đa số lần cho phép.' }, 400)
    }

    // Tính giảm giá
    if (promo.discount_type === 'PERCENT') {
      discountAmount = Math.floor(cart.total * promo.discount_value / 100)
      if (promo.max_discount_amount !== null && discountAmount > promo.max_discount_amount) {
        discountAmount = promo.max_discount_amount
      }
    } else {
      discountAmount = promo.discount_value
    }

    if (discountAmount > cart.total) {
      discountAmount = cart.total
    }

    promotionId = promo.id
  }

  const orderId = crypto.randomUUID()
  const subtotal = cart.total
  const total = subtotal - discountAmount

  const statements = [
    c.env.DB.prepare(`
      INSERT INTO orders (
        id, user_id, customer_name, phone, address,
        subtotal, total, payment_method,
        payment_status, order_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')
    `).bind(
      orderId,
      user.id,
      customerName,
      phone,
      address,
      subtotal,
      total,
      paymentMethod,
    ),

    ...cart.items.map(({ product, qty, variant }) =>
      c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, product_id, product_name,
          unit_price, quantity, line_total, variant_id, variant_sku, variant_label
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        orderId,
        product.id,
        product.name,
        product.price,
        qty,
        product.price * qty,
        variant?.id ?? null,
        variant?.sku ?? '',
        variant
          ? `${variant.weight_g}g${variant.flavor ? ` · ${variant.flavor}` : ''}${variant.packaging ? ` · ${variant.packaging}` : ''}`
          : '',
      ),
    ),

    // Cập nhật tồn kho (trừ stock)
    ...cart.items.map(({ product, qty, variant }) =>
      variant
        ? c.env.DB.prepare(`
          UPDATE product_variants SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(qty, variant.id)
        : c.env.DB.prepare(`
          UPDATE products SET stock = stock - ? WHERE id = ?
        `).bind(qty, product.id),
    ),

    c.env.DB.prepare(`
      INSERT INTO payments (
        order_id, payment_method, amount, status, reference
      ) VALUES (?, ?, ?, 'PENDING', ?)
    `).bind(
      orderId,
      paymentMethod,
      total,
      `DEMO-${orderId}`,
    ),
  ]

  // Thêm ghi nhận sử dụng promotion nếu có
  if (promotionId !== null) {
    statements.push(
      c.env.DB.prepare(`
        UPDATE promotions SET usage_count = usage_count + 1 WHERE id = ?
      `).bind(promotionId),
      c.env.DB.prepare(`
        INSERT INTO promotion_usages (promotion_id, user_id, order_id, discount_amount)
        VALUES (?, ?, ?, ?)
      `).bind(promotionId, user.id, orderId, discountAmount)
    )
  }

  try {
    await c.env.DB.batch(statements)
    await c.env.CART.delete(key)

    return c.json(
      {
        message: 'Đặt hàng thành công.',
        order: {
          id: orderId,
          subtotal,
          total,
          paymentMethod,
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING',
        },
        discountAmount,
        promotionCode: promotionCode || null,
        demoPayment:
          paymentMethod === 'BANK_TRANSFER_DEMO'
            ? {
                reference: `DEMO-${orderId}`,
                message: 'Đây là thanh toán mô phỏng, không chuyển tiền thật.',
              }
            : null,
      },
      201,
    )
  } catch (error) {
    console.error('Create order failed:', error)
    if (error instanceof Error && error.message.toLowerCase().includes('stock')) {
      return c.json({ error: 'Tồn kho vừa thay đổi. Vui lòng kiểm tra giỏ hàng và thử lại.' }, 409)
    }
    return c.json({ error: 'Không thể tạo đơn hàng lúc này.' }, 500)
  }
})

// Validate mã giảm giá (dùng khi nhập mã ở checkout)
app.post('/promotions/validate', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  const key = cartKey(c)
  if (!key) {
    return c.json({ error: 'Không tìm thấy giỏ hàng.' }, 400)
  }

  let body: { code?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu không hợp lệ.' }, 400)
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) {
    return c.json({ error: 'Vui lòng nhập mã giảm giá.' }, 400)
  }

  const lines = await readLines(c, key)
  if (!lines.length) {
    return c.json({ error: 'Giỏ hàng đang trống.' }, 400)
  }

  const cart = await hydrate(c, lines)

  const now = new Date().toISOString()
  const promo = await c.env.DB
    .prepare(`
      SELECT * FROM promotions
      WHERE code = ? AND is_active = 1
      AND starts_at <= ? AND ends_at >= ?
    `)
    .bind(code, now, now)
    .first<Promotion>()

  if (!promo) {
    return c.json({ error: 'Mã giảm giá không hợp lệ hoặc đã hết hạn.' }, 400)
  }

  if (promo.usage_limit !== null && promo.usage_count >= promo.usage_limit) {
    return c.json({ error: 'Mã giảm giá đã hết lượt sử dụng.' }, 400)
  }

  if (cart.total < promo.min_order_amount) {
    return c.json(
      { error: `Đơn hàng tối thiểu ${new Intl.NumberFormat('vi-VN').format(promo.min_order_amount)}đ để dùng mã này.` },
      400,
    )
  }

  const userUsage = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM promotion_usages WHERE promotion_id = ? AND user_id = ?')
    .bind(promo.id, user.id)
    .first<{ cnt: number }>()

  if ((userUsage?.cnt ?? 0) >= promo.per_user_limit) {
    return c.json({ error: 'Bạn đã sử dụng mã này tối đa số lần cho phép.' }, 400)
  }

  let discountAmount = 0
  if (promo.discount_type === 'PERCENT') {
    discountAmount = Math.floor(cart.total * promo.discount_value / 100)
    if (promo.max_discount_amount !== null && discountAmount > promo.max_discount_amount) {
      discountAmount = promo.max_discount_amount
    }
  } else {
    discountAmount = promo.discount_value
  }

  if (discountAmount > cart.total) {
    discountAmount = cart.total
  }

  return c.json({
    valid: true,
    promotion: {
      id: promo.id,
      code: promo.code,
      name: promo.name,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
    },
    discountAmount,
    newTotal: cart.total - discountAmount,
  })
})

// ==================== USER ORDERS API ====================

// Lấy lịch sử đơn hàng của user (có phân trang)
app.get('/orders', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10', 10)))
  const offset = (page - 1) * limit

  const { results } = await c.env.DB
    .prepare(`
      SELECT o.*,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .bind(user.id, limit, offset)
    .all()

  const countResult = await c.env.DB
    .prepare('SELECT COUNT(*) as total FROM orders WHERE user_id = ?')
    .bind(user.id)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  return c.json({
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  })
})

// Lấy chi tiết đơn hàng của user
app.get('/orders/:id', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) {
    return c.json({ error: 'Vui lòng đăng nhập.' }, 401)
  }

  const orderId = c.req.param('id')
  if (!orderId) {
    return c.json({ error: 'ID đơn hàng không hợp lệ.' }, 400)
  }

  const order = await c.env.DB
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .bind(orderId, user.id)
    .first()

  if (!order) {
    return c.json({ error: 'Không tìm thấy đơn hàng.' }, 404)
  }

  const { results: items } = await c.env.DB
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .bind(orderId)
    .all()

  const payment = await c.env.DB
    .prepare('SELECT * FROM payments WHERE order_id = ?')
    .bind(orderId)
    .first()

  return c.json({ order, items, payment })
})

// ==================== AI CHATBOT ====================

// AI chatbot: chỉ tư vấn dựa trên dữ liệu và nghiệp vụ Storez.
app.post('/chat', async (c) => {
  let body: { message?: unknown }

  try {
    body = await c.req.json<{ message?: unknown }>()
  } catch {
    return c.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400)
  }

  if (typeof body.message !== 'string') {
    return c.json({ error: 'Vui lòng nhập câu hỏi.' }, 400)
  }

  const message = body.message.trim()

  if (!message) {
    return c.json({ error: 'Vui lòng nhập câu hỏi.' }, 400)
  }

  if (message.length > 1000) {
    return c.json(
      { error: 'Câu hỏi không được vượt quá 1000 ký tự.' },
      400,
    )
  }

  const normalizeText = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi')
  const lowerMessage = normalizeText(message)
  const healthTerms = /(chua benh|chua tri|dieu tri|phong benh|benh|tieu duong|duong huyet|giam can|dinh duong|vitamin|di ung|bau bi|mang thai|tre so sinh)/i
  if (healthTerms.test(lowerMessage)) {
    return c.json({
      reply: 'Storez **không có thông tin y tế, dinh dưỡng hoặc thành phần đã xác minh** để tư vấn an toàn cho trường hợp này. Vui lòng hỏi chuyên gia phù hợp và kiểm tra nhãn sản phẩm.',
    })
  }
  if (/(an kieng|an chay|it duong|khong duong)/i.test(lowerMessage)) {
    return c.json({
      reply: 'Storez **chưa có dữ liệu thành phần/đường được xác minh** để xác nhận sản phẩm phù hợp với chế độ ăn này. Nếu bạn cho biết loại trái cây, độ giòn/dẻo hoặc mức giá, mình có thể lọc sản phẩm theo đúng các thông tin đang có.',
    })
  }

  const orderIntent = /(don hang|ma don|trang thai don|kiem tra don|don cua toi|lich su mua|lich su don|don hang gan nhat|xem don hang|mua lai don)/i.test(lowerMessage)

  const policyIntent = /(giao hang|van chuyen|ship|doi tra|hoan tien|bao hanh|chinh sach|lien he|dia chi cua hang)/i.test(lowerMessage)
  if (policyIntent) {
    return c.json({
      reply: 'Storez **chưa có thông tin chính sách được xác minh** trong hệ thống. Vui lòng liên hệ cửa hàng để được xác nhận trước khi đặt hàng.',
    })
  }

  try {
    const { results } = await c.env.DB
      .prepare(
        `SELECT products.id, products.name, products.short_description,
          products.description, products.details, products.fruit_type,
          products.drying_method, products.ingredients, products.net_weight_g,
          products.price, products.image, products.stock, products.origin,
          products.responsible_party, products.expiry_info,
          products.storage_instructions, products.data_status,
          products.verification_source,
          categories.name AS category_name
        FROM products
        LEFT JOIN categories ON categories.id = products.category_id
        WHERE products.is_active = 1
          AND EXISTS (
            SELECT 1 FROM categories visible_category
            WHERE visible_category.id = products.category_id
              AND visible_category.is_active = 1
          )
          AND (products.data_status = 'SAMPLE'
            OR (products.data_status = 'VERIFIED' AND length(trim(products.verification_source)) > 0))
        ORDER BY products.id`,
      )
      .all<Pick<
        Product,
        | 'id' | 'name' | 'short_description' | 'description'
        | 'details' | 'fruit_type' | 'drying_method' | 'ingredients'
        | 'net_weight_g' | 'price' | 'image' | 'stock' | 'origin'
        | 'responsible_party' | 'expiry_info' | 'storage_instructions'
        | 'data_status' | 'verification_source'
      > & { category_name: string | null }>()

    if (!results.length) {
      return c.json({
        reply: 'Xin lỗi, **Storez hiện chưa có sản phẩm đang bán** để tư vấn. Bạn có thể quay lại sau khi catalog được cập nhật.',
        recommendations: [],
      })
    }

    const { results: variants } = await c.env.DB.prepare(`
      SELECT product_id, sku, weight_g, flavor, packaging, price, sale_price, stock
      FROM product_variants
      WHERE is_active = 1 AND product_id IN (
        SELECT id FROM products
        WHERE is_active = 1
          AND EXISTS (
            SELECT 1 FROM categories visible_category
            WHERE visible_category.id = products.category_id
              AND visible_category.is_active = 1
          )
          AND (data_status = 'SAMPLE'
            OR (data_status = 'VERIFIED' AND length(trim(verification_source)) > 0))
      )
      ORDER BY weight_g
    `).all<{
      product_id: number
      sku: string
      weight_g: number
      flavor: string
      packaging: string
      price: number
      sale_price: number | null
      stock: number
    }>()
    const variantMap = new Map<number, typeof variants>()
    for (const variant of variants) {
      const list = variantMap.get(variant.product_id) ?? []
      list.push(variant)
      variantMap.set(variant.product_id, list)
    }
    const currency = new Intl.NumberFormat('vi-VN')
    const priceOf = (product: typeof results[number]) => {
      const options = variantMap.get(product.id) ?? []
      return options.length
        ? Math.min(...options.map((variant) => variant.sale_price ?? variant.price))
        : product.price
    }
    const stockOf = (product: typeof results[number]) => {
      const options = variantMap.get(product.id) ?? []
      return options.length
        ? options.reduce((sum, variant) => sum + variant.stock, 0)
        : product.stock
    }
    const parseAmount = (raw: string, unit = '') => {
      const amount = Number(raw.replace(/[.,]/g, ''))
      if (!Number.isSafeInteger(amount) || amount <= 0) return null
      if (unit === 'trieu' || unit === 'tr') return amount * 1_000_000
      if (unit === 'k' || unit === 'nghin') return amount * 1_000
      return amount
    }
    const amountPattern = '(\\d[\\d.,]*)\\s*(trieu|tr|k|nghin)?(?:d|dong)?'
    const rangeMatch = lowerMessage.match(
      new RegExp(`(?:tu\\s*)?${amountPattern}\\s*(?:den|toi)\\s*${amountPattern}`),
    )
    const underMatch = lowerMessage.match(
      new RegExp(`(?:duoi|toi da|khong qua|nho hon|<)\\s*${amountPattern}`),
    )
    const budgetMatch = lowerMessage.match(
      new RegExp(`(?:voi|ngan sach(?: la)?|tam gia|khoang|toi da)\\s*${amountPattern}`),
    )
    const priceRange = rangeMatch
      ? [parseAmount(rangeMatch[1], rangeMatch[2] ?? ''), parseAmount(rangeMatch[3], rangeMatch[4] ?? '')] as const
      : null
    const strictPriceCeiling = Boolean(underMatch && /(duoi|nho hon|<)/i.test(lowerMessage))
    const maxPrice = underMatch
      ? parseAmount(underMatch[1], underMatch[2] ?? '')
      : budgetMatch
        ? parseAmount(budgetMatch[1], budgetMatch[2] ?? '')
        : null
    const hasPriceQuestion = /(gia|khuyen mai|giam gia|duoi|tu .* den|re nhat|dat nhat|ngan sach|voi \d)/i.test(lowerMessage)
    const normalizedQuestion = lowerMessage.replace(/[^a-z0-9]+/g, ' ').trim()
    const includesPhrase = (phrase: string) =>
      (` ${normalizedQuestion} `).includes(` ${phrase.replace(/[^a-z0-9]+/g, ' ').trim()} `)
    const namedProductMentions = results.filter((product) => {
      const name = normalizeText(product.name).replace(/\s*\d+\s*g\b/g, '').trim()
      return name.length >= 4 && includesPhrase(name)
    })
    const productMentions = namedProductMentions.length
      ? namedProductMentions
      : results.filter((product) => {
      const fruit = normalizeText(product.fruit_type || '')
      const fruitPrefix = fruit.split(/\s+/).slice(0, 2).join(' ')
      return Boolean(
        fruit && (includesPhrase(fruit) || (fruitPrefix.length >= 5 && includesPhrase(fruitPrefix))),
      )
    })
    const skuMatchResult = lowerMessage.match(/\bstz-[a-z0-9-]+\b|(?:ma|sku)\s+([a-z0-9-]{6,})/i)
    const skuMatch = skuMatchResult?.[1] ?? skuMatchResult?.[0]
    const skuProduct = skuMatch
      ? results.find((product) =>
        (variantMap.get(product.id) ?? []).some(
          (variant) => variant.sku.toLocaleLowerCase('vi') === skuMatch.toLocaleLowerCase('vi'),
        ),
      )
      : undefined
    const detailQuestion = /(nguyen lieu|thanh phan|khoi luong|trong luong|phuong phap|say bang|xuat xu|san xuat tai|tinh nao|bao quan|han su dung|bao nhieu thang|trach nhiem|chung nhan|organic|huu co|thong tin san pham|thong tin ve phuong phap)/i.test(lowerMessage)
    const stockQuestion = /(ton kho|con hang|het hang|sap het|con bao nhieu|mua \d+|\d+\s*goi|bao nhieu goi|sku|ma san pham)/i.test(lowerMessage)
    const foodCategory = /(rau cu|nam huong|nam say|cu qua)/i.test(lowerMessage)
    const fruitCategory = /(trai cay say|hoa qua say|loai trai cay|trai cay nao)/i.test(lowerMessage)
    const freezeDried = /(say thang hoa|thang hoa)/i.test(lowerMessage)
    const adviceIntent = /(tu van|goi y|gioi thieu|phu hop|nen chon|toi thich|so thich|lam qua|qua tang)/i.test(lowerMessage)
    const listIntent = /(liet ke|co nhung gi|cac san pham|san pham nao|dang ban|hien dang ban)/i.test(lowerMessage)
    const countMatch = lowerMessage.match(/\b(?:mua|them|tang len|len)\s+(\d+)\s*(?:goi|san pham)?\b/)
    const requestedQuantity = countMatch ? Number(countMatch[1]) : null
    const mentionedForDetails = skuProduct ? [skuProduct] : productMentions

    const lineFor = (product: typeof results[number], includeStock = false) => {
      const stock = stockOf(product)
      const facts = [
        product.drying_method ? `phương pháp: ${product.drying_method.replace(/\s*\(đề xuất demo\)\s*/i, '').trim()}` : '',
        product.net_weight_g ? `khối lượng: ${product.net_weight_g} g` : '',
        `giá: ${currency.format(priceOf(product))}đ`,
        includeStock ? `tồn kho: ${stock}` : '',
      ].filter(Boolean)
      return `• **${product.name}** — ${facts.join('; ')}`
    }
    const productResponse = (selected: typeof results, includeStock = false) => {
      const recommendations = selected.map((product) => ({
        id: product.id,
        name: product.name,
        image: product.image,
        price: priceOf(product),
      }))
      return { recommendations, lines: selected.map((product) => lineFor(product, includeStock)) }
    }

    if (/(them|cho vao|bo vao).{0,50}(gio hang)|gio hang.{0,50}(them|tang|xoa)|tang so luong|so luong.{0,20}(len|tang)|xoa.{0,30}(gio hang|san pham)/i.test(lowerMessage)) {
      const user = await getCurrentUser(c)
      if (!user) {
        return c.json({
          reply: 'Vui lòng đăng nhập để thao tác với giỏ hàng. Sau khi đăng nhập, hãy mở sản phẩm và chọn **Thêm vào giỏ**; Storez sẽ kiểm tra tồn kho trước khi thêm.',
          recommendations: productResponse(productMentions).recommendations,
        })
      }
      return c.json({
        reply: 'Bạn có thể thao tác trong giỏ hàng bằng nút **+ / −** để đổi số lượng hoặc **Xóa** để bỏ món. Mình chưa tự thay đổi giỏ khi chưa xác nhận rõ sản phẩm và số lượng.',
        recommendations: productResponse(productMentions).recommendations,
      })
    }

    if (/(gio hang hien tai|gio hang cua toi|tong tien trong gio|gio hang co nhung)/i.test(lowerMessage)) {
      const user = await getCurrentUser(c)
      if (!user) return c.json({ reply: 'Vui lòng đăng nhập để xem giỏ hàng của bạn.' })
      const key = cartKey(c)
      if (!key) return c.json({ reply: 'Chưa thể xác định giỏ hàng trong phiên này. Hãy tải lại trang rồi thử lại.' })
      const cart = await hydrate(c, await readLines(c, key))
      if (!cart.items.length) return c.json({ reply: 'Giỏ hàng của bạn hiện đang trống.' })
      const lines = cart.items.map(({ product, qty, variant }) =>
        `• **${product.name}**${variant ? ` (${variant.weight_g} g)` : ''} × ${qty}: ${currency.format(product.price * qty)}đ`,
      )
      return c.json({ reply: `Giỏ hàng hiện có ${cart.count} sản phẩm:\n${lines.join('\n')}\n**Tổng cộng: ${currency.format(cart.total)}đ.**` })
    }

    if (/(lich su mua|lich su don|don hang gan nhat|don hang cua toi|xem don hang|mua lai don)/i.test(lowerMessage)) {
      const user = await getCurrentUser(c)
      if (!user) return c.json({ reply: 'Vui lòng đăng nhập để xem lịch sử đơn hàng của chính bạn.' })
      const { results: orders } = await c.env.DB.prepare(`
        SELECT id, order_status, payment_status, total, created_at
        FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
      `).bind(user.id).all<{
        id: string; order_status: string; payment_status: string; total: number; created_at: string
      }>()
      if (!orders.length) return c.json({ reply: 'Tài khoản của bạn chưa có đơn hàng nào.' })
      const lines = orders.map((order) =>
        `• **${order.id}** — ${order.order_status}; thanh toán ${order.payment_status}; ${currency.format(order.total)}đ (${order.created_at})`,
      )
      const prefix = /mua lai/i.test(lowerMessage)
        ? 'Bạn có thể mở lại sản phẩm trong danh sách đơn cũ rồi thêm vào giỏ; Storez hiện không có chức năng đặt lại nguyên đơn tự động.'
        : 'Các đơn hàng gần đây trong tài khoản của bạn:'
      return c.json({ reply: `${prefix}\n${lines.join('\n')}` })
    }

    if (/(huy don|doi thong tin nhan|sua dia chi|thay doi thong tin nhan)/i.test(lowerMessage)) {
      return c.json({
        reply: 'Chatbot không thể hủy đơn hoặc sửa địa chỉ nhận hàng. **Storez chưa cung cấp thao tác tự phục vụ này trong chatbot**; vui lòng liên hệ cửa hàng để kiểm tra đơn cụ thể.',
      })
    }

    if (orderIntent) {
      const user = await getCurrentUser(c)
      if (!user) return c.json({ reply: 'Vui lòng đăng nhập để tra cứu đơn hàng của chính bạn.' })
      const orderId = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0]
      const order = orderId
        ? await c.env.DB.prepare(`
          SELECT id, order_status, payment_status, created_at
          FROM orders WHERE id = ? AND user_id = ?
        `).bind(orderId, user.id).first<{
          id: string; order_status: string; payment_status: string; created_at: string
        }>()
        : await c.env.DB.prepare(`
          SELECT id, order_status, payment_status, created_at
          FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
        `).bind(user.id).first<{
          id: string; order_status: string; payment_status: string; created_at: string
        }>()
      if (!order) return c.json({ reply: orderId ? 'Không tìm thấy mã đơn này trong tài khoản của bạn.' : 'Tài khoản của bạn chưa có đơn hàng để tra cứu.' })
      return c.json({
        reply: `Đơn **${order.id}**: trạng thái **${order.order_status}**; thanh toán **${order.payment_status}**; tạo lúc ${order.created_at}.`,
      })
    }

    if (/(huong dan mua|cach mua|dat hang|thanh toan)/i.test(lowerMessage)) {
      const user = await getCurrentUser(c)
      return c.json({
        reply: user
          ? 'Chọn sản phẩm → **Thêm vào giỏ** → mở giỏ hàng → kiểm tra số lượng → tiến hành thanh toán và nhập thông tin nhận hàng.'
          : 'Bạn có thể xem và tìm sản phẩm trước. Để mua: đăng nhập hoặc đăng ký → chọn sản phẩm → **Thêm vào giỏ** → mở giỏ hàng → điền thông tin nhận hàng và xác nhận đơn.',
      })
    }

    if (/(say khac nhau|khac nhau giua|so sanh).*(say deo|say gion|say thang hoa)/i.test(lowerMessage)) {
      return c.json({
        reply: 'Ở mức khái quát: **sấy dẻo** thường giữ kết cấu mềm; **sấy giòn** cho kết cấu giòn; **sấy thăng hoa** làm khô bằng cách đông lạnh rồi loại nước trong môi trường áp suất thấp. Đây là mô tả chung về phương pháp, không khẳng định quy trình cụ thể của từng sản phẩm Storez.',
      })
    }

    if (/(giao hang|van chuyen|ship|doi tra|hoan tien|bao hanh|chinh sach|lien he|dia chi cua hang)/i.test(lowerMessage)) {
      return c.json({
        reply: 'Storez **chưa có thông tin chính sách được xác minh** trong dữ liệu hiện tại. Vui lòng liên hệ cửa hàng để được xác nhận trước khi đặt hàng.',
      })
    }

    const filteredByCategory = foodCategory
      ? results.filter((product) =>
        /rau cu|thap cam/i.test(normalizeText(product.category_name ?? '')) ||
        /rau cu|nam huong|khoai/i.test(normalizeText(product.fruit_type)),
      )
      : fruitCategory
        ? results.filter((product) =>
          /hoa qua/i.test(normalizeText(product.category_name ?? '')),
        )
        : results
    const filteredByMethod = freezeDried
      ? filteredByCategory.filter((product) =>
        /thang hoa/i.test(normalizeText(product.drying_method)),
      )
      : filteredByCategory
    const priceCandidates = foodCategory || fruitCategory || freezeDried
      ? filteredByMethod
      : results

    if (skuMatch && !skuProduct) {
      return c.json({ reply: `Xin lỗi, **không tìm thấy mã ${skuMatch.toUpperCase()}** trong danh mục sản phẩm Storez.` })
    }

    if (stockQuestion) {
      const selected = skuProduct ? [skuProduct] : productMentions
      if (!selected.length) {
        if (requestedQuantity) return c.json({ reply: 'Bạn hãy cho biết tên hoặc mã SKU của sản phẩm để mình kiểm tra số lượng có thể mua.' })
        const outOfStock = results.filter((product) => stockOf(product) <= 0)
        const lowStock = results.filter((product) => stockOf(product) > 0 && stockOf(product) <= 5)
        const requestedState = /(sap het|het hang)/i.test(lowerMessage)
        const matches = requestedState
          ? /(sap het)/i.test(lowerMessage) ? lowStock : outOfStock
          : results
        return c.json({
          reply: matches.length
            ? `Theo tồn kho trong hệ thống:\n${matches.slice(0, 10).map((product) => lineFor(product, true)).join('\n')}`
            : 'Hiện không có sản phẩm nào trong danh mục thuộc trạng thái tồn kho bạn hỏi.',
          recommendations: productResponse(matches).recommendations,
        })
      }
      const lines = selected.map((product) => {
        const stock = stockOf(product)
        if (requestedQuantity) {
          return `• **${product.name}** hiện có ${stock}; ${requestedQuantity <= stock ? `đủ tồn kho để mua ${requestedQuantity} gói theo dữ liệu hệ thống` : `không đủ tồn kho để mua ${requestedQuantity} gói`}.`
        }
        return `• **${product.name}**: ${stock > 0 ? `còn ${stock}` : 'hiện hết hàng'} theo tồn kho hệ thống.`
      })
      return c.json({ reply: lines.join('\n'), recommendations: productResponse(selected).recommendations })
    }

    if (detailQuestion) {
      const selected = mentionedForDetails
      if (!selected.length && /(khong co thong tin.*phuong phap|phuong phap.*khong co thong tin)/i.test(lowerMessage)) {
        const missingMethod = results.filter((product) => !product.drying_method.trim())
        return c.json({
          reply: missingMethod.length
            ? `Sản phẩm chưa có thông tin phương pháp sấy:\n${missingMethod.map((product) => `• **${product.name}**`).join('\n')}`
            : 'Tất cả sản phẩm đang hiển thị đều có ghi phương pháp sấy trong catalog.',
        })
      }
      if (!selected.length && /bao quan/i.test(lowerMessage)) {
        const withInstructions = results.filter((product) => product.storage_instructions.trim())
        return c.json({
          reply: withInstructions.length
            ? `Hướng dẫn bảo quản được ghi trong catalog:\n${withInstructions.map((product) => `• **${product.name}:** ${product.storage_instructions}`).join('\n')}`
            : 'Website chưa cung cấp hướng dẫn bảo quản cụ thể cho sản phẩm. Vui lòng xem nhãn bao bì hoặc hỏi cửa hàng.',
        })
      }
      if (!selected.length) {
        if (/(han su dung|bao nhieu thang)/i.test(lowerMessage)) {
          return c.json({ reply: 'Website chưa cung cấp hạn sử dụng chính xác cho các sản phẩm. Vui lòng kiểm tra nhãn bao bì hoặc hỏi cửa hàng trước khi sử dụng.' })
        }
        return c.json({ reply: 'Bạn muốn hỏi thông tin sản phẩm nào? Hãy gửi tên sản phẩm để mình đối chiếu dữ liệu đang có.' })
      }
      const requestedFields: { label: string; keys: (keyof typeof selected[number])[] }[] = [
        { label: 'nguyên liệu/thành phần', keys: ['ingredients'] },
        { label: 'phương pháp sấy', keys: ['drying_method'] },
        { label: 'khối lượng', keys: ['net_weight_g'] },
        { label: 'xuất xứ', keys: ['origin'] },
        { label: 'đơn vị chịu trách nhiệm', keys: ['responsible_party'] },
        { label: 'hạn sử dụng', keys: ['expiry_info'] },
        { label: 'hướng dẫn bảo quản', keys: ['storage_instructions'] },
      ]
      const fieldsToAnswer = requestedFields.filter((field) =>
        field.keys.some((key) => {
          const label = normalizeText(field.label)
          return lowerMessage.includes(label) ||
            (key === 'net_weight_g' && /(khoi luong|trong luong|bao nhieu gam|bao nhieu g)/i.test(lowerMessage)) ||
            (key === 'drying_method' && /(phuong phap|say bang)/i.test(lowerMessage)) ||
            (key === 'responsible_party' && /trach nhiem|san xuat/i.test(lowerMessage)) ||
            (key === 'expiry_info' && /han su dung|bao nhieu thang/i.test(lowerMessage)) ||
            (key === 'storage_instructions' && /bao quan/i.test(lowerMessage)) ||
            (key === 'ingredients' && /nguyen lieu|thanh phan/i.test(lowerMessage)) ||
            (key === 'origin' && /xuat xu|san xuat tai|tinh nao/i.test(lowerMessage))
        }),
      )
      const lines = selected.map((product) => {
        const facts = fieldsToAnswer.map((field) => {
          const key = field.keys[0]
          const value = product[key]
          const present = typeof value === 'number' ? value > 0 : typeof value === 'string' && value.trim()
          return `• **${field.label}:** ${present ? `${value}${key === 'net_weight_g' ? ' g' : ''}` : 'website chưa cung cấp thông tin này'}`
        })
        const sampleNote = product.data_status === 'SAMPLE'
          ? ' (dữ liệu catalog đang ở trạng thái mẫu, chưa xác minh)'
          : ''
        return `**${product.name}**${sampleNote}\n${facts.join('\n')}`
      })
      if (/(chung nhan|organic|huu co|tac dung|chua benh)/i.test(lowerMessage)) {
        return c.json({
          reply: `Mình không thể xác nhận chứng nhận hoặc công dụng nếu dữ liệu cửa hàng chưa ghi nhận. ${selected.map((product) => `**${product.name}:** ${product.verification_source?.trim() ? product.verification_source : 'chưa có thông tin chứng nhận được xác minh'}.`).join(' ')}`,
        })
      }
      return c.json({ reply: lines.join('\n'), recommendations: productResponse(selected).recommendations })
    }

    if (/(khuyen mai|giam gia)/i.test(lowerMessage)) {
      const discounted = results.filter((product) =>
        (variantMap.get(product.id) ?? []).some(
          (variant) => variant.sale_price !== null && variant.sale_price < variant.price,
        ),
      )
      const { results: promotions } = await c.env.DB.prepare(`
        SELECT code, name, description, discount_type, discount_value,
          min_order_amount, ends_at
        FROM promotions
        WHERE is_active = 1
          AND datetime(starts_at) <= datetime('now')
          AND datetime(ends_at) >= datetime('now')
        ORDER BY ends_at
      `).all<{
        code: string; name: string; description: string; discount_type: string
        discount_value: number; min_order_amount: number; ends_at: string
      }>()
      const discountLines = [
        ...discounted.map((product) => {
          const best = (variantMap.get(product.id) ?? []).find(
            (variant) => variant.sale_price !== null && variant.sale_price < variant.price,
          )
          return `• **${product.name}**: ${currency.format(best?.price ?? product.price)}đ → ${currency.format(best?.sale_price ?? product.price)}đ`
        }),
        ...promotions.map((promo) =>
          `• **${promo.name}** (${promo.code}): ${promo.discount_type === 'PERCENT' ? `giảm ${promo.discount_value}%` : `giảm ${currency.format(promo.discount_value)}đ`}${promo.min_order_amount ? `, đơn tối thiểu ${currency.format(promo.min_order_amount)}đ` : ''}; đến ${promo.ends_at}`,
        ),
      ]
      return c.json({
        reply: discountLines.length
          ? `Thông tin ưu đãi đang hiệu lực theo hệ thống:\n${discountLines.join('\n')}`
          : 'Hiện hệ thống không ghi nhận sản phẩm giảm giá hoặc mã khuyến mãi đang có hiệu lực.',
      })
    }

    if (hasPriceQuestion) {
      const relevantPriceCandidates = productMentions.length ? productMentions : priceCandidates
      const sorted = [...relevantPriceCandidates].sort((a, b) => priceOf(a) - priceOf(b))
      let selected: typeof results
      let intro: string
      if (/(dat nhat|cao nhat|gia cao nhat)/i.test(lowerMessage)) {
        selected = sorted.slice(-1)
        intro = 'Sản phẩm có giá cao nhất theo danh mục hiện tại:'
      } else if (/(re nhat|thap nhat|gia thap nhat)/i.test(lowerMessage)) {
        selected = sorted.slice(0, 1)
        intro = 'Sản phẩm có giá thấp nhất theo danh mục hiện tại:'
      } else if (priceRange?.[0] && priceRange[1]) {
        const [min, max] = priceRange as [number, number]
        selected = relevantPriceCandidates.filter((product) => priceOf(product) >= min && priceOf(product) <= max)
        intro = `Sản phẩm trong khoảng ${currency.format(min)}–${currency.format(max)}đ:`
      } else if (maxPrice) {
        selected = relevantPriceCandidates.filter((product) =>
          strictPriceCeiling ? priceOf(product) < maxPrice : priceOf(product) <= maxPrice,
        )
        intro = `Sản phẩm có giá ${strictPriceCeiling ? 'dưới' : 'không quá'} ${currency.format(maxPrice)}đ:`
      } else {
        selected = sorted
        intro = productMentions.length === 1
          ? `Giá hiện tại của **${productMentions[0].name}**:`
          : productMentions.length
            ? 'Giá các sản phẩm phù hợp với tên bạn hỏi:'
            : 'Giá các sản phẩm trong danh mục hiện tại:'
      }
      const details = productResponse(selected)
      let budgetNote = ''
      if (budgetMatch && maxPrice) {
        budgetNote = `\nTrong ngân sách ${currency.format(maxPrice)}đ, có thể chọn từng sản phẩm trong danh sách trên. Tồn kho hiện tại có thể giới hạn số lượng mua.`
        if (/(nhieu loai|nhieu mon|ket hop|mua nhieu|khac nhau)/i.test(lowerMessage)) {
          const basket: typeof results = []
          let basketTotal = 0
          for (const product of [...priceCandidates].sort((a, b) => priceOf(a) - priceOf(b))) {
            if (stockOf(product) <= 0 || basketTotal + priceOf(product) > maxPrice) continue
            basket.push(product)
            basketTotal += priceOf(product)
          }
          if (basket.length) {
            budgetNote += `\nMột cách kết hợp nhiều loại còn hàng theo tồn kho hiện tại: ${basket.map((product) => product.name).join(', ')} — tổng ${currency.format(basketTotal)}đ.`
          } else {
            budgetNote += '\nChưa thể đề xuất giỏ gồm nhiều loại vì hiện không có đủ sản phẩm có tồn kho dương trong danh mục.'
          }
        }
      }
      return c.json({
        reply: selected.length
          ? `${intro}\n${details.lines.join('\n')}${budgetNote}`
          : 'Xin lỗi, hiện không có sản phẩm khớp khoảng giá bạn nêu.',
        recommendations: details.recommendations,
      })
    }

    if (detailQuestion && !mentionedForDetails.length) {
      return c.json({ reply: 'Website chưa cung cấp thông tin để kết luận. Hãy cho mình biết tên sản phẩm cụ thể để kiểm tra từng mục.' })
    }

    if (foodCategory || fruitCategory || freezeDried) {
      const selected = filteredByMethod
      if (!selected.length) return c.json({ reply: 'Xin lỗi, hiện chưa có sản phẩm phù hợp trong danh mục Storez.' })
      const requestedCountMatch = lowerMessage.match(/\b(\d+)\s+(?:san pham|mon|loai)\b/i)
      const requestedCount = requestedCountMatch ? Number(requestedCountMatch[1]) : selected.length
      const details = productResponse(selected.slice(0, requestedCount))
      const label = foodCategory ? 'rau củ sấy' : freezeDried ? 'sấy thăng hoa' : 'trái cây sấy'
      return c.json({ reply: `Theo danh mục sản phẩm hiện tại, Storez có các món ${label}:\n${details.lines.join('\n')}`, recommendations: details.recommendations })
    }

    if (productMentions.length) {
      const details = productResponse(productMentions)
      return c.json({ reply: `Mình tìm thấy trong danh mục Storez:\n${details.lines.join('\n')}`, recommendations: details.recommendations })
    }

    if (adviceIntent || listIntent || /san pham|trai cay|hoa qua|say|an vat/i.test(lowerMessage)) {
      const requestedCountMatch = lowerMessage.match(/\b(\d+)\s+(?:san pham|mon|loai)\b/i)
      const requestedCount = requestedCountMatch ? Number(requestedCountMatch[1]) : results.length
      const candidates = foodCategory || fruitCategory || freezeDried ? filteredByMethod : results
      const selected = [...candidates]
        .sort((a, b) => Number(stockOf(b) > 0) - Number(stockOf(a) > 0) || priceOf(a) - priceOf(b))
        .slice(0, requestedCount)
      const details = productResponse(selected)
      const tasteIntent = /(vi ngot|ngot tu nhien|vi chua|huong vi)/i.test(lowerMessage)
      const prefix = tasteIntent
        ? 'Dữ liệu Storez chưa xác nhận hương vị cụ thể nên mình không thể kết luận món nào ngọt tự nhiên. Đây là các sản phẩm hiện có để bạn tham khảo:'
        : 'Dựa trên danh mục thực tế Storez hiện có:'
      return c.json({ reply: `${prefix}\n${details.lines.join('\n')}`, recommendations: details.recommendations })
    }

    const unrecognizedProduct = lowerMessage.match(/(?:co ban|ban|co)\s+(.+?)(?:\s+khong|\?|$)/i)?.[1]?.trim()
    if (unrecognizedProduct && /(kho|say|thit|bo|ga|ca|san pham)/i.test(unrecognizedProduct)) {
      return c.json({
        reply: `Xin lỗi, mình không tìm thấy **${unrecognizedProduct}** trong danh mục sản phẩm Storez. Mình sẽ không tự tạo thông tin sản phẩm không có thật; bạn có thể hỏi về các sản phẩm đang hiển thị trên trang.`,
      })
    }

    return c.json({
      reply: 'Mình chưa tìm thấy thông tin được cung cấp để trả lời chắc chắn. Bạn có thể hỏi tên sản phẩm, giá, phương pháp sấy, khối lượng, tồn kho hoặc đơn hàng của chính mình.',
    })
  } catch (error) {
    console.error('Chat endpoint failed:', error)

    return c.json(
      { error: 'Không thể xử lý câu hỏi lúc này. Vui lòng thử lại.' },
      500,
    )
  }
})

export default app

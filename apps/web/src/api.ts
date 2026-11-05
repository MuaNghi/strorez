export type Product = {
  id: number
  name: string
  description: string
  price: number
  image: string
  category_id?: number | null
  category_name?: string | null
  stock?: number
  is_active?: number
  short_description?: string
  details?: string
  fruit_type?: string
  drying_method?: string
  ingredients?: string
  net_weight_g?: number | null
  origin?: string
  responsible_party?: string
  packaging?: string
  produced_on?: string | null
  expiry_info?: string
  storage_instructions?: string
  data_status?: 'SAMPLE' | 'VERIFIED'
  verification_source?: string
  is_featured?: number
  variants?: ProductVariant[]
}

export type ProductVariant = {
  id?: number
  product_id?: number
  sku: string
  weight_g: number
  flavor: string
  packaging: string
  price: number
  sale_price: number | null
  stock: number
  is_active?: number
}

export type Category = {
  id: number
  name: string
  description: string
  image: string
  is_active: number
  sort_order: number
}

type ProductListResponse = {
  data: Product[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

export type Cart = {
  items: { product: Product; qty: number; variant: ProductVariant | null }[]
  total: number
  count: number
}

export type User = {
  id: number
  name: string
  email: string
  created_at: string
  role: 'ADMIN' | 'CUSTOMER'
}

export type AuthResponse = {
  message: string
  user?: User
}

export type CreateOrderInput = {
  customerName: string
  phone: string
  address: string
  paymentMethod: 'COD' | 'BANK_TRANSFER_DEMO'
}

export type CreateOrderResponse = {
  message: string
  order: {
    id: string
    subtotal: number
    total: number
    paymentMethod: 'COD' | 'BANK_TRANSFER_DEMO'
    paymentStatus: 'PENDING'
    orderStatus: 'PENDING'
  }
  demoPayment: {
    reference: string
    message: string
  } | null
}

export type ProductInput = {
  name: string
  description: string
  price: number
  image: string
  category_id?: number | null
  stock?: number
  is_active?: number
  short_description?: string
  details?: string
  fruit_type?: string
  drying_method?: string
  ingredients?: string
  net_weight_g?: number | null
  origin?: string
  responsible_party?: string
  packaging?: string
  produced_on?: string | null
  expiry_info?: string
  storage_instructions?: string
  data_status?: 'SAMPLE' | 'VERIFIED'
  verification_source?: string
  is_featured?: number
}

export type UploadImageResponse = {
  url: string
  fileId: string
  name: string
}

export type AdminCategory = {
  id: number
  name: string
  description: string
  image: string
  is_active: number
  sort_order: number
  product_count: number
}

export type AdminPromotion = {
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
}

export type AdminSettings = {
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

export type AdminOrder = {
  id: string
  customer_name: string
  email: string
  phone: string
  address: string
  subtotal: number
  total: number
  payment_method: 'COD' | 'BANK_TRANSFER_DEMO'
  payment_status: 'PENDING' | 'PAID_DEMO'
  order_status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  item_count: number
  created_at: string
}

export type AdminSummary = {
  products: number
  orders: number
  customers: number
  revenue: number
  lowStock: number
  recentOrders: Pick<AdminOrder, 'id' | 'customer_name' | 'total' | 'order_status' | 'payment_status' | 'created_at'>[]
}

export type AdminCustomer = {
  id: number
  name: string
  email: string
  created_at: string
  order_count: number
  total_spent: number
}

export type AdminInventoryItem = {
  id: number
  product_id?: number
  variant_id?: number
  variant_sku?: string
  name: string
  image: string
  stock: number
  is_active: number
  category_name: string | null
}

export type AdminPayment = {
  id: number
  order_id: string
  payment_method: 'COD' | 'BANK_TRANSFER_DEMO'
  amount: number
  status: 'PENDING' | 'PAID_DEMO'
  reference: string | null
  created_at: string
  paid_at: string | null
  customer_name: string
  phone: string
  order_status: string
}

export type AdminReview = {
  id: number
  product_name: string
  customer_name: string
  customer_email: string
  rating: number
  title: string
  content: string
  is_visible: number
  admin_reply: string | null
  created_at: string
}

const cartId = (() => {
  try {
    let id = localStorage.getItem('cart-id')

    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('cart-id', id)
    }

    return id
  } catch {
    return crypto.randomUUID()
  }
})()

async function req<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-cart-id': cartId,
      ...init.headers,
    },
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(
      data?.error || `${res.status} ${res.statusText}`,
    )
  }

  return data as T
}

async function uploadRequest<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'x-cart-id': cartId,
    },
    body: formData,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(
      data?.error || `${res.status} ${res.statusText}`,
    )
  }

  return data as T
}

export const api = {
  // Sản phẩm
  products: async (filters: Record<string, string> = {}) => {
    const params = new URLSearchParams(filters)
    return req<ProductListResponse>(`/products?${params}`)
  },
  product: (id: number) => req<Product>(`/products/${id}`),
  categories: () => req<Category[]>('/categories'),

  // Giỏ hàng
  cart: () =>
    req<Cart>('/cart'),

  add: (productId: number, variantId?: number) =>
    req<Cart>('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, ...(variantId !== undefined ? { variantId } : {}) }),
    }),

  setQty: (productId: number, qty: number, variantId?: number) =>
    req<Cart>(`/cart/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ qty, ...(variantId !== undefined ? { variantId } : {}) }),
    }),

  clear: () =>
    req<Cart>('/cart', {
      method: 'DELETE',
    }),

  // Đăng ký tài khoản
  register: (
    name: string,
    email: string,
    password: string,
  ) =>
    req<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    }),

  // Đăng nhập
  login: (
    email: string,
    password: string,
  ) =>
    req<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    }),

  // Kiểm tra người dùng đang đăng nhập
  me: () =>
    req<{ user: User }>('/auth/me'),

  // Đăng xuất
  logout: () =>
    req<AuthResponse>('/auth/logout', {
      method: 'POST',
    }),

  // Tạo đơn hàng
  createOrder: (input: CreateOrderInput) =>
    req<CreateOrderResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // ============================
  // ADMIN - QUẢN LÝ SẢN PHẨM
  // ============================

  // Lấy danh sách sản phẩm
  adminProducts: async () =>
    (await req<ProductListResponse>('/admin/products')).data,

  // Thêm sản phẩm
  createProduct: (product: ProductInput) =>
    req<{ message: string; product: Product }>('/admin/products', {
      method: 'POST',
      body: JSON.stringify(product),
    }),

  // Cập nhật sản phẩm
  updateProduct: (
    id: number,
    product: ProductInput,
  ) =>
    req<{ message: string; product: Product }>(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    }),
  updateProductVariants: (id: number, variants: ProductVariant[]) =>
    req<{ message: string }>(`/admin/products/${id}/variants`, {
      method: 'PUT',
      body: JSON.stringify({ variants }),
    }),

  // Xóa sản phẩm
  deleteProduct: (id: number) =>
    req<{ message: string }>(`/admin/products/${id}`, {
      method: 'DELETE',
    }),

  adminSummary: () => req<AdminSummary>('/admin/summary'),
  adminOrders: (search = '', status = '') => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    return req<AdminOrder[]>(`/admin/orders?${params}`)
  },
  updateOrderStatus: (id: string, order_status: AdminOrder['order_status']) =>
    req<{ message: string }>(`/admin/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status }),
    }),
  adminCustomers: (search = '') =>
    req<AdminCustomer[]>(`/admin/customers?${new URLSearchParams({ search })}`),
  deleteCustomer: (id: number) =>
    req<{ message: string }>(`/admin/customers/${id}`, { method: 'DELETE' }),
  adminCategories: () => req<AdminCategory[]>('/admin/categories'),
  createCategory: (data: Omit<AdminCategory, 'id' | 'product_count'>) =>
    req<{ id: number }>('/admin/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: Omit<AdminCategory, 'id' | 'product_count'>) =>
    req<{ message: string }>(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) =>
    req<{ message: string }>(`/admin/categories/${id}`, { method: 'DELETE' }),
  adminInventory: () => req<AdminInventoryItem[]>('/admin/inventory'),
  updateStock: (id: number, stock: number) =>
    req<{ message: string }>(`/admin/inventory/${id}`, { method: 'PUT', body: JSON.stringify({ stock }) }),
  updateVariantStock: (id: number, stock: number) =>
    req<{ message: string }>(`/admin/inventory/variants/${id}`, { method: 'PUT', body: JSON.stringify({ stock }) }),
  adminPayments: () => req<AdminPayment[]>('/admin/payments'),
  updatePaymentStatus: (id: number, status: AdminPayment['status']) =>
    req<{ message: string }>(`/admin/payments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminPromotions: () => req<AdminPromotion[]>('/admin/promotions'),
  createPromotion: (data: Omit<AdminPromotion, 'id' | 'usage_count'>) =>
    req<{ id: number }>('/admin/promotions', { method: 'POST', body: JSON.stringify(data) }),
  updatePromotion: (id: number, data: Omit<AdminPromotion, 'id' | 'usage_count'>) =>
    req<{ message: string }>(`/admin/promotions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePromotion: (id: number) =>
    req<{ message: string }>(`/admin/promotions/${id}`, { method: 'DELETE' }),
  adminReviews: () => req<AdminReview[]>('/admin/reviews'),
  updateReview: (id: number, data: { is_visible?: number; admin_reply: string }) =>
    req<{ message: string }>(`/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminSettings: () => req<AdminSettings>('/admin/settings'),
  updateSettings: (data: AdminSettings) =>
    req<{ message: string }>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // ============================
  // ADMIN - TẢI ẢNH IMAGEKIT
  // ============================

  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return uploadRequest<UploadImageResponse>(
      '/admin/images/upload',
      formData,
    )
  },
}

// ============================
// CHATBOT
// ============================

export type ChatResponse = {
  reply: string
  recommendations?: Pick<Product, 'id' | 'name' | 'image' | 'price'>[]
}

export const chatApi = {
  send: (message: string) =>
    req<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
}

// ============================
// ĐỊNH DẠNG TIỀN VIỆT NAM
// ============================

export const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n)
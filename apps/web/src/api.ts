export type Product = {
  id: number
  name: string
  description: string
  price: number
  image: string
}

export type Cart = {
  items: { product: Product; qty: number }[]
  total: number
  count: number
}

export type User = {
  id: number
  name: string
  email: string
  created_at: string
}

export type AuthResponse = {
  message: string
  user?: User
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

export const api = {
  // Sản phẩm
  products: () => req<Product[]>('/products'),

  // Giỏ hàng
  cart: () => req<Cart>('/cart'),

  add: (productId: number) =>
    req<Cart>('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    }),

  setQty: (productId: number, qty: number) =>
    req<Cart>(`/cart/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ qty }),
    }),

  clear: () =>
    req<Cart>('/cart', {
      method: 'DELETE',
    }),

  // Đăng ký tài khoản
  register: (name: string, email: string, password: string) =>
    req<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  // Đăng nhập
  login: (email: string, password: string) =>
    req<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Kiểm tra người dùng đang đăng nhập
  me: () =>
    req<{ user: User }>('/auth/me'),

  // Đăng xuất
  logout: () =>
    req<AuthResponse>('/auth/logout', {
      method: 'POST',
    }),
}

export type ChatResponse = {
  reply: string
}

export const chatApi = {
  send: (message: string) =>
    req<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
}

export const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n)

import { Hono } from 'hono'

type AuthEnv = {
  Bindings: {
    DB: D1Database
  }
}

type UserRow = {
  id: number
  name: string
  email: string
  password_hash: string
  created_at: string
  role: 'ADMIN' | 'CUSTOMER'
}

export type SessionUser = {
  id: number
  name: string
  email: string
  created_at: string
  role: 'ADMIN' | 'CUSTOMER'
}

const auth = new Hono<AuthEnv>()

const SESSION_SECONDS = 60 * 60 * 24 * 7
const PASSWORD_ITERATIONS = 100000

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new Error('Invalid hexadecimal value')
  }
  return Uint8Array.from(
    hex.match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  )
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return toHex(new Uint8Array(digest))
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  )
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false

  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
    return false
  }

  try {
    const salt = fromHex(parts[2])
    const expected = fromHex(parts[3])
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations,
      },
      key,
      expected.length * 8,
    )
    const actual = new Uint8Array(bits)
    if (actual.length !== expected.length) return false

    let difference = 0
    for (let i = 0; i < actual.length; i++) {
      difference |= actual[i] ^ expected[i]
    }
    return difference === 0
  } catch {
    return false
  }
}

function createToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function getSessionUser(
  token: string,
  db: D1Database,
): Promise<SessionUser | null> {
  const tokenHash = await sha256(token)
  const now = Math.floor(Date.now() / 1000)

  const result = await db.prepare(`
    SELECT users.id, users.name, users.email, users.created_at, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(tokenHash, now).first<SessionUser>()

  return result ?? null
}

auth.post('/register', async (c) => {
  let body: { name?: unknown; email?: unknown; password?: unknown }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (name.length < 2 || name.length > 100) {
    return c.json({ error: 'Họ tên phải từ 2 đến 100 ký tự.' }, 400)
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Email không hợp lệ.' }, 400)
  }
  if (password.length < 8 || new TextEncoder().encode(password).length > 256) {
    return c.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự và không vượt quá 256 byte.' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  ).bind(email).first<{ id: number }>()

  if (existing) {
    return c.json({ error: 'Email này đã được đăng ký.' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const inserted = await c.env.DB.prepare(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
  ).bind(name, email, passwordHash).run()

  if (!inserted.success) {
    return c.json({ error: 'Không thể tạo tài khoản lúc này.' }, 500)
  }

  return c.json({ message: 'Đăng ký thành công. Bạn có thể đăng nhập.' }, 201)
})

auth.post('/login', async (c) => {
  let body: { email?: unknown; password?: unknown }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password || password.length > 256) {
    return c.json({ error: 'Email hoặc mật khẩu không chính xác.' }, 401)
  }

  const user = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash, created_at, role FROM users WHERE email = ?',
  ).bind(email).first<UserRow>()

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Email hoặc mật khẩu không chính xác.' }, 401)
  }

  const token = createToken()
  const tokenHash = await sha256(token)
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS

  await c.env.DB.prepare(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
  ).bind(user.id, tokenHash, expiresAt).run()

  c.header(
    'Set-Cookie',
    `store_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${SESSION_SECONDS}`,
  )

  return c.json({
    message: 'Đăng nhập thành công.',
    user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at, role: user.role },
  })
})

auth.get('/me', async (c) => {
  const cookie = c.req.header('Cookie') ?? ''
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('store_session='))
    ?.slice('store_session='.length)

  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return c.json({ error: 'Bạn chưa đăng nhập.' }, 401)
  }

  const user = await getSessionUser(token, c.env.DB)
  if (!user) return c.json({ error: 'Phiên đăng nhập đã hết hạn.' }, 401)

  return c.json({ user })
})

auth.post('/logout', async (c) => {
  const cookie = c.req.header('Cookie') ?? ''
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('store_session='))
    ?.slice('store_session='.length)

  if (token && /^[0-9a-f]{64}$/i.test(token)) {
    const tokenHash = await sha256(token)
    await c.env.DB.prepare(
      'DELETE FROM sessions WHERE token_hash = ?',
    ).bind(tokenHash).run()
  }

  c.header(
    'Set-Cookie',
    'store_session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0',
  )

  return c.json({ message: 'Đã đăng xuất.' })
})

export default auth


import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  chatApi,
  vnd,
  type Cart,
  type Product,
  type User,
} from './api'

const emptyCart: Cart = { items: [], total: 0, count: 0 }

type Page = 'home' | 'login' | 'register' | 'products' | 'cart'

type ChatMessage = {
  role: 'bot' | 'user'
  text: string
}


function Chatbot({ products }: { products: Product[] }) {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: 'Xin chào! 👋 Tôi là trợ lý AI Storez. Bạn muốn tìm hiểu sản phẩm nào?',
    },
  ])

  const sendMessage = async (message?: string) => {
    const text = (message ?? chatInput).trim()

    if (!text || chatLoading) return

    setChatInput('')

    setChatMessages((previous) => [
      ...previous,
      { role: 'user', text },
    ])

    setChatLoading(true)

    try {
      const response = await chatApi.send(text)

      setChatMessages((previous) => [
        ...previous,
        { role: 'bot', text: response.reply },
      ])
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Không thể kết nối với trợ lý AI. Vui lòng thử lại.'

      setChatMessages((previous) => [
        ...previous,
        { role: 'bot', text: errorMessage },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendMessage()
  }

  return (
    <>
      {chatOpen && (
        <section
          className="chatbot-window"
          role="dialog"
          aria-label="Trợ lý tư vấn Storez"
        >
          <header className="chatbot-header">
            <div>
              <h3>Trợ lý Storez 🛍️</h3>
              <p>Hỗ trợ tư vấn sản phẩm bằng AI</p>
            </div>

            <button
              type="button"
              className="chatbot-close"
              onClick={() => setChatOpen(false)}
              aria-label="Đóng chatbot"
            >
              ×
            </button>
          </header>

          <div className="chatbot-messages" aria-live="polite">
            {chatMessages.map((message, index) => (
              <div
                className={`chatbot-message ${message.role}`}
                key={`${index}-${message.role}`}
              >
                {message.text}
              </div>
            ))}

            {chatLoading && (
              <div className="chatbot-message bot">
                AI đang trả lời...
              </div>
            )}
          </div>

          <div className="chatbot-quick-actions">
            <button
              type="button"
              disabled={chatLoading}
              onClick={() => void sendMessage('Danh sách sản phẩm')}
            >
              🛍️ Sản phẩm
            </button>

            <button
              type="button"
              disabled={chatLoading}
              onClick={() => void sendMessage('Hướng dẫn đặt hàng')}
            >
              🛒 Đặt hàng
            </button>

            <button
              type="button"
              disabled={chatLoading}
              onClick={() => void sendMessage('Chính sách giao hàng')}
            >
              🚚 Giao hàng
            </button>
          </div>

          <form className="chatbot-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Nhập câu hỏi..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              aria-label="Tin nhắn"
              maxLength={1000}
              disabled={chatLoading}
            />

            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
            >
              {chatLoading ? 'Đang gửi...' : 'Gửi'}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="chatbot-launcher"
        onClick={() => setChatOpen((open) => !open)}
        aria-label={chatOpen ? 'Đóng chatbot' : 'Mở chatbot'}
        aria-expanded={chatOpen}
      >
        {chatOpen ? '×' : '💬'}
      </button>
    </>
  )
}



export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Cart>(emptyCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    api.me()
      .then((result) => {
        if (active) {
          setUser(result.user)
          setPage('products')
        }
      })
      .catch(() => {
        if (active) {
          setUser(null)
          setPage('home')
        }
      })
      .finally(() => {
        if (active) setChecking(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setProducts([])
      setCart(emptyCart)
      return
    }

    let active = true

    Promise.all([api.products(), api.cart()])
      .then(([productData, cartData]) => {
        if (active) {
          setProducts(productData)
          setCart(cartData)
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message)
      })

    return () => {
      active = false
    }
  }, [user])

  const goTo = (nextPage: Page) => {
    setError('')
    setMessage('')
    setPassword('')
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const updateCart = (request: Promise<Cart>) => {
    request
      .then(setCart)
      .catch((e: Error) => setError(e.message))
  }

  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (page === 'register') {
        const result = await api.register(name.trim(), email.trim(), password)
        setMessage(result.message || 'Đăng ký thành công. Hãy đăng nhập.')
        setPassword('')
        setPage('login')
      } else {
        const result = await api.login(email.trim(), password)
        const currentUser = result.user
          ? result.user
          : (await api.me()).user

        setUser(currentUser)
        setPassword('')
        setName('')
        setPage('products')
        setMessage('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đã xảy ra lỗi.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    setError('')
    setMessage('')

    try {
      await api.logout()
      setUser(null)
      setCart(emptyCart)
      setProducts([])
      setCartOpen(false)
      setSelectedProduct(null)
      setPage('home')
      setMessage('Bạn đã đăng xuất thành công.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đăng xuất.')
    }
  }

  if (checking) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <p>Đang kiểm tra tài khoản...</p>
      </div>
    )
  }

  if (!user || (page !== 'products' && page !== 'cart')) {
    if (page === 'login' || page === 'register') {
      const registering = page === 'register'

      return (
        <div className="auth-page">
          <header className="public-nav">
            <button className="brand-button" onClick={() => goTo('home')}>
              🛍️ Store
            </button>
            <button className="ghost" onClick={() => goTo('home')}>
              Trang chủ
            </button>
          </header>

          <main className="auth-layout">
            <section className="auth-card">
              <div className="auth-icon">{registering ? '✨' : '👋'}</div>
              <h1>{registering ? 'Tạo tài khoản' : 'Chào mừng trở lại!'}</h1>
              <p className="auth-subtitle">
                {registering
                  ? 'Đăng ký để bắt đầu mua sắm cùng chúng tôi.'
                  : 'Đăng nhập để khám phá các sản phẩm của cửa hàng.'}
              </p>

              {error && <p className="error">{error}</p>}
              {message && <p className="success-message">{message}</p>}

              <form className="auth-form" onSubmit={handleAuth}>
                {registering && (
                  <label className="auth-field">
                    Họ và tên
                    <input
                      type="text"
                      placeholder="Nhập họ và tên"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </label>
                )}

                <label className="auth-field">
                  Email
                  <input
                    type="email"
                    placeholder="ban@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    required
                  />
                </label>

                <label className="auth-field">
                  Mật khẩu
                  <input
                    type="password"
                    placeholder="Ít nhất 8 ký tự"
                    autoComplete={registering ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </label>

                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading
                    ? 'Đang xử lý...'
                    : registering
                      ? 'Đăng ký tài khoản'
                      : 'Đăng nhập'}
                </button>
              </form>

              <p className="auth-switch">
                {registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
                <button
                  className="text-button"
                  onClick={() => goTo(registering ? 'login' : 'register')}
                >
                  {registering ? 'Đăng nhập' : 'Đăng ký ngay'}
                </button>
              </p>
            </section>
          </main>

          <footer className="site-footer">
            © Store — Mua sắm dễ dàng mỗi ngày.
          </footer>
        </div>
      )
    }

    return (
      <div className="home-page">
        <header className="public-nav">
          <button className="brand-button" onClick={() => goTo('home')}>
            🛍️ Store
          </button>
          <nav className="home-nav-actions">
            <button className="ghost" onClick={() => goTo('login')}>
              Đăng nhập
            </button>
            <button onClick={() => goTo('register')}>Đăng ký</button>
          </nav>
        </header>

        <main className="hero">
          <div className="hero-copy">
            <span className="hero-tag">CHÀO MỪNG BẠN ĐẾN VỚI STORE</span>
            <h1>
              Mua sắm dễ dàng,
              <br />
              <span>niềm vui mỗi ngày.</span>
            </h1>
            <p>
              Khám phá các sản phẩm yêu thích, lựa chọn những món đồ phù hợp
              và tận hưởng trải nghiệm mua sắm đơn giản tại cửa hàng của chúng tôi.
            </p>
            <div className="hero-actions">
              <button className="hero-primary" onClick={() => goTo('register')}>
                Bắt đầu mua sắm <span>→</span>
              </button>
              <button className="ghost" onClick={() => goTo('login')}>
                Tôi đã có tài khoản
              </button>
            </div>
            <div className="hero-benefits">
              <span>✓ Dễ dàng sử dụng</span>
              <span>✓ Giỏ hàng tiện lợi</span>
            </div>
          </div>

          <div className="hero-art" aria-label="Minh họa mua sắm">
            <div className="art-circle" />
            <div className="art-card art-card-top">
              <span>✨</span>
              <div>
                <strong>Khám phá</strong>
                <small>Sản phẩm dành cho bạn</small>
              </div>
            </div>
            <div className="shopping-illustration">
              <div className="shopping-bag">
                <div className="bag-handle" />
                <span>STORE</span>
              </div>
              <div className="art-star">✦</div>
              <div className="art-dot">•</div>
            </div>
            <div className="art-card art-card-bottom">
              <span>🛒</span>
              <div>
                <strong>Sẵn sàng mua sắm?</strong>
                <small>Đăng nhập để tiếp tục</small>
              </div>
            </div>
          </div>
        </main>

        <section className="home-features">
          <article>
            <span>🛍️</span>
            <h3>Sản phẩm đa dạng</h3>
            <p>Khám phá danh mục sản phẩm ngay sau khi đăng nhập.</p>
          </article>
          <article>
            <span>🔐</span>
            <h3>Tài khoản riêng</h3>
            <p>Đăng ký và đăng nhập để sử dụng cửa hàng.</p>
          </article>
          <article>
            <span>🛒</span>
            <h3>Giỏ hàng tiện lợi</h3>
            <p>Thêm sản phẩm và quản lý số lượng dễ dàng.</p>
          </article>
        </section>

        {message && <p className="home-notice">{message}</p>}
        <footer className="site-footer">
          © Store — Mua sắm dễ dàng mỗi ngày.
        </footer>
        
        <Chatbot products={products} />
      </div>
    )
  }

  if (page === 'cart') {
    return (
      <>
        <header className="topbar">
          <button className="brand-button" onClick={() => goTo('products')}>
            🛍️ Store
          </button>
          <div className="product-header-actions">
            <button className="ghost" onClick={() => goTo('products')}>
              ← Tiếp tục mua sắm
            </button>
            <button className="ghost" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="cart-page">
          <div className="products-heading">
            <div>
              <p className="products-eyebrow">YOUR SHOPPING CART</p>
              <h2>Giỏ hàng của tôi</h2>
              <p>Kiểm tra sản phẩm và số lượng trước khi thanh toán.</p>
            </div>
            <span className="product-count">{cart.count} sản phẩm</span>
          </div>

          {error && <p className="error">Lỗi: {error}</p>}

          {cart.items.length === 0 ? (
            <section className="cart-empty">
              <div>🛒</div>
              <h3>Giỏ hàng đang trống</h3>
              <p>Hãy chọn sản phẩm bạn yêu thích để bắt đầu mua sắm.</p>
              <button onClick={() => goTo('products')}>
                Khám phá sản phẩm
              </button>
            </section>
          ) : (
            <div className="cart-layout">
              <section className="cart-items">
                {cart.items.map(({ product: p, qty }) => (
                  <article className="cart-item" key={p.id}>
                    <img src={p.image} alt={p.name} />

                    <div className="cart-item-info">
                      <h3>{p.name}</h3>
                      <p>{vnd(p.price)}</p>
                      <div className="qty">
                        <button
                          disabled={qty <= 1}
                          onClick={() => updateCart(api.setQty(p.id, qty - 1))}
                        >
                          −
                        </button>
                        <span>{qty}</span>
                        <button
                          onClick={() => updateCart(api.setQty(p.id, qty + 1))}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="cart-item-total">
                      <strong>{vnd(p.price * qty)}</strong>
                      <button
                        className="text-button"
                        onClick={() => updateCart(api.setQty(p.id, 0))}
                      >
                        Xóa
                      </button>
                    </div>
                  </article>
                ))}
              </section>

              <aside className="cart-summary">
                <h3>Tóm tắt đơn hàng</h3>
                <div className="cart-summary-row">
                  <span>Số lượng sản phẩm</span>
                  <strong>{cart.count}</strong>
                </div>
                <div className="cart-summary-row">
                  <span>Tạm tính</span>
                  <strong>{vnd(cart.total)}</strong>
                </div>
                <div className="cart-summary-total">
                  <span>Tổng thanh toán</span>
                  <strong>{vnd(cart.total)}</strong>
                </div>

                <button
                  className="cart-checkout"
                  disabled={!cart.count}
                  onClick={() => alert('Demo: chức năng thanh toán chưa được triển khai.')}
                >
                  Tiến hành thanh toán
                </button>
                <button
                  className="cart-clear"
                  disabled={!cart.count}
                  onClick={() => updateCart(api.clear())}
                >
                  Xóa toàn bộ giỏ hàng
                </button>
              </aside>
            </div>
          )}
        </main>
        <Chatbot products={products} />
      </>
    )
  }

  return (
    <>
      <header className="topbar">
        <button className="brand-button" onClick={() => goTo('products')}>
          🛍️ Store
        </button>
        <div className="product-header-actions">
          <span className="welcome-user">Xin chào, {user.name}</span>
          <button className="ghost" onClick={handleLogout}>
            Đăng xuất
          </button>
          <button
            className="cart-btn"
            onClick={() => goTo('cart')}
            aria-label="Mở trang giỏ hàng"
          >
            🛒
            {cart.count > 0 && <span className="badge">{cart.count}</span>}
          </button>
        </div>
      </header>

      <main>
        {error && <p className="error">Lỗi: {error}</p>}

        <div className="products-heading">
          <div>
            <p className="products-eyebrow">STORE COLLECTION</p>
            <h2>Khám phá sản phẩm</h2>
            <p>Chọn những sản phẩm phù hợp với bạn.</p>
          </div>
          <span className="product-count">{products.length} sản phẩm</span>
        </div>

        <div className="grid">
          {products.map((p) => (
            <article className="card" key={p.id}>
              <img src={p.image} alt={p.name} loading="lazy" />
              <div className="card-body">
                <h2>{p.name}</h2>
                <div className="card-foot">
                  <strong>{vnd(p.price)}</strong>
                  <div className="product-actions">
                    <button
                      className="detail-btn"
                      onClick={() => setSelectedProduct(p)}
                    >
                      Xem chi tiết
                    </button>
                    <button onClick={() => updateCart(api.add(p.id))}>
                      Thêm vào giỏ
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {products.length === 0 && !error && (
          <p className="empty">Đang tải sản phẩm hoặc chưa có sản phẩm.</p>
        )}
      </main>

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedProduct(null)}
            >
              ✕
            </button>
            <img
              className="detail-image"
              src={selectedProduct.image}
              alt={selectedProduct.name}
            />
            <div className="detail-content">
              <h2>{selectedProduct.name}</h2>
              <p className="detail-price">{vnd(selectedProduct.price)}</p>
              <h3>Mô tả sản phẩm</h3>
              <p className="detail-description">
                {selectedProduct.description || 'Chưa có mô tả cho sản phẩm này.'}
              </p>
              <button
                className="detail-add"
                onClick={() => updateCart(api.add(selectedProduct.id))}
              >
                Thêm vào giỏ hàng
              </button>
            </div>
          </section>
        </div>
      )}

      <Chatbot products={products} />
    </>
  )
}

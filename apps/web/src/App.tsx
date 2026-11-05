import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  api,
  chatApi,
  vnd,
  type Cart,
  type Product,
  type User,
  type CreateOrderResponse,
} from './api'
import ProductsPage from './pages/admin/ProductsPage'
import AdminManagementPage from './pages/admin/AdminManagementPage'
import AdminLayout from './components/admin/AdminLayout'
import type { AdminMenu } from './components/admin/AdminLayout'

const emptyCart: Cart = { items: [], total: 0, count: 0 }

function productDescription(product: Product): string {
  const savedDescription = [
    product.short_description,
    product.description,
    product.details,
  ].find((description) => description?.trim())
  if (savedDescription) return savedDescription

  const name = product.fruit_type?.trim() || product.name
  const method = product.drying_method
    ?.replace(/\s*\(đề xuất demo\)\s*/i, '')
    .trim()
    .toLocaleLowerCase('vi')
  const productLabel = method ? `${name} ${method}` : name
  const weight = product.net_weight_g ? `, quy cách ${product.net_weight_g} g` : ''
  return `${productLabel}${weight}.`
}

type Page =
  | 'home'
  | 'login'
  | 'register'
  | 'products'
  | 'cart'
  | 'checkout'
  | 'admin'

type ChatMessage = {
  role: 'bot' | 'user'
  text: string
  recommendations?: { id: number; name: string; image: string; price: number }[]
}

type PendingAuthAction =
  | { type: 'addToCart'; productId: number; variantId?: number }
  | { type: 'navigate'; page: 'cart' | 'checkout' }

function renderChatText(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  )
}

// ==================== CHATBOT ====================

function Chatbot({ onSelectProduct }: { onSelectProduct: (id: number) => void }) {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: 'Xin chào! Tôi là trợ lý Storez. Tôi chỉ tư vấn theo sản phẩm đang có trong cửa hàng và thông tin đã được cung cấp.',
    },
  ])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages, chatLoading])

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
        { role: 'bot', text: response.reply, recommendations: response.recommendations },
      ])
    } catch (error) {
      setChatMessages((previous) => [
        ...previous,
        {
          role: 'bot',
          text:
            error instanceof Error
              ? error.message
              : 'Không thể kết nối với trợ lý AI.',
        },
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
              <h3>TRỢ LÝ STOREZ</h3>
              <p>Tư vấn theo sản phẩm đang có trong cửa hàng</p>
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
                {renderChatText(message.text)}
                {message.recommendations?.map((product) => (
                  <button
                    className="chatbot-product"
                    key={product.id}
                    type="button"
                    onClick={() => onSelectProduct(product.id)}
                  >
                    <img src={product.image} alt="" />
                    <span>{product.name}</span>
                    <strong>{vnd(product.price)}</strong>
                  </button>
                ))}
              </div>
            ))}

            {chatLoading && (
              <div className="chatbot-message bot">
                AI đang trả lời...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-quick-actions">
            <button
              type="button"
              disabled={chatLoading}
              onClick={() => void sendMessage('Liệt kê các sản phẩm đang có')}
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

// ==================== ADMIN DASHBOARD ====================

// ==================== APP ====================

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [adminMenu, setAdminMenu] = useState<AdminMenu>('dashboard')
  const [pendingAuthAction, setPendingAuthAction] =
    useState<PendingAuthAction | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogTotalPages, setCatalogTotalPages] = useState(1)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogSort, setCatalogSort] = useState('id_asc')
  const [catalogPage, setCatalogPage] = useState(1)
  const [cart, setCart] = useState<Cart>(emptyCart)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null)
  const selectedVariant = selectedProduct?.variants?.find(
    (variant) => variant.id === selectedVariantId,
  )

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<
    'COD' | 'BANK_TRANSFER_DEMO'
  >('COD')

  const [orderLoading, setOrderLoading] = useState(false)
  const [orderResult, setOrderResult] =
    useState<CreateOrderResponse | null>(null)

  const [productsLoading, setProductsLoading] = useState(false)
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
      setCart(emptyCart)
      return
    }

    let active = true
    void api.cart()
      .then((cartData) => {
        if (active) setCart(cartData)
      })
      .catch((e: Error) => {
        if (active) setError(e.message)
      })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    let active = true
    setProductsLoading(true)
    const filters = {
      search: catalogSearch,
      sort: catalogSort,
      page: String(catalogPage),
      limit: '20',
    }
    void api.products(filters)
      .then((listing) => {
        if (!active) return
        setProducts(listing.data)
        setCatalogTotal(listing.pagination.total)
        setCatalogTotalPages(listing.pagination.totalPages)
      })
      .catch((e: Error) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setProductsLoading(false)
      })
    return () => {
      active = false
    }
  }, [
    user,
    catalogSearch,
    catalogSort,
    catalogPage,
  ])

  const goTo = (nextPage: Page) => {
    if (!user && (nextPage === 'cart' || nextPage === 'checkout')) {
      setPendingAuthAction({ type: 'navigate', page: nextPage })
      setError('')
      setMessage('')
      setPassword('')
      setPage('login')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (nextPage === 'admin' && user?.role !== 'ADMIN') {
      setError('Bạn không có quyền truy cập trang quản trị.')
      return
    }

    if (nextPage === 'admin') setAdminMenu('dashboard')
    if (nextPage === 'home' || nextPage === 'products') {
      setPendingAuthAction(null)
    }
    setError('')
    setMessage('')
    setPassword('')
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addProductToCart = (productId: number, variantId?: number) => {
    if (!user) {
      setPendingAuthAction({ type: 'addToCart', productId, variantId })
      setError('')
      setMessage('')
      setPassword('')
      setPage('login')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    void updateCart(api.add(productId, variantId))
  }

  const returnToStore = () => {
    goTo('products')
    void api.products({ page: String(catalogPage), limit: '20' })
      .then((listing) => {
        setProducts(listing.data)
        setCatalogTotal(listing.pagination.total)
        setCatalogTotalPages(listing.pagination.totalPages)
      })
      .catch((e: Error) => setError(e.message))
    void api.cart()
      .then(setCart)
      .catch((e: Error) => setError(e.message))
  }

  const updateCart = async (request: Promise<Cart>) => {
    setError('')

    try {
      const updatedCart = await request
      setCart(updatedCart)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cập nhật giỏ hàng.')
    }
  }

  const openRecommendedProduct = async (id: number) => {
    try {
      const product = await api.product(id)
      setSelectedProduct(product)
      setSelectedVariantId(product.variants?.[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể mở thông tin sản phẩm.')
    }
  }

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (page === 'register') {
        const result = await api.register(
          name.trim(),
          email.trim(),
          password,
        )

        setMessage(result.message || 'Đăng ký thành công. Hãy đăng nhập.')
        setPassword('')
        setPage('login')
      } else {
        const result = await api.login(email.trim(), password)
        const currentUser = result.user
          ? result.user
          : (await api.me()).user
        const actionToResume = pendingAuthAction

        setPassword('')
        setName('')
        setPendingAuthAction(null)
        setMessage('')

        try {
          if (actionToResume?.type === 'addToCart') {
            setCart(await api.add(actionToResume.productId, actionToResume.variantId))
            setPage('products')
            setMessage('Đăng nhập thành công. Sản phẩm đã được thêm vào giỏ hàng.')
          } else if (actionToResume?.type === 'navigate') {
            setCart(await api.cart())
            setPage(actionToResume.page)
          } else {
            setPage('products')
          }
          setUser(currentUser)
        } catch (actionError) {
          setUser(currentUser)
          setPage('products')
          setError(
            actionError instanceof Error
              ? `Đăng nhập thành công nhưng chưa thể tiếp tục thao tác: ${actionError.message}`
              : 'Đăng nhập thành công nhưng chưa thể tiếp tục thao tác.',
          )
        }
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
      setSelectedProduct(null)
      setOrderResult(null)
      setPage('home')
      setMessage('Bạn đã đăng xuất thành công.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đăng xuất.')
    }
  }

  const handleCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setOrderLoading(true)

    try {
      const result = await api.createOrder({
        customerName: user?.name || name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        paymentMethod,
      })

      setOrderResult(result)
      setCart(emptyCart)
      setPage('checkout')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể tạo đơn hàng. Vui lòng thử lại.',
      )
    } finally {
      setOrderLoading(false)
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

  // Trang đăng nhập và đăng ký
  if (!user && (page === 'login' || page === 'register')) {
    const registering = page === 'register'
    const resumeMessage = pendingAuthAction?.type === 'addToCart'
      ? 'Đăng nhập để thêm sản phẩm đã chọn vào giỏ. Sau đó bạn sẽ quay lại danh sách sản phẩm.'
      : pendingAuthAction?.type === 'navigate'
        ? 'Đăng nhập để tiếp tục đến giỏ hàng và hoàn tất thao tác của bạn.'
        : ''

    return (
      <div className="auth-page">
        <header className="public-nav">
          <button
            className="brand-button"
            onClick={() => goTo('home')}
          >
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="brand-lockup">
              <strong>Storez</strong>
              <small>GIAN HÀNG MÓN SẤY</small>
            </span>
          </button>

          <button
            className="ghost"
            onClick={() => goTo(pendingAuthAction ? 'products' : 'home')}
          >
            {pendingAuthAction ? 'Tiếp tục xem sản phẩm' : 'Trang chủ'}
          </button>
        </header>

        <main className="auth-layout">
          <section className="auth-card">
            <div className="auth-icon">
              {registering ? '✨' : '👋'}
            </div>

            <h1>
              {registering ? 'Tạo tài khoản' : 'Chào mừng trở lại!'}
            </h1>

            <p className="auth-subtitle">
              {registering
                ? 'Tạo tài khoản để lưu giỏ hàng và đặt món sấy bạn yêu thích.'
                : 'Đăng nhập để tiếp tục mua sắm tại Storez.'}
            </p>

            {resumeMessage && (
              <div className="auth-return-note">
                <strong>Bạn chỉ còn một bước nữa</strong>
                <span>{resumeMessage}</span>
              </div>
            )}

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
                  autoComplete={
                    registering ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
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
          © Storez — Thế giới món sấy mỗi ngày.
        </footer>
      </div>
    )
  }

  // Trang chủ dành cho người chưa đăng nhập
  if (!user && page === 'home') {
    return (
      <div className="home-page">
        <header className="public-nav">
          <button
            className="brand-button"
            onClick={() => goTo('home')}
          >
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="brand-lockup">
              <strong>Storez</strong>
              <small>GIAN HÀNG MÓN SẤY</small>
            </span>
          </button>

          <nav className="home-nav-actions">
            <button className="ghost" onClick={() => goTo('products')}>
              Xem sản phẩm
            </button>
            <button className="ghost" onClick={() => goTo('login')}>
              Đăng nhập
            </button>
            <button onClick={() => goTo('register')}>
              Đăng ký
            </button>
          </nav>
        </header>

        <main className="hero">
          <div className="hero-copy">
            <span className="hero-tag">STOREZ · GIAN HÀNG THỰC PHẨM SẤY</span>

            <h1>
              Món sấy ngon,
              <br />
              <span>chọn theo cách bạn thích.</span>
            </h1>

            <p>
              Khám phá các món trái cây sấy, xem phương pháp sấy, khối lượng
              và giá của từng sản phẩm trước khi chọn mua.
            </p>

            <div className="hero-actions">
              <button
                className="hero-primary"
                onClick={() => goTo('products')}
              >
                Khám phá sản phẩm <span>→</span>
              </button>

              <button
                className="ghost"
                onClick={() => goTo('login')}
              >
                Tôi đã có tài khoản
              </button>
            </div>

            <div className="hero-benefits">
              <span>✓ Nhiều phương pháp sấy</span>
              <span>✓ Chọn theo khối lượng</span>
            </div>
          </div>

          <div className="hero-art" aria-label="Một số sản phẩm trái cây sấy">
            <div className="hero-art-orbit" />
            <div className="hero-product-card hero-product-main">
              <img src="/products/Xoài sấy dẻo.png" alt="Xoài sấy dẻo" />
              <span className="hero-product-label">
                <strong>Xoài sấy dẻo</strong>
                <small>Mềm dẻo · 250 g</small>
              </span>
            </div>
            <div className="hero-product-card hero-product-side">
              <img src="/products/Chuối sấy.png" alt="Chuối sấy" />
              <span className="hero-product-label">
                <strong>Chuối sấy giòn</strong>
                <small>Giòn vui · 200 g</small>
              </span>
            </div>
            <div className="hero-art-sticker" aria-hidden="true">🥭</div>
            <div className="hero-art-note">
              <span aria-hidden="true">✳</span>
              <div>
                <strong>Chọn món sấy</strong>
                <small>Theo vị giác của bạn</small>
              </div>
            </div>
          </div>
        </main>

        <section className="home-features">
          <article>
            <span>🍊</span>
            <h3>Đa dạng món sấy</h3>
            <p>Khám phá các loại trái cây sấy với nhiều cách chế biến.</p>
          </article>

          <article>
            <span>🌿</span>
            <h3>Tìm món thật nhanh</h3>
            <p>Tìm theo tên sản phẩm và sắp xếp danh sách theo nhu cầu.</p>
          </article>

          <article>
            <span>🧺</span>
            <h3>Mua sắm thật gọn</h3>
            <p>Xem sản phẩm thoải mái; đăng nhập khi bạn muốn thêm vào giỏ và đặt hàng.</p>
          </article>
        </section>

        {message && <p className="home-notice">{message}</p>}

        <footer className="site-footer">
          © Storez — Thế giới món sấy mỗi ngày.
        </footer>

        <Chatbot onSelectProduct={(id) => void openRecommendedProduct(id)} />
      </div>
    )
  }

  // Header dùng chung cho các trang sau đăng nhập
  const UserHeader = () => {
    if (!user) return null

    return (
      <header className="topbar">
        <button
          className="brand-button"
          onClick={() => goTo('products')}
        >
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-lockup">
            <strong>Storez</strong>
            <small>GIAN HÀNG MÓN SẤY</small>
          </span>
        </button>

        <div className="product-header-actions">
          <span className="welcome-user">Xin chào, {user.name}</span>

          <button className="ghost" onClick={() => goTo('products')}>
            Sản phẩm
          </button>

          {user.role === 'ADMIN' && (
            <button
              className="ghost"
              onClick={() => goTo('admin')}
            >
              ⚙️ Quản trị
            </button>
          )}

          <button className="ghost" onClick={handleLogout}>
            Đăng xuất
          </button>

          <button
            className="cart-btn"
            onClick={() => goTo('cart')}
            aria-label="Mở trang giỏ hàng"
          >
            🛒
            {cart.count > 0 && (
              <span className="badge">{cart.count}</span>
            )}
          </button>
        </div>
      </header>
    )
  }

  // Trang quản trị
  if (page === 'admin') {
    if (user?.role !== 'ADMIN') {
      return (
        <>
          <UserHeader />
          <main className="admin-page">
            <p className="error">
              Bạn không có quyền truy cập trang quản trị.
            </p>
            <button onClick={() => goTo('products')}>
              Quay lại cửa hàng
            </button>
          </main>
        </>
      )
    }

    return (
      <AdminLayout
        activeMenu={adminMenu}
        onNavigate={setAdminMenu}
        onBackToStore={returnToStore}
      >
        {adminMenu === 'products'
          ? <ProductsPage onBack={returnToStore} />
          : <AdminManagementPage menu={adminMenu} />}
      </AdminLayout>
    )
  }


  // Trang thanh toán và kết quả đơn hàng
  if (page === 'checkout') {
    if (orderResult) {
      return (
        <>
          <UserHeader />

          <main className="checkout-page">
            <section className="order-success">
              <div className="order-success-icon">✓</div>

              <h1>Đặt hàng thành công!</h1>

              <p>
                Đơn hàng của bạn đã được ghi nhận trong hệ thống Storez.
              </p>

              <div className="order-result-card">
                <div className="checkout-row">
                  <span>Mã đơn hàng</span>
                  <strong>{orderResult.order.id}</strong>
                </div>

                <div className="checkout-row">
                  <span>Tổng tiền</span>
                  <strong>{vnd(orderResult.order.total)}</strong>
                </div>

                <div className="checkout-row">
                  <span>Phương thức thanh toán</span>
                  <strong>
                    {orderResult.order.paymentMethod === 'COD'
                      ? 'Thanh toán khi nhận hàng'
                      : 'Chuyển khoản demo'}
                  </strong>
                </div>

                <div className="checkout-row">
                  <span>Trạng thái đơn hàng</span>
                  <strong>{orderResult.order.orderStatus}</strong>
                </div>

                <div className="checkout-row">
                  <span>Trạng thái thanh toán</span>
                  <strong>{orderResult.order.paymentStatus}</strong>
                </div>
              </div>

              {orderResult.demoPayment && (
                <div className="demo-payment-notice">
                  <h3>Thông tin thanh toán mô phỏng</h3>
                  <p>{orderResult.demoPayment.message}</p>
                  <p>
                    Mã tham chiếu:{' '}
                    <strong>{orderResult.demoPayment.reference}</strong>
                  </p>
                  <p>
                    Đây là chức năng demo, không phải giao dịch chuyển khoản
                    ngân hàng thật.
                  </p>
                </div>
              )}

              <button
                className="checkout-submit"
                onClick={() => {
                  setOrderResult(null)
                  setPhone('')
                  setAddress('')
                  setPaymentMethod('COD')
                  goTo('products')
                }}
              >
                Tiếp tục mua sắm
              </button>
            </section>
          </main>

          <Chatbot onSelectProduct={(id) => void openRecommendedProduct(id)} />
        </>
      )
    }

    if (cart.count === 0) {
      return (
        <>
          <UserHeader />

          <main className="checkout-page">
            <section className="cart-empty">
              <div>🛒</div>
              <h3>Giỏ hàng đang trống</h3>
              <p>Hãy thêm sản phẩm trước khi thanh toán.</p>
              <button onClick={() => goTo('products')}>
                Khám phá sản phẩm
              </button>
            </section>
          </main>
        </>
      )
    }

    return (
      <>
        <UserHeader />

        <main className="checkout-page">
          <div className="products-heading">
            <div>
              <p className="products-eyebrow">HOÀN TẤT ĐƠN HÀNG</p>
              <h2>Thanh toán đơn hàng</h2>
              <p>Điền thông tin nhận hàng và chọn phương thức thanh toán.</p>
            </div>
          </div>

          {error && <p className="error">Lỗi: {error}</p>}

          <div className="checkout-layout">
            <form
              className="checkout-form"
              onSubmit={handleCheckout}
            >
              <section className="checkout-section">
                <h3>📦 Thông tin nhận hàng</h3>

                <label className="checkout-field">
                  Họ và tên
                  <input
                    type="text"
                    value={user?.name ?? ''}
                    disabled
                    readOnly
                  />
                </label>

                <label className="checkout-field">
                  Số điện thoại
                  <input
                    type="tel"
                    placeholder="Nhập số điện thoại"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    minLength={9}
                    maxLength={15}
                    autoComplete="tel"
                    required
                  />
                </label>

                <label className="checkout-field">
                  Địa chỉ nhận hàng
                  <textarea
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={4}
                    maxLength={500}
                    autoComplete="street-address"
                    required
                  />
                </label>
              </section>

              <section className="checkout-section">
                <h3>💳 Phương thức thanh toán</h3>

                <label className="payment-option">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={paymentMethod === 'COD'}
                    onChange={() => setPaymentMethod('COD')}
                  />

                  <span>
                    <strong>Thanh toán khi nhận hàng (COD)</strong>
                    <small>Thanh toán trực tiếp khi nhận được sản phẩm.</small>
                  </span>
                </label>

                <label className="payment-option">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="BANK_TRANSFER_DEMO"
                    checked={paymentMethod === 'BANK_TRANSFER_DEMO'}
                    onChange={() =>
                      setPaymentMethod('BANK_TRANSFER_DEMO')
                    }
                  />

                  <span>
                    <strong>Chuyển khoản ngân hàng (Demo)</strong>
                    <small>
                      Chỉ mô phỏng quy trình, chưa kết nối ngân hàng thật.
                    </small>
                  </span>
                </label>
              </section>

              <button
                type="submit"
                className="checkout-submit"
                disabled={orderLoading || cart.count === 0}
              >
                {orderLoading
                  ? 'Đang tạo đơn hàng...'
                  : 'Xác nhận đặt hàng'}
              </button>

              <button
                type="button"
                className="checkout-back"
                onClick={() => goTo('cart')}
                disabled={orderLoading}
              >
                ← Quay lại giỏ hàng
              </button>
            </form>

            <aside className="checkout-summary">
              <h3>Đơn hàng của bạn</h3>

              {cart.items.map(({ product, qty, variant }) => (
                <div className="checkout-product" key={`${product.id}-${variant?.id ?? 'base'}`}>
                  <img src={product.image} alt={product.name} />

                  <div>
                    <strong>{product.name}</strong>
                    {variant && <small>{variant.weight_g} g{variant.flavor ? ` · ${variant.flavor}` : ''}</small>}
                    <small>Số lượng: {qty}</small>
                  </div>

                  <strong>{vnd(product.price * qty)}</strong>
                </div>
              ))}

              <div className="checkout-row">
                <span>Số lượng</span>
                <strong>{cart.count}</strong>
              </div>

              <div className="checkout-row checkout-total">
                <span>Tổng thanh toán</span>
                <strong>{vnd(cart.total)}</strong>
              </div>
            </aside>
          </div>
        </main>

        <Chatbot onSelectProduct={(id) => void openRecommendedProduct(id)} />
      </>
    )
  }

  // Trang giỏ hàng
  if (page === 'cart') {
    return (
      <>
        <UserHeader />

        <main className="cart-page">
          <div className="products-heading">
            <div>
              <p className="products-eyebrow">GIỎ HÀNG STOREZ</p>
              <h2>Giỏ hàng của tôi</h2>
              <p>Kiểm tra sản phẩm và số lượng trước khi thanh toán.</p>
            </div>

            <span className="product-count">
              {cart.count} sản phẩm
            </span>
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
                {cart.items.map(({ product, qty, variant }) => (
                  <article className="cart-item" key={`${product.id}-${variant?.id ?? 'base'}`}>
                    <img src={product.image} alt={product.name} />

                    <div className="cart-item-info">
                      <h3>{product.name}</h3>
                      {variant && <p>{variant.weight_g} g{variant.flavor ? ` · ${variant.flavor}` : ''}</p>}
                      <p>{vnd(product.price)}</p>

                      <div className="qty">
                        <button
                          disabled={qty <= 1}
                          onClick={() =>
                            void updateCart(
                              api.setQty(product.id, qty - 1, variant?.id),
                            )
                          }
                        >
                          −
                        </button>

                        <span>{qty}</span>

                        <button
                          onClick={() =>
                            void updateCart(
                              api.setQty(product.id, qty + 1, variant?.id),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="cart-item-total">
                      <strong>{vnd(product.price * qty)}</strong>

                      <button
                        className="text-button"
                        onClick={() =>
                          void updateCart(api.setQty(product.id, 0, variant?.id))
                        }
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
                  onClick={() => goTo('checkout')}
                >
                  Tiến hành thanh toán
                </button>

                <button
                  className="cart-clear"
                  disabled={!cart.count}
                  onClick={() => void updateCart(api.clear())}
                >
                  Xóa toàn bộ giỏ hàng
                </button>
              </aside>
            </div>
          )}
        </main>

        <Chatbot onSelectProduct={(id) => void openRecommendedProduct(id)} />
      </>
    )
  }

  // Trang danh sách sản phẩm
  return (
    <>
      {user ? (
        <UserHeader />
      ) : (
        <header className="public-nav catalog-nav">
          <button className="brand-button" onClick={() => goTo('home')}>
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="brand-lockup">
              <strong>Storez</strong>
              <small>GIAN HÀNG MÓN SẤY</small>
            </span>
          </button>
          <nav className="home-nav-actions">
            <button className="ghost" onClick={() => goTo('home')}>Trang chủ</button>
            <button className="ghost" onClick={() => goTo('cart')}>🛒 Giỏ hàng</button>
            <button className="ghost" onClick={() => goTo('login')}>Đăng nhập</button>
            <button onClick={() => goTo('register')}>Đăng ký</button>
          </nav>
        </header>
      )}

      <main>
        {error && <p className="error">Lỗi: {error}</p>}

        <div className="products-heading">
          <div>
            <p className="products-eyebrow">GIAN HÀNG MÓN SẤY</p>
            <h2>Khám phá món sấy</h2>
            <p>Tìm sản phẩm bạn thích và sắp xếp danh sách theo nhu cầu.</p>
          </div>

          <span className="product-count">
            {catalogTotal} sản phẩm
          </span>
        </div>

        <section className="catalog-filters" aria-label="Lọc sản phẩm">
          <label>
            Tìm sản phẩm
            <input
              value={catalogSearch}
              onChange={(event) => {
                setCatalogPage(1)
                setCatalogSearch(event.target.value)
              }}
              placeholder="Nhập tên sản phẩm..."
            />
          </label>
          <label>
            Sắp xếp
            <select
              value={catalogSort}
              onChange={(event) => {
                setCatalogPage(1)
                setCatalogSort(event.target.value)
              }}
            >
              <option value="id_asc">Mặc định</option>
              <option value="newest">Mới nhất</option>
              <option value="price_asc">Giá thấp đến cao</option>
              <option value="price_desc">Giá cao đến thấp</option>
              <option value="bestseller">Bán chạy</option>
              <option value="name_asc">Tên A-Z</option>
            </select>
          </label>
        </section>

        {!user && (
          <aside className="guest-catalog-note">
            <span aria-hidden="true">🌿</span>
            <p>
              Bạn có thể xem và tìm kiếm sản phẩm trước. Khi muốn mua, hãy đăng
              nhập để thêm món vào giỏ hàng.
            </p>
            <button className="ghost" onClick={() => goTo('login')}>
              Đăng nhập
            </button>
          </aside>
        )}

        <div className="grid">
          {products.map((product) => (
            <article className="card" key={product.id}>
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
              />

              <div className="card-body">
                {product.drying_method && (
                  <span className="product-method-chip">
                    {product.drying_method.replace(/\s*\(đề xuất demo\)\s*/i, '').trim()}
                  </span>
                )}
                <h2>{product.name}</h2>
                {product.data_status === 'VERIFIED' && (
                  <span className="verified-badge">Thông tin đã xác minh</span>
                )}
                <p>{productDescription(product)}</p>

                <div className="card-foot">
                  <strong>{vnd(product.price)}</strong>

                  <div className="product-actions">
                    <button
                      className="detail-btn"
                      onClick={() => {
                        setSelectedProduct(product)
                        setSelectedVariantId(product.variants?.[0]?.id ?? null)
                      }}
                    >
                      Xem chi tiết
                    </button>

                    <button
                      disabled={
                        product.variants?.length
                          ? !product.variants.some((variant) => variant.stock > 0)
                          : (product.stock ?? 0) <= 0
                      }
                      onClick={() => {
                        const variant = product.variants?.find((item) => item.stock > 0)
                        addProductToCart(product.id, variant?.id)
                      }}
                    >
                      {product.variants?.length &&
                      !product.variants.some((variant) => variant.stock > 0)
                        ? 'Hết hàng'
                        : user ? 'Thêm vào giỏ' : 'Đăng nhập để mua'}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {catalogTotalPages > 1 && (
          <nav className="catalog-pagination" aria-label="Phân trang sản phẩm">
            <button
              className="ghost"
              disabled={catalogPage <= 1 || productsLoading}
              onClick={() => setCatalogPage((pageNumber) => pageNumber - 1)}
            >
              ← Trước
            </button>
            <span>Trang {catalogPage} / {catalogTotalPages}</span>
            <button
              className="ghost"
              disabled={catalogPage >= catalogTotalPages || productsLoading}
              onClick={() => setCatalogPage((pageNumber) => pageNumber + 1)}
            >
              Tiếp →
            </button>
          </nav>
        )}

        {productsLoading && products.length === 0 && (
          <p className="empty">
            Đang tải sản phẩm...
          </p>
        )}

        {!productsLoading && products.length === 0 && !error && (
          <p className="empty">
            Chưa có sản phẩm nào.
          </p>
        )}
      </main>

      {selectedProduct && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedProduct(null)}
        >
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedProduct(null)}
              aria-label="Đóng"
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

              <p className="detail-price">
                {vnd(selectedVariant?.sale_price ?? selectedVariant?.price ?? selectedProduct.price)}
              </p>

              {selectedProduct.variants?.length ? (
                <label className="detail-variant-select">
                  Quy cách
                  <select
                    value={selectedVariantId ?? ''}
                    onChange={(event) => setSelectedVariantId(
                      event.target.value ? Number(event.target.value) : null,
                    )}
                  >
                    {selectedProduct.variants.map((variant) => (
                      <option key={variant.id} value={variant.id} disabled={variant.stock <= 0}>
                        {variant.weight_g} g{variant.flavor ? ` · ${variant.flavor}` : ''}{variant.packaging ? ` · ${variant.packaging}` : ''} — {vnd(variant.sale_price ?? variant.price)}
                        {variant.stock <= 0 ? ' (Hết hàng)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {selectedProduct.fruit_type && <p><strong>Loại trái cây:</strong> {selectedProduct.fruit_type}</p>}
              {selectedProduct.drying_method && (
                <p>
                  <strong>Phương pháp sấy:</strong>{' '}
                  {selectedProduct.drying_method.replace(/\s*\(đề xuất demo\)\s*/i, '').trim()}
                </p>
              )}
              {selectedProduct.ingredients && <p><strong>Thành phần:</strong> {selectedProduct.ingredients}</p>}
              {selectedProduct.net_weight_g && <p><strong>Khối lượng tịnh:</strong> {selectedProduct.net_weight_g} g</p>}
              {selectedProduct.origin && <p><strong>Xuất xứ:</strong> {selectedProduct.origin}</p>}
              {selectedProduct.responsible_party && <p><strong>Đơn vị chịu trách nhiệm:</strong> {selectedProduct.responsible_party}</p>}
              {selectedProduct.packaging && <p><strong>Đóng gói:</strong> {selectedProduct.packaging}</p>}
              {selectedProduct.produced_on && <p><strong>Ngày sản xuất:</strong> {selectedProduct.produced_on}</p>}
              {selectedProduct.expiry_info && <p><strong>Hạn sử dụng:</strong> {selectedProduct.expiry_info}</p>}
              {selectedProduct.storage_instructions && <p><strong>Bảo quản:</strong> {selectedProduct.storage_instructions}</p>}

              <h3>Mô tả sản phẩm</h3>

              <p className="detail-description">
                {productDescription(selectedProduct)}
              </p>

              <button
                className="detail-add"
                disabled={
                  Boolean(selectedProduct.variants?.length) &&
                  !selectedProduct.variants?.some(
                    (variant) => variant.id === selectedVariantId && variant.stock > 0,
                  )
                }
                onClick={() => {
                  addProductToCart(selectedProduct.id, selectedVariantId ?? undefined)
                  setSelectedProduct(null)
                }}
              >
                {user ? 'Thêm vào giỏ hàng' : 'Đăng nhập để thêm vào giỏ'}
              </button>
            </div>
          </section>
        </div>
      )}

      <Chatbot onSelectProduct={(id) => void openRecommendedProduct(id)} />
    </>
  )
}

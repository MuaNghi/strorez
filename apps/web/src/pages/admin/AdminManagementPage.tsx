import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  vnd,
  type AdminCategory,
  type AdminCustomer,
  type AdminInventoryItem,
  type AdminOrder,
  type AdminPayment,
  type AdminPromotion,
  type AdminReview,
  type AdminSettings,
  type AdminSummary,
} from '../../api'
import type { AdminMenu } from '../../components/admin/AdminLayout'

const emptyCategory = {
  name: '',
  description: '',
  image: '',
  sort_order: 0,
  is_active: 1,
}

type PromotionForm = Omit<AdminPromotion, 'id' | 'usage_count'>

const emptyPromotion: PromotionForm = {
  code: '',
  name: '',
  description: '',
  discount_type: 'PERCENT' as const,
  discount_value: 10,
  min_order_amount: 0,
  max_discount_amount: null as number | null,
  usage_limit: null as number | null,
  per_user_limit: 1,
  starts_at: new Date().toISOString().slice(0, 16),
  ends_at: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
  is_active: 1,
}

const emptySettings: AdminSettings = {
  store_name: 'Storez',
  store_description: '',
  store_logo: '',
  store_favicon: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  primary_color: '#f36b35',
  secondary_color: '#4f46e5',
  free_shipping_threshold: 1000000,
  cod_fee: 0,
  meta_title: '',
  meta_description: '',
  og_image: '',
  maintenance_mode: 0,
  maintenance_message: '',
  updated_at: '',
}

const localDateTime = (value: string) => {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function AdminManagementPage({ menu }: { menu: Exclude<AdminMenu, 'products'> }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [showInactiveCategories, setShowInactiveCategories] = useState(false)
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([])
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [promotions, setPromotions] = useState<AdminPromotion[]>([])
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [settings, setSettings] = useState<AdminSettings>(emptySettings)
  const [categoryForm, setCategoryForm] = useState(emptyCategory)
  const [editingCategory, setEditingCategory] = useState<number | null>(null)
  const [promotionForm, setPromotionForm] = useState(emptyPromotion)
  const [editingPromotion, setEditingPromotion] = useState<number | null>(null)
  const [stockDraft, setStockDraft] = useState<Record<string, number>>({})
  const [reviewReplies, setReviewReplies] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      switch (menu) {
        case 'dashboard':
          setSummary(await api.adminSummary())
          break
        case 'orders':
          setOrders(await api.adminOrders(search, statusFilter))
          break
        case 'customers':
          setCustomers(await api.adminCustomers(search))
          break
        case 'categories':
          setCategories(await api.adminCategories())
          break
        case 'inventory':
          setInventory(await api.adminInventory())
          break
        case 'payments':
          setPayments(await api.adminPayments())
          break
        case 'promotions':
          setPromotions(await api.adminPromotions())
          break
        case 'reviews':
          setReviews(await api.adminReviews())
          break
        case 'settings':
          setSettings((await api.adminSettings()) ?? emptySettings)
          break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải dữ liệu quản trị.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [menu, search, statusFilter])

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể hoàn tất thao tác.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const submitCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const action = () => editingCategory === null
      ? api.createCategory(categoryForm)
      : api.updateCategory(editingCategory, categoryForm)
    void runAction(action, editingCategory === null ? 'Đã thêm danh mục.' : 'Đã cập nhật danh mục.')
      .then((saved) => {
        if (!saved) return
        setCategoryForm(emptyCategory)
        setEditingCategory(null)
      })
  }

  const submitPromotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = {
      ...promotionForm,
      code: promotionForm.code.toUpperCase().trim(),
      starts_at: new Date(promotionForm.starts_at).toISOString(),
      ends_at: new Date(promotionForm.ends_at).toISOString(),
    }
    const action = () => editingPromotion === null
      ? api.createPromotion(payload)
      : api.updatePromotion(editingPromotion, payload)
    void runAction(action, editingPromotion === null ? 'Đã tạo mã khuyến mãi.' : 'Đã cập nhật mã khuyến mãi.')
      .then((saved) => {
        if (!saved) return
        setPromotionForm(emptyPromotion)
        setEditingPromotion(null)
      })
  }

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAction(() => api.updateSettings(settings), 'Đã lưu cài đặt cửa hàng.')
  }

  const title: Record<Exclude<AdminMenu, 'products'>, string> = {
    dashboard: 'Tổng quan hoạt động',
    orders: 'Đơn hàng',
    customers: 'Khách hàng',
    categories: 'Danh mục sản phẩm',
    payments: 'Thanh toán',
    inventory: 'Tồn kho sản phẩm',
    promotions: 'Mã khuyến mãi',
    reviews: 'Đánh giá sản phẩm',
    settings: 'Cài đặt cửa hàng',
  }

  return (
    <section className="admin-management">
      <div className="admin-management-heading">
        <div>
          <p className="products-eyebrow">QUẢN LÝ THỰC PHẨM SẤY</p>
          <h2>{title[menu]}</h2>
        </div>
        <button type="button" className="ghost" onClick={() => void load()} disabled={loading}>
          ↻ Làm mới
        </button>
      </div>
      {error && <p className="error">Lỗi: {error}</p>}
      {message && <p className="success-message">{message}</p>}
      {loading ? <p className="empty">Đang tải dữ liệu...</p> : (
        <>
          {menu === 'dashboard' && summary && (
            <>
              <div className="admin-metric-grid">
                {[
                  ['📦', 'Sản phẩm', summary.products],
                  ['🧾', 'Đơn hàng', summary.orders],
                  ['♙', 'Khách hàng', summary.customers],
                  ['💰', 'Doanh thu', vnd(summary.revenue)],
                  ['⚠️', 'Sắp hết hàng', summary.lowStock],
                ].map(([icon, label, value]) => (
                  <article className="admin-metric" key={String(label)}>
                    <span>{icon}</span><small>{label}</small><strong>{value}</strong>
                  </article>
                ))}
              </div>
              <section className="admin-panel">
                <h3>Đơn hàng gần đây</h3>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Tổng tiền</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead>
                    <tbody>{summary.recentOrders.map((order) => (
                      <tr key={order.id}><td>{order.id.slice(0, 8)}…</td><td>{order.customer_name}</td><td>{vnd(order.total)}</td><td>{order.order_status}</td><td>{new Date(order.created_at).toLocaleString('vi-VN')}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                {!summary.recentOrders.length && <p className="empty">Chưa có đơn hàng.</p>}
              </section>
            </>
          )}

          {menu === 'orders' && (
            <section className="admin-panel">
              <div className="admin-toolbar">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã đơn, tên hoặc số điện thoại" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Tất cả trạng thái</option><option value="PENDING">Chờ xử lý</option><option value="CONFIRMED">Đã xác nhận</option><option value="CANCELLED">Đã hủy</option>
                </select>
              </div>
              <div className="admin-table-wrap"><table className="admin-table">
                <thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead>
                <tbody>{orders.map((order) => <tr key={order.id}>
                  <td><strong>{order.id.slice(0, 8)}…</strong><small>{new Date(order.created_at).toLocaleString('vi-VN')}</small></td>
                  <td>{order.customer_name}<small>{order.phone}<br />{order.email}</small></td>
                  <td>{order.item_count}</td><td>{vnd(order.total)}</td><td>{order.payment_method === 'COD' ? 'COD' : 'Chuyển khoản demo'}<small>{order.payment_status}</small></td>
                  <td><select value={order.order_status} disabled={saving || order.order_status === 'CANCELLED'} onChange={(e) => void runAction(() => api.updateOrderStatus(order.id, e.target.value as AdminOrder['order_status']), 'Đã cập nhật đơn hàng.')}>
                    <option value="PENDING">Chờ xử lý</option><option value="CONFIRMED">Đã xác nhận</option><option value="CANCELLED">Hủy đơn</option>
                  </select></td>
                </tr>)}</tbody>
              </table></div>
              {!orders.length && <p className="empty">Không tìm thấy đơn hàng.</p>}
            </section>
          )}

          {menu === 'customers' && (
            <section className="admin-panel">
              <div className="admin-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc email" /></div>
              <div className="admin-table-wrap"><table className="admin-table">
                <thead><tr><th>Khách hàng</th><th>Ngày tham gia</th><th>Số đơn</th><th>Tổng chi tiêu</th><th>Thao tác</th></tr></thead>
                <tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong><small>{customer.email}</small></td><td>{new Date(customer.created_at).toLocaleDateString('vi-VN')}</td><td>{customer.order_count}</td><td>{vnd(customer.total_spent)}</td><td><button className="admin-delete-btn" disabled={saving} onClick={() => { if (window.confirm(`Xoá tài khoản ${customer.name} (${customer.email})? Thông tin liên hệ sẽ bị ẩn danh và không thể đăng nhập lại; lịch sử đơn hàng vẫn được giữ.`)) void runAction(() => api.deleteCustomer(customer.id), 'Đã xoá thông tin khách hàng và giữ lịch sử đơn ở dạng ẩn danh.') }}>Xoá khách</button></td></tr>)}</tbody>
              </table></div>
              {!customers.length && <p className="empty">Chưa có khách hàng phù hợp.</p>}
            </section>
          )}

          {menu === 'categories' && (
            <>
              <section className="admin-panel">
                <h3>{editingCategory === null ? 'Thêm danh mục' : 'Chỉnh sửa danh mục'}</h3>
                <form className="admin-inline-form" onSubmit={submitCategory}>
                  <label className="admin-field">Tên danh mục<input required maxLength={100} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></label>
                  <label className="admin-field">Thứ tự<input type="number" min="0" value={categoryForm.sort_order} onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: Number(e.target.value) })} /></label>
                  <label className="admin-field admin-field-full">Mô tả<textarea maxLength={1000} value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></label>
                  <label className="admin-field admin-field-full">Ảnh danh mục (URL)<input type="url" value={categoryForm.image} onChange={(e) => setCategoryForm({ ...categoryForm, image: e.target.value })} /></label>
                  <label className="admin-check"><input type="checkbox" checked={categoryForm.is_active === 1} onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked ? 1 : 0 })} /> Đang hiển thị</label>
                  <div className="admin-form-actions"><button disabled={saving} type="submit">{saving ? 'Đang lưu...' : 'Lưu danh mục'}</button>{editingCategory !== null && <button type="button" className="ghost" onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory) }}>Hủy</button>}</div>
                </form>
              </section>
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Danh mục đang sử dụng</h2>
                    <p>{categories.filter((category) => category.is_active === 1).length} nhóm sản phẩm tổng quát</p>
                  </div>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={showInactiveCategories}
                      onChange={(event) => setShowInactiveCategories(event.target.checked)}
                    />
                    Hiện danh mục đã ẩn ({categories.filter((category) => category.is_active === 0).length})
                  </label>
                </div>
                <div className="admin-table-wrap"><table className="admin-table">
                <thead><tr><th>Danh mục</th><th>Sản phẩm</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                <tbody>{categories.filter((category) => showInactiveCategories || category.is_active === 1).map((category) => <tr key={category.id}><td><strong>{category.name}</strong><small>{category.description}</small></td><td>{category.product_count}</td><td>{category.sort_order}</td><td>{category.is_active ? 'Đang bật' : 'Đang ẩn'}</td><td><div className="admin-row-actions"><button className="admin-edit-btn" onClick={() => { setEditingCategory(category.id); setCategoryForm({ name: category.name, description: category.description, image: category.image, sort_order: category.sort_order, is_active: category.is_active }) }}>Sửa</button><button className="admin-delete-btn" disabled={saving} onClick={() => { if (window.confirm(`Xóa danh mục "${category.name}"?`)) void runAction(() => api.deleteCategory(category.id), 'Đã xóa danh mục.') }}>Xóa</button></div></td></tr>)}</tbody>
              </table></div></section>
            </>
          )}

          {menu === 'inventory' && (
            <section className="admin-panel"><p className="admin-help">Cập nhật số lượng tồn kho. Đơn hàng đã đặt sẽ tự trừ kho; đơn bị hủy sẽ hoàn kho.</p><div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Tình trạng</th><th>Tồn kho</th><th>Thao tác</th></tr></thead>
              <tbody>{inventory.map((item) => {
                const key = `${item.variant_id ? 'variant' : 'product'}-${item.id}`
                const draft = stockDraft[key] ?? item.stock
                const variantId = item.variant_id
                const update = variantId !== undefined
                  ? () => api.updateVariantStock(variantId, draft)
                  : () => api.updateStock(item.id, draft)
                return <tr key={key}><td><strong>{item.name}</strong><small>{item.variant_sku ? `SKU ${item.variant_sku}` : `#${item.id}`}</small></td><td>{item.category_name || 'Chưa phân loại'}</td><td>{!item.is_active ? 'Đang ẩn' : item.stock === 0 ? 'Hết hàng' : item.stock <= 5 ? 'Sắp hết' : 'Còn hàng'}</td><td><input aria-label={`Tồn kho ${item.name}`} type="number" min="0" step="1" value={draft} onChange={(e) => setStockDraft({ ...stockDraft, [key]: Number(e.target.value) })} /></td><td><button disabled={saving || draft === item.stock} onClick={() => void runAction(update, 'Đã cập nhật tồn kho.')}>Lưu</button></td></tr>
              })}</tbody>
            </table></div></section>
          )}

          {menu === 'payments' && (
            <section className="admin-panel"><p className="admin-help">Trạng thái đã thanh toán tại đây chỉ là xác nhận demo, không thay thế đối soát ngân hàng.</p><div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Phương thức</th><th>Số tiền</th><th>Mã tham chiếu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>{payments.map((payment) => <tr key={payment.id}><td>{payment.order_id.slice(0, 8)}…<small>{new Date(payment.created_at).toLocaleString('vi-VN')}</small></td><td>{payment.customer_name}<small>{payment.phone}</small></td><td>{payment.payment_method === 'COD' ? 'COD' : 'Chuyển khoản demo'}</td><td>{vnd(payment.amount)}</td><td>{payment.reference || '—'}</td><td>{payment.status === 'PAID_DEMO' ? 'Đã thu (demo)' : 'Chờ thanh toán'}</td><td><button className="admin-edit-btn" disabled={saving || payment.status === 'PAID_DEMO'} onClick={() => void runAction(() => api.updatePaymentStatus(payment.id, 'PAID_DEMO'), 'Đã ghi nhận thanh toán demo.')}>Đánh dấu đã thu</button></td></tr>)}</tbody>
            </table></div>{!payments.length && <p className="empty">Chưa có giao dịch.</p>}</section>
          )}

          {menu === 'promotions' && (
            <>
              <section className="admin-panel"><h3>{editingPromotion === null ? 'Tạo mã khuyến mãi' : 'Chỉnh sửa mã khuyến mãi'}</h3>
                <form className="admin-inline-form" onSubmit={submitPromotion}>
                  <label className="admin-field">Mã<input required maxLength={30} value={promotionForm.code} onChange={(e) => setPromotionForm({ ...promotionForm, code: e.target.value.toUpperCase() })} /></label>
                  <label className="admin-field">Tên chương trình<input required maxLength={150} value={promotionForm.name} onChange={(e) => setPromotionForm({ ...promotionForm, name: e.target.value })} /></label>
                  <label className="admin-field">Loại giảm giá<select value={promotionForm.discount_type} onChange={(e) => setPromotionForm({ ...promotionForm, discount_type: e.target.value as 'PERCENT' | 'FIXED' })}><option value="PERCENT">Phần trăm</option><option value="FIXED">Số tiền cố định</option></select></label>
                  <label className="admin-field">Giá trị giảm<input required type="number" min="1" max={promotionForm.discount_type === 'PERCENT' ? 100 : undefined} value={promotionForm.discount_value} onChange={(e) => setPromotionForm({ ...promotionForm, discount_value: Number(e.target.value) })} /></label>
                  <label className="admin-field">Đơn tối thiểu<input type="number" min="0" value={promotionForm.min_order_amount} onChange={(e) => setPromotionForm({ ...promotionForm, min_order_amount: Number(e.target.value) })} /></label>
                  <label className="admin-field">Giảm tối đa (để trống = không giới hạn)<input type="number" min="0" value={promotionForm.max_discount_amount ?? ''} onChange={(e) => setPromotionForm({ ...promotionForm, max_discount_amount: e.target.value ? Number(e.target.value) : null })} /></label>
                  <label className="admin-field">Giới hạn lượt dùng<input type="number" min="1" placeholder="Không giới hạn" value={promotionForm.usage_limit ?? ''} onChange={(e) => setPromotionForm({ ...promotionForm, usage_limit: e.target.value ? Number(e.target.value) : null })} /></label>
                  <label className="admin-field">Lượt dùng mỗi khách<input type="number" min="1" value={promotionForm.per_user_limit} onChange={(e) => setPromotionForm({ ...promotionForm, per_user_limit: Number(e.target.value) })} /></label>
                  <label className="admin-field">Bắt đầu<input required type="datetime-local" value={promotionForm.starts_at} onChange={(e) => setPromotionForm({ ...promotionForm, starts_at: e.target.value })} /></label>
                  <label className="admin-field">Kết thúc<input required type="datetime-local" value={promotionForm.ends_at} onChange={(e) => setPromotionForm({ ...promotionForm, ends_at: e.target.value })} /></label>
                  <label className="admin-field admin-field-full">Mô tả<textarea maxLength={1000} value={promotionForm.description} onChange={(e) => setPromotionForm({ ...promotionForm, description: e.target.value })} /></label>
                  <label className="admin-check"><input type="checkbox" checked={promotionForm.is_active === 1} onChange={(e) => setPromotionForm({ ...promotionForm, is_active: e.target.checked ? 1 : 0 })} /> Đang kích hoạt</label>
                  <div className="admin-form-actions"><button type="submit" disabled={saving}>Lưu mã giảm giá</button>{editingPromotion !== null && <button type="button" className="ghost" onClick={() => { setEditingPromotion(null); setPromotionForm(emptyPromotion) }}>Hủy</button>}</div>
                </form>
              </section>
              <section className="admin-panel"><div className="admin-table-wrap"><table className="admin-table">
                <thead><tr><th>Mã</th><th>Ưu đãi</th><th>Đã dùng</th><th>Thời hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                <tbody>{promotions.map((promo) => <tr key={promo.id}><td><strong>{promo.code}</strong><small>{promo.name}</small></td><td>{promo.discount_type === 'PERCENT' ? `${promo.discount_value}%` : vnd(promo.discount_value)}<small>Đơn từ {vnd(promo.min_order_amount)}</small></td><td>{promo.usage_count}{promo.usage_limit === null ? ' / ∞' : ` / ${promo.usage_limit}`}</td><td>{new Date(promo.starts_at).toLocaleDateString('vi-VN')} – {new Date(promo.ends_at).toLocaleDateString('vi-VN')}</td><td>{promo.is_active ? 'Đang bật' : 'Đang tắt'}</td><td><div className="admin-row-actions"><button className="admin-edit-btn" onClick={() => { setEditingPromotion(promo.id); setPromotionForm({ ...promo, starts_at: localDateTime(promo.starts_at), ends_at: localDateTime(promo.ends_at) }) }}>Sửa</button><button className="admin-delete-btn" disabled={saving} onClick={() => { if (window.confirm(`Xóa/ngừng mã ${promo.code}?`)) void runAction(() => api.deletePromotion(promo.id), 'Đã xử lý mã khuyến mãi.') }}>Xóa</button></div></td></tr>)}</tbody>
              </table></div></section>
            </>
          )}

          {menu === 'reviews' && (
            <section className="admin-review-list">{reviews.map((review) => <article className="admin-panel" key={review.id}>
              <div className="admin-review-heading"><div><strong>{review.product_name}</strong><small>{review.customer_name} · {review.customer_email} · {new Date(review.created_at).toLocaleDateString('vi-VN')}</small></div><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>
              {review.title && <h3>{review.title}</h3>}<p>{review.content || 'Không có nội dung.'}</p>
              <label className="admin-field">Phản hồi cửa hàng<textarea maxLength={2000} value={reviewReplies[review.id] ?? review.admin_reply ?? ''} onChange={(e) => setReviewReplies({ ...reviewReplies, [review.id]: e.target.value })} /></label>
              <div className="admin-form-actions"><button disabled={saving} onClick={() => void runAction(() => api.updateReview(review.id, { admin_reply: reviewReplies[review.id] ?? review.admin_reply ?? '' }), 'Đã lưu phản hồi.')}>Lưu phản hồi</button><button className="ghost" disabled={saving} onClick={() => void runAction(() => api.updateReview(review.id, { is_visible: review.is_visible ? 0 : 1, admin_reply: reviewReplies[review.id] ?? review.admin_reply ?? '' }), review.is_visible ? 'Đã ẩn đánh giá.' : 'Đã hiển thị đánh giá.')}>{review.is_visible ? 'Ẩn đánh giá' : 'Hiển thị đánh giá'}</button></div>
            </article>)}{!reviews.length && <p className="empty">Chưa có đánh giá.</p>}</section>
          )}

          {menu === 'settings' && (
            <form className="admin-panel admin-settings-form" onSubmit={saveSettings}>
              <h3>Thông tin cửa hàng</h3>
              <div className="admin-inline-form">
                {([
                  ['store_name', 'Tên cửa hàng'],
                  ['contact_email', 'Email liên hệ'],
                  ['contact_phone', 'Điện thoại'],
                  ['store_logo', 'URL logo'],
                  ['store_favicon', 'URL favicon'],
                  ['address', 'Địa chỉ'],
                  ['primary_color', 'Màu chính'],
                  ['secondary_color', 'Màu phụ'],
                  ['meta_title', 'Tiêu đề SEO'],
                  ['og_image', 'URL ảnh chia sẻ'],
                  ['free_shipping_threshold', 'Miễn phí ship từ (VND)'],
                  ['cod_fee', 'Phí COD (VND)'],
                ] as const).map(([field, label]) => <label className="admin-field" key={field}>{label}<input type={field.includes('color') ? 'color' : typeof settings[field] === 'number' ? 'number' : 'text'} min={typeof settings[field] === 'number' ? 0 : undefined} value={settings[field]} onChange={(e) => setSettings({ ...settings, [field]: typeof settings[field] === 'number' ? Number(e.target.value) : e.target.value })} /></label>)}
                <label className="admin-field admin-field-full">Mô tả cửa hàng<textarea value={settings.store_description} onChange={(e) => setSettings({ ...settings, store_description: e.target.value })} /></label>
                <label className="admin-field admin-field-full">Mô tả SEO<textarea value={settings.meta_description} onChange={(e) => setSettings({ ...settings, meta_description: e.target.value })} /></label>
                <label className="admin-field admin-field-full">Thông báo bảo trì<textarea value={settings.maintenance_message} onChange={(e) => setSettings({ ...settings, maintenance_message: e.target.value })} /></label>
                <label className="admin-check"><input type="checkbox" checked={settings.maintenance_mode === 1} onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked ? 1 : 0 })} /> Bật chế độ bảo trì</label>
              </div>
              <div className="admin-form-actions"><button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu cài đặt'}</button></div>
            </form>
          )}
        </>
      )}
    </section>
  )
}

export default AdminManagementPage

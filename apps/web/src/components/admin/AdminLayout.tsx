
import { useState, type ReactNode } from 'react'

type AdminMenu =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'customers'
  | 'categories'
  | 'payments'
  | 'inventory'
  | 'promotions'
  | 'reviews'
  | 'settings'

type AdminLayoutProps = {
  children: ReactNode
  activeMenu: AdminMenu
  onNavigate: (menu: AdminMenu) => void
  onBackToStore: () => void
}

const menuGroups = [
  {
    title: 'TỔNG QUAN',
    items: [
      { id: 'dashboard', label: 'Tổng quan', icon: '▦' },
    ],
  },
  {
    title: 'QUẢN LÝ BÁN HÀNG',
    items: [
      { id: 'products', label: 'Sản phẩm', icon: '□' },
      { id: 'orders', label: 'Đơn hàng', icon: '▤' },
      { id: 'customers', label: 'Khách hàng', icon: '♙' },
      { id: 'categories', label: 'Danh mục', icon: '▧' },
      { id: 'inventory', label: 'Kho hàng', icon: '▥' },
    ],
  },
  {
    title: 'KINH DOANH',
    items: [
      { id: 'payments', label: 'Thanh toán', icon: '₫' },
      { id: 'promotions', label: 'Khuyến mãi', icon: '%' },
      { id: 'reviews', label: 'Đánh giá', icon: '☆' },
    ],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { id: 'settings', label: 'Cài đặt', icon: '⚙' },
    ],
  },
] satisfies {
  title: string
  items: { id: AdminMenu; label: string; icon: string }[]
}[]

const pageTitles: Record<AdminMenu, string> = {
  dashboard: 'Tổng quan',
  products: 'Quản lý sản phẩm',
  orders: 'Quản lý đơn hàng',
  customers: 'Quản lý khách hàng',
  categories: 'Quản lý danh mục',
  payments: 'Quản lý thanh toán',
  inventory: 'Quản lý kho hàng',
  promotions: 'Quản lý khuyến mãi',
  reviews: 'Quản lý đánh giá',
  settings: 'Cài đặt hệ thống',
}

export type { AdminMenu }

export default function AdminLayout({
  children,
  activeMenu,
  onNavigate,
  onBackToStore,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="admin-brand">
          <div className="admin-brand-icon">S</div>
          <div>
            <strong>STOREZ</strong>
            <span>Quản lý món sấy</span>
          </div>
        </div>

        <nav className="admin-navigation">
          {menuGroups.map((group) => (
            <div className="admin-menu-group" key={group.title}>
              <div className="admin-menu-heading">{group.title}</div>

              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-menu-item ${
                    activeMenu === item.id ? 'active' : ''
                  }`}
                  onClick={() => {
                    onNavigate(item.id)
                    setSidebarOpen(false)
                  }}
                >
                  <span className="admin-menu-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="admin-back-store"
          onClick={onBackToStore}
        >
          ← Quay lại cửa hàng
        </button>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-overlay"
          aria-label="Đóng menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-mobile-menu"
              aria-label="Mở menu"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>

            <div>
              <div className="admin-breadcrumb">Quản trị / Cửa hàng</div>
              <h1>{pageTitles[activeMenu]}</h1>
            </div>
          </div>

          <div className="admin-topbar-right">
            <span className="admin-status">
              <span />
              Hệ thống quản trị
            </span>
            <div className="admin-avatar" title="Quản trị viên">
              A
            </div>
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  )
}

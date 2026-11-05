import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  api,
  vnd,
  type AdminCategory,
  type Product,
  type ProductInput,
  type ProductVariant,
} from '../../api'

const suggestedProductName = (
  fruitType: string,
  dryingMethod: string,
  weight: number | null,
) => {
  const fruit = fruitType.trim()
  const method = dryingMethod
    .trim()
    .replace(/\s*\(đề xuất demo\)$/i, '')
  const methodDetail = method.replace(/^sấy\s*/i, '').trim()
  const dryingLabel = methodDetail
    ? `sấy ${methodDetail}`
    : /^sấy$/i.test(method)
      ? 'sấy'
      : ''
  return [fruit, dryingLabel, weight ? `${weight}g` : '']
    .filter(Boolean)
    .join(' ')
}

export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [newSku, setNewSku] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [detailTab, setDetailTab] = useState<'overview' | 'details'>('overview')
  const [productSearch, setProductSearch] = useState('')

  const [form, setForm] = useState<ProductInput>({
    name: '',
    description: '',
    price: 0,
    image: '',
    category_id: null,
    stock: 0,
    is_active: 1,
    short_description: '',
    details: '',
    fruit_type: '',
    drying_method: '',
    ingredients: '',
    net_weight_g: null,
    origin: '',
    responsible_party: '',
    packaging: '',
    produced_on: null,
    expiry_info: '',
    storage_instructions: '',
    data_status: 'SAMPLE',
    verification_source: '',
    is_featured: 0,
  })

  const loadProducts = async () => {
    setLoading(true)
    setError('')

    try {
      const [data, categoryData] = await Promise.all([
        api.adminProducts(),
        api.adminCategories(),
      ])
      setProducts(data)
      setCategories(categoryData)
      setForm((previous) => previous.category_id !== null
        ? previous
        : {
            ...previous,
            category_id: categoryData.find((category) =>
              category.is_active === 1 && category.name === 'Hoa quả sấy',
            )?.id ?? null,
          })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể tải danh sách sản phẩm.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [])

  useEffect(() => {
    if (!selectedProduct) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedProduct(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedProduct])

  const filteredProducts = products.filter((product) => {
    const query = productSearch.trim().toLocaleLowerCase('vi')
    if (!query) return true

    return [
      product.name,
      product.fruit_type,
      product.origin,
      product.responsible_party,
      product.category_name,
    ].some((value) => value?.toLocaleLowerCase('vi').includes(query))
  })

  const resetForm = () => {
    setEditingId(null)
    setVariants([])
    setForm({
      name: '',
      description: '',
      price: 0,
      image: '',
      category_id: categories.find((category) =>
        category.is_active === 1 && category.name === 'Hoa quả sấy',
      )?.id ?? null,
      stock: 0,
      is_active: 1,
      short_description: '',
      details: '',
      fruit_type: '',
      drying_method: '',
      ingredients: '',
      net_weight_g: null,
      origin: '',
      responsible_party: '',
      packaging: '',
      produced_on: null,
      expiry_info: '',
      storage_instructions: '',
      data_status: 'SAMPLE',
      verification_source: '',
      is_featured: 0,
    })
    setNewSku('')
  }

  const updateVariant = (index: number, patch: Partial<ProductVariant>) => {
    setVariants((previous) =>
      previous.map((variant, rowIndex) =>
        rowIndex === index ? { ...variant, ...patch } : variant,
      ),
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (editingId === null && (
      !form.fruit_type?.trim() ||
      !form.drying_method?.trim() ||
      !Number.isSafeInteger(form.net_weight_g) ||
      !form.net_weight_g ||
      !newSku.trim() ||
      form.category_id === null
    )) {
      setError('Vui lòng nhập loại trái cây, phương pháp sấy, khối lượng, SKU và danh mục.')
      return
    }

    if (editingId === null &&
      (!Number.isSafeInteger(form.stock) || (form.stock ?? -1) < 0)) {
      setError('Tồn kho phải là số nguyên không âm.')
      return
    }

    if (!Number.isSafeInteger(form.price) || form.price <= 0) {
      setError('Giá sản phẩm phải là số nguyên lớn hơn 0.')
      return
    }

    if (!form.image.trim()) {
      setError('Vui lòng tải ảnh sản phẩm lên.')
      return
    }

    if (editingId !== null && !form.name.trim()) {
      setError('Vui lòng nhập tên sản phẩm.')
      return
    }

    if (form.data_status === 'VERIFIED' && !form.verification_source?.trim()) {
      setError('Cần ghi nguồn đối chiếu trước khi đánh dấu dữ liệu đã xác minh.')
      return
    }

    if (editingId !== null && variants.some((variant) =>
      !variant.sku.trim() ||
      !Number.isSafeInteger(variant.weight_g) || variant.weight_g <= 0 ||
      !Number.isSafeInteger(variant.price) || variant.price <= 0 ||
      (variant.sale_price !== null &&
        (!Number.isSafeInteger(variant.sale_price) || variant.sale_price < 0 ||
          variant.sale_price > variant.price)) ||
      !Number.isSafeInteger(variant.stock) || variant.stock < 0
    )) {
      setError('Mỗi quy cách cần SKU, khối lượng, giá và tồn kho hợp lệ.')
      return
    }

    setSaving(true)

    try {
      const product: ProductInput = {
        name: editingId !== null
          ? form.name.trim()
          : suggestedProductName(
              form.fruit_type ?? '',
              form.drying_method ?? '',
              form.net_weight_g ?? null,
            ),
        description: form.description.trim(),
        price: form.price,
        image: form.image.trim(),
        category_id: form.category_id ?? null,
        stock: editingId !== null ? form.stock ?? 0 : 0,
        is_active: form.is_active ?? 1,
        short_description: form.short_description ?? '',
        details: form.details ?? '',
        fruit_type: form.fruit_type ?? '',
        drying_method: form.drying_method ?? '',
        ingredients: form.ingredients ?? '',
        net_weight_g: form.net_weight_g ?? null,
        origin: form.origin ?? '',
        responsible_party: form.responsible_party ?? '',
        packaging: form.packaging ?? '',
        produced_on: form.produced_on ?? null,
        expiry_info: form.expiry_info ?? '',
        storage_instructions: form.storage_instructions ?? '',
        data_status: form.data_status ?? 'SAMPLE',
        verification_source: form.verification_source ?? '',
        is_featured: form.is_featured ?? 0,
      }

      let productId = editingId
      if (editingId !== null) {
        await api.updateProduct(editingId, product)
      } else {
        const created = await api.createProduct(product)
        productId = created.product.id
      }
      if (productId !== null) {
        const variantsToSave = editingId !== null
          ? variants
          : [{
              sku: newSku.trim(),
              weight_g: form.net_weight_g ?? 0,
              flavor: '',
              packaging: '',
              price: form.price,
              sale_price: null,
              stock: form.stock ?? 0,
            }]
        await api.updateProductVariants(productId, variantsToSave)
      }
      setMessage(editingId !== null
        ? 'Cập nhật sản phẩm thành công.'
        : 'Thêm sản phẩm thành công.')

      resetForm()
      await loadProducts()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể lưu sản phẩm.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product: Product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      description: product.description,
      price: product.price,
      image: product.image,
      category_id: product.category_id ?? null,
      stock: product.stock ?? 0,
      is_active: product.is_active ?? 1,
      short_description: product.short_description ?? '',
      details: product.details ?? '',
      fruit_type: product.fruit_type ?? '',
      drying_method: product.drying_method ?? '',
      ingredients: product.ingredients ?? '',
      net_weight_g: product.net_weight_g ?? null,
      origin: product.origin ?? '',
      responsible_party: product.responsible_party ?? '',
      packaging: product.packaging ?? '',
      produced_on: product.produced_on ?? null,
      expiry_info: product.expiry_info ?? '',
      storage_instructions: product.storage_instructions ?? '',
      data_status: product.data_status ?? 'SAMPLE',
      verification_source: product.verification_source ?? '',
      is_featured: product.is_featured ?? 0,
    })
    setVariants(product.variants ?? [])

    setError('')
    setMessage('')

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (product: Product) => {
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa sản phẩm "${product.name}" không?`,
    )

    if (!confirmed) return

    setError('')
    setMessage('')

    try {
      await api.deleteProduct(product.id)
      setMessage('Xóa sản phẩm thành công.')

      if (editingId === product.id) {
        resetForm()
      }

      await loadProducts()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể xóa sản phẩm.',
      )
    }
  }

  const handleUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setMessage('')

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      setError('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Dung lượng ảnh không được vượt quá 5MB.')
      event.target.value = ''
      return
    }

    setUploading(true)

    try {
      const result = await api.uploadImage(file)

      setForm((previous) => ({
        ...previous,
        image: result.url,
      }))

      setMessage('Tải ảnh lên thành công.')
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể tải ảnh lên.',
      )
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <div>
          <p className="products-eyebrow">QUẢN LÝ THỰC PHẨM SẤY</p>
          <h1>Quản trị cửa hàng</h1>
          <p>Quản lý và cập nhật sản phẩm trong hệ thống Storez.</p>
        </div>

        <button className="ghost" onClick={onBack}>
          ← Quay lại cửa hàng
        </button>
      </div>

      <section className="admin-overview">
        <article className="admin-stat">
          <span>📦</span>
          <div>
            <p>Tổng sản phẩm</p>
            <strong>{products.length}</strong>
          </div>
        </article>

        <article className="admin-stat">
          <span>🖼️</span>
          <div>
            <p>Sản phẩm có hình ảnh</p>
            <strong>
              {products.filter((product) => product.image).length}
            </strong>
          </div>
        </article>
      </section>

      {error && <p className="error">Lỗi: {error}</p>}
      {message && <p className="success-message">{message}</p>}

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>
              {editingId !== null
                ? '✏️ Chỉnh sửa sản phẩm'
                : '➕ Thêm sản phẩm mới'}
            </h2>
            <p>Nhập thông tin sản phẩm và lưu vào cửa hàng.</p>
          </div>
        </div>

        <form className="admin-product-form" onSubmit={handleSubmit}>
          {editingId === null ? (
            <>
              <label className="admin-field">
                Loại trái cây
                <input
                  value={form.fruit_type ?? ''}
                  maxLength={100}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    fruit_type: event.target.value,
                  }))}
                  required
                />
              </label>

              <label className="admin-field">
                Phương pháp sấy
                <input
                  value={form.drying_method ?? ''}
                  maxLength={100}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    drying_method: event.target.value,
                  }))}
                  required
                />
              </label>

              <label className="admin-field">
                Giá (VNĐ)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.price || ''}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    price: Number(event.target.value),
                  }))}
                  required
                />
              </label>

              <label className="admin-field">
                Khối lượng (g)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.net_weight_g ?? ''}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    net_weight_g: event.target.value ? Number(event.target.value) : null,
                  }))}
                  required
                />
              </label>

              <label className="admin-field">
                SKU
                <input
                  value={newSku}
                  maxLength={80}
                  onChange={(event) => setNewSku(event.target.value)}
                  required
                />
              </label>

              <label className="admin-field">
                Tồn kho
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock ?? 0}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    stock: Number(event.target.value),
                  }))}
                  required
                />
              </label>

              <label className="admin-field">
                Danh mục
                <select
                  value={form.category_id ?? ''}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    category_id: event.target.value ? Number(event.target.value) : null,
                  }))}
                  required
                >
                  {categories.filter((category) => category.is_active === 1).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name === 'Hoa quả sấy' ? 'Trái cây sấy' : category.name}
                    </option>
                  ))}
                </select>
              </label>

              <p className="admin-field-full">
                Tên sản phẩm: {suggestedProductName(
                  form.fruit_type ?? '',
                  form.drying_method ?? '',
                  form.net_weight_g ?? null,
                ) || 'Tự tạo từ thông tin đã nhập'}
              </p>
            </>
          ) : (
            <>
          <label className="admin-field">
            Tên sản phẩm
            <input
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              placeholder="Nhập tên sản phẩm"
              maxLength={200}
              required
            />
          </label>

          <label className="admin-field">
            Giá sản phẩm (VNĐ)
            <input
              type="number"
              min="1"
              step="1"
              value={form.price || ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  price: Number(event.target.value),
                }))
              }
              placeholder="Ví dụ: 150000"
              required
            />
          </label>

          <label className="admin-field">
            Danh mục
            <select
              value={form.category_id ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  category_id: event.target.value ? Number(event.target.value) : null,
                }))
              }
            >
              <option value="">Chưa phân loại</option>
              {categories.filter((category) => category.is_active === 1).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            Tồn kho sản phẩm (chỉ dùng khi chưa có biến thể)
            <input
              type="number"
              min="0"
              step="1"
              value={form.stock ?? 0}
              disabled={variants.length > 0}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  stock: Number(event.target.value),
                }))
              }
            />
            {variants.length > 0 && <small>Tồn kho đang được quản lý riêng theo từng quy cách.</small>}
          </label>

          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.is_active === 1}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  is_active: event.target.checked ? 1 : 0,
                }))
              }
            />
            Hiển thị sản phẩm
          </label>

          <label className="admin-field admin-field-full">
            Mô tả sản phẩm
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              placeholder="Nhập mô tả sản phẩm..."
              rows={4}
              maxLength={5000}
            />
          </label>

          <label className="admin-field admin-field-full">
            Mô tả ngắn
            <input
              value={form.short_description ?? ''}
              maxLength={500}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                short_description: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field admin-field-full">
            Thông tin chi tiết
            <textarea
              value={form.details ?? ''}
              maxLength={2000}
              rows={3}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                details: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Loại trái cây
            <input
              value={form.fruit_type ?? ''}
              maxLength={100}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                fruit_type: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Phương pháp sấy
            <input
              value={form.drying_method ?? ''}
              maxLength={100}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                drying_method: event.target.value,
              }))}
              placeholder="Ví dụ: sấy dẻo / sấy giòn"
            />
          </label>

          <label className="admin-field admin-field-full">
            Thành phần
            <textarea
              value={form.ingredients ?? ''}
              maxLength={2000}
              rows={2}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                ingredients: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Khối lượng tịnh (g)
            <input
              type="number"
              min="1"
              step="1"
              value={form.net_weight_g ?? ''}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                net_weight_g: event.target.value ? Number(event.target.value) : null,
              }))}
            />
          </label>

          <label className="admin-field">
            Xuất xứ
            <input
              value={form.origin ?? ''}
              maxLength={200}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                origin: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Thương hiệu / đơn vị chịu trách nhiệm
            <input
              value={form.responsible_party ?? ''}
              maxLength={200}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                responsible_party: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Quy cách đóng gói
            <input
              value={form.packaging ?? ''}
              maxLength={200}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                packaging: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Thông tin hạn sử dụng
            <input
              value={form.expiry_info ?? ''}
              maxLength={500}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                expiry_info: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field">
            Ngày sản xuất (nếu xác minh được)
            <input
              type="date"
              value={form.produced_on ?? ''}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                produced_on: event.target.value || null,
              }))}
            />
          </label>

          <label className="admin-field admin-field-full">
            Hướng dẫn bảo quản
            <textarea
              value={form.storage_instructions ?? ''}
              maxLength={1000}
              rows={2}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                storage_instructions: event.target.value,
              }))}
            />
          </label>

          <label className="admin-field admin-field-full">
            Nguồn xác minh (URL tài liệu/nhãn nhà cung cấp)
            <input
              value={form.verification_source ?? ''}
              maxLength={2000}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                verification_source: event.target.value,
              }))}
              placeholder="Nhập URL hoặc mã tham chiếu tài liệu đã kiểm tra"
            />
          </label>

          <label className="admin-field">
            Trạng thái dữ liệu
            <select
              value={form.data_status ?? 'SAMPLE'}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                data_status: event.target.value as 'SAMPLE' | 'VERIFIED',
              }))}
            >
              <option value="SAMPLE">Chưa xác minh</option>
              <option value="VERIFIED">Đã xác minh (có căn cứ)</option>
            </select>
            <small>Chỉ đánh dấu xác minh khi đối chiếu được nhãn hoặc tài liệu nhà cung cấp.</small>
          </label>

          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.is_featured === 1}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                is_featured: event.target.checked ? 1 : 0,
              }))}
            />
            Sản phẩm nổi bật
          </label>

          <section className="admin-field-full variant-editor">
            <div className="variant-editor-heading">
              <div>
                <h3>Quy cách và biến thể</h3>
                <p>SKU, khối lượng, giá và tồn kho theo từng quy cách.</p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => setVariants((previous) => [...previous, {
                  sku: '',
                  weight_g: 0,
                  flavor: '',
                  packaging: '',
                  price: 0,
                  sale_price: null,
                  stock: 0,
                }])}
              >
                + Thêm quy cách
              </button>
            </div>
            {variants.map((variant, index) => (
              <div className="variant-editor-row" key={`${variant.id ?? 'new'}-${index}`}>
                <label className="admin-field">
                  SKU
                  <input value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value })} />
                </label>
                <label className="admin-field">
                  Khối lượng (g)
                  <input type="number" min="1" value={variant.weight_g || ''} onChange={(event) => updateVariant(index, { weight_g: Number(event.target.value) })} />
                </label>
                <label className="admin-field">
                  Giá (VNĐ)
                  <input type="number" min="1" value={variant.price || ''} onChange={(event) => updateVariant(index, { price: Number(event.target.value) })} />
                </label>
                <label className="admin-field">
                  Giá khuyến mãi
                  <input type="number" min="0" value={variant.sale_price ?? ''} onChange={(event) => updateVariant(index, { sale_price: event.target.value ? Number(event.target.value) : null })} />
                </label>
                <label className="admin-field">
                  Tồn kho
                  <input type="number" min="0" value={variant.stock} onChange={(event) => updateVariant(index, { stock: Number(event.target.value) })} />
                </label>
                <label className="admin-field">
                  Hương vị
                  <input value={variant.flavor} onChange={(event) => updateVariant(index, { flavor: event.target.value })} />
                </label>
                <label className="admin-field">
                  Đóng gói
                  <input value={variant.packaging} onChange={(event) => updateVariant(index, { packaging: event.target.value })} />
                </label>
                <button type="button" className="ghost" onClick={() => setVariants((previous) => previous.filter((_, rowIndex) => rowIndex !== index))}>
                  Xóa dòng
                </button>
              </div>
            ))}
            {variants.length === 0 && <p className="empty">Chưa có quy cách. Có thể thêm sau khi nhận thông tin xác minh.</p>}
          </section>
            </>
          )}

          <div className="admin-field admin-field-full">
            <span className="admin-label">Tải ảnh từ máy tính</span>

            <label className="admin-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={uploading}
              />

              <span>
                {uploading
                  ? '⏳ Đang tải ảnh lên ImageKit...'
                  : '📤 Chọn ảnh để tải lên'}
              </span>
            </label>

            <small>
              Chọn tệp sẽ tự tải lên ImageKit. Cần đăng nhập Admin; hỗ trợ JPG, PNG, WEBP tối đa 5MB.
            </small>
          </div>

          {form.image && (
            <div className="admin-image-preview">
              <span>Xem trước hình ảnh</span>
              <img src={form.image} alt="Ảnh xem trước sản phẩm" />
            </div>
          )}

          <div className="admin-form-actions admin-field-full">
            <button
              type="submit"
              disabled={saving || uploading}
            >
              {saving
                ? 'Đang lưu...'
                : editingId !== null
                  ? 'Lưu thay đổi'
                  : 'Thêm sản phẩm'}
            </button>

            {editingId !== null && (
              <button
                type="button"
                className="ghost"
                onClick={resetForm}
                disabled={saving}
              >
                Hủy chỉnh sửa
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>📦 Danh sách sản phẩm</h2>
            <p>Quản lý các sản phẩm đang có trong cửa hàng.</p>
          </div>

          <button
            className="ghost"
            onClick={() => void loadProducts()}
            disabled={loading}
          >
            ↻ Làm mới
          </button>
        </div>

        <div className="admin-products-toolbar">
          <label className="admin-field">
            Tìm sản phẩm
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Tên, loại trái cây, thương hiệu..."
              aria-label="Tìm sản phẩm"
            />
          </label>
          <span>{filteredProducts.length} / {products.length} sản phẩm</span>
        </div>

        {loading ? (
          <p className="empty">Đang tải danh sách sản phẩm...</p>
        ) : products.length === 0 ? (
          <p className="empty">Chưa có sản phẩm nào.</p>
        ) : filteredProducts.length === 0 ? (
          <p className="empty">Không tìm thấy sản phẩm phù hợp.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Hình ảnh</th>
                  <th>Sản phẩm</th>
                  <th>Giá bán</th>
                  <th>Danh mục</th>
                  <th>Tồn kho</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <img
                        className="admin-table-image"
                        src={product.image}
                        alt={product.name}
                      />
                    </td>

                    <td>
                      <strong>{product.name}</strong>
                      <small>
                        {product.short_description || product.fruit_type || 'Chưa có mô tả ngắn'}
                      </small>
                    </td>

                    <td>
                      <strong>{vnd(product.price)}</strong>
                    </td>

                    <td>{categories.find((category) => category.id === product.category_id)?.name || product.category_name || 'Chưa phân loại'}</td>
                    <td>{product.variants?.length
                      ? product.variants.reduce((total, variant) => total + variant.stock, 0)
                      : product.stock ?? 0}</td>
                    <td>
                      <span className={`admin-product-status ${product.is_active === 0 ? 'is-hidden' : 'is-active'}`}>
                        {product.is_active === 0 ? 'Đang ẩn' : 'Đang bán'}
                      </span>
                    </td>

                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-detail-btn"
                          onClick={() => {
                            setSelectedProduct(product)
                            setDetailTab('overview')
                          }}
                        >
                          Chi tiết
                        </button>
                        <button
                          type="button"
                          className="admin-edit-btn"
                          onClick={() => handleEdit(product)}
                        >
                          Sửa
                        </button>

                        <button
                          type="button"
                          className="admin-delete-btn"
                          onClick={() => void handleDelete(product)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedProduct && (
        <div
          className="admin-product-detail-backdrop"
          onClick={() => setSelectedProduct(null)}
        >
          <section
            className="admin-product-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-product-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="admin-product-detail-close"
              aria-label="Đóng chi tiết sản phẩm"
              onClick={() => setSelectedProduct(null)}
            >
              ×
            </button>

            <div className="admin-product-detail-main">
              <div className="admin-product-detail-image">
                <img src={selectedProduct.image} alt={selectedProduct.name} />
              </div>

              <div className="admin-product-detail-summary">
                <p className="products-eyebrow">CHI TIẾT SẢN PHẨM · #{selectedProduct.id}</p>
                <h2 id="admin-product-detail-title">{selectedProduct.name}</h2>
                <p className="admin-product-detail-price">{vnd(selectedProduct.price)}</p>
                <dl className="admin-product-facts">
                  <div>
                    <dt>Xuất xứ</dt>
                    <dd>{selectedProduct.origin || 'Chưa cập nhật'}</dd>
                  </div>
                  <div>
                    <dt>Thương hiệu / đơn vị chịu trách nhiệm</dt>
                    <dd>{selectedProduct.responsible_party || 'Chưa cập nhật'}</dd>
                  </div>
                  <div>
                    <dt>Khối lượng</dt>
                    <dd>{selectedProduct.net_weight_g
                      ? `${selectedProduct.net_weight_g}g`
                      : selectedProduct.variants?.length
                        ? selectedProduct.variants.map((variant) => `${variant.weight_g}g`).join(', ')
                        : 'Chưa cập nhật'}</dd>
                  </div>
                  <div>
                    <dt>Danh mục</dt>
                    <dd>{categories.find((category) => category.id === selectedProduct.category_id)?.name || selectedProduct.category_name || 'Chưa phân loại'}</dd>
                  </div>
                  <div>
                    <dt>Tồn kho</dt>
                    <dd>{selectedProduct.variants?.length
                      ? selectedProduct.variants.reduce((total, variant) => total + variant.stock, 0)
                      : selectedProduct.stock ?? 0} sản phẩm</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{selectedProduct.is_active === 0 ? 'Đang ẩn' : 'Đang bán'} · {selectedProduct.data_status === 'VERIFIED' ? 'Đã xác minh' : 'Chưa xác minh'}</dd>
                  </div>
                </dl>

                <div className="admin-product-detail-tags">
                  {selectedProduct.fruit_type && <span>{selectedProduct.fruit_type}</span>}
                  {selectedProduct.drying_method && <span>{selectedProduct.drying_method}</span>}
                  {selectedProduct.packaging && <span>{selectedProduct.packaging}</span>}
                </div>
              </div>
            </div>

            <div className="admin-product-detail-tabs" role="tablist" aria-label="Thông tin sản phẩm">
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'overview'}
                className={detailTab === 'overview' ? 'active' : ''}
                onClick={() => setDetailTab('overview')}
              >
                Thông tin sản phẩm
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'details'}
                className={detailTab === 'details' ? 'active' : ''}
                onClick={() => setDetailTab('details')}
              >
                Thành phần & bảo quản
              </button>
            </div>

            {detailTab === 'overview' ? (
              <div className="admin-product-detail-content" role="tabpanel">
                {selectedProduct.short_description && <p className="admin-product-detail-lead">{selectedProduct.short_description}</p>}
                <h3>Mô tả sản phẩm</h3>
                <p>{selectedProduct.description || 'Chưa có mô tả sản phẩm.'}</p>
                {selectedProduct.details && (
                  <>
                    <h3>Thông tin chi tiết</h3>
                    <p>{selectedProduct.details}</p>
                  </>
                )}
                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <>
                    <h3>Quy cách bán</h3>
                    <div className="admin-product-variant-list">
                      {selectedProduct.variants.map((variant) => (
                        <div key={variant.id ?? variant.sku}>
                          <strong>{variant.weight_g}g</strong>
                          <span>{variant.flavor || 'Vị nguyên bản'} · {variant.packaging || 'Chưa ghi đóng gói'}</span>
                          <span>{vnd(variant.sale_price ?? variant.price)}</span>
                          <span>SKU: {variant.sku}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="admin-product-detail-content" role="tabpanel">
                <h3>Thành phần</h3>
                <p>{selectedProduct.ingredients || 'Chưa cập nhật thành phần.'}</p>
                <h3>Hạn sử dụng</h3>
                <p>{selectedProduct.expiry_info || 'Chưa cập nhật hạn sử dụng.'}</p>
                {selectedProduct.produced_on && (
                  <>
                    <h3>Ngày sản xuất</h3>
                    <p>{selectedProduct.produced_on}</p>
                  </>
                )}
                <h3>Hướng dẫn bảo quản</h3>
                <p>{selectedProduct.storage_instructions || 'Chưa cập nhật hướng dẫn bảo quản.'}</p>
                <h3>Nguồn xác minh</h3>
                {selectedProduct.verification_source ? (
                  /^https?:\/\//i.test(selectedProduct.verification_source)
                    ? <a href={selectedProduct.verification_source} target="_blank" rel="noreferrer">{selectedProduct.verification_source}</a>
                    : <p>{selectedProduct.verification_source}</p>
                ) : <p>Chưa cập nhật nguồn xác minh.</p>}
              </div>
            )}

            <div className="admin-product-detail-actions">
              <button
                type="button"
                className="admin-edit-btn"
                onClick={() => {
                  handleEdit(selectedProduct)
                  setSelectedProduct(null)
                }}
              >
                Chỉnh sửa sản phẩm
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setSelectedProduct(null)}
              >
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

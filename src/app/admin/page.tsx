'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

// Types
interface CategoryTranslation { id: number; category_id: number; language: string; name: string; }
interface Category { id: number; slug: string; icon: string | null; sort_order: number; is_active: boolean; category_translations: CategoryTranslation[]; }
interface StoreTranslation { id: number; store_id: number; language: string; name: string; }
interface Store { id: number; slug: string; logo_url: string | null; website_url: string | null; is_active: boolean; store_translations: StoreTranslation[]; }
interface ProductTranslation { id: number; product_id: number; language: string; name: string; description: string | null; features: string | null; specs: string | null; }
interface ProductPrice { id: number; product_id: number; store_id: number; current_price: string; original_price: string | null; product_url: string; in_stock: boolean; discount_percent: number | null; }
interface BannerTranslation { id: number; banner_id: number; language: string; image_key: string | null; title: string | null; subtitle: string | null; }
interface Banner { id: number; image_key: string | null; image_url: string | null; link_url: string | null; sort_order: number; is_active: boolean; banner_translations: BannerTranslation[]; }
interface Product { id: number; slug: string; category_id: number | null; image_url: string | null; images: string | null; is_active: boolean; is_featured: boolean; product_translations: ProductTranslation[]; product_prices: ProductPrice[]; categories?: { id: number; slug: string; category_translations: CategoryTranslation[] } | null; }

type Tab = 'products' | 'categories' | 'stores' | 'banners';
const LANGUAGES = ['en', 'zh'];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, storeRes, prodRes, bannerRes] = await Promise.all([
        fetch('/api/admin/categories'),
        fetch('/api/admin/stores'),
        fetch('/api/admin/products?limit=100'),
        fetch('/api/admin/banners'),
      ]);
      const catJson = await catRes.json();
      const storeJson = await storeRes.json();
      const prodJson = await prodRes.json();
      const bannerJson = await bannerRes.json();
      if (catJson.success) setCategories(catJson.data || []);
      if (storeJson.success) setStores(storeJson.data || []);
      if (prodJson.success) setProducts(prodJson.data?.products || []);
      if (bannerJson.success) setBanners(bannerJson.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  // Seed data
  const handleSeed = async () => {
    if (!confirm('This will add demo data. Continue?')) return;
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert(json.message);
        fetchAllData();
      } else {
        alert('Error: ' + json.error);
      }
    } catch (err) {
      alert('Failed to seed data');
    }
  };

  // Delete product
  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch(`/api/admin/products?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert('Error: ' + json.error);
    } catch { alert('Failed to delete'); }
  };

  // Delete category
  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Are you sure? This will also delete all translations and may affect products.')) return;
    try {
      const res = await fetch(`/api/admin/categories?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert('Error: ' + json.error);
    } catch { alert('Failed to delete'); }
  };

  // Delete store
  const handleDeleteStore = async (id: number) => {
    if (!confirm('Are you sure? This will also delete all translations and prices.')) return;
    try {
      const res = await fetch(`/api/admin/stores?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert('Error: ' + json.error);
    } catch { alert('Failed to delete'); }
  };

  // Delete banner
  const handleDeleteBanner = async (id: number) => {
    if (!confirm('Are you sure you want to delete this banner?')) return;
    try {
      const res = await fetch(`/api/admin/banners?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert('Error: ' + json.error);
    } catch { alert('Failed to delete banner'); }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">V</div>
            <span className="text-xl font-bold tracking-tight">VapeDeal</span>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">Admin Panel</p>
        </div>
        <nav className="px-3 space-y-1">
          {(['products', 'categories', 'stores', 'banners'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}
            >
              {tab === 'products' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
              {tab === 'categories' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
              {tab === 'stores' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>}
              {tab === 'banners' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
        <div className="px-3 mt-8">
          <button
            onClick={handleSeed}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Seed Demo Data
          </button>
        </div>
        <div className="px-3 mt-4">
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            View Site
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Products Tab */}
          {activeTab === 'products' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Products</h1>
                <ProductFormModal
                  categories={categories}
                  stores={stores}
                  onSave={fetchAllData}
                />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Prices</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const enName = product.product_translations?.find((t) => t.language === 'en')?.name || '—';
                        const zhName = product.product_translations?.find((t) => t.language === 'zh')?.name || '—';
                        const catName = product.categories?.category_translations?.find((t) => t.language === 'en')?.name || '—';
                        return (
                          <tr key={product.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">{product.id}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium">{enName}</div>
                              <div className="text-xs text-muted-foreground">{zhName}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{catName}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{product.product_prices?.length || 0} stores</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {product.is_active && <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">Active</span>}
                                {product.is_featured && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Featured</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <ProductFormModal
                                  product={product}
                                  categories={categories}
                                  stores={stores}
                                  onSave={fetchAllData}
                                />
                                <button
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {products.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      No products yet. Click &quot;Add Product&quot; or &quot;Seed Demo Data&quot; to get started.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === 'categories' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Categories</h1>
                <CategoryFormModal onSave={fetchAllData} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Name (EN)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Name (ZH)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{cat.id}</td>
                          <td className="px-4 py-3 text-sm font-mono">{cat.slug}</td>
                          <td className="px-4 py-3 text-sm">{cat.category_translations?.find((t) => t.language === 'en')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{cat.category_translations?.find((t) => t.language === 'zh')?.name || '—'}</td>
                          <td className="px-4 py-3">
                            {cat.is_active && <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">Active</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <CategoryFormModal category={cat} onSave={fetchAllData} />
                              <button
                                onClick={() => handleDeleteCategory(cat.id)}
                                className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Stores Tab */}
          {activeTab === 'stores' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Stores</h1>
                <StoreFormModal onSave={fetchAllData} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Name (EN)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Name (ZH)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Website</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.map((store) => (
                        <tr key={store.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{store.id}</td>
                          <td className="px-4 py-3 text-sm font-mono">{store.slug}</td>
                          <td className="px-4 py-3 text-sm">{store.store_translations?.find((t) => t.language === 'en')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{store.store_translations?.find((t) => t.language === 'zh')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-accent truncate max-w-48">{store.website_url || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <StoreFormModal store={store} onSave={fetchAllData} />
                              <button
                                onClick={() => handleDeleteStore(store.id)}
                                className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Banners Tab */}
          {activeTab === 'banners' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Banners</h1>
                <BannerFormModal onSave={fetchAllData} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : banners.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No banners yet. Click &quot;Add Banner&quot; to get started.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {banners.map((banner) => {
                    const enTrans = banner.banner_translations?.find((t) => t.language === 'en');
                    const zhTrans = banner.banner_translations?.find((t) => t.language === 'zh');
                    return (
                      <div key={banner.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Banner Preview */}
                        <div className="relative aspect-[21/6] bg-secondary">
                          {banner.image_url && (
                            <img src={banner.image_url} alt="Banner preview" className="w-full h-full object-cover" />
                          )}
                          {!banner.image_url && enTrans?.image_key && (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">EN image set</div>
                          )}
                          {!banner.image_url && !enTrans?.image_key && (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No image</div>
                          )}
                          {/* Status badge */}
                          <div className="absolute top-2 right-2 flex gap-1">
                            {banner.is_active && <span className="rounded bg-green-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">Active</span>}
                          </div>
                        </div>
                        {/* Banner Info */}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Banner #{banner.id}</span>
                            <span className="text-xs text-muted-foreground">Sort: {banner.sort_order}</span>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground mb-3">
                            {enTrans && <div>EN: {enTrans.title || '(no title)'} {enTrans.image_key ? '✓ Image' : '✗ Image'}</div>}
                            {zhTrans && <div>ZH: {zhTrans.title || '(no title)'} {zhTrans.image_key ? '✓ Image' : '✗ Image'}</div>}
                            {banner.link_url && <div className="text-accent truncate">Link: {banner.link_url}</div>}
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <BannerFormModal banner={banner} onSave={fetchAllData} />
                            <button
                              onClick={() => handleDeleteBanner(banner.id)}
                              className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ============== Category Form Modal ==============
function CategoryFormModal({ category, onSave }: { category?: Category; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(category?.slug || '');
  const [icon, setIcon] = useState(category?.icon || '');
  const [sortOrder, setSortOrder] = useState(category?.sort_order || 0);
  const [isActive, setIsActive] = useState(category?.is_active !== false);
  const [translations, setTranslations] = useState<{ language: string; name: string }[]>(
    category?.category_translations?.map((t) => ({ language: t.language, name: t.name })) || [
      { language: 'en', name: '' },
      { language: 'zh', name: '' },
    ]
  );
  const [saving, setSaving] = useState(false);

  const isEdit = !!category;

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = '/api/admin/categories';
      const method = isEdit ? 'PUT' : 'POST';
      const body = { id: category?.id, slug, icon: icon || null, sort_order: sortOrder, is_active: isActive, translations };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert('Error: ' + json.error);
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {isEdit ? 'Edit' : 'Add Category'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Category' : 'Add Category'}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Slug</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Icon (emoji)</label>
                  <input value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Sort Order</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                    Active
                  </label>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">Translations</h3>
                {translations.map((t, idx) => (
                  <div key={idx} className="grid grid-cols-[60px_1fr] gap-2 mb-2">
                    <select
                      value={t.language}
                      onChange={(e) => {
                        const newT = [...translations];
                        newT[idx].language = e.target.value;
                        setTranslations(newT);
                      }}
                      className="rounded-lg border border-border bg-secondary px-2 py-2 text-sm"
                    >
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                    </select>
                    <input
                      value={t.name}
                      onChange={(e) => {
                        const newT = [...translations];
                        newT[idx].name = e.target.value;
                        setTranslations(newT);
                      }}
                      placeholder="Name"
                      className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setTranslations([...translations, { language: 'en', name: '' }])}
                  className="text-xs text-primary hover:underline"
                >
                  + Add Translation
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== Store Form Modal ==============
function StoreFormModal({ store, onSave }: { store?: Store; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(store?.slug || '');
  const [logoUrl, setLogoUrl] = useState(store?.logo_url || '');
  const [websiteUrl, setWebsiteUrl] = useState(store?.website_url || '');
  const [isActive, setIsActive] = useState(store?.is_active !== false);
  const [translations, setTranslations] = useState<{ language: string; name: string }[]>(
    store?.store_translations?.map((t) => ({ language: t.language, name: t.name })) || [
      { language: 'en', name: '' },
      { language: 'zh', name: '' },
    ]
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!store;

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = '/api/admin/stores';
      const method = isEdit ? 'PUT' : 'POST';
      const body = { id: store?.id, slug, logo_url: logoUrl || null, website_url: websiteUrl || null, is_active: isActive, translations };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert('Error: ' + json.error);
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {isEdit ? 'Edit' : 'Add Store'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Store' : 'Add Store'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Slug</label>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Logo URL</label>
                <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Website URL</label>
                <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                Active
              </label>
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">Translations</h3>
                {translations.map((t, idx) => (
                  <div key={idx} className="grid grid-cols-[60px_1fr] gap-2 mb-2">
                    <select
                      value={t.language}
                      onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }}
                      className="rounded-lg border border-border bg-secondary px-2 py-2 text-sm"
                    >
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                    </select>
                    <input
                      value={t.name}
                      onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }}
                      placeholder="Name"
                      className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', name: '' }])} className="text-xs text-primary hover:underline">+ Add Translation</button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== Product Form Modal ==============
function ProductFormModal({ product, categories, stores, onSave }: { product?: Product; categories: Category[]; stores: Store[]; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(product?.slug || '');
  const [categoryId, setCategoryId] = useState<string>(product?.category_id?.toString() || '');
  const [imageUrl, setImageUrl] = useState(product?.image_url || '');
  const [isActive, setIsActive] = useState(product?.is_active !== false);
  const [isFeatured, setIsFeatured] = useState(product?.is_featured || false);
  const [translations, setTranslations] = useState<{ language: string; name: string; description: string; features: string; specs: string }[]>(
    product?.product_translations?.map((t) => ({
      language: t.language,
      name: t.name,
      description: t.description || '',
      features: t.features || '',
      specs: t.specs || '',
    })) || [
      { language: 'en', name: '', description: '', features: '', specs: '' },
      { language: 'zh', name: '', description: '', features: '', specs: '' },
    ]
  );
  const [prices, setPrices] = useState<{ store_id: string; current_price: string; original_price: string; product_url: string; discount_percent: string }[]>(
    product?.product_prices?.map((p) => ({
      store_id: p.store_id.toString(),
      current_price: p.current_price,
      original_price: p.original_price || '',
      product_url: p.product_url,
      discount_percent: p.discount_percent?.toString() || '',
    })) || [{ store_id: '', current_price: '', original_price: '', product_url: '', discount_percent: '' }]
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!product;

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = '/api/admin/products';
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        id: product?.id,
        slug,
        category_id: categoryId ? parseInt(categoryId) : null,
        image_url: imageUrl || null,
        is_active: isActive,
        is_featured: isFeatured,
        translations: translations.map((t) => ({
          language: t.language,
          name: t.name,
          description: t.description || null,
          features: t.features || null,
          specs: t.specs || null,
        })),
        prices: prices.filter((p) => p.store_id && p.current_price && p.product_url).map((p) => ({
          store_id: parseInt(p.store_id),
          current_price: p.current_price,
          original_price: p.original_price || null,
          product_url: p.product_url,
          discount_percent: p.discount_percent ? parseInt(p.discount_percent) : null,
        })),
      };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert('Error: ' + json.error);
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {isEdit ? 'Edit' : 'Add Product'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Slug</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Category</label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.category_translations?.find((t) => t.language === 'en')?.name || c.slug}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Image URL</label>
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" /> Active</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="rounded" /> Featured</label>
              </div>

              {/* Translations */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">Translations</h3>
                {translations.map((t, idx) => (
                  <div key={idx} className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={t.language}
                        onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }}
                        className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs"
                      >
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                      </select>
                      <span className="text-xs text-muted-foreground">Translation</span>
                    </div>
                    <input
                      value={t.name}
                      onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }}
                      placeholder="Product name"
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm mb-2"
                    />
                    <textarea
                      value={t.description}
                      onChange={(e) => { const newT = [...translations]; newT[idx].description = e.target.value; setTranslations(newT); }}
                      placeholder="Description"
                      rows={2}
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm mb-2"
                    />
                    <input
                      value={t.features}
                      onChange={(e) => { const newT = [...translations]; newT[idx].features = e.target.value; setTranslations(newT); }}
                      placeholder='Features (JSON array, e.g. ["Feature 1","Feature 2"])'
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm mb-2"
                    />
                    <input
                      value={t.specs}
                      onChange={(e) => { const newT = [...translations]; newT[idx].specs = e.target.value; setTranslations(newT); }}
                      placeholder='Specs (JSON object, e.g. {"Battery":"1500mAh"})'
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', name: '', description: '', features: '', specs: '' }])} className="text-xs text-primary hover:underline">
                  + Add Translation
                </button>
              </div>

              {/* Prices */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">Store Prices</h3>
                {prices.map((p, idx) => (
                  <div key={idx} className="mb-3 p-3 rounded-lg border border-border bg-secondary/30">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Store</label>
                        <select
                          value={p.store_id}
                          onChange={(e) => { const newP = [...prices]; newP[idx].store_id = e.target.value; setPrices(newP); }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm"
                        >
                          <option value="">Select store</option>
                          {stores.map((s) => (
                            <option key={s.id} value={s.id}>{s.store_translations?.find((t) => t.language === 'en')?.name || s.slug}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Current Price ($)</label>
                        <input
                          value={p.current_price}
                          onChange={(e) => { const newP = [...prices]; newP[idx].current_price = e.target.value; setPrices(newP); }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Original Price ($)</label>
                        <input
                          value={p.original_price}
                          onChange={(e) => { const newP = [...prices]; newP[idx].original_price = e.target.value; setPrices(newP); }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Discount %</label>
                        <input
                          value={p.discount_percent}
                          onChange={(e) => { const newP = [...prices]; newP[idx].discount_percent = e.target.value; setPrices(newP); }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Product URL</label>
                        <input
                          value={p.product_url}
                          onChange={(e) => { const newP = [...prices]; newP[idx].product_url = e.target.value; setPrices(newP); }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    {prices.length > 1 && (
                      <button
                        onClick={() => setPrices(prices.filter((_, i) => i !== idx))}
                        className="mt-2 text-[10px] text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setPrices([...prices, { store_id: '', current_price: '', original_price: '', product_url: '', discount_percent: '' }])} className="text-xs text-primary hover:underline">
                  + Add Store Price
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== Banner Form Modal ==============
function BannerFormModal({ banner, onSave }: { banner?: Banner; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState(banner?.link_url || '');
  const [sortOrder, setSortOrder] = useState(banner?.sort_order || 0);
  const [isActive, setIsActive] = useState(banner?.is_active !== false);
  const [defaultImageKey, setDefaultImageKey] = useState(banner?.image_key || '');
  const [translations, setTranslations] = useState<{ language: string; image_key: string; title: string; subtitle: string }[]>(
    banner?.banner_translations?.map((t) => ({
      language: t.language,
      image_key: t.image_key || '',
      title: t.title || '',
      subtitle: t.subtitle || '',
    })) || [
      { language: 'en', image_key: '', title: '', subtitle: '' },
      { language: 'zh', image_key: '', title: '', subtitle: '' },
    ]
  );
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = !!banner;

  const handleUpload = async (file: File, target: 'default' | number) => {
    const formData = new FormData();
    formData.append('file', file);

    if (target === 'default') {
      setUploading('default');
    } else {
      setUploading(`trans-${target}`);
    }

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success) {
        const key = json.data.key;
        if (target === 'default') {
          setDefaultImageKey(key);
        } else {
          const newT = [...translations];
          newT[target].image_key = key;
          setTranslations(newT);
        }
      } else {
        alert('Upload failed: ' + json.error);
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = '/api/admin/banners';
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        id: banner?.id,
        image_key: defaultImageKey || null,
        link_url: linkUrl || null,
        sort_order: sortOrder,
        is_active: isActive,
        translations: translations.map((t) => ({
          language: t.language,
          image_key: t.image_key || null,
          title: t.title || null,
          subtitle: t.subtitle || null,
        })),
      };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert('Error: ' + json.error);
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {isEdit ? 'Edit' : 'Add Banner'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Banner' : 'Add Banner'}</h2>
            <div className="space-y-4">
              {/* Default Image Upload */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Default Banner Image (fallback if no language-specific image)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file, 'default');
                    }}
                    className="text-sm"
                    disabled={uploading === 'default'}
                  />
                  {uploading === 'default' && <span className="text-xs text-primary animate-pulse">Uploading...</span>}
                  {defaultImageKey && <span className="text-xs text-green-400">✓ Uploaded</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Link URL (optional)</label>
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Sort Order</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                Active
              </label>

              {/* Language-specific translations */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">Language-specific Banners</h3>
                <p className="text-xs text-muted-foreground mb-3">Upload different banner images for each language. If no language-specific image is set, the default image will be used.</p>
                {translations.map((t, idx) => (
                  <div key={idx} className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 mb-3">
                      <select
                        value={t.language}
                        onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }}
                        className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs"
                      >
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                      </select>
                      <span className="text-xs text-muted-foreground">Banner Image</span>
                    </div>
                    <div className="mb-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(file, idx);
                        }}
                        className="text-sm"
                        disabled={uploading === `trans-${idx}`}
                      />
                      {uploading === `trans-${idx}` && <span className="text-xs text-primary animate-pulse ml-2">Uploading...</span>}
                      {t.image_key && <span className="text-xs text-green-400 ml-2">✓ Uploaded</span>}
                    </div>
                    <input
                      value={t.title}
                      onChange={(e) => { const newT = [...translations]; newT[idx].title = e.target.value; setTranslations(newT); }}
                      placeholder="Banner title (optional)"
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm mb-2"
                    />
                    <input
                      value={t.subtitle}
                      onChange={(e) => { const newT = [...translations]; newT[idx].subtitle = e.target.value; setTranslations(newT); }}
                      placeholder="Banner subtitle (optional)"
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', image_key: '', title: '', subtitle: '' }])} className="text-xs text-primary hover:underline">
                  + Add Language Banner
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

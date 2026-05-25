'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ImageUpload } from '@/components/image-upload';

// Types
interface CategoryTranslation { id: number; category_id: number; language: string; name: string; }
interface Category { id: number; slug: string; icon: string | null; sort_order: number; is_active: boolean; category_translations: CategoryTranslation[]; }
interface StoreTranslation { id: number; store_id: number; language: string; name: string; }
interface Store { id: number; slug: string; logo_url: string | null; logo_key: string | null; website_url: string | null; is_active: boolean; store_translations: StoreTranslation[]; }
interface ProductTranslation { id: number; product_id: number; language: string; name: string; description: string | null; features: string | null; specs: string | null; }
interface ProductPrice { id: number; product_id: number; store_id: number; current_price: string; original_price: string | null; product_url: string; in_stock: boolean; discount_percent: number | null; }
interface BannerTranslation { id: number; banner_id: number; language: string; image_key: string | null; title: string | null; subtitle: string | null; }
interface Banner { id: number; image_key: string | null; image_url: string | null; link_url: string | null; sort_order: number; is_active: boolean; banner_translations: BannerTranslation[]; }
interface Product { id: number; slug: string; category_id: number | null; image_url: string | null; image_key: string | null; images: string | null; is_active: boolean; is_featured: boolean; product_translations: ProductTranslation[]; product_prices: ProductPrice[]; categories?: { id: number; slug: string; category_translations: CategoryTranslation[] } | null; }

type Tab = 'site_settings' | 'products' | 'categories' | 'stores' | 'banners' | 'analytics';
const LANGUAGES = ['en', 'zh'];

// i18n helper
function t(en: string, zh: string, lang: string) {
  return lang === 'zh' ? zh : en;
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('site_settings');
  const [adminSiteSettings, setAdminSiteSettings] = useState<{ site_name: string; logo_url: string | null } | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteLogo, setEditSiteLogo] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<Record<string, unknown> | null>(null);
  const [analyticsMonth, setAnalyticsMonth] = useState('all');

  // Check login state on mount
  useEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (token) setIsLoggedIn(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const json = await res.json();
      if (json.success) {
        sessionStorage.setItem('admin_token', json.token);
        setIsLoggedIn(true);
      } else {
        setLoginError(t('Invalid username or password', '用户名或密码错误', adminLang));
      }
    } catch {
      setLoginError(t('Login failed', '登录失败', adminLang));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    setIsLoggedIn(false);
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetch('/api/admin/site-settings').then(r => r.json()).then(d => { if (d.success) { setAdminSiteSettings(d.data); setEditSiteName(d.data.site_name); setEditSiteLogo(d.data.logo_url); } }).catch(() => {});
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && activeTab === 'analytics') {
      fetch(`/api/analytics?month=${analyticsMonth}`).then(r => r.json()).then(d => { if (d.success) setAnalyticsData(d.data); }).catch(() => {});
    }
  }, [isLoggedIn, activeTab, analyticsMonth]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminLang, setAdminLang] = useState<'en' | 'zh'>('en');

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
    if (!confirm(t('This will add demo data. Continue?', '这将添加演示数据。继续吗？', adminLang))) return;
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert(json.message);
        fetchAllData();
      } else {
        alert(t('Error:', '错误：', adminLang) + json.error);
      }
    } catch {
      alert(t('Failed to seed data', '添加数据失败', adminLang));
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this product?', '确定要删除该产品吗？', adminLang))) return;
    try {
      const res = await fetch(`/api/admin/products?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete', '删除失败', adminLang)); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm(t('Are you sure? This will also delete all translations and may affect products.', '确定吗？这将删除所有翻译并可能影响产品。', adminLang))) return;
    try {
      const res = await fetch(`/api/admin/categories?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete', '删除失败', adminLang)); }
  };

  const handleDeleteStore = async (id: number) => {
    if (!confirm(t('Are you sure? This will also delete all translations and prices.', '确定吗？这将删除所有翻译和价格。', adminLang))) return;
    try {
      const res = await fetch(`/api/admin/stores?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete', '删除失败', adminLang)); }
  };

  const handleDeleteBanner = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this banner?', '确定要删除该 Banner 吗？', adminLang))) return;
    try {
      const res = await fetch(`/api/admin/banners?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete banner', '删除 Banner 失败', adminLang)); }
  };

  const tabLabels: Record<Tab, { en: string; zh: string }> = {
    site_settings: { en: 'Site Settings', zh: '站点设置' },
    products: { en: 'Products', zh: '产品' },
    categories: { en: 'Categories', zh: '分类' },
    stores: { en: 'Stores', zh: '商城' },
    banners: { en: 'Banners', zh: 'Banner' },
    analytics: { en: 'Analytics', zh: '数据统计' },
  };

  // Login page
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-2xl border border-border p-8 shadow-xl">
            <div className="flex flex-col items-center mb-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-2xl mb-4">V</div>
              <h1 className="text-2xl font-bold">{t('Admin Login', '后台登录', adminLang)}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('Enter credentials to continue', '请输入登录凭据', adminLang)}</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('Username', '用户名', adminLang)}</label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('Enter username', '输入用户名', adminLang)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('Password', '密码', adminLang)}</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('Enter password', '输入密码', adminLang)}
                />
              </div>
              {loginError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
                  {loginError}
                </div>
              )}
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loginLoading ? t('Logging in...', '登录中...', adminLang) : t('Login', '登录', adminLang)}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2">
            {adminSiteSettings?.logo_url ? (
              <img src={adminSiteSettings.logo_url.startsWith('http') ? adminSiteSettings.logo_url : `/api/image?key=${encodeURIComponent(adminSiteSettings.logo_url)}`} alt="Logo" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">V</div>
            )}
            <span className="text-xl font-bold tracking-tight">{adminSiteSettings?.site_name || 'VapeDeal'}</span>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{t('Admin Panel', '管理后台', adminLang)}</p>
        </div>
        <nav className="px-3 space-y-1">
          {(['site_settings', 'products', 'categories', 'stores', 'banners', 'analytics'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}
            >
              {tab === 'site_settings' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              {tab === 'products' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
              {tab === 'categories' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
              {tab === 'stores' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>}
              {tab === 'banners' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              {tab === 'analytics' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              {t(tabLabels[tab].en, tabLabels[tab].zh, adminLang)}
            </button>
          ))}
        </nav>
        <div className="px-3 mt-8">
          <button
            onClick={handleSeed}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {t('Seed Demo Data', '添加演示数据', adminLang)}
          </button>
        </div>
        <div className="px-3 mt-4">
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            {t('View Site', '查看网站', adminLang)}
          </Link>
        </div>
        {/* Language Switch */}
        <div className="px-3 mt-4">
          <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{t('Language:', '语言：', adminLang)}</span>
            <button
              onClick={() => setAdminLang('en')}
              className={`text-xs px-2 py-0.5 rounded ${adminLang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >EN</button>
            <button
              onClick={() => setAdminLang('zh')}
              className={`text-xs px-2 py-0.5 rounded ${adminLang === 'zh' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >中文</button>
          </div>
        </div>
        {/* Logout */}
        <div className="px-3 mt-4 mb-6">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            {t('Logout', '退出登录', adminLang)}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Site Settings Tab */}
          {activeTab === 'site_settings' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">{t('Site Settings', '站点设置', adminLang)}</h2>
              <div className="bg-card rounded-xl border border-border p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('Site Name', '网站名称', adminLang)}</label>
                  <input
                    type="text"
                    value={editSiteName}
                    onChange={(e) => setEditSiteName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('Enter site name', '输入网站名称', adminLang)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t('Site Logo', '网站 Logo', adminLang)}
                    <span className="ml-2 text-xs text-muted-foreground">({t('Recommended: 36x36px, 1:1 ratio', '建议尺寸: 36x36px, 1:1 比例', adminLang)})</span>
                  </label>
                  <ImageUpload
                    value={editSiteLogo}
                    onChange={setEditSiteLogo}
                    aspectRatio={1}
                    recommendedSize="36x36px"
                    label={t('Logo', 'Logo', adminLang)}
                    lang={adminLang}
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    onClick={async () => {
                      setShowSaveConfirm(true);
                    }}
                    className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {t('Save Settings', '保存设置', adminLang)}
                  </button>
                </div>
                {/* Save Confirmation Dialog */}
                {showSaveConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-2xl">
                      <h3 className="text-lg font-bold mb-2">{t('Confirm Save', '确认保存', adminLang)}</h3>
                      <p className="text-sm text-muted-foreground mb-6">{t('Are you sure you want to update the site settings? This will change the site name and logo on the frontend.', '确定要更新站点设置吗？这将更改前台的网站名称和Logo。', adminLang)}</p>
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setShowSaveConfirm(false)}
                          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors"
                        >
                          {t('Cancel', '取消', adminLang)}
                        </button>
                        <button
                          onClick={async () => {
                            setShowSaveConfirm(false);
                            const res = await fetch('/api/admin/site-settings', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ site_name: editSiteName, logo_url: editSiteLogo }),
                            });
                            const json = await res.json();
                            if (json.success) {
                              setAdminSiteSettings(json.data);
                              alert(t('Saved!', '已保存!', adminLang));
                            }
                          }}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          {t('Confirm', '确认', adminLang)}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">{t('Analytics', '数据统计', adminLang)}</h2>
                <select
                  value={analyticsMonth}
                  onChange={(e) => setAnalyticsMonth(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">{t('All', '全部', adminLang)}</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const label = d.toLocaleDateString(adminLang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' });
                    return <option key={val} value={val}>{label}</option>;
                  })}
                </select>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { key: 'pv', label: t('Page Views', '浏览量', adminLang), color: 'text-blue-400' },
                  { key: 'uv', label: t('Unique Visitors', '独立访客', adminLang), color: 'text-green-400' },
                  { key: 'vv', label: t('Visit Sessions', '访问次数', adminLang), color: 'text-purple-400' },
                  { key: 'ip', label: t('IP Count', 'IP 数', adminLang), color: 'text-orange-400' },
                ].map(({ key, label, color }) => (
                  <div key={key} className="bg-card rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{(analyticsData as Record<string, Record<string, number>>)?.summary?.[key] ?? 0}</p>
                  </div>
                ))}
              </div>

              {/* Extra Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { key: 'new_visitor_rate', label: t('New Visitor Rate', '新访客占比', adminLang), suffix: '%' },
                  { key: 'bounce_rate', label: t('Bounce Rate', '跳出率', adminLang), suffix: '%' },
                  { key: 'avg_duration', label: t('Avg Duration', '平均访问时长', adminLang), suffix: 's' },
                ].map(({ key, label, suffix }) => (
                  <div key={key} className="bg-card rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold">{(analyticsData as Record<string, Record<string, number>>)?.summary?.[key]?.toFixed(1) ?? '0.0'}{suffix}</p>
                  </div>
                ))}
              </div>

              {/* PV Trend Chart */}
              <div className="bg-card rounded-xl border border-border p-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">{t('PV/UV Trend', 'PV/UV 趋势', adminLang)}</h3>
                <div className="h-48 flex items-end gap-1">
                  {((analyticsData as Record<string, unknown>)?.trend as Array<Record<string, number | string>> || []).map((item, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-blue-500/60 rounded-t" style={{ height: `${Math.max(4, ((item.pv as number) / Math.max(...((analyticsData as Record<string, unknown>)?.trend as Array<Record<string, number>> || [{ pv: 1 }]).map((i: Record<string, number>) => i.pv || 1))) * 140)}px` }} title={`PV: ${item.pv}`} />
                      <div className="w-full bg-green-500/60 rounded-t" style={{ height: `${Math.max(4, ((item.uv as number) / Math.max(...((analyticsData as Record<string, unknown>)?.trend as Array<Record<string, number>> || [{ uv: 1 }]).map((i: Record<string, number>) => i.uv || 1))) * 100)}px` }} title={`UV: ${item.uv}`} />
                      <span className="text-[10px] text-muted-foreground truncate w-full text-center">{String(item.date).slice(-5)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500/60" /> PV</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/60" /> UV</span>
                </div>
              </div>

              {/* Click Rate Table */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-lg font-semibold mb-4">{t('Click Rate Details', '点击率详情', adminLang)}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4">{t('Metric', '指标', adminLang)}</th>
                      <th className="text-right py-3 px-4">{t('Clicks', '点击次数', adminLang)}</th>
                      <th className="text-right py-3 px-4">{t('Rate', '点击率', adminLang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: 'product_card', label: t('Product Card Click', '产品卡片点击', adminLang) },
                      { key: 'buy_button', label: t('Buy Button Click', '首页 Buy 点击', adminLang) },
                      { key: 'visit_store', label: t('Visit Store Click', '详情页 Visit Store 点击', adminLang) },
                      { key: 'banner', label: t('Banner Click', 'Banner 点击', adminLang) },
                    ].map(({ key, label }) => {
                      const clicks = ((analyticsData as Record<string, Record<string, number>>)?.clickRates?.[key] as number) || 0;
                      const pv = (analyticsData as Record<string, Record<string, number>>)?.summary?.pv || 1;
                      return (
                        <tr key={key} className="border-b border-border/50">
                          <td className="py-3 px-4">{label}</td>
                          <td className="text-right py-3 px-4 font-mono">{clicks}</td>
                          <td className="text-right py-3 px-4 font-mono">{pv > 0 ? (clicks / pv * 100).toFixed(2) : '0.00'}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {activeTab === 'products' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">{t('Products', '产品', adminLang)}</h1>
                <ProductFormModal categories={categories} stores={stores} onSave={fetchAllData} lang={adminLang} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('ID', 'ID', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Product', '产品', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Category', '分类', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Prices', '价格数', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Status', '状态', adminLang)}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('Actions', '操作', adminLang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const enName = product.product_translations?.find((tr) => tr.language === 'en')?.name || '—';
                        const zhName = product.product_translations?.find((tr) => tr.language === 'zh')?.name || '—';
                        const catName = product.categories?.category_translations?.find((tr) => tr.language === adminLang)?.name || '—';
                        return (
                          <tr key={product.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">{product.id}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium">{enName}</div>
                              <div className="text-xs text-muted-foreground">{zhName}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{catName}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{product.product_prices?.length || 0} {t('stores', '家商城', adminLang)}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {product.is_active && <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">{t('Active', '启用', adminLang)}</span>}
                                {product.is_featured && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t('Featured', '推荐', adminLang)}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <ProductFormModal product={product} categories={categories} stores={stores} onSave={fetchAllData} lang={adminLang} />
                                <button
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  {t('Delete', '删除', adminLang)}
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
                      {t('No products yet. Click "Add Product" or "Seed Demo Data" to get started.', '暂无产品。点击"添加产品"或"添加演示数据"开始。', adminLang)}
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
                <h1 className="text-2xl font-bold">{t('Categories', '分类', adminLang)}</h1>
                <CategoryFormModal onSave={fetchAllData} lang={adminLang} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('ID', 'ID', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Name (EN)', '名称 (英文)', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Name (ZH)', '名称 (中文)', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Status', '状态', adminLang)}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('Actions', '操作', adminLang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{cat.id}</td>
                          <td className="px-4 py-3 text-sm font-mono">{cat.slug}</td>
                          <td className="px-4 py-3 text-sm">{cat.category_translations?.find((tr) => tr.language === 'en')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{cat.category_translations?.find((tr) => tr.language === 'zh')?.name || '—'}</td>
                          <td className="px-4 py-3">
                            {cat.is_active && <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">{t('Active', '启用', adminLang)}</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <CategoryFormModal category={cat} onSave={fetchAllData} lang={adminLang} />
                              <button onClick={() => handleDeleteCategory(cat.id)} className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors">
                                {t('Delete', '删除', adminLang)}
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
                <h1 className="text-2xl font-bold">{t('Stores', '商城', adminLang)}</h1>
                <StoreFormModal onSave={fetchAllData} lang={adminLang} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('ID', 'ID', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Logo', 'Logo', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Name (EN)', '名称 (英文)', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Name (ZH)', '名称 (中文)', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Website', '网址', adminLang)}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('Actions', '操作', adminLang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.map((store) => (
                        <tr key={store.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{store.id}</td>
                          <td className="px-4 py-3">
                            {store.logo_url || store.logo_key ? (
                              <img
                                src={store.logo_url || `/api/image?key=${encodeURIComponent(store.logo_key || '')}`}
                                alt="Logo"
                                className="h-8 w-8 rounded object-contain bg-secondary"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                                {(store.store_translations?.find((tr) => tr.language === 'en')?.name || '?').charAt(0)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{store.slug}</td>
                          <td className="px-4 py-3 text-sm">{store.store_translations?.find((tr) => tr.language === 'en')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{store.store_translations?.find((tr) => tr.language === 'zh')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-accent truncate max-w-48">{store.website_url || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <StoreFormModal store={store} onSave={fetchAllData} lang={adminLang} />
                              <button onClick={() => handleDeleteStore(store.id)} className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors">
                                {t('Delete', '删除', adminLang)}
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
                <h1 className="text-2xl font-bold">{t('Banners', 'Banner', adminLang)}</h1>
                <BannerFormModal onSave={fetchAllData} lang={adminLang} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : banners.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {t('No banners yet. Click "Add Banner" to get started.', '暂无 Banner。点击"添加 Banner"开始。', adminLang)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {banners.map((banner) => {
                    const enTrans = banner.banner_translations?.find((tr) => tr.language === 'en');
                    const zhTrans = banner.banner_translations?.find((tr) => tr.language === 'zh');
                    return (
                      <div key={banner.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="relative aspect-[21/6] bg-secondary">
                          {banner.image_url && <img src={banner.image_url} alt="Banner" className="w-full h-full object-cover" />}
                          {!banner.image_url && enTrans?.image_key && (
                            <img src={`/api/image?key=${encodeURIComponent(enTrans.image_key)}`} alt="Banner" className="w-full h-full object-cover" />
                          )}
                          {!banner.image_url && !enTrans?.image_key && (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">{t('No image', '无图片', adminLang)}</div>
                          )}
                          <div className="absolute top-2 right-2 flex gap-1">
                            {banner.is_active && <span className="rounded bg-green-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('Active', '启用', adminLang)}</span>}
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Banner #{banner.id}</span>
                            <span className="text-xs text-muted-foreground">{t('Sort:', '排序：', adminLang)} {banner.sort_order}</span>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground mb-3">
                            {enTrans && <div>EN: {enTrans.title || t('(no title)', '(无标题)', adminLang)} {enTrans.image_key ? '✓ ' + t('Image', '图片', adminLang) : '✗ ' + t('Image', '图片', adminLang)}</div>}
                            {zhTrans && <div>ZH: {zhTrans.title || t('(no title)', '(无标题)', adminLang)} {zhTrans.image_key ? '✓ ' + t('Image', '图片', adminLang) : '✗ ' + t('Image', '图片', adminLang)}</div>}
                            {banner.link_url && <div className="text-accent truncate">{t('Link:', '链接：', adminLang)} {banner.link_url}</div>}
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <BannerFormModal banner={banner} onSave={fetchAllData} lang={adminLang} />
                            <button onClick={() => handleDeleteBanner(banner.id)} className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors">
                              {t('Delete', '删除', adminLang)}
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
function CategoryFormModal({ category, onSave, lang }: { category?: Category; onSave: () => void; lang: string }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(category?.slug || '');
  const [icon, setIcon] = useState(category?.icon || '');
  const [sortOrder, setSortOrder] = useState(category?.sort_order || 0);
  const [isActive, setIsActive] = useState(category?.is_active !== false);
  const [translations, setTranslations] = useState<{ language: string; name: string }[]>(
    category?.category_translations?.map((tr) => ({ language: tr.language, name: tr.name })) || [
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
      else alert(t('Error:', '错误：', lang) + json.error);
    } catch { alert(t('Failed to save', '保存失败', lang)); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        {isEdit ? t('Edit', '编辑', lang) : t('Add Category', '添加分类', lang)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? t('Edit Category', '编辑分类', lang) : t('Add Category', '添加分类', lang)}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('Slug', '标识', lang)}</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('Icon (emoji)', '图标 (emoji)', lang)}</label>
                  <input value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('Sort Order', '排序', lang)}</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                    {t('Active', '启用', lang)}
                  </label>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Translations', '翻译', lang)}</h3>
                {translations.map((tr, idx) => (
                  <div key={idx} className="grid grid-cols-[60px_1fr] gap-2 mb-2">
                    <select value={tr.language} onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }} className="rounded-lg border border-border bg-secondary px-2 py-2 text-sm">
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                    </select>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('Name', '名称', lang)}</label>
                      <input value={tr.name} onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                    </div>
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', name: '' }])} className="text-xs text-primary hover:underline">
                  + {t('Add Translation', '添加翻译', lang)}
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">{t('Cancel', '取消', lang)}</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? t('Saving...', '保存中...', lang) : t('Save', '保存', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== Store Form Modal ==============
function StoreFormModal({ store, onSave, lang }: { store?: Store; onSave: () => void; lang: string }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(store?.slug || '');
  const [logoKey, setLogoKey] = useState(store?.logo_key || store?.logo_url || '');
  const [websiteUrl, setWebsiteUrl] = useState(store?.website_url || '');
  const [isActive, setIsActive] = useState(store?.is_active !== false);
  const [translations, setTranslations] = useState<{ language: string; name: string }[]>(
    store?.store_translations?.map((tr) => ({ language: tr.language, name: tr.name })) || [
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
      const body = {
        id: store?.id,
        slug,
        logo_url: logoKey || null,
        website_url: websiteUrl || null,
        is_active: isActive,
        translations,
      };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert(t('Error:', '错误：', lang) + json.error);
    } catch { alert(t('Failed to save', '保存失败', lang)); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        {isEdit ? t('Edit', '编辑', lang) : t('Add Store', '添加商城', lang)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? t('Edit Store', '编辑商城', lang) : t('Add Store', '添加商城', lang)}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{t('Slug', '标识', lang)}</label>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <ImageUpload
                value={logoKey}
                onUploadComplete={setLogoKey}
                aspectRatio={1}
                suggestedSize="64x64px"
                label={t('Store Logo', '商城 Logo', lang)}
                folder="logos"
              />
              <div>
                <label className="text-xs text-muted-foreground">{t('Website URL', '网站地址', lang)}</label>
                <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                {t('Active', '启用', lang)}
              </label>
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Translations', '翻译', lang)}</h3>
                {translations.map((tr, idx) => (
                  <div key={idx} className="grid grid-cols-[60px_1fr] gap-2 mb-2">
                    <select value={tr.language} onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }} className="rounded-lg border border-border bg-secondary px-2 py-2 text-sm">
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                    </select>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('Name', '名称', lang)}</label>
                      <input value={tr.name} onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                    </div>
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', name: '' }])} className="text-xs text-primary hover:underline">
                  + {t('Add Translation', '添加翻译', lang)}
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">{t('Cancel', '取消', lang)}</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? t('Saving...', '保存中...', lang) : t('Save', '保存', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== Product Form Modal ==============
function ProductFormModal({ product, categories, stores, onSave, lang }: { product?: Product; categories: Category[]; stores: Store[]; onSave: () => void; lang: string }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(product?.slug || '');
  const [categoryId, setCategoryId] = useState<string>(product?.category_id?.toString() || '');
  const [imageKey, setImageKey] = useState(product?.image_key || product?.image_url || '');
  const [isActive, setIsActive] = useState(product?.is_active !== false);
  const [isFeatured, setIsFeatured] = useState(product?.is_featured || false);
  const [translations, setTranslations] = useState<{ language: string; name: string; description: string; features: string; specs: string }[]>(
    product?.product_translations?.map((tr) => ({
      language: tr.language,
      name: tr.name,
      description: tr.description || '',
      features: tr.features || '',
      specs: tr.specs || '',
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
        image_url: imageKey || null,
        is_active: isActive,
        is_featured: isFeatured,
        translations: translations.map((tr) => ({
          language: tr.language,
          name: tr.name,
          description: tr.description || null,
          features: tr.features || null,
          specs: tr.specs || null,
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
      else alert(t('Error:', '错误：', lang) + json.error);
    } catch { alert(t('Failed to save', '保存失败', lang)); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        {isEdit ? t('Edit', '编辑', lang) : t('Add Product', '添加产品', lang)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? t('Edit Product', '编辑产品', lang) : t('Add Product', '添加产品', lang)}</h2>
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('Slug', '标识', lang)}</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('Category', '分类', lang)}</label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
                    <option value="">{t('None', '无', lang)}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.category_translations?.find((tr) => tr.language === lang)?.name || c.slug}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Image Upload */}
              <ImageUpload
                value={imageKey}
                onUploadComplete={setImageKey}
                aspectRatio={1}
                suggestedSize="400x400px"
                label={t('Product Image', '产品图片', lang)}
                folder="products"
              />

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" /> {t('Active', '启用', lang)}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="rounded" /> {t('Featured', '推荐', lang)}</label>
              </div>

              {/* Translations */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Translations', '翻译', lang)}</h3>
                {translations.map((tr, idx) => (
                  <div key={idx} className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 mb-2">
                      <select value={tr.language} onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }} className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs">
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                      </select>
                      <span className="text-xs text-muted-foreground">{t('Translation', '翻译', lang)}</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">{t('Product Name', '产品名称', lang)}</label>
                        <input value={tr.name} onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">{t('Description', '描述', lang)}</label>
                        <textarea value={tr.description} onChange={(e) => { const newT = [...translations]; newT[idx].description = e.target.value; setTranslations(newT); }} rows={2} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">{t('Features (JSON array)', '产品特性 (JSON 数组)', lang)}</label>
                        <input value={tr.features} onChange={(e) => { const newT = [...translations]; newT[idx].features = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">{t('Specs (JSON object)', '规格参数 (JSON 对象)', lang)}</label>
                        <input value={tr.specs} onChange={(e) => { const newT = [...translations]; newT[idx].specs = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', name: '', description: '', features: '', specs: '' }])} className="text-xs text-primary hover:underline">
                  + {t('Add Translation', '添加翻译', lang)}
                </button>
              </div>

              {/* Prices */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Store Prices', '商城价格', lang)}</h3>
                {prices.map((p, idx) => (
                  <div key={idx} className="mb-3 p-3 rounded-lg border border-border bg-secondary/30">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">{t('Store', '商城', lang)}</label>
                        <select value={p.store_id} onChange={(e) => { const newP = [...prices]; newP[idx].store_id = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm">
                          <option value="">{t('Select store', '选择商城', lang)}</option>
                          {stores.map((s) => (
                            <option key={s.id} value={s.id}>{s.store_translations?.find((tr) => tr.language === lang)?.name || s.slug}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{t('Current Price ($)', '现价 ($)', lang)}</label>
                        <input value={p.current_price} onChange={(e) => { const newP = [...prices]; newP[idx].current_price = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0.00" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">{t('Original Price ($)', '原价 ($)', lang)}</label>
                        <input value={p.original_price} onChange={(e) => { const newP = [...prices]; newP[idx].original_price = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0.00" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{t('Discount %', '折扣 %', lang)}</label>
                        <input value={p.discount_percent} onChange={(e) => { const newP = [...prices]; newP[idx].discount_percent = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{t('Product URL', '产品链接', lang)}</label>
                        <input value={p.product_url} onChange={(e) => { const newP = [...prices]; newP[idx].product_url = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="https://..." />
                      </div>
                    </div>
                    {prices.length > 1 && (
                      <button onClick={() => setPrices(prices.filter((_, i) => i !== idx))} className="mt-2 text-[10px] text-destructive hover:underline">
                        {t('Remove', '移除', lang)}
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setPrices([...prices, { store_id: '', current_price: '', original_price: '', product_url: '', discount_percent: '' }])} className="text-xs text-primary hover:underline">
                  + {t('Add Store Price', '添加商城价格', lang)}
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">{t('Cancel', '取消', lang)}</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? t('Saving...', '保存中...', lang) : t('Save', '保存', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== Banner Form Modal ==============
function BannerFormModal({ banner, onSave, lang }: { banner?: Banner; onSave: () => void; lang: string }) {
  const [open, setOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState(banner?.link_url || '');
  const [sortOrder, setSortOrder] = useState(banner?.sort_order || 0);
  const [isActive, setIsActive] = useState(banner?.is_active !== false);
  const [defaultImageKey, setDefaultImageKey] = useState(banner?.image_key || '');
  const [translations, setTranslations] = useState<{ language: string; image_key: string; title: string; subtitle: string }[]>(
    banner?.banner_translations?.map((tr) => ({
      language: tr.language,
      image_key: tr.image_key || '',
      title: tr.title || '',
      subtitle: tr.subtitle || '',
    })) || [
      { language: 'en', image_key: '', title: '', subtitle: '' },
      { language: 'zh', image_key: '', title: '', subtitle: '' },
    ]
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!banner;

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
        translations: translations.map((tr) => ({
          language: tr.language,
          image_key: tr.image_key || null,
          title: tr.title || null,
          subtitle: tr.subtitle || null,
        })),
      };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert(t('Error:', '错误：', lang) + json.error);
    } catch { alert(t('Failed to save', '保存失败', lang)); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        {isEdit ? t('Edit', '编辑', lang) : t('Add Banner', '添加 Banner', lang)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{isEdit ? t('Edit Banner', '编辑 Banner', lang) : t('Add Banner', '添加 Banner', lang)}</h2>
            <div className="space-y-4">
              {/* Default Banner Image Upload */}
              <ImageUpload
                value={defaultImageKey}
                onUploadComplete={setDefaultImageKey}
                aspectRatio={21 / 6}
                suggestedSize="1200x343px"
                label={t('Default Banner Image (fallback if no language-specific image)', '默认 Banner 图片（无语言专属图时使用）', lang)}
                folder="banners"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('Link URL (optional)', '链接地址 (可选)', lang)}</label>
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('Sort Order', '排序', lang)}</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                {t('Active', '启用', lang)}
              </label>

              {/* Language-specific translations */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Language-specific Banners', '多语言 Banner', lang)}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('Upload different banner images for each language. If no language-specific image is set, the default image will be used.', '为每种语言上传不同的 Banner 图片。如未设置语言专属图，将使用默认图片。', lang)}
                </p>
                {translations.map((tr, idx) => (
                  <div key={idx} className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 mb-3">
                      <select value={tr.language} onChange={(e) => { const newT = [...translations]; newT[idx].language = e.target.value; setTranslations(newT); }} className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs">
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                      </select>
                      <span className="text-xs text-muted-foreground">{t('Language Banner', '语言 Banner', lang)}</span>
                    </div>
                    <ImageUpload
                      value={tr.image_key}
                      onUploadComplete={(key) => { const newT = [...translations]; newT[idx].image_key = key; setTranslations(newT); }}
                      aspectRatio={21 / 6}
                      suggestedSize="1200x343px"
                      label={t('Banner Image', 'Banner 图片', lang)}
                      folder="banners"
                    />
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">{t('Title', '标题', lang)}</label>
                        <input value={tr.title} onChange={(e) => { const newT = [...translations]; newT[idx].title = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">{t('Subtitle', '副标题', lang)}</label>
                        <input value={tr.subtitle} onChange={(e) => { const newT = [...translations]; newT[idx].subtitle = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setTranslations([...translations, { language: 'en', image_key: '', title: '', subtitle: '' }])} className="text-xs text-primary hover:underline">
                  + {t('Add Language Banner', '添加语言 Banner', lang)}
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">{t('Cancel', '取消', lang)}</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? t('Saving...', '保存中...', lang) : t('Save', '保存', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

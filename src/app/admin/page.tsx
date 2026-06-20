'use client';

import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { X, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { ImageUpload } from '@/components/image-upload';
import { useSupabaseConfig } from '@/lib/supabase-config-inject';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false, loading: () => <div className="min-h-[300px] rounded-lg border border-border bg-secondary animate-pulse" /> });

// Auth-aware fetch helper: auto-attaches x-session header
async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const supabase = await getSupabaseBrowserClientWithRetry();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };
    if (session?.access_token) {
      headers['x-session'] = session.access_token;
    }
    return fetch(url, { ...options, headers });
  } catch {
    return fetch(url, options);
  }
}

let mammothInstance: typeof import('mammoth') | null = null;
async function getMammoth() {
  if (!mammothInstance) {
    mammothInstance = await import('mammoth');
  }
  return mammothInstance;
}
// Import Quill class for Quill.find() - needed for custom color picker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let QuillClass: any = null;
// Register a custom StyledImage blot that preserves inline styles (class, style, width, height)
// so that image alignment/border/resize survive Quill re-renders
// Also register a TableEmbed blot to preserve table HTML from Word imports
let customBlotRegistered = false;
import('quill').then((mod) => {
  QuillClass = mod.default;
  if (!customBlotRegistered && QuillClass) {
    const Embed = QuillClass.import('blots/embed');
    const BlockEmbed = QuillClass.import('blots/block/embed');

    // ===== StyledImage blot (preserves class/style/width/height on images) =====
    class StyledImage extends Embed {
      static blotName = 'image';
      static tagName = 'IMG';

      static create(value: any) {
        let node: HTMLImageElement;
        if (typeof value === 'string') {
          node = super.create() as HTMLImageElement;
          node.setAttribute('src', value);
        } else if (typeof value === 'object' && value !== null) {
          // Check for data-styled from clipboard parser
          if (value['data-styled']) {
            try {
              const decoded = JSON.parse(decodeURIComponent(value['data-styled']));
              node = super.create() as HTMLImageElement;
              if (decoded.src) node.setAttribute('src', decoded.src);
              if (decoded.class) node.setAttribute('class', decoded.class);
              if (decoded.style) node.setAttribute('style', decoded.style);
              if (decoded.width) node.setAttribute('width', String(decoded.width));
              if (decoded.height) node.setAttribute('height', String(decoded.height));
              return node;
            } catch { /* fall through */ }
          }
          node = super.create() as HTMLImageElement;
          if (value.src) node.setAttribute('src', value.src);
          if (value.class) node.setAttribute('class', value.class);
          if (value.style) node.setAttribute('style', value.style);
          if (value.width) node.setAttribute('width', String(value.width));
          if (value.height) node.setAttribute('height', String(value.height));
        } else {
          node = super.create(value) as HTMLImageElement;
        }
        return node;
      }

      static formats(domNode: HTMLElement) {
        const formats: Record<string, string> = {};
        const cls = domNode.getAttribute('class');
        if (cls) formats['class'] = cls;
        const style = domNode.getAttribute('style');
        if (style) formats['style'] = style;
        const w = domNode.getAttribute('width');
        if (w) formats['width'] = w;
        const h = domNode.getAttribute('height');
        if (h) formats['height'] = h;
        return Object.keys(formats).length > 0 ? formats : undefined;
      }

      format(name: string, value: any) {
        if (['class', 'style', 'width', 'height'].includes(name)) {
          if (value) {
            this.domNode.setAttribute(name, String(value));
          } else {
            this.domNode.removeAttribute(name);
          }
        } else {
          super.format(name, value);
        }
      }

      static value(domNode: HTMLElement) {
        const src = domNode.getAttribute('src') || '';
        const cls = domNode.getAttribute('class') || '';
        const style = domNode.getAttribute('style') || '';
        const w = domNode.getAttribute('width') || '';
        const h = domNode.getAttribute('height') || '';
        // Return object if any extra attrs exist, else just src string for compat
        if (cls || style || w || h) {
          return { src, class: cls, style, width: w, height: h };
        }
        return src;
      }
    }
    QuillClass.register(StyledImage, true);

    // ===== TableEmbed blot (preserves full table HTML as a block embed) =====
    class TableEmbed extends (BlockEmbed as any) {
      static blotName = 'table-embed';
      static tagName = 'DIV';
      static className = 'table-wrapper';

      static create(value: any) {
        const node = (BlockEmbed as any).create.call(this) as HTMLDivElement;
        node.classList.add('table-wrapper');
        if (typeof value === 'string') {
          node.innerHTML = value;
        } else if (typeof value === 'object' && value !== null && value.html) {
          node.innerHTML = value.html;
        }
        return node;
      }

      static value(domNode: HTMLElement) {
        return { html: domNode.innerHTML };
      }

      static formats() {
        return undefined; // no custom formats
      }
    }
    QuillClass.register(TableEmbed, true);

    // ===== Patch the clipboard to preserve img attrs and table-wrapper divs =====
    const Clipboard = QuillClass.import('modules/clipboard');
    const Delta = QuillClass.import('delta');
    const originalConvert = Clipboard.prototype.convert;

    Clipboard.prototype.convert = function(html: any) {
      if (typeof html === 'string') {
        // Step 1: Extract table-wrapper blocks and replace with placeholders
        const tables: Array<string> = [];
        const placeholder = '___TABLE_EMBED_PLACEHOLDER___';
        const tableExtractor = /<div class="table-wrapper"[\s>]([\s\S]*?)<\/div>\s*/gi;
        let processed = html.replace(tableExtractor, (_fullMatch: string, innerContent: string) => {
          // Store only the inner HTML (without the wrapper div) since TableEmbed.create()
          // already adds <div class="table-wrapper"> as the container
          tables.push(innerContent.trim());
          return `<p>${placeholder}${tables.length - 1}${placeholder}</p>`;
        });

        // Step 2: Process img tags to encode extra attrs
        processed = processed.replace(/<img([^>]*)>/gi, (_match: string, attrs: string) => {
          const srcMatch = attrs.match(/src=["']([^"']*)["']/);
          const classMatch = attrs.match(/class=["']([^"']*)["']/);
          const styleMatch = attrs.match(/style=["']([^"']*)["']/);
          const widthMatch = attrs.match(/width=["']([^"']*)["']/);
          const heightMatch = attrs.match(/height=["']([^"']*)["']/);
          
          const extras: Record<string, string> = {};
          if (classMatch) extras.class = classMatch[1];
          if (styleMatch) extras.style = styleMatch[1];
          if (widthMatch) extras.width = widthMatch[1];
          if (heightMatch) extras.height = heightMatch[1];
          
          const src = srcMatch ? srcMatch[1] : '';
          if (Object.keys(extras).length > 0) {
            const dataStyled = encodeURIComponent(JSON.stringify({ src, ...extras }));
            return `<img src="${src}" data-styled="${dataStyled}">`;
          }
          return `<img src="${src}">`;
        });

        // Step 3: Let Quill process the modified HTML
        const delta = originalConvert.call(this, processed);

        // Step 4: Replace placeholder text in delta with table-embed inserts
        if (tables.length > 0 && delta && delta.ops) {
          const newOps: any[] = [];
          for (const op of delta.ops) {
            if (typeof op.insert === 'string') {
              const text = op.insert;
              const parts = text.split(new RegExp(`${placeholder}(\\d+)${placeholder}`, 'g'));
              for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                  // Regular text
                  if (parts[i]) {
                    newOps.push({ insert: parts[i], ...(op.attributes || {}) });
                  }
                } else {
                  // Table placeholder index
                  const tableIndex = parseInt(parts[i], 10);
                  if (tableIndex >= 0 && tableIndex < tables.length) {
                    newOps.push({ insert: { 'table-embed': { html: tables[tableIndex] } } });
                  }
                }
              }
            } else {
              newOps.push(op);
            }
          }
          return new Delta(newOps);
        }

        return delta;
      }
      return originalConvert.call(this, html);
    };

    customBlotRegistered = true;
  }
}).catch(() => {});

// Types
interface CategoryTranslation { id: number; category_id: number; language: string; name: string; }
interface Category { id: number; slug: string; icon: string | null; sort_order: number; is_active: boolean; category_translations: CategoryTranslation[]; }
interface StoreTranslation { id: number; store_id: number; language: string; name: string; }
interface Store { id: number; slug: string; logo_url: string | null; logo_key: string | null; website_url: string | null; website_urls: Array<{url: string; label?: string}>; store_type: string; is_active: boolean; regions: Array<{region: string; currency: string}>; notes: string; store_translations: StoreTranslation[]; }
interface ProductTranslation { id: number; product_id: number; language: string; name: string; description: string | null; features: string | null; specs: string | null; }
interface ProductPrice { id: number; product_id: number; store_id: number; current_price: string; original_price: string | null; product_url: string; in_stock: boolean; discount_percent: number | null; currency: string; region: string; }
interface BannerTranslation { id: number; banner_id: number; language: string; image_key: string | null; title: string | null; subtitle: string | null; }
interface Banner { id: number; image_key: string | null; mobile_image_key: string | null; image_url: string | null; mobile_image_url: string | null; link_url: string | null; sort_order: number; is_active: boolean; banner_translations: BannerTranslation[]; }
interface Product { id: number; slug: string; category_id: number | null; image_url: string | null; image_key: string | null; images: string | null; sales_region: string | null; is_active: boolean; is_featured: boolean; notes: string; product_translations: ProductTranslation[]; product_prices: ProductPrice[]; categories?: { id: number; slug: string; category_translations: CategoryTranslation[] } | null; }

type Tab = 'site_settings' | 'products' | 'categories' | 'stores' | 'banners' | 'analytics' | 'best_vapes' | 'news';
type StaticPageSlug = 'privacy-policy' | 'about-us' | 'disclaimer' | 'affiliate-disclosure' | 'terms-of-service';
interface Language { id: number; code: string; name: string; is_active: boolean; is_hidden: boolean; sort_order: number; }
const DEFAULT_LANGUAGES: Language[] = [{ id: 1, code: 'en', name: 'English', is_active: true, is_hidden: false, sort_order: 0 }, { id: 2, code: 'zh', name: '中文', is_active: true, is_hidden: false, sort_order: 1 }];

// i18n helper
function t(en: string, zh: string, lang: string) {
  return lang === 'zh' ? zh : en;
}

function StoreSelect({ stores, value, onChange, lang, disabledStoreIds }: {
  stores: Array<{ id: number; slug: string; logo_url: string | null; store_translations?: Array<{ name: string; language: string }> }>;
  value: string;
  onChange: (value: string) => void;
  lang: string;
  disabledStoreIds?: number[];
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedStore = stores.find(s => String(s.id) === value);
  
  // Helper function to get store name
  const getStoreName = (store: typeof stores[0]) => {
    const t2 = store.store_translations?.find((tr: { language: string }) => tr.language === lang);
    return t2?.name || store.slug;
  };

  // Filter stores by search query (alphabetical order, with prefix matches first)
  const filteredStores = useMemo(() => {
    // First filter by search query
    let filtered = [...stores];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const name = getStoreName(s);
        return name.toLowerCase().includes(query);
      });
    }
    
    // Sort: prefix matches first, then alphabetical order
    const query = searchQuery.trim().toLowerCase();
    filtered.sort((a, b) => {
      const nameA = getStoreName(a).toLowerCase();
      const nameB = getStoreName(b).toLowerCase();
      
      // If searching, prioritize prefix matches
      if (query) {
        const aStartsWith = nameA.startsWith(query);
        const bStartsWith = nameB.startsWith(query);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
      }
      
      // Alphabetical order
      return nameA.localeCompare(nameB);
    });
    
    return filtered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, searchQuery, lang]);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-600 bg-[#1e1e2e] cursor-pointer hover:border-purple-500 transition-colors"
      >
        {selectedStore?.logo_url ? (
          <img src={selectedStore.logo_url} alt="" className="w-6 h-6 rounded object-contain flex-shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
        <span className="text-white text-sm flex-1">
          {selectedStore ? getStoreName(selectedStore) : t('Select Store', '选择商城', lang)}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-600 bg-[#1e1e2e] shadow-lg max-h-60 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-700">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-600 bg-[#2a2a3e]">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'zh' ? '搜索商城...' : 'Search store...'}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          {/* Store list */}
          <div className="overflow-y-auto max-h-48">
            {filteredStores.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-500 text-sm">
                {lang === 'zh' ? '未找到商城' : 'No stores found'}
              </div>
            ) : (
              filteredStores.map((store) => {
                const isDisabled = disabledStoreIds?.includes(store.id);
                return (
                  <div
                    key={store.id}
                    onClick={() => { if (!isDisabled) { onChange(String(store.id)); setOpen(false); setSearchQuery(''); } }}
                    className={`flex items-center gap-2 px-3 py-2 transition-colors ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-purple-500/20'} ${String(store.id) === value ? 'bg-purple-500/30' : ''}`}
                  >
                    {store.logo_url ? (
                      <img src={store.logo_url} alt="" className="w-6 h-6 rounded object-contain flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    )}
                    <span className="text-sm" style={{ color: isDisabled ? 'rgba(255,255,255,0.5)' : 'white' }}>{getStoreName(store)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


  const [activeTab, setActiveTab] = useState<Tab>('site_settings');
  const [storeTypeTab, setStoreTypeTab] = useState<'store' | 'official'>('store');
  const [storeSearchInput, setStoreSearchInput] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [storePage, setStorePage] = useState(1);
  const [storeSortOrder, setStoreSortOrder] = useState<'asc' | 'desc'>('desc');
  const STORES_PER_PAGE = 20;
  const [adminSiteSettings, setAdminSiteSettings] = useState<{ site_name: string; logo_url: string | null } | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteLogo, setEditSiteLogo] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [siteEditing, setSiteEditing] = useState(false);
  const [socialLinks, setSocialLinks] = useState<Array<{ id: number; platform: string; url: string; icon: string | null; sort_order: number; is_active: boolean }>>([]);
  const [editingSocial, setEditingSocial] = useState<{ id: number | null; platform: string; url: string; sort_order: number }>({ id: null, platform: '', url: '', sort_order: 0 });
  const [showSocialForm, setShowSocialForm] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<Record<string, unknown> | null>(null);
  const [analyticsMonth, setAnalyticsMonth] = useState('all');
  const [analyticsRegion, setAnalyticsRegion] = useState('all');

  const bestVapesRef = useRef<ContentPagesManagerRef>(null);
  const newsRef = useRef<ContentPagesManagerRef>(null);
  const privacyRef = useRef<StaticPageEditorRef>(null);
  const aboutRef = useRef<StaticPageEditorRef>(null);
  const disclaimerRef = useRef<StaticPageEditorRef>(null);
  const affiliateRef = useRef<StaticPageEditorRef>(null);
  const termsRef = useRef<StaticPageEditorRef>(null);

  // Sub-page navigation within Site Settings
  const [siteSettingsSubPage, setSiteSettingsSubPage] = useState<StaticPageSlug | null>(null);

  // Check login state on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = await getSupabaseBrowserClientWithRetry();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setIsLoggedIn(true);
      } catch {
        // Supabase not ready yet
      }
    };
    checkSession();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) {
        setLoginError(error.message || t('Invalid email or password', '邮箱或密码错误', adminLang));
      } else if (data.session) {
        setIsLoggedIn(true);
      }
    } catch {
      setLoginError(t('Login failed', '登录失败', adminLang));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.auth.signOut();
    } catch {
      // Ignore
    }
    setIsLoggedIn(false);
  };

  useEffect(() => {
    if (isLoggedIn) {
      adminFetch('/api/admin/site-settings').then(r => r.json()).then(d => { if (d.success) { setAdminSiteSettings(d.data); setEditSiteName(d.data.site_name); setEditSiteLogo(d.data.logo_url); } }).catch(() => {});
      fetch('/api/social-links').then(r => r.json()).then(d => { if (d.success) setSocialLinks(d.data || []); }).catch(() => {});
      adminFetch('/api/admin/languages').then(r => r.json()).then(d => { if (d.success) setLanguages(d.data || []); }).catch(() => {});
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && activeTab === 'analytics') {
      const params = new URLSearchParams({ month: analyticsMonth });
      if (analyticsRegion && analyticsRegion !== 'all') {
        params.set('region', analyticsRegion);
      }
      fetch(`/api/analytics?${params.toString()}`).then(r => r.json()).then(d => { if (d.success) setAnalyticsData(d.data); }).catch(() => {});
    }
  }, [isLoggedIn, activeTab, analyticsMonth, analyticsRegion]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSortOrder, setProductSortOrder] = useState<'asc' | 'desc'>('desc');
  const [productSearch, setProductSearch] = useState('');
  const [productSearchInput, setProductSearchInput] = useState('');
  const [productPage, setProductPage] = useState(1);
  const PRODUCTS_PER_PAGE = 20;
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => productSortOrder === 'asc' ? a.id - b.id : b.id - a.id);
  }, [products, productSortOrder]);
  const filteredProducts = useMemo(() => {
    return sortedProducts.filter(p => !productSearch || (p.product_translations?.find((tr: any) => tr.language === 'en')?.name || '').toLowerCase().includes(productSearch.toLowerCase()));
  }, [sortedProducts, productSearch]);
  const productTotalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, productPage]);

  // Store pagination and sorting
  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => storeSortOrder === 'asc' ? a.id - b.id : b.id - a.id);
  }, [stores, storeSortOrder]);
  const filteredStores = useMemo(() => {
    return sortedStores.filter(s =>
      (s.store_type || 'store') === storeTypeTab &&
      (!storeSearch || (s.store_translations?.find((tr: any) => tr.language === 'en')?.name || '').toLowerCase().includes(storeSearch.toLowerCase()))
    );
  }, [sortedStores, storeTypeTab, storeSearch]);
  const storeTotalPages = Math.ceil(filteredStores.length / STORES_PER_PAGE);
  const paginatedStores = useMemo(() => {
    const start = (storePage - 1) * STORES_PER_PAGE;
    return filteredStores.slice(start, start + STORES_PER_PAGE);
  }, [filteredStores, storePage]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminLang, setAdminLang] = useState<'en' | 'zh'>('en');
  const [languages, setLanguages] = useState<Language[]>(DEFAULT_LANGUAGES);
  const [langEditing, setLangEditing] = useState(false);
  const activeLanguages = useMemo(() => languages.filter(l => l.is_active && !l.is_hidden).sort((a, b) => a.sort_order - b.sort_order), [languages]);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, storeRes, prodRes, bannerRes] = await Promise.all([
        adminFetch('/api/admin/categories'),
        adminFetch('/api/admin/stores'),
        adminFetch('/api/admin/products?limit=100'),
        adminFetch('/api/admin/banners'),
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
      const res = await adminFetch('/api/admin/seed', { method: 'POST' });
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
      const res = await adminFetch(`/api/admin/products?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete', '删除失败', adminLang)); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm(t('Are you sure? This will also delete all translations and may affect products.', '确定吗？这将删除所有翻译并可能影响产品。', adminLang))) return;
    try {
      const res = await adminFetch(`/api/admin/categories?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete', '删除失败', adminLang)); }
  };

  const handleDeleteStore = async (id: number) => {
    if (!confirm(t('Are you sure? This will also delete all translations and prices.', '确定吗？这将删除所有翻译和价格。', adminLang))) return;
    try {
      const res = await adminFetch(`/api/admin/stores?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchAllData();
      else alert(t('Error:', '错误：', adminLang) + json.error);
    } catch { alert(t('Failed to delete', '删除失败', adminLang)); }
  };

  const handleDeleteBanner = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this banner?', '确定要删除该 Banner 吗？', adminLang))) return;
    try {
      const res = await adminFetch(`/api/admin/banners?id=${id}`, { method: 'DELETE' });
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
    best_vapes: { en: 'Best Vapes', zh: 'Best Vapes' },
    news: { en: 'News', zh: '新闻' },
    analytics: { en: 'Analytics', zh: '数据统计' },
  };

  // Login page
  if (!isLoggedIn) {
    return (
      <div className="admin-dark min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-2xl border border-border p-8 shadow-xl">
            <div className="flex flex-col items-center mb-8">
              <img
                src="https://coze-coding-project.tos.coze.site/gen_project_icon/2026-05-22/7642619146919952424_1779436857.png?sign=490260516-fdfb97f369-0-ab44db23aa14bde024c0964b882eb270c4c5ef8fcc30760f2ab0cf3ece075cfe"
                alt="VapeDeal"
                className="h-14 w-14 rounded-2xl object-cover mb-4"
              />
              <h1 className="text-2xl font-bold">{t('Admin Login', '后台登录', adminLang)}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('Enter credentials to continue', '请输入登录凭据', adminLang)}</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('Email', '邮箱', adminLang)}</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('Enter email', '输入邮箱', adminLang)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('Password', '密码', adminLang)}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder={t('Enter password', '输入密码', adminLang)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
    <div className="admin-dark h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar h-full overflow-y-auto">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2">
            {adminSiteSettings?.logo_url ? (
              <img src={adminSiteSettings.logo_url.startsWith('http') ? adminSiteSettings.logo_url : `/api/image?key=${encodeURIComponent(adminSiteSettings.logo_url)}`} alt="Logo" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">{(adminSiteSettings?.site_name || 'V').charAt(0)}</div>
            )}
            <span className="text-xl font-bold tracking-tight">{adminSiteSettings?.site_name || '\u00A0'}</span>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{t('Admin Panel', '管理后台', adminLang)}</p>
        </div>
        <nav className="px-3 space-y-1">
          {(['site_settings', 'products', 'categories', 'stores', 'banners', 'best_vapes', 'news', 'analytics'] as Tab[]).map((tab) => (
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
              {tab === 'best_vapes' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
              {tab === 'news' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>}
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
              {/* Sub-page: Static Page Editor */}
              {siteSettingsSubPage ? (
                <div>
                  <button
                    onClick={() => setSiteSettingsSubPage(null)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t('Back to Site Settings', '返回站点设置', adminLang)}
                  </button>
                  {siteSettingsSubPage === 'privacy-policy' && (
                    <StaticPageEditor ref={privacyRef} slug="privacy-policy" title={t('Privacy Policy', '隐私政策', adminLang)} lang={adminLang} activeLanguages={activeLanguages} />
                  )}
                  {siteSettingsSubPage === 'about-us' && (
                    <StaticPageEditor ref={aboutRef} slug="about-us" title={t('About Us', '关于我们', adminLang)} lang={adminLang} activeLanguages={activeLanguages} />
                  )}
                  {siteSettingsSubPage === 'disclaimer' && (
                    <StaticPageEditor ref={disclaimerRef} slug="disclaimer" title={t('Disclaimer', '免责声明', adminLang)} lang={adminLang} activeLanguages={activeLanguages} />
                  )}
                  {siteSettingsSubPage === 'affiliate-disclosure' && (
                    <StaticPageEditor ref={affiliateRef} slug="affiliate-disclosure" title={t('Affiliate Disclosure', '联盟披露', adminLang)} lang={adminLang} activeLanguages={activeLanguages} />
                  )}
                  {siteSettingsSubPage === 'terms-of-service' && (
                    <StaticPageEditor ref={termsRef} slug="terms-of-service" title={t('Terms of Service', '服务条款', adminLang)} lang={adminLang} activeLanguages={activeLanguages} />
                  )}
                </div>
              ) : (
                <>
              <h2 className="text-2xl font-bold mb-6">{t('Site Settings', '站点设置', adminLang)}</h2>
              <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('Site Name & Logo', '网站名称与Logo', adminLang)}</h3>
                  {!siteEditing ? (
                    <button
                      onClick={() => setSiteEditing(true)}
                      className="text-xs px-3 py-1 rounded-md border border-border hover:bg-secondary transition-colors"
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSiteEditing(false);
                        // Revert to saved values
                        setEditSiteName(adminSiteSettings?.site_name || '');
                        setEditSiteLogo(adminSiteSettings?.logo_url || null);
                      }}
                      className="text-xs px-3 py-1 rounded-md border border-border hover:bg-secondary transition-colors"
                    >
                      Done
                    </button>
                  )}
                </div>
                {!siteEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {adminSiteSettings?.logo_url ? (
                        <img src={adminSiteSettings.logo_url} alt="Logo" className="w-9 h-9 rounded object-contain border border-border" />
                      ) : (
                        <div className="w-9 h-9 rounded border border-border bg-secondary flex items-center justify-center text-muted-foreground text-xs">N/A</div>
                      )}
                      <span className="text-sm font-medium">{adminSiteSettings?.site_name || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
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
                    <div className="pt-2 flex gap-3">
                      <button
                        onClick={async () => {
                          setShowSaveConfirm(true);
                        }}
                        className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition-all ${
                          editSiteName !== (adminSiteSettings?.site_name || '') || editSiteLogo !== (adminSiteSettings?.logo_url || null)
                            ? 'bg-purple-600 text-white hover:bg-purple-700 ring-2 ring-purple-400/50'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {t('Save Settings', '保存设置', adminLang)}
                      </button>
                    </div>
                  </div>
                )}
                {/* Save Confirmation Dialog */}
                {showSaveConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-2xl relative">
                      <button onClick={() => setShowSaveConfirm(false)} className="absolute top-3 right-3 p-1 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
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
                            const res = await adminFetch('/api/admin/site-settings', {
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

              {/* Social Links Section */}
              <div className="bg-card rounded-xl border border-border p-6 space-y-4 mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t('Social Media Links', '社媒链接', adminLang)}</h3>
                  <button
                    onClick={() => { setEditingSocial({ id: null, platform: '', url: '', sort_order: socialLinks.length }); setShowSocialForm(true); }}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    + {t('Add', '添加', adminLang)}
                  </button>
                </div>

                {socialLinks.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('No social links yet. Click Add to create one.', '暂无社媒链接，点击添加。', adminLang)}</p>
                )}

                {socialLinks.sort((a, b) => a.sort_order - b.sort_order).map((link) => (
                  <div key={link.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{link.platform}</p>
                      <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                    </div>
                    <button
                      onClick={() => { setEditingSocial({ id: link.id, platform: link.platform, url: link.url, sort_order: link.sort_order }); setShowSocialForm(true); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      {t('Edit', '编辑', adminLang)}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(t('Delete this social link?', '确定删除此社媒链接？', adminLang))) return;
                        const res = await adminFetch(`/api/admin/social-links?id=${link.id}`, { method: 'DELETE' });
                        const json = await res.json();
                        if (json.success) {
                          setSocialLinks(prev => prev.filter(l => l.id !== link.id));
                        } else {
                          alert(json.error || 'Delete failed');
                        }
                      }}
                      className="rounded-md border border-red-800 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/50 transition-colors"
                    >
                      {t('Delete', '删除', adminLang)}
                    </button>
                  </div>
                ))}

                {/* Social Link Form Modal */}
                {showSocialForm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl space-y-4">
                      <h3 className="text-lg font-bold">{editingSocial.id ? t('Edit Social Link', '编辑社媒链接', adminLang) : t('Add Social Link', '添加社媒链接', adminLang)}</h3>
                      <div>
                        <label className="block text-sm font-medium mb-1">{t('Platform', '平台名称', adminLang)}</label>
                        <select
                          value={editingSocial.platform}
                          onChange={(e) => setEditingSocial(prev => ({ ...prev, platform: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">{t('Select platform...', '选择平台...', adminLang)}</option>
                          <option value="facebook">Facebook</option>
                          <option value="twitter">Twitter / X</option>
                          <option value="instagram">Instagram</option>
                          <option value="youtube">YouTube</option>
                          <option value="tiktok">TikTok</option>
                          <option value="telegram">Telegram</option>
                          <option value="discord">Discord</option>
                          <option value="reddit">Reddit</option>
                          <option value="pinterest">Pinterest</option>
                          <option value="linkedin">LinkedIn</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="wechat">WeChat</option>
                          <option value="other">{t('Other', '其他', adminLang)}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">{t('URL', '链接地址', adminLang)}</label>
                        <input
                          type="url"
                          value={editingSocial.url}
                          onChange={(e) => setEditingSocial(prev => ({ ...prev, url: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">{t('Sort Order', '排序', adminLang)}</label>
                        <input
                          type="number"
                          value={editingSocial.sort_order}
                          onChange={(e) => setEditingSocial(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="flex gap-3 justify-end pt-2">
                        <button
                          onClick={() => setShowSocialForm(false)}
                          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors"
                        >
                          {t('Cancel', '取消', adminLang)}
                        </button>
                        <button
                          onClick={async () => {
                            if (!editingSocial.platform || !editingSocial.url) {
                              alert(t('Platform and URL are required', '平台和链接不能为空', adminLang));
                              return;
                            }
                            let res;
                            if (editingSocial.id) {
                              res = await adminFetch('/api/admin/social-links', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(editingSocial),
                              });
                            } else {
                              res = await adminFetch('/api/admin/social-links', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(editingSocial),
                              });
                            }
                            const json = await res.json();
                            if (json.success) {
                              const listRes = await fetch('/api/social-links');
                              const listJson = await listRes.json();
                              if (listJson.success) setSocialLinks(listJson.data || []);
                              setShowSocialForm(false);
                            } else {
                              alert(json.error || 'Save failed');
                            }
                          }}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          {t('Save', '保存', adminLang)}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Languages Section */}
              <div className="bg-card rounded-xl border border-border p-6 space-y-4 mt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{t('Languages', '语言管理', adminLang)}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t('Manage site languages. Active languages will appear in frontend language selector and determine translation fields in forms.', '管理网站语言。启用的语言将出现在前台语言选择器中，并决定表单中的翻译字段。', adminLang)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {langEditing ? (
                      <>
                        <button
                          onClick={async () => {
                            const code = prompt(t('Enter language code (e.g. ja, ko, fr):', '输入语言代码（如 ja, ko, fr）:', adminLang));
                            if (!code?.trim()) return;
                            const name = prompt(t('Enter language display name (e.g. Japanese):', '输入语言显示名称（如 日语）:', adminLang));
                            if (!name?.trim()) return;
                            const res = await adminFetch('/api/admin/languages', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ code: code.trim().toLowerCase(), name: name.trim(), is_active: true, sort_order: languages.length }),
                            });
                            const json = await res.json();
                            if (json.success) {
                              setLanguages(prev => [...prev, json.data]);
                            } else {
                              alert(json.error || t('Failed to add language', '添加语言失败', adminLang));
                            }
                          }}
                          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          + {t('Add Language', '添加语言', adminLang)}
                        </button>
                        <button
                          onClick={() => setLangEditing(false)}
                          className="rounded-lg bg-gray-200 dark:bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          {t('Done', '完成', adminLang)}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setLangEditing(true)}
                        className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        {t('Edit', '编辑', adminLang)}
                      </button>
                    )}
                  </div>
                </div>

                {languages.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('No languages configured.', '暂无语言配置。', adminLang)}</p>
                )}

                {languages.sort((a, b) => a.sort_order - b.sort_order).map((lang) => (
                  <div key={lang.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                    <span className="text-sm font-medium uppercase min-w-[36px]">{lang.code}</span>
                    {langEditing ? (
                      <>
                        <span className="flex-1 text-sm font-medium">{lang.name}</span>
                        <button
                          onClick={async () => {
                            const newHidden = !lang.is_hidden;
                            setLanguages(prev => prev.map(l => l.id === lang.id ? { ...l, is_hidden: newHidden, is_active: newHidden ? false : l.is_active } : l));
                            await adminFetch('/api/admin/languages', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: lang.id, is_hidden: newHidden, is_active: newHidden ? false : lang.is_active }),
                            });
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${lang.is_hidden ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700' : 'bg-gray-800 text-gray-500 border border-gray-600'}`}
                        >
                          {lang.is_hidden ? t('Hidden', '已隐藏', adminLang) : t('Hide', '隐藏', adminLang)}
                        </button>
                        <button
                          onClick={async () => {
                            const newActive = !lang.is_active;
                            setLanguages(prev => prev.map(l => l.id === lang.id ? { ...l, is_active: newActive, is_hidden: newActive ? false : l.is_hidden } : l));
                            await adminFetch('/api/admin/languages', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: lang.id, is_active: newActive, is_hidden: newActive ? false : lang.is_hidden }),
                            });
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${lang.is_active ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-800 text-gray-500 border border-gray-600'}`}
                        >
                          {lang.is_active ? t('Active', '启用', adminLang) : t('Inactive', '停用', adminLang)}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{lang.name}</span>
                        {lang.is_hidden ? (
                          <span className="rounded-md px-3 py-1.5 text-xs font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-700">{t('Hidden', '已隐藏', adminLang)}</span>
                        ) : lang.is_active ? (
                          <span className="rounded-md px-3 py-1.5 text-xs font-medium bg-green-900/50 text-green-400 border border-green-700">{t('Active', '启用', adminLang)}</span>
                        ) : (
                          <span className="rounded-md px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-500 border border-gray-600">{t('Inactive', '停用', adminLang)}</span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Static Pages Section */}
              <div className="bg-card rounded-xl border border-border p-6 space-y-4 mt-6">
                <h3 className="text-lg font-semibold">{t('Static Pages', '静态页面', adminLang)}</h3>
                <p className="text-sm text-muted-foreground">{t('Click to edit page content with rich text editor', '点击进入富文本编辑器编辑页面内容', adminLang)}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([
                    { slug: 'privacy-policy' as StaticPageSlug, title: t('Privacy Policy', '隐私政策', adminLang), icon: '🛡️', desc: t('Site privacy policy', '网站隐私政策', adminLang) },
                    { slug: 'about-us' as StaticPageSlug, title: t('About Us', '关于我们', adminLang), icon: 'ℹ️', desc: t('About the site', '关于本站', adminLang) },
                    { slug: 'disclaimer' as StaticPageSlug, title: t('Disclaimer', '免责声明', adminLang), icon: '⚠️', desc: t('Site disclaimer', '网站免责声明', adminLang) },
                    { slug: 'affiliate-disclosure' as StaticPageSlug, title: t('Affiliate Disclosure', '联盟披露', adminLang), icon: '🤝', desc: t('Affiliate partnerships disclosure', '联盟合作关系披露', adminLang) },
                    { slug: 'terms-of-service' as StaticPageSlug, title: t('Terms of Service', '服务条款', adminLang), icon: '📋', desc: t('Terms and conditions of use', '使用条款与条件', adminLang) },
                  ]).map((page) => (
                    <button
                      key={page.slug}
                      onClick={() => setSiteSettingsSubPage(page.slug)}
                      className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 text-left hover:border-purple-500 hover:bg-purple-500/5 transition-all group"
                    >
                      <span className="text-2xl">{page.icon}</span>
                      <span className="text-sm font-semibold group-hover:text-purple-400 transition-colors">{page.title}</span>
                      <span className="text-xs text-muted-foreground">{page.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
                </>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">{t('Analytics', '数据统计', adminLang)}</h2>
                <div className="flex items-center gap-3">
                  <select
                    value={analyticsRegion}
                    onChange={(e) => setAnalyticsRegion(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">{t('Global', '全球', adminLang)}</option>
                    <option value="USA">{t('USA', '美国', adminLang)}</option>
                    <option value="UK">{t('UK', '英国', adminLang)}</option>
                    <option value="Canada">{t('Canada', '加拿大', adminLang)}</option>
                    <option value="Russia">{t('Russia', '俄罗斯', adminLang)}</option>
                    <option value="Japan">{t('Japan', '日本', adminLang)}</option>
                    <option value="Europe">{t('Europe', '欧洲', adminLang)}</option>
                  </select>
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
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={((analyticsData as Record<string, unknown>)?.trend as Array<Record<string, number | string>>) || []}
                      margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        tickFormatter={(value: string) => value.slice(-5)}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                        labelStyle={{ color: '#9ca3af' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="pv" name="PV" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="uv" name="UV" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
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
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{t('Products', '产品', adminLang)}</h1>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={productSearchInput}
                        onChange={(e) => setProductSearchInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setProductSearch(productSearchInput); setProductPage(1); } }}
                        placeholder="Search product name..."
                        className="px-3 py-1.5 pr-7 rounded-md border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500 w-48"
                      />
                      {productSearchInput && (
                        <button
                          type="button"
                          onClick={() => { setProductSearchInput(''); setProductSearch(''); setProductPage(1); }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => { setProductSearch(productSearchInput); setProductPage(1); }}
                      className="px-3 py-1.5 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                    >
                      {t('Confirm', '确认', adminLang)}
                    </button>
                  </div>
                </div>
                <ProductFormModal categories={categories} stores={stores} onSave={fetchAllData} lang={adminLang} activeLanguages={activeLanguages} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => setProductSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                          <span className="inline-flex items-center gap-1">
                            {t('ID', 'ID', adminLang)}
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline-block">
                              <path d="M6 2L9.5 5.5H2.5L6 2Z" fill={productSortOrder === 'asc' ? 'currentColor' : 'rgba(255,255,255,0.25)'} />
                              <path d="M6 10L2.5 6.5H9.5L6 10Z" fill={productSortOrder === 'desc' ? 'currentColor' : 'rgba(255,255,255,0.25)'} />
                            </svg>
                          </span>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Product', '产品', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Category', '分类', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Prices', '价格数', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Status', '状态', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Notes', '备注', adminLang)}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('Actions', '操作', adminLang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.map((product, pIndex) => {
                        const enName = product.product_translations?.find((tr) => tr.language === 'en')?.name || '—';
                        const zhName = product.product_translations?.find((tr) => tr.language === 'zh')?.name || '—';
                        const catName = product.categories?.category_translations?.find((tr) => tr.language === adminLang)?.name || '—';
                        const rowIndex = (productPage - 1) * PRODUCTS_PER_PAGE + pIndex + 1;
                        // 从产品关联的商城中获取地区信息
                        const productRegions = new Set<string>();
                        product.product_prices?.forEach((price: ProductPrice) => {
                          const store = stores.find((s) => s.id === price.store_id);
                          store?.regions?.forEach((r) => {
                            if (r.region) productRegions.add(r.region);
                          });
                        });
                        const regionList = Array.from(productRegions);
                        return (
                          <tr key={product.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">{rowIndex}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{product.id}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium">{enName}</div>
                              <div className="text-xs text-muted-foreground">{zhName}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{catName}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{product.product_prices?.length || 0} {t('stores', '家商城', adminLang)}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {product.is_active && <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">{t('Active', '启用', adminLang)}</span>}
                                {product.is_featured && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t('Featured', '推荐', adminLang)}</span>}
                                {regionList.map((region) => (
                                  <span key={region} className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400">{region}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate" title={product.notes || ''}>{product.notes || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <ProductFormModal product={product} categories={categories} stores={stores} onSave={fetchAllData} lang={adminLang} activeLanguages={activeLanguages} />
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
              {/* Pagination */}
              {productTotalPages > 1 && (
                <AdminPagination
                  currentPage={productPage}
                  totalPages={productTotalPages}
                  total={filteredProducts.length}
                  onPageChange={(p) => { setProductPage(p); }}
                  lang={adminLang}
                />
              )}
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === 'categories' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">{t('Categories', '分类', adminLang)}</h1>
                <CategoryFormModal onSave={fetchAllData} lang={adminLang} activeLanguages={activeLanguages} />
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
                              <CategoryFormModal category={cat} onSave={fetchAllData} lang={adminLang} activeLanguages={activeLanguages} />
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
                <div className="flex items-center gap-4">
                  <h1 className="text-2xl font-bold">{t('Stores', '商城', adminLang)}</h1>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => { setStoreTypeTab('store'); setStorePage(1); }}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${storeTypeTab === 'store' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary'}`}
                    >
                      {t('Store', '商城', adminLang)}
                    </button>
                    <button
                      onClick={() => { setStoreTypeTab('official'); setStorePage(1); }}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${storeTypeTab === 'official' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary'}`}
                    >
                      {t('Official Website', '官网', adminLang)}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={storeSearchInput}
                        onChange={(e) => setStoreSearchInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setStoreSearch(storeSearchInput.trim()); }}
                        placeholder={t('Search name...', '搜索名称...', adminLang)}
                        className="h-8 rounded-md border border-border bg-card px-3 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
                      />
                      {storeSearchInput && (
                        <button
                          type="button"
                          onClick={() => { setStoreSearchInput(''); setStoreSearch(''); setStorePage(1); }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => { setStoreSearch(storeSearchInput.trim()); setStorePage(1); }}
                      className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {t('Confirm', '确认', adminLang)}
                    </button>
                  </div>
                </div>
                <StoreFormModal onSave={fetchAllData} lang={adminLang} defaultType={storeTypeTab} activeLanguages={activeLanguages} allStores={stores} />
              </div>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => setStoreSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                          <span className="inline-flex items-center gap-1">
                            {t('ID', 'ID', adminLang)}
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline-block">
                              <path d="M6 2L9.5 5.5H2.5L6 2Z" fill={storeSortOrder === 'asc' ? 'currentColor' : 'rgba(255,255,255,0.25)'} />
                              <path d="M6 10L2.5 6.5H9.5L6 10Z" fill={storeSortOrder === 'desc' ? 'currentColor' : 'rgba(255,255,255,0.25)'} />
                            </svg>
                          </span>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Logo', 'Logo', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Type', '类型', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Name (EN)', '名称 (英文)', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Regions', '地区', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Currencies', '货币', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Notes', '备注', adminLang)}</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('Website', '网址', adminLang)}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('Actions', '操作', adminLang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStores.map((store, sIndex) => {
                        const rowIndex = (storePage - 1) * STORES_PER_PAGE + sIndex + 1;
                        return (
                        <tr key={store.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{rowIndex}</td>
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
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${(store.store_type || 'store') === 'official' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {(store.store_type || 'store') === 'official' ? t('Official', '官网', adminLang) : t('Store', '商城', adminLang)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{store.store_translations?.find((tr) => tr.language === 'en')?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{Array.isArray(store.regions) ? store.regions.map((r: any) => r.region).join(', ') || '—' : '—'}</td>
                          <td className="px-4 py-3 text-sm">{Array.isArray(store.regions) ? store.regions.map((r: any) => r.currency).join(', ') || '—' : '—'}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-32" title={store.notes || ''}>{store.notes || '—'}</td>
                          <td className="px-4 py-3 text-sm truncate max-w-48">
                            {Array.isArray(store.website_urls) && store.website_urls.length > 0
                              ? store.website_urls.map((w: {url: string; label?: string}, i: number) => (
                                  <a key={i} href={w.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline block truncate">
                                    {w.label ? `${w.label}: ${w.url}` : w.url}
                                  </a>
                                ))
                              : store.website_url
                                ? <a href={store.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{store.website_url}</a>
                                : '—'
                            }
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <StoreFormModal store={store} onSave={fetchAllData} lang={adminLang} defaultType={storeTypeTab} activeLanguages={activeLanguages} allStores={stores} />
                              <button onClick={() => handleDeleteStore(store.id)} className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors">
                                {t('Delete', '删除', adminLang)}
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Pagination */}
                  {storeTotalPages > 1 && (
                    <AdminPagination
                      currentPage={storePage}
                      totalPages={storeTotalPages}
                      total={filteredStores.length}
                      onPageChange={(p) => { setStorePage(p); }}
                      lang={adminLang}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Banners Tab */}
          {activeTab === 'banners' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">{t('Banners', 'Banner', adminLang)}</h1>
                <BannerFormModal onSave={fetchAllData} lang={adminLang} activeLanguages={activeLanguages} />
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
                            <BannerFormModal banner={banner} onSave={fetchAllData} lang={adminLang} activeLanguages={activeLanguages} />
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
          {/* Best Vapes Tab */}
          {activeTab === 'best_vapes' && (
            <ContentPagesManager ref={bestVapesRef} type="best_vapes" title={t('Best Vapes', 'Best Vapes', adminLang)} lang={adminLang} isFullPage activeLanguages={activeLanguages} />
          )}
          {/* News Tab */}
          {activeTab === 'news' && (
            <ContentPagesManager ref={newsRef} type="news" title={t('News', '新闻', adminLang)} lang={adminLang} isFullPage activeLanguages={activeLanguages} />
          )}
        </div>
      </main>
    </div>
  );
}

// ============== Rich Text Editor ==============

export interface RichTextEditorRef {
  getHTML: () => string;
  uploadBase64Images: (html: string) => Promise<string>;
}

const RichTextEditor = forwardRef<RichTextEditorRef, { value: string; onChange: (v: string) => void }>(function RichTextEditor({ value, onChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [importingWord, setImportingWord] = useState(false);
  const savedFormatsRef = useRef<Record<string, unknown> | null>(null);
  // Use ref for onChange to avoid stale closure in useCallback hooks
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Use ref for resizeImageToStorage to avoid stale closure in useEffect
  const resizeImageToStorageRef = useRef<(img: HTMLImageElement, w: number, h: number) => void>(() => {});
  const uploadImageFileRef = useRef<(file: File) => Promise<string | null>>(async () => null);

  // Expose getHTML() to parent for reliable content reading on Publish
  // Format Painter: copy formats from current cursor position
  const handleFormatPainterCopy = useCallback(() => {
    const container = containerRef.current;
    if (!container || !QuillClass) return;
    const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
    if (!qlContainer) return;
    try {
      const quill = QuillClass.find(qlContainer);
      if (!quill) return;
      const range = quill.getSelection();
      if (!range || range.length === 0) {
        // No selection - just toggle painter mode with no saved format (will copy on next select)
        setFormatPainterActive(prev => !prev);
        savedFormatsRef.current = null;
        return;
      }
      // Copy formats from the selected text
      const formats = quill.getFormat(range.index, range.length);
      savedFormatsRef.current = formats;
      setFormatPainterActive(true);
    } catch { /* ignore */ }
  }, []);

  // Word import: read .docx file and insert HTML into editor
  const handleWordImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImportingWord(true);
      try {
        const mammoth = await getMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        // Post-process: style tables to match the site's table design
        let html = result.value;
        html = html.replace(/<table([^>]*)>/gi, (match, attrs: string) => {
          // Remove any existing border/width attributes from Word
          const cleanAttrs = attrs
            .replace(/border="[^"]*"/gi, '')
            .replace(/cellspacing="[^"]*"/gi, '')
            .replace(/cellpadding="[^"]*"/gi, '')
            .replace(/width="[^"]*"/gi, '')
            .replace(/style="[^"]*"/gi, '')
            .trim();
          return `<table${cleanAttrs ? ' ' + cleanAttrs : ''}>`;
        });
        // Wrap tables in a scrollable container and apply consistent styling
        html = html.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (_match, attrs: string, content: string) => {
          // Detect if the table has a header row (first row has <th> or first <td> looks like header)
          const hasHeader = /<th[\s>]/i.test(content);
          let tableContent = content;
          if (!hasHeader) {
            // Convert first <tr>'s <td>s to <th>s
            tableContent = tableContent.replace(/<tr([^>]*)>([\s\S]*?)<\/tr>/i, (_m: string, trAttrs: string, rowContent: string) => {
              const convertedRow = rowContent.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, '<th$1>$2</th>');
              return `<tr${trAttrs ? ' ' + trAttrs : ''}>${convertedRow}</tr>`;
            });
          }
          // Clean inline styles from all cells
          tableContent = tableContent.replace(/<(td|th)([^>]*)>/gi, (_m: string, tag: string, cellAttrs: string) => {
            const cleanCellAttrs = cellAttrs
              .replace(/style="[^"]*"/gi, '')
              .replace(/width="[^"]*"/gi, '')
              .replace(/valign="[^"]*"/gi, '')
              .trim();
            return `<${tag}${cleanCellAttrs ? ' ' + cleanCellAttrs : ''}>`;
          });
          return `<div class="table-wrapper"><table>${tableContent}</table></div>`;
        });
        // Split HTML into segments: text blocks and table blocks
        // Tables must be inserted as TableEmbed blots because Quill's clipboard
        // parser strips <table>/<div class="table-wrapper"> tags
        const segments: Array<{ type: 'html' | 'table'; content: string }> = [];
        const tableRegex = /<div class="table-wrapper">([\s\S]*?)<\/div>\s*/gi;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = tableRegex.exec(html)) !== null) {
          // Text before this table
          if (match.index > lastIndex) {
            const textBefore = html.slice(lastIndex, match.index).trim();
            if (textBefore) segments.push({ type: 'html', content: textBefore });
          }
          // The table itself (strip outer wrapper since TableEmbed creates it)
          const innerHtml = match[1].trim(); // captured group: content inside <div class="table-wrapper">
          segments.push({ type: 'table', content: innerHtml });
          lastIndex = match.index + match[0].length;
        }
        // Remaining text after last table
        if (lastIndex < html.length) {
          const textAfter = html.slice(lastIndex).trim();
          if (textAfter) segments.push({ type: 'html', content: textAfter });
        }
        // If no tables found, just insert all as HTML
        if (segments.length === 0 && html.trim()) {
          segments.push({ type: 'html', content: html.trim() });
        }

        const container = containerRef.current;
        if (!container || !QuillClass) return;
        const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
        if (!qlContainer) return;
        const quill = QuillClass.find(qlContainer);
        if (!quill) return;

        // Build a single Delta that inserts all segments in order
        // For HTML segments, parse through clipboard to get proper Delta ops,
        // then combine with table-embed ops into one composite Delta
        const Delta = QuillClass.import('delta');
        let compositeDelta = new Delta();

        for (const seg of segments) {
          if (seg.type === 'table') {
            // Insert table as a TableEmbed blot + newline
            compositeDelta = compositeDelta
              .insert({ 'table-embed': { html: seg.content } })
              .insert('\n');
          } else {
            // Parse HTML segment through Quill's clipboard to get proper Delta ops
            const tempDelta = quill.clipboard.convert({ html: seg.content, text: '' });
            compositeDelta = compositeDelta.concat(tempDelta);
          }
        }

        // Prepend a retain to skip existing content, so the composite Delta
        // appends at the end of the document instead of inserting at position 0.
        // Quill always has a trailing newline, so getLength() - 1 is the actual
        // content length before the trailing newline.
        const currentLength = quill.getLength();
        compositeDelta = new Delta().retain(currentLength - 1).concat(compositeDelta);
        quill.editor.applyDelta(compositeDelta);

        // Sync React state with the new editor content
        setTimeout(() => {
          const newHtml = quill.root.innerHTML;
          console.log('[Word Import] Syncing to React state, HTML length:', newHtml?.length);
          onChangeRef.current(newHtml);
        }, 0);
      } catch (err) {
        console.error('Word import failed:', err);
        alert('Failed to import Word document');
      } finally {
        setImportingWord(false);
      }
    };
    input.click();
  }, []);

  // Table insert: create HTML table and insert into editor
  const handleInsertTable = useCallback(() => {
    const container = containerRef.current;
    if (!container || !QuillClass) return;
    const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
    if (!qlContainer) return;
    const quill = QuillClass.find(qlContainer);
    if (!quill) return;

    const rows = Math.max(1, Math.min(tableRows, 20));
    const cols = Math.max(1, Math.min(tableCols, 10));
    let tableContent = '<table>';
    // Header row
    tableContent += '<tr>';
    for (let c = 0; c < cols; c++) {
      tableContent += `<th>Header ${c + 1}</th>`;
    }
    tableContent += '</tr>';
    // Data rows
    for (let r = 0; r < rows - 1; r++) {
      tableContent += '<tr>';
      for (let c = 0; c < cols; c++) {
        tableContent += `<td>&nbsp;</td>`;
      }
      tableContent += '</tr>';
    }
    tableContent += '</table>';
    // TableEmbed's create() already adds <div class="table-wrapper"> wrapper,
    // so we only pass the inner table HTML
    const Delta = QuillClass.import('delta');
    const tableDelta = new Delta().insert({ 'table-embed': { html: tableContent } });
    quill.editor.applyDelta(tableDelta);
    // Sync React state with the new editor content
    setTimeout(() => {
      const html = quill.root.innerHTML;
      onChangeRef.current(html);
    }, 0);
    setShowTableModal(false);
  }, [tableRows, tableCols]);

  // Format Painter: apply saved formats on text selection
  useEffect(() => {
    if (!formatPainterActive || !savedFormatsRef.current) return;
    const container = containerRef.current;
    if (!container || !QuillClass) return;

    const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
    if (!qlContainer) return;

    const handleSelectionChange = () => {
      try {
        const quill = QuillClass.find(qlContainer);
        if (!quill) return;
        const range = quill.getSelection();
        if (range && range.length > 0) {
          // Apply saved formats to the selected text
          quill.format(savedFormatsRef.current as Record<string, unknown>);
          // Deactivate after applying
          setFormatPainterActive(false);
          savedFormatsRef.current = null;
        }
      } catch { /* ignore */ }
    };

    const quill = QuillClass.find(qlContainer);
    if (quill) {
      quill.on('selection-change', handleSelectionChange);
      return () => {
        quill.off('selection-change', handleSelectionChange);
      };
    }
  }, [formatPainterActive]);

  // Inject format painter button + custom color buttons into toolbar
  useEffect(() => {
    const injectCustomToolbarButtons = () => {
      const container = containerRef.current;
      if (!container) return;

      // --- Format Painter Button ---
      const toolbar = container.querySelector('.ql-toolbar');
      if (toolbar && !toolbar.querySelector('.ql-format-painter')) {
        const painterBtn = document.createElement('button');
        painterBtn.type = 'button';
        painterBtn.className = 'ql-format-painter';
        painterBtn.title = '格式刷 (Format Painter)';
        painterBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 5 5c0 2.76-2.24 5-5 5a5 5 0 0 1-5-5 5 5 0 0 1 5-5z"/><path d="M12 12v10"/><path d="M8 22h8"/></svg>`;
        painterBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleFormatPainterCopy();
        });
        const painterGroup = document.createElement('span');
        painterGroup.className = 'ql-formats';
        painterGroup.appendChild(painterBtn);
        // Find the correct parent for insertion (insert before the last ql-formats group)
        const allGroups = toolbar.querySelectorAll('.ql-formats');
        if (allGroups.length > 0) {
          const lastGroup = allGroups[allGroups.length - 1];
          lastGroup.parentElement!.insertBefore(painterGroup, lastGroup.nextSibling);
        } else {
          toolbar.appendChild(painterGroup);
        }
      }

      // --- Word Import Button ---
      if (toolbar && !toolbar.querySelector('.ql-word-import')) {
        const wordBtn = document.createElement('button');
        wordBtn.type = 'button';
        wordBtn.className = 'ql-word-import';
        wordBtn.title = '导入Word (Import Word)';
        wordBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/></svg>`;
        wordBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleWordImport();
        });
        const wordGroup = document.createElement('span');
        wordGroup.className = 'ql-formats';
        wordGroup.appendChild(wordBtn);
        // Insert after format painter
        const painterGroupEl = toolbar.querySelector('.ql-format-painter')?.parentElement;
        if (painterGroupEl) {
          painterGroupEl.parentElement!.insertBefore(wordGroup, painterGroupEl.nextSibling);
        } else {
          toolbar.appendChild(wordGroup);
        }
      }

      // --- Table Insert Button ---
      if (toolbar && !toolbar.querySelector('.ql-insert-table')) {
        const tableBtn = document.createElement('button');
        tableBtn.type = 'button';
        tableBtn.className = 'ql-insert-table';
        tableBtn.title = '插入表格 (Insert Table)';
        tableBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;
        tableBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowTableModal(true);
        });
        const tableGroup = document.createElement('span');
        tableGroup.className = 'ql-formats';
        tableGroup.appendChild(tableBtn);
        // Insert after word import
        const wordGroupEl = toolbar.querySelector('.ql-word-import')?.parentElement;
        if (wordGroupEl) {
          wordGroupEl.parentElement!.insertBefore(tableGroup, wordGroupEl.nextSibling);
        } else {
          toolbar.appendChild(tableGroup);
        }
      }

      // --- Custom Color Pickers ---
      const pickers = container.querySelectorAll('.ql-toolbar .ql-color-picker');
      pickers.forEach((picker) => {
        const options = picker.querySelector('.ql-picker-options');
        if (!options || options.querySelector('.ql-custom-color-wrapper')) return;

        const isBackground = picker.classList.contains('ql-background');
        const formatName = isBackground ? 'background' : 'color';
        const storageKey = isBackground ? 'quill-recent-bg-colors' : 'quill-recent-text-colors';

        // --- Recently Used Colors Section ---
        const recentWrapper = document.createElement('div');
        recentWrapper.className = 'ql-recent-colors-wrapper';

        const recentLabel = document.createElement('div');
        recentLabel.className = 'ql-recent-colors-label';
        recentLabel.textContent = '最近使用';
        recentWrapper.appendChild(recentLabel);

        const recentRow = document.createElement('div');
        recentRow.className = 'ql-recent-colors-row';
        recentWrapper.appendChild(recentRow);

        const renderRecentColors = () => {
          recentRow.innerHTML = '';
          const stored = localStorage.getItem(storageKey);
          const recentColors: string[] = stored ? JSON.parse(stored) : [];
          for (let i = 0; i < 8; i++) {
            const slot = document.createElement('span');
            slot.className = 'ql-recent-color-slot';
            if (recentColors[i]) {
              slot.style.backgroundColor = recentColors[i];
              slot.title = recentColors[i];
              const colorVal = recentColors[i];
              slot.addEventListener('click', (e) => {
                e.stopPropagation();
                const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
                if (qlContainer && QuillClass) {
                  try {
                    const quill = QuillClass.find(qlContainer);
                    if (quill) quill.format(formatName, colorVal);
                  } catch { /* ignore */ }
                }
                picker.classList.remove('ql-expanded');
              });
            }
            recentRow.appendChild(slot);
          }
        };
        renderRecentColors();

        // --- Custom Color Button ---
        const wrapper = document.createElement('div');
        wrapper.className = 'ql-custom-color-wrapper';
        wrapper.innerHTML = `
          <div class="ql-custom-color-btn">
            <span>自定义颜色</span>
            <svg viewBox="0 0 10 10" width="10" height="10" style="margin-left:auto"><path d="M3 1l5 4-5 4z" fill="currentColor"/></svg>
          </div>
          <input type="color" class="ql-custom-color-input" />
        `;

        const btn = wrapper.querySelector('.ql-custom-color-btn') as HTMLElement;
        const colorInput = wrapper.querySelector('.ql-custom-color-input') as HTMLInputElement;

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          colorInput.click();
        });

        colorInput.addEventListener('input', (ev) => {
          const color = (ev.target as HTMLInputElement).value;
          const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
          if (qlContainer && QuillClass) {
            try {
              const quill = QuillClass.find(qlContainer);
              if (quill) quill.format(formatName, color);
            } catch { /* ignore */ }
          }
          const stored = localStorage.getItem(storageKey);
          const recentColors: string[] = stored ? JSON.parse(stored) : [];
          const filtered = recentColors.filter((c: string) => c !== color);
          filtered.unshift(color);
          if (filtered.length > 8) filtered.length = 8;
          localStorage.setItem(storageKey, JSON.stringify(filtered));
          renderRecentColors();
        });

        options.appendChild(recentWrapper);
        options.appendChild(wrapper);

        const observer = new MutationObserver(() => {
          if (picker.classList.contains('ql-expanded')) {
            renderRecentColors();
          }
        });
        observer.observe(picker, { attributes: true, attributeFilter: ['class'] });
      });
    };

    const timer = setTimeout(injectCustomToolbarButtons, 300);
    // Retry injection in case the editor renders later (e.g. tab switch)
    const retryTimer = setTimeout(injectCustomToolbarButtons, 1500);
    return () => { clearTimeout(timer); clearTimeout(retryTimer); };
  }, [handleFormatPainterCopy]);

  // Update format painter button active state
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const painterBtn = container.querySelector('.ql-format-painter');
    if (painterBtn) {
      if (formatPainterActive) {
        painterBtn.classList.add('ql-active');
      } else {
        painterBtn.classList.remove('ql-active');
      }
    }
  }, [formatPainterActive]);

  // ===== Image Resize: click to select, drag handles to resize (overlay approach — no DOM mutation inside editor) =====
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const MAX_WIDTH = 1060;
    const MIN_WIDTH = 40;

    // State for active resize
    let activeImg: HTMLImageElement | null = null;
    let dragOverlay: HTMLDivElement | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let isCropping = false;
    let cropCleanup: (() => void) | null = null;
    let cropConfirmCallback: (() => void) | null = null;
    let startX = 0;
    let startWidth = 0;
    let startHeight = 0;
    let naturalWidth = 0;
    let naturalHeight = 0;

    // Position the selection box overlay on top of the active image
    const positionSelectionBox = () => {
      if (!selectionBox || !activeImg || !container) return;
      const containerRect = container.getBoundingClientRect();
      const imgRect = activeImg.getBoundingClientRect();
      selectionBox.style.top = (imgRect.top - containerRect.top) + 'px';
      selectionBox.style.left = (imgRect.left - containerRect.left) + 'px';
      selectionBox.style.width = imgRect.width + 'px';
      selectionBox.style.height = imgRect.height + 'px';
      selectionBox.style.display = 'block';

      // Position toolbar above the selection box
      if (imgToolbar) {
        const toolbarTop = imgRect.top - containerRect.top - 36;
        imgToolbar.style.top = (toolbarTop < 0 ? imgRect.top - containerRect.top + imgRect.height + 4 : toolbarTop) + 'px';
        imgToolbar.style.left = (imgRect.left - containerRect.left) + 'px';
        imgToolbar.style.display = 'flex';
      }
    };

    // Show selection box and toolbar around an image
    let imgToolbar: HTMLDivElement | null = null;

    // Remove selection overlay
    const clearSelection = () => {
      if (isCropping && cropCleanup) {
        // If in crop mode, cancel the crop instead
        cropCleanup();
        return;
      }
      if (selectionBox) { selectionBox.remove(); selectionBox = null; }
      if (dragOverlay) { dragOverlay.remove(); dragOverlay = null; }
      if (imgToolbar) { imgToolbar.remove(); imgToolbar = null; }
      activeImg = null;
    };

    const showSelectionBox = (img: HTMLImageElement) => {
      clearSelection();

      activeImg = img;
      naturalWidth = img.naturalWidth || img.width;
      naturalHeight = img.naturalHeight || img.height;

      // Set explicit width/height from current rendered size if not set
      const currentWidth = img.offsetWidth;
      const currentHeight = img.offsetHeight;
      img.style.width = currentWidth + 'px';
      img.style.height = currentHeight + 'px';

      // Make container position:relative so the overlay can use absolute positioning
      const originalPosition = container.style.position;
      if (!originalPosition || originalPosition === 'static') {
        container.style.position = 'relative';
      }

      // Create floating toolbar
      imgToolbar = document.createElement('div');
      imgToolbar.className = 'ql-img-toolbar';

      // Alignment group
      const alignGroup = document.createElement('div');
      alignGroup.className = 'ql-img-toolbar-group';

      const alignLeftBtn = document.createElement('button');
      alignLeftBtn.title = 'Align Left';
      alignLeftBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="14" height="4" rx="1"/><rect x="3" y="10" width="18" height="2" rx="0.5"/><rect x="3" y="14" width="18" height="2" rx="0.5"/><rect x="3" y="18" width="12" height="2" rx="0.5"/></svg>`;
      alignLeftBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const alignCenterBtn = document.createElement('button');
      alignCenterBtn.title = 'Align Center';
      alignCenterBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="4" rx="1"/><rect x="3" y="10" width="18" height="2" rx="0.5"/><rect x="3" y="14" width="18" height="2" rx="0.5"/><rect x="5" y="18" width="14" height="2" rx="0.5"/></svg>`;
      alignCenterBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const alignRightBtn = document.createElement('button');
      alignRightBtn.title = 'Align Right';
      alignRightBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="3" width="14" height="4" rx="1"/><rect x="3" y="10" width="18" height="2" rx="0.5"/><rect x="3" y="14" width="18" height="2" rx="0.5"/><rect x="9" y="18" width="12" height="2" rx="0.5"/></svg>`;
      alignRightBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const applyAlignment = (alignClass: string) => {
        if (!activeImg) return;
        // Remove old alignment classes
        activeImg.classList.remove('img-align-left', 'img-align-center', 'img-align-right');
        activeImg.classList.add(alignClass);
        // Update toolbar active state
        [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => b.classList.remove('active'));
        if (alignClass === 'img-align-left') alignLeftBtn.classList.add('active');
        else if (alignClass === 'img-align-center') alignCenterBtn.classList.add('active');
        else if (alignClass === 'img-align-right') alignRightBtn.classList.add('active');
        // Remove any clearing BR that may have been added
        const nextSibling = activeImg.nextElementSibling;
        if (nextSibling && nextSibling.tagName === 'BR' && (nextSibling as HTMLElement).style.clear) {
          nextSibling.remove();
        }
        // Persist the class via Quill's format API so it survives re-renders
        persistImageFormats(activeImg);
        requestAnimationFrame(() => positionSelectionBox());
      };

      alignLeftBtn.addEventListener('click', () => applyAlignment('img-align-left'));
      alignCenterBtn.addEventListener('click', () => applyAlignment('img-align-center'));
      alignRightBtn.addEventListener('click', () => applyAlignment('img-align-right'));

      alignGroup.appendChild(alignLeftBtn);
      alignGroup.appendChild(alignCenterBtn);
      alignGroup.appendChild(alignRightBtn);

      // Border group
      const borderGroup = document.createElement('div');
      borderGroup.className = 'ql-img-toolbar-group';

      const borderNoneBtn = document.createElement('button');
      borderNoneBtn.title = 'No Border';
      borderNoneBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/></svg>`;
      borderNoneBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const borderThinBtn = document.createElement('button');
      borderThinBtn.title = 'Thin Border';
      borderThinBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
      borderThinBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const borderRoundedBtn = document.createElement('button');
      borderRoundedBtn.title = 'Rounded Border';
      borderRoundedBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="6"/></svg>`;
      borderRoundedBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const borderShadowBtn = document.createElement('button');
      borderShadowBtn.title = 'Shadow';
      borderShadowBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="16" height="16" rx="4"/><rect x="3" y="3" width="16" height="16" rx="4" opacity="0.3"/></svg>`;
      borderShadowBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      const applyBorder = (borderClass: string) => {
        if (!activeImg) return;
        activeImg.classList.remove('img-border-none', 'img-border-thin', 'img-border-rounded', 'img-border-shadow');
        activeImg.classList.add(borderClass);
        [borderNoneBtn, borderThinBtn, borderRoundedBtn, borderShadowBtn].forEach(b => b.classList.remove('active'));
        if (borderClass === 'img-border-none') borderNoneBtn.classList.add('active');
        else if (borderClass === 'img-border-thin') borderThinBtn.classList.add('active');
        else if (borderClass === 'img-border-rounded') borderRoundedBtn.classList.add('active');
        else if (borderClass === 'img-border-shadow') borderShadowBtn.classList.add('active');
        // Persist the class via Quill's format API so it survives re-renders
        persistImageFormats(activeImg);
      };

      borderNoneBtn.addEventListener('click', () => applyBorder('img-border-none'));
      borderThinBtn.addEventListener('click', () => applyBorder('img-border-thin'));
      borderRoundedBtn.addEventListener('click', () => applyBorder('img-border-rounded'));
      borderShadowBtn.addEventListener('click', () => applyBorder('img-border-shadow'));

      borderGroup.appendChild(borderNoneBtn);
      borderGroup.appendChild(borderThinBtn);
      borderGroup.appendChild(borderRoundedBtn);
      borderGroup.appendChild(borderShadowBtn);

      // Crop group
      const cropGroup = document.createElement('div');
      cropGroup.className = 'ql-img-toolbar-group';

      const cropBtn = document.createElement('button');
      cropBtn.title = 'Crop Image';
      cropBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>`;
      cropBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      cropBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isCropping) {
          // Confirm crop — trigger the confirm callback
          if (cropConfirmCallback) cropConfirmCallback();
        } else {
          if (!activeImg) return;
          openImageCrop(activeImg);
        }
      });

      cropGroup.appendChild(cropBtn);

      imgToolbar.appendChild(alignGroup);
      imgToolbar.appendChild(borderGroup);
      imgToolbar.appendChild(cropGroup);

      // Set initial active states based on current classes
      if (img.classList.contains('img-align-left')) alignLeftBtn.classList.add('active');
      else if (img.classList.contains('img-align-right')) alignRightBtn.classList.add('active');
      else alignCenterBtn.classList.add('active'); // default center

      if (img.classList.contains('img-border-thin')) borderThinBtn.classList.add('active');
      else if (img.classList.contains('img-border-rounded')) borderRoundedBtn.classList.add('active');
      else if (img.classList.contains('img-border-shadow')) borderShadowBtn.classList.add('active');
      else borderNoneBtn.classList.add('active'); // default none

      container.appendChild(imgToolbar);

      // Create selection box (absolute positioned overlay, OUTSIDE .ql-editor)
      selectionBox = document.createElement('div');
      selectionBox.className = 'ql-img-resize-selection';

      // Create 4 corner handles
      const handlePositions = ['ql-handle-tl', 'ql-handle-tr', 'ql-handle-bl', 'ql-handle-br'];
      handlePositions.forEach((pos) => {
        const handle = document.createElement('div');
        handle.className = `ql-img-resize-handle ${pos}`;
        selectionBox!.appendChild(handle);
      });

      container.appendChild(selectionBox);
      positionSelectionBox();
    };

    // Helper: sync Quill content to state
    const syncQuillContent = () => {
      const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
      if (qlContainer && QuillClass) {
        try {
          const quill = QuillClass.find(qlContainer);
          if (quill) {
            setTimeout(() => { onChangeRef.current(quill.root.innerHTML); }, 0);
          }
        } catch { /* ignore */ }
      }
    };

    // Persist image class/style/width/height attributes through Quill's Delta model
    // so they survive React re-renders. Uses Quill.format() on the image blot.
    const persistImageFormats = (img: HTMLImageElement) => {
      const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
      if (!qlContainer || !QuillClass) return;
      try {
        const quill = QuillClass.find(qlContainer);
        if (!quill) return;
        const blot = QuillClass.find(img);
        if (!blot) return;
        const offset = blot.offset(quill.scroll);
        const cls = img.getAttribute('class') || '';
        const style = img.getAttribute('style') || '';
        const w = img.getAttribute('width') || '';
        const h = img.getAttribute('height') || '';
        // Use quill.formatText to store extra attrs in the Delta
        const formats: Record<string, string> = {};
        if (cls) formats['class'] = cls;
        if (style) formats['style'] = style;
        if (w) formats['width'] = w;
        if (h) formats['height'] = h;
        quill.formatText(offset, 1, formats, 'silent');
        // Also sync the HTML to React state
        setTimeout(() => { onChangeRef.current(quill.root.innerHTML); }, 0);
      } catch { /* ignore */ }
    };

    // Open inline image crop UI (Word-style: toolbar crop icon becomes ✓, blue dashed selection, dim masks)
    const openImageCrop = (img: HTMLImageElement) => {
      const src = img.getAttribute('src');
      if (!src) return;

      const qlEditor = container.querySelector('.ql-editor') as HTMLElement | null;
      if (!qlEditor) return;

      // Set cropping state
      isCropping = true;

      // Hide the selection box while cropping (keep toolbar visible)
      if (selectionBox) selectionBox.style.display = 'none';

      // Transform toolbar crop button into ✓ confirm button
      if (imgToolbar) {
        const cropBtnEl = imgToolbar.querySelector('.ql-img-toolbar-group:last-child button') as HTMLElement | null;
        if (cropBtnEl) {
          cropBtnEl.title = 'Confirm Crop';
          cropBtnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
          cropBtnEl.style.background = '#059669';
          cropBtnEl.style.color = '#fff';
        }
        // Disable alignment and border buttons during crop
        imgToolbar.querySelectorAll('.ql-img-toolbar-group:not(:last-child) button').forEach(b => {
          (b as HTMLButtonElement).disabled = true;
          (b as HTMLElement).style.opacity = '0.4';
          (b as HTMLElement).style.pointerEvents = 'none';
        });
      }

      // Create a full-size overlay on top of the editor area
      // IMPORTANT: Append to container (NOT qlEditor) because Quill controls its own DOM
      // and will remove unknown elements appended to .ql-editor
      const editorWrapper = document.createElement('div');
      editorWrapper.className = 'ql-crop-container';
      editorWrapper.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:55;cursor:crosshair;';
      container.style.position = 'relative';
      container.appendChild(editorWrapper);

      // Load the original image for cropping
      const originalImg = new window.Image();
      originalImg.crossOrigin = 'anonymous';
      originalImg.src = src;

      // Selection state (as percentages of displayed image size)
      let selX = 0, selY = 0, selW = 1, selH = 1; // default: full image

      // Helper: get img position relative to container (since overlay is on container)
      const getImgOffset = (): { left: number; top: number; width: number; height: number } => {
        const imgRect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return {
          left: imgRect.left - containerRect.left,
          top: imgRect.top - containerRect.top,
          width: imgRect.width,
          height: imgRect.height,
        };
      };

      // Dark masks (top, bottom, left, right) around the selection
      const maskTop = document.createElement('div');
      const maskBottom = document.createElement('div');
      const maskLeft = document.createElement('div');
      const maskRight = document.createElement('div');
      [maskTop, maskBottom, maskLeft, maskRight].forEach(m => {
        m.style.cssText = 'position:absolute;background:rgba(0,0,0,0.5);pointer-events:none;';
        editorWrapper.appendChild(m);
      });

      // Selection border (blue dashed like Word)
      const selBorder = document.createElement('div');
      selBorder.className = 'ql-crop-selection';
      selBorder.style.cssText = 'position:absolute;border:2px dashed #2b7cd8;pointer-events:none;box-shadow:0 0 0 1px rgba(43,124,216,0.3);';
      editorWrapper.appendChild(selBorder);

      // 8 handles: 4 corners + 4 edge midpoints (like Word)
      const handles: HTMLDivElement[] = [];
      const handleConfigs = [
        { id: 'nw', cursor: 'nw-resize' },
        { id: 'n',  cursor: 'n-resize' },
        { id: 'ne', cursor: 'ne-resize' },
        { id: 'e',  cursor: 'e-resize' },
        { id: 'se', cursor: 'se-resize' },
        { id: 's',  cursor: 's-resize' },
        { id: 'sw', cursor: 'sw-resize' },
        { id: 'w',  cursor: 'w-resize' },
      ];
      for (const cfg of handleConfigs) {
        const h = document.createElement('div');
        h.className = 'ql-crop-handle';
        h.dataset.handle = cfg.id;
        const isCorner = ['nw', 'ne', 'sw', 'se'].includes(cfg.id);
        const size = isCorner ? 10 : 8;
        h.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:#fff;border:2px solid #2b7cd8;cursor:${cfg.cursor};z-index:15;${isCorner ? 'border-radius:1px;' : 'border-radius:1px;'}`;
        editorWrapper.appendChild(h);
        handles.push(h);
      }

      // Update mask and handle positions based on img position and selection
      const updateSelection = () => {
        const off = getImgOffset();
        const imgW = off.width;
        const imgH = off.height;
        const ox = off.left;
        const oy = off.top;

        const sx = selX * imgW, sy = selY * imgH;
        const sw = selW * imgW, sh = selH * imgH;

        // Masks (positioned relative to editorWrapper which is over qlEditor)
        maskTop.style.cssText = `position:absolute;top:${oy}px;left:${ox}px;width:${imgW}px;height:${sy}px;background:rgba(0,0,0,0.5);pointer-events:none;z-index:11;`;
        maskBottom.style.cssText = `position:absolute;top:${oy+sy+sh}px;left:${ox}px;width:${imgW}px;height:${imgH-sy-sh}px;background:rgba(0,0,0,0.5);pointer-events:none;z-index:11;`;
        maskLeft.style.cssText = `position:absolute;top:${oy+sy}px;left:${ox}px;width:${sx}px;height:${sh}px;background:rgba(0,0,0,0.5);pointer-events:none;z-index:11;`;
        maskRight.style.cssText = `position:absolute;top:${oy+sy}px;left:${ox+sx+sw}px;width:${imgW-sx-sw}px;height:${sh}px;background:rgba(0,0,0,0.5);pointer-events:none;z-index:11;`;

        // Selection border
        selBorder.style.left = (ox + sx) + 'px';
        selBorder.style.top = (oy + sy) + 'px';
        selBorder.style.width = sw + 'px';
        selBorder.style.height = sh + 'px';
        selBorder.style.zIndex = '12';

        // Handles: 8 positions [nw, n, ne, e, se, s, sw, w]
        const hh = 5; // half handle size for offset
        // nw (top-left)
        handles[0].style.left = (ox + sx - hh) + 'px'; handles[0].style.top = (oy + sy - hh) + 'px';
        // n (top-center)
        handles[1].style.left = (ox + sx + sw/2 - hh) + 'px'; handles[1].style.top = (oy + sy - hh) + 'px';
        // ne (top-right)
        handles[2].style.left = (ox + sx + sw - hh) + 'px'; handles[2].style.top = (oy + sy - hh) + 'px';
        // e (mid-right)
        handles[3].style.left = (ox + sx + sw - hh) + 'px'; handles[3].style.top = (oy + sy + sh/2 - hh) + 'px';
        // se (bottom-right)
        handles[4].style.left = (ox + sx + sw - hh) + 'px'; handles[4].style.top = (oy + sy + sh - hh) + 'px';
        // s (bottom-center)
        handles[5].style.left = (ox + sx + sw/2 - hh) + 'px'; handles[5].style.top = (oy + sy + sh - hh) + 'px';
        // sw (bottom-left)
        handles[6].style.left = (ox + sx - hh) + 'px'; handles[6].style.top = (oy + sy + sh - hh) + 'px';
        // w (mid-left)
        handles[7].style.left = (ox + sx - hh) + 'px'; handles[7].style.top = (oy + sy + sh/2 - hh) + 'px';
      };

      updateSelection();

      // Drag handling
      let dragType: string | null = null;
      let dragStartX = 0, dragStartY = 0;
      let startSelX = 0, startSelY = 0, startSelW = 0, startSelH = 0;

      const getMousePos = (e: MouseEvent) => {
        const imgRect = img.getBoundingClientRect();
        return { x: (e.clientX - imgRect.left) / imgRect.width, y: (e.clientY - imgRect.top) / imgRect.height };
      };

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const target = e.target as HTMLElement;

        if (target.dataset.handle) {
          dragType = target.dataset.handle;
        } else {
          const pos = getMousePos(e);
          if (pos.x >= selX && pos.x <= selX + selW && pos.y >= selY && pos.y <= selY + selH) {
            dragType = 'move';
          } else {
            dragType = 'new';
            selX = pos.x; selY = pos.y; selW = 0; selH = 0;
          }
        }

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startSelX = selX; startSelY = selY; startSelW = selW; startSelH = selH;
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!dragType) return;
        e.preventDefault();

        const imgRect = img.getBoundingClientRect();
        const dx = (e.clientX - dragStartX) / imgRect.width;
        const dy = (e.clientY - dragStartY) / imgRect.height;

        if (dragType === 'move') {
          selX = Math.max(0, Math.min(1 - selW, startSelX + dx));
          selY = Math.max(0, Math.min(1 - selH, startSelY + dy));
        } else if (dragType === 'new') {
          const pos = getMousePos(e);
          selX = Math.min(startSelX, pos.x);
          selY = Math.min(startSelY, pos.y);
          selW = Math.abs(pos.x - startSelX);
          selH = Math.abs(pos.y - startSelY);
          selW = Math.min(selW, 1 - selX);
          selH = Math.min(selH, 1 - selY);
        } else {
          let newX = startSelX, newY = startSelY, newW = startSelW, newH = startSelH;

          if (dragType.includes('w')) { newX = startSelX + dx; newW = startSelW - dx; }
          if (dragType.includes('e')) { newW = startSelW + dx; }
          if (dragType.includes('n')) { newY = startSelY + dy; newH = startSelH - dy; }
          if (dragType.includes('s')) { newH = startSelH + dy; }

          if (newW < 0.02) { newW = 0.02; if (dragType.includes('w')) newX = startSelX + startSelW - 0.02; }
          if (newH < 0.02) { newH = 0.02; if (dragType.includes('n')) newY = startSelY + startSelH - 0.02; }
          if (newX < 0) { newW += newX; newX = 0; }
          if (newY < 0) { newH += newY; newY = 0; }
          if (newX + newW > 1) newW = 1 - newX;
          if (newY + newH > 1) newH = 1 - newY;

          selX = newX; selY = newY; selW = newW; selH = newH;
        }

        updateSelection();
      };

      const onMouseUp = () => {
        dragType = null;
      };

      editorWrapper.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      // Cleanup function: restore toolbar and remove crop overlay
      const cleanup = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (onKeyDownRef) document.removeEventListener('keydown', onKeyDownRef);
        editorWrapper.remove();
        isCropping = false;
        cropCleanup = null;
        cropConfirmCallback = null;

        // Restore toolbar crop button to original crop icon
        if (imgToolbar) {
          const cropBtnEl = imgToolbar.querySelector('.ql-img-toolbar-group:last-child button') as HTMLElement | null;
          if (cropBtnEl) {
            cropBtnEl.title = 'Crop Image';
            cropBtnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>`;
            cropBtnEl.style.background = '';
            cropBtnEl.style.color = '';
          }
          // Re-enable alignment and border buttons
          imgToolbar.querySelectorAll('.ql-img-toolbar-group:not(:last-child) button').forEach(b => {
            (b as HTMLButtonElement).disabled = false;
            (b as HTMLElement).style.opacity = '';
            (b as HTMLElement).style.pointerEvents = '';
          });
        }

        // Restore selection box
        if (selectionBox) selectionBox.style.display = '';
        requestAnimationFrame(() => positionSelectionBox());
      };

      cropCleanup = cleanup;

      // Escape key to cancel crop
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
        }
      };
      let onKeyDownRef: ((e: KeyboardEvent) => void) | null = onKeyDown;
      document.addEventListener('keydown', onKeyDown);

      // Confirm crop callback (triggered by ✓ button in toolbar)
      cropConfirmCallback = async () => {
        if (selW < 0.01 || selH < 0.01) {
          // Selection too small, just cancel
          cleanup();
          return;
        }

        if (!originalImg.complete) {
          await new Promise<void>((resolve) => {
            originalImg.onload = () => resolve();
            originalImg.onerror = () => resolve();
          });
        }

        const natW = originalImg.naturalWidth;
        const natH = originalImg.naturalHeight;

        const cx = Math.round(selX * natW);
        const cy = Math.round(selY * natH);
        const cw = Math.round(selW * natW);
        const ch = Math.round(selH * natH);

        if (cw < 5 || ch < 5) {
          cleanup();
          return;
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cw;
        cropCanvas.height = ch;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(originalImg, cx, cy, cw, ch, 0, 0, cw, ch);

        const isJpg = src.includes('.jpg') || src.includes('.jpeg') || !src.includes('.png');
        const outputType = isJpg ? 'image/jpeg' : 'image/png';
        const ext = isJpg ? 'jpg' : 'png';

        const blob = await new Promise<Blob>((resolve) => {
          cropCanvas.toBlob((b) => resolve(b!), outputType, outputType === 'image/jpeg' ? 0.85 : undefined);
        });

        const file = new File([blob], `cropped-${Date.now()}.${ext}`, { type: outputType });

        try {
          const newUrl = await uploadImageFileRef.current(file);
          if (newUrl) {
            img.setAttribute('src', newUrl);
            img.removeAttribute('width');
            img.removeAttribute('height');
            img.style.width = '';
            img.style.height = '';
            persistImageFormats(img);

            const oldKey = resolveStorageKeyFromSrc(src);
            if (oldKey) {
              fetch('/api/admin/cleanup-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: oldKey }),
              }).catch(() => {});
            }
          }
        } catch (err) {
          console.error('[Crop] Failed:', err);
        }

        cleanup();
      };
    };

    // Handle click on images to select
    const handleClick = (e: MouseEvent) => {
      if (isCropping) return; // Don't interfere with crop mode
      const target = e.target as HTMLElement;
      const qlEditor = container.querySelector('.ql-editor');
      if (!qlEditor) return;

      if (target.tagName === 'IMG' && target.closest('.ql-editor')) {
        showSelectionBox(target as HTMLImageElement);
      } else if (!target.closest('.ql-img-resize-selection') && !target.closest('.ql-img-toolbar') && !target.closest('.ql-crop-container')) {
        clearSelection();
      }
    };

    // Handle mousedown on resize handle
    const handleResizeStart = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('ql-img-resize-handle') || !activeImg) return;

      e.preventDefault();
      e.stopPropagation();

      // Create overlay to capture mouse events during drag
      dragOverlay = document.createElement('div');
      dragOverlay.className = 'ql-img-resize-overlay';
      document.body.appendChild(dragOverlay);

      startX = e.clientX;
      startWidth = activeImg.offsetWidth;
      startHeight = activeImg.offsetHeight;
      naturalWidth = activeImg.naturalWidth || startWidth;
      naturalHeight = activeImg.naturalHeight || startHeight;

      const onMouseMove = (ev: MouseEvent) => {
        if (!activeImg) return;
        const deltaX = ev.clientX - startX;

        // Determine sign based on which handle is dragged
        let effectiveDelta: number;
        if (target.classList.contains('ql-handle-tr') || target.classList.contains('ql-handle-bl')) {
          effectiveDelta = -deltaX;
        } else {
          effectiveDelta = deltaX;
        }

        let newWidth = startWidth + effectiveDelta;

        // Clamp: min width and max width
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

        // Don't exceed natural width
        if (newWidth > naturalWidth) newWidth = naturalWidth;

        // Calculate proportional height
        const aspectRatio = naturalHeight / naturalWidth;
        const newHeight = Math.round(newWidth * aspectRatio);

        activeImg.style.width = newWidth + 'px';
        activeImg.style.height = newHeight + 'px';

        // Update selection box position
        positionSelectionBox();
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (dragOverlay) { dragOverlay.remove(); dragOverlay = null; }

        if (!activeImg) return;

        // If image was actually resized, re-upload the resized version
        const finalWidth = activeImg.offsetWidth;
        const finalHeight = activeImg.offsetHeight;
        const wasResized = finalWidth !== startWidth || finalHeight !== startHeight;
        if (wasResized) {
          const imgRef = activeImg;
          // resizeImageToStorage will sync Quill content after uploading the resized image
          // (syncing here would cause ReactQuill to re-render and strip inline styles,
          //  reverting the image to its natural size before the upload completes)
          resizeImageToStorageRef.current(imgRef, finalWidth, finalHeight);
        } else {
          // No resize happened, just sync content normally
          const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
          if (qlContainer && QuillClass) {
            try {
              const quill = QuillClass.find(qlContainer);
              if (quill) {
                setTimeout(() => { onChangeRef.current(quill.root.innerHTML); }, 0);
              }
            } catch { /* ignore */ }
          }
        }

        // Reposition selection box after resize
        requestAnimationFrame(() => positionSelectionBox());
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    // Reposition on scroll / resize
    const reposition = () => positionSelectionBox();

    // Use MutationObserver to wait for .ql-editor to appear (dynamic import may delay it)
    const qlEditor = container.querySelector('.ql-editor') as HTMLElement | null;
    let listenersAttached = false;

    const attachListeners = () => {
      if (listenersAttached) return;
      listenersAttached = true;
      container.addEventListener('click', handleClick, true);
      container.addEventListener('mousedown', handleResizeStart);
      container.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
    };

    const detachListeners = () => {
      if (!listenersAttached) return;
      listenersAttached = false;
      container.removeEventListener('click', handleClick, true);
      container.removeEventListener('mousedown', handleResizeStart);
      container.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      clearSelection();
    };

    if (qlEditor) {
      attachListeners();
    } else {
      // Watch for Quill editor to be inserted into DOM
      const observer = new MutationObserver(() => {
        const editor = container.querySelector('.ql-editor') as HTMLElement | null;
        if (editor) {
          observer.disconnect();
          attachListeners();
        }
      });
      observer.observe(container, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        detachListeners();
      };
    }

    return () => {
      detachListeners();
    };
  }, []);

  // Quill instance ref - populated lazily
  const quillInstanceRef = useRef<any>(null);

  // Helper to get the Quill instance from the container DOM
  const getQuillInstance = useCallback(() => {
    if (quillInstanceRef.current) return quillInstanceRef.current;
    const container = containerRef.current;
    if (!container) return null;
    // Quill stores the instance on the .ql-container element
    const qlContainer = container.querySelector('.ql-container') as HTMLElement;
    if (!qlContainer) return null;
    // Use the module-level QuillClass that's loaded at the top of this file
    if (!QuillClass) return null;
    const instance = QuillClass.find(qlContainer);
    if (instance) quillInstanceRef.current = instance;
    return instance;
  }, []);

  // Image compression: compress images over 400KB to 200-300KB range
  // Also resize images wider than editor max width (1060px) to save storage
  const EDITOR_MAX_WIDTH = 1060;
  const COMPRESS_THRESHOLD = 400 * 1024; // 400KB
  const COMPRESS_TARGET_MIN = 200 * 1024; // 200KB
  const COMPRESS_TARGET_MAX = 300 * 1024; // 300KB

  const compressImage = useCallback(async (file: File): Promise<File> => {
    const imageBitmap = await createImageBitmap(file);
    let { width, height } = imageBitmap;

    // If image is wider than editor max width, resize to editor width first
    let needsResize = width > EDITOR_MAX_WIDTH;
    let skipCompression = file.size <= COMPRESS_THRESHOLD && !needsResize;

    if (needsResize) {
      const ratio = EDITOR_MAX_WIDTH / width;
      width = EDITOR_MAX_WIDTH;
      height = Math.round(height * ratio);
    }

    // Draw to canvas (possibly resized)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();

    // If no compression needed and no resize happened, return original
    if (skipCompression) return file;

    // Determine output format - use JPEG for photos (better compression), keep PNG for transparency
    const isTransparent = await hasTransparency(file);
    const outputType = isTransparent ? 'image/png' : 'image/jpeg';
    const ext = isTransparent ? 'png' : 'jpg';

    // For PNG with transparency, try PNG first then fall back to resizing
    if (isTransparent) {
      const pngBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });
      if (pngBlob.size <= COMPRESS_TARGET_MAX) {
        return new File([pngBlob], file.name.replace(/\.\w+$/, '.png'), { type: 'image/png' });
      }
      // If PNG is still too large, scale down dimensions
      return await compressByResize(file, canvas, outputType, ext);
    }

    // For JPEG: binary search on quality to hit 200-300KB target
    let low = 0.1, high = 0.92, bestBlob: Blob | null = null;

    for (let i = 0; i < 8; i++) {
      const mid = (low + high) / 2;
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', mid);
      });

      if (blob.size >= COMPRESS_TARGET_MIN && blob.size <= COMPRESS_TARGET_MAX) {
        bestBlob = blob;
        break;
      }

      if (blob.size < COMPRESS_TARGET_MIN) {
        low = mid;
        bestBlob = blob; // keep as fallback
      } else {
        high = mid;
        bestBlob = blob; // keep as fallback
      }
    }

    // If quality adjustment alone can't reach target, try resizing
    if (bestBlob && bestBlob.size <= COMPRESS_TARGET_MAX && bestBlob.size >= COMPRESS_TARGET_MIN * 0.5) {
      return new File([bestBlob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
    }

    return await compressByResize(file, canvas, outputType, ext);
  }, []);

  // Helper: check if image has transparency
  const hasTransparency = useCallback(async (file: File): Promise<boolean> => {
    if (file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif') {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Check alpha channel - sample every 100th pixel for performance
      for (let i = 3; i < data.length; i += 400) {
        if (data[i] < 250) return true; // semi-transparent pixel found
      }
    }
    return false;
  }, []);

  // Helper: compress by resizing dimensions + quality adjustment
  const compressByResize = useCallback(async (file: File, originalCanvas: HTMLCanvasElement, outputType: string, ext: string): Promise<File> => {
    let scale = 0.85;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.round(originalCanvas.width * scale);
      const h = Math.round(originalCanvas.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(originalCanvas, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), outputType, outputType === 'image/jpeg' ? 0.8 : undefined);
      });

      if (blob.size <= COMPRESS_TARGET_MAX) {
        bestBlob = blob;
        if (blob.size >= COMPRESS_TARGET_MIN) break; // in target range
      } else {
        bestBlob = blob; // keep as fallback
      }
      scale *= 0.8;
    }

    if (!bestBlob) return file; // fallback to original
    const fileName = file.name.replace(/\.\w+$/, `.${ext}`);
    return new File([bestBlob], fileName, { type: outputType });
  }, []);

  // Upload a single image file to object storage, return URL or null
  const uploadImageFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      const processedFile = await compressImage(file);
      const formData = new FormData();
      formData.append('file', processedFile);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      return data?.data?.url || data?.data?.key || data?.url || data?.key || null;
    } catch (err) {
      console.error('Image upload failed:', err);
      return null;
    }
  }, [compressImage]);

  // Keep ref in sync
  uploadImageFileRef.current = uploadImageFile;

  // Scan HTML content for base64 images, upload them, and replace with URLs
  const uploadBase64Images = useCallback(async (html: string): Promise<string> => {
    const base64Regex = /<img[^>]+src="(data:image\/([^;]+);base64,([^"]+))"[^>]*>/gi;
    const matches = [...html.matchAll(base64Regex)];
    if (matches.length === 0) return html;

    console.log(`[uploadBase64Images] Found ${matches.length} base64 image(s), uploading...`);
    let result = html;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const fullMatch = match[0];
      const dataUrl = match[1];
      const mimeType = `image/${match[2]}`;
      const base64Data = match[3];
      try {
        // Direct base64 decode (more reliable than fetch(dataUrl) for large images)
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const ext = mimeType.split('/')[1] || 'png';
        const file = new File([blob], `paste-image-${Date.now()}-${i}.${ext}`, { type: mimeType });
        console.log(`[uploadBase64Images] Uploading image ${i + 1}/${matches.length}, size: ${(file.size / 1024).toFixed(0)}KB`);
        const url = await uploadImageFile(file);
        if (url) {
          result = result.replace(fullMatch, fullMatch.replace(dataUrl, url));
          console.log(`[uploadBase64Images] Image ${i + 1} uploaded: ${url}`);
        } else {
          console.error(`[uploadBase64Images] Image ${i + 1} upload returned null`);
        }
      } catch (err) {
        console.error(`[uploadBase64Images] Failed to upload image ${i + 1}:`, err);
      }
    }
    return result;
  }, [uploadImageFile]);

  // Resize an image in the editor to the given display dimensions and re-upload the resized version.
  // This replaces the full-size stored image with a smaller one to save storage.
  const resizeImageToStorage = useCallback(async (imgElement: HTMLImageElement, targetWidth: number, targetHeight: number) => {
    const src = imgElement.getAttribute('src');
    if (!src || src.startsWith('data:')) return; // skip base64 or missing

    try {
      // Load the image into a canvas at the target dimensions
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = src;
      });

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Determine format
      const isJpg = src.includes('.jpg') || src.includes('.jpeg') || !src.includes('.png');
      const outputType = isJpg ? 'image/jpeg' : 'image/png';
      const ext = isJpg ? 'jpg' : 'png';

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), outputType, outputType === 'image/jpeg' ? 0.85 : undefined);
      });

      const file = new File([blob], `resized-${Date.now()}.${ext}`, { type: outputType });
      console.log(`[resizeImageToStorage] Resized to ${targetWidth}x${targetHeight}, size: ${(blob.size / 1024).toFixed(0)}KB`);

      // Upload resized image
      const newUrl = await uploadImageFile(file);
      if (!newUrl) {
        console.error('[resizeImageToStorage] Upload failed, keeping original');
        return;
      }

      console.log(`[resizeImageToStorage] Uploaded resized image: ${newUrl}`);

      // Replace src in the editor DOM and remove inline styles
      // The new image has naturalWidth=targetWidth, naturalHeight=targetHeight,
      // so inline width/height are no longer needed and would cause issues
      // when Quill re-renders from Delta (stripping inline styles)
      imgElement.setAttribute('src', newUrl);
      imgElement.removeAttribute('width');
      imgElement.removeAttribute('height');
      imgElement.style.width = '';
      imgElement.style.height = '';

      // Sync Quill content so state reflects the new src (without inline styles)
      // Use quill.formatText to persist class/style attrs in the Delta model
      const container = containerRef.current;
      if (container) {
        const qlContainer = container.querySelector('.ql-container') as HTMLElement | null;
        if (qlContainer && QuillClass) {
          try {
            const quill = QuillClass.find(qlContainer);
            if (quill) {
              // Persist image class/style via the custom StyledImage blot
              try {
                const blot = QuillClass.find(imgElement);
                if (blot) {
                  const offset = blot.offset(quill.scroll);
                  const formats: Record<string, string> = {};
                  const cls = imgElement.getAttribute('class') || '';
                  const style = imgElement.getAttribute('style') || '';
                  if (cls) formats['class'] = cls;
                  if (style) formats['style'] = style;
                  if (Object.keys(formats).length > 0) {
                    quill.formatText(offset, 1, formats, 'silent');
                  }
                }
              } catch { /* ignore blot persist */ }
              onChangeRef.current(quill.root.innerHTML);
            }
          } catch { /* ignore */ }
        }
      }

      // Delete the old image from storage (fire and forget)
      const oldKey = resolveStorageKeyFromSrc(src);
      if (oldKey) {
        console.log(`[resizeImageToStorage] Deleting old image: ${oldKey}`);
        fetch('/api/admin/cleanup-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: oldKey }),
        }).catch((err) => console.error('[resizeImageToStorage] Failed to delete old image:', err));
      }
    } catch (err) {
      console.error('[resizeImageToStorage] Failed:', err);
    }
  }, [uploadImageFile]);

  // Keep the ref up to date for use in useEffect closures
  resizeImageToStorageRef.current = resizeImageToStorage;

  // Resolve an image src to a storage key for deletion
  const resolveStorageKeyFromSrc = (src: string): string | null => {
    // Proxy URL: /api/image?key=xxx
    const proxyMatch = src.match(/\/api\/image\?key=([^&]+)/);
    if (proxyMatch) return decodeURIComponent(proxyMatch[1]);
    // Full URL (Vercel Blob or other storage)
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    return null;
  };

  // Custom image handler: compress + upload to object storage instead of base64
  const imageHandler = useCallback(() => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const quill = getQuillInstance();
      if (!quill) return;
      const range = quill.getSelection(true);
      try {
        const url = await uploadImageFile(file);
        if (url) {
          quill.insertEmbed(range.index, 'image', url);
          quill.setSelection(range.index + 1);
          // Sync onChange since insertEmbed doesn't trigger it
          setTimeout(() => { onChangeRef.current(quill.root.innerHTML); }, 0);
        }
      } catch (err) {
        console.error('Image upload failed:', err);
        alert('Image upload failed. Please try again.');
      }
    };
  }, [uploadImageFile, getQuillInstance]);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ color: ['transparent', '#000000', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ecf0f1', '#95a5a6', '#f5b7b1', '#fad7a0', '#f9e79f', '#abebc6', '#aed6f1', '#d2b4de', '#bdc3c7', '#7f8c8d', '#e6b0aa', '#f0b27a', '#fdebd0', '#a9dfbf', '#a9cce3', '#bb8fce', '#717d7e', '#515a5a', '#cd6155', '#ca6f1e', '#b7950b', '#1e8449', '#2874a6', '#6c3483'] }, { background: ['transparent', '#000000', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ecf0f1', '#95a5a6', '#f5b7b1', '#fad7a0', '#f9e79f', '#abebc6', '#aed6f1', '#d2b4de', '#bdc3c7', '#7f8c8d', '#e6b0aa', '#f0b27a', '#fdebd0', '#a9dfbf', '#a9cce3', '#bb8fce', '#717d7e', '#515a5a', '#cd6155', '#ca6f1e', '#b7950b', '#1e8449', '#2874a6', '#6c3483'] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: imageHandler,
      },
    },
    clipboard: {
      // Intercept pasted images and upload to object storage instead of base64
      matchVisual: false,
    },
  }), [imageHandler]);

  // Handle paste events: intercept pasted images, upload to object storage
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (!file) continue;

          const quill = getQuillInstance();
          if (!quill) continue;
          const range = quill.getSelection(true);
          const savedRange = range ? { index: range.index, length: range.length } : { index: 0, length: 0 };

          (async () => {
            try {
              const url = await uploadImageFile(file);
              if (url) {
                quill.insertEmbed(savedRange.index, 'image', url);
                quill.setSelection(savedRange.index + 1);
                setTimeout(() => { onChangeRef.current(quill.root.innerHTML); }, 0);
              }
            } catch (err) {
              console.error('Paste image upload failed:', err);
            }
          })();
          break; // Only handle the first image
        }
      }
    };

    container.addEventListener('paste', handlePaste, true); // capture phase to intercept before Quill
    return () => container.removeEventListener('paste', handlePaste, true);
  }, [getQuillInstance, uploadImageFile]);

  useImperativeHandle(ref, () => ({
    getHTML: () => {
      const container = containerRef.current;
      if (!container) return value;
      const qlEditor = container.querySelector('.ql-editor') as HTMLElement | null;
      return qlEditor ? qlEditor.innerHTML : value;
    },
    uploadBase64Images,
  }), [value, uploadBase64Images]);

  return (
    <div ref={containerRef} className="quill-sticky-toolbar">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={quillModules}
        formats={['header', 'bold', 'italic', 'underline', 'color', 'background', 'list', 'bullet', 'align', 'link', 'image', 'table-embed']}
        style={{ minHeight: '300px' }}
      />
      {importingWord && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3 shadow-xl">
            <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700">Importing Word document...</span>
          </div>
        </div>
      )}
      {showTableModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowTableModal(false)}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-4">Insert Table</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">Rows</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) => setTableRows(parseInt(e.target.value) || 3)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">Columns</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(parseInt(e.target.value) || 3)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowTableModal(false)}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInsertTable}
                className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ============== Content Pages Manager (Best Vapes / News) ==============
export interface ContentPagesManagerRef {
  publish: () => Promise<void>;
}

const ContentPagesManager = forwardRef<ContentPagesManagerRef, { type: string; title: string; lang: string; isFullPage?: boolean; activeLanguages: Language[] }>(function ContentPagesManager({ type, title, lang, isFullPage, activeLanguages }, ref) {
  const [pages, setPages] = useState<Array<{
    id: number; slug: string; cover_image: string | null; sort_order: number; is_published: boolean;
    content_page_translations: Array<{ id: number; language: string; title: string; content: string }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formSlug, setFormSlug] = useState('');
  const [formCoverImage, setFormCoverImage] = useState<string | null>(null);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formPublished, setFormPublished] = useState(true);
  const [hasFormChanges, setHasFormChanges] = useState(false);
  const [formTranslations, setFormTranslations] = useState<Array<{ id?: number; language: string; title: string; content: string }>>([]);
  const [editLang, setEditLang] = useState<string>('en');
  const [saving, setSaving] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [listPublishMsg, setListPublishMsg] = useState<string | null>(null);
  const editorRef = useRef<RichTextEditorRef>(null);


  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/content-pages?type=${type}`);
      const json = await res.json();
      if (json.success) setPages(json.data || []);
    } catch (err) {
      console.error('Failed to fetch content pages:', err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  // Normalize Quill HTML for comparison (trim whitespace, remove trailing newlines)
  const normalizeQuillHtml = (html: string) => html.replace(/\s+$/gm, '').trim();

  // Expose publish method to parent via ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    publish: async () => {
      await handlePublish();
    },
  }));

  const openEditForm = (page: typeof pages[0]) => {
    setEditingPage(page.id);
    setFormSlug(page.slug);
    setFormCoverImage(page.cover_image);
    setFormSortOrder(page.sort_order);
    setFormPublished(page.is_published);
    setHasFormChanges(false);

    const translations = activeLanguages.map(l => {
      const existing = page.content_page_translations?.find((t: { language: string }) => t.language === l.code);
      return existing || { language: l.code, title: '', content: '' };
    });
    setFormTranslations(translations);
    setPublishSuccess(false);
    setShowForm(true);
  };

  const openNewForm = () => {
    setEditingPage(null);
    setFormSlug('');
    setFormCoverImage(null);
    setFormSortOrder(pages.length + 1);
    setFormPublished(true);
    setHasFormChanges(false);
    const initialTranslations = [
      { language: 'en', title: '', content: '' },
      { language: 'zh', title: '', content: '' },
    ];
    setFormTranslations(initialTranslations);
    setPublishSuccess(false);
    setShowForm(true);
  };

  // Mark form as changed
  const markChanged = () => setHasFormChanges(true);

  // Publish: save content + set is_published = true
  const handlePublish = async () => {
    setSaving(true);
    try {
      // 1. Read content directly from Quill editor DOM (bypasses React state staleness)
      const publishTranslations = formTranslations.map(t => ({ ...t }));
      const editorHTML = editorRef.current?.getHTML();
      if (editorHTML !== undefined && editorHTML !== '') {
        const currentIdx = publishTranslations.findIndex(t => t.language === editLang);
        if (currentIdx !== -1) {
          publishTranslations[currentIdx] = {
            ...publishTranslations[currentIdx],
            content: editorHTML,
          };
        }
      }

      // 2. Fallback: if current language content is still empty, try reading from DOM directly
      const currentLangTrans = publishTranslations.find(t => t.language === editLang);
      if (!currentLangTrans?.content && editorRef.current) {
        const fallbackHTML = editorRef.current.getHTML();
        if (fallbackHTML) {
          const idx = publishTranslations.findIndex(t => t.language === editLang);
          if (idx !== -1) {
            publishTranslations[idx].content = fallbackHTML;
          }
        }
      }

      // 3. Scan and upload any base64 images in content (safety net for clipboard paste etc.)
      // This function is defined inline to avoid dependency on editorRef
      const scanAndUploadBase64 = async (html: string): Promise<string> => {
        if (!html || !html.includes('data:image/')) return html;
        const base64Regex = /<img[^>]+src="(data:image\/([^;]+);base64,([^"]+))"[^>]*>/gi;
        const matches = [...html.matchAll(base64Regex)];
        if (matches.length === 0) return html;
        console.log(`[handlePublish] Found ${matches.length} base64 image(s), uploading...`);
        let result = html;
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const fullMatch = match[0];
          const dataUrl = match[1];
          const mimeType = `image/${match[2]}`;
          const base64Data = match[3];
          try {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let j = 0; j < byteCharacters.length; j++) {
              byteNumbers[j] = byteCharacters.charCodeAt(j);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            const ext = mimeType.split('/')[1] || 'png';
            const file = new File([blob], `publish-image-${Date.now()}-${i}.${ext}`, { type: mimeType });
            console.log(`[handlePublish] Uploading base64 image ${i + 1}/${matches.length}, size: ${(file.size / 1024).toFixed(0)}KB`);
            // Upload directly via /api/upload
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
            const uploadData = await uploadRes.json();
            const url = uploadData?.data?.url || uploadData?.data?.key || uploadData?.url || uploadData?.key;
            if (url) {
              result = result.replace(fullMatch, fullMatch.replace(dataUrl, url));
              console.log(`[handlePublish] Image ${i + 1} uploaded: ${url}`);
            } else {
              console.error(`[handlePublish] Image ${i + 1} upload returned no URL:`, uploadData);
            }
          } catch (err) {
            console.error(`[handlePublish] Failed to upload base64 image ${i + 1}:`, err);
          }
        }
        return result;
      };

      for (let i = 0; i < publishTranslations.length; i++) {
        const t = publishTranslations[i];
        if (t.content && t.content.includes('data:image/')) {
          try {
            const cleanHTML = await scanAndUploadBase64(t.content);
            if (cleanHTML) {
              publishTranslations[i] = { ...t, content: cleanHTML };
            }
          } catch (err) {
            console.error('Failed to upload base64 images for', t.language, err);
          }
        }
      }

      // 3. Validate: warn if content is empty
      const enContent = publishTranslations.find(t => t.language === 'en')?.content;
      if (!enContent || enContent.trim() === '' || enContent === '<p><br></p>') {
        const proceed = confirm('English content appears to be empty. Publish anyway?');
        if (!proceed) { setSaving(false); return; }
      }

      // 4. Trim slug
      const trimmedSlug = (formSlug || '').trim();
      if (!trimmedSlug) {
        alert('Slug is required');
        setSaving(false);
        return;
      }

      const body = {
        id: editingPage,
        type,
        slug: trimmedSlug,
        cover_image: formCoverImage,
        sort_order: formSortOrder,
        is_published: true,
        translations: publishTranslations.map(t => ({
          id: t.id,
          language: t.language,
          title: t.title,
          content: t.content,
        })),
      };


      const res = await adminFetch('/api/admin/content-pages', {
        method: editingPage ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        // For new pages, capture the returned ID and translation IDs
        if (!editingPage && json.data?.id) {
          setEditingPage(json.data.id);
          // Capture translation IDs from the response so future PUTs use update instead of insert
          if (json.data.content_page_translations) {
            const newTranslations = activeLanguages.map(l => {
              const existing = json.data.content_page_translations.find((t: { language: string }) => t.language === l.code);
              const current = publishTranslations.find(t => t.language === l.code);
              if (existing) {
                return { id: existing.id, language: existing.language, title: current?.title || existing.title, content: current?.content || existing.content };
              }
              return current || { language: l.code, title: '', content: '' };
            });
            setFormTranslations(newTranslations);
          } else {
            setFormTranslations(publishTranslations);
          }
        } else {
          // Sync React state with the actually published content
          setFormTranslations(publishTranslations);
        }
        setFormPublished(true);
        setHasFormChanges(false);
        setPublishSuccess(true);
        setTimeout(() => setPublishSuccess(false), 3000);
        fetchPages();
      } else {
        alert(json.error || 'Publish failed');
      }
    } catch (err) {
      console.error('Publish error:', err);
      alert('Publish error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  // List-level toggle publish/unpublish
  const handleTogglePublish = async (id: number, currentPublished: boolean) => {
    try {
      const res = await adminFetch('/api/admin/content-pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_published: !currentPublished }),
      });
      const json = await res.json();
      if (json.success) {
        fetchPages();
        setListPublishMsg(!currentPublished ? t('Published successfully!', '发布成功!', lang) : t('Unpublished', '已取消发布', lang));
        setTimeout(() => setListPublishMsg(null), 3000);
      }
    } catch (err) {
      console.error('Toggle publish error:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('Delete this page?', '确定删除此页面？', lang))) return;
    try {
      const res = await adminFetch('/api/admin/content-pages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) fetchPages();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Full-page edit view for Best Vapes
  if (isFullPage && showForm) {
    return (
      <div className="flex flex-col h-full content-pages-editor">
        {/* Top bar with back button - sticky */}
        <div className="flex items-center justify-between sticky top-0 z-20 bg-background pt-2 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border p-2 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-2xl font-bold">{editingPage ? t('Edit Page', '编辑页面', lang) : t('Add Page', '添加页面', lang)}</h2>
          </div>
          <div className="flex items-center gap-3">
            {publishSuccess && (
              <span className="text-xs text-purple-400 font-medium">{t('Published successfully!', '发布成功!', lang)}</span>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={saving || (formPublished && !hasFormChanges)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                saving || (formPublished && !hasFormChanges)
                  ? 'bg-purple-600/50 text-white cursor-default'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              {saving ? t('Publishing...', '发布中...', lang) : t('Publish', '发布', lang)}
            </button>
          </div>
        </div>

        <div className="space-y-4 flex-1 pr-1 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Slug</label>
              <input value={formSlug} onChange={e => { markChanged(); setFormSlug(e.target.value); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. best-pod-system-2025" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('Sort Order', '排序', lang)}</label>
              <input type="number" value={formSortOrder} onChange={e => { markChanged(); setFormSortOrder(parseInt(e.target.value) || 0); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('Cover Image', '封面图', lang)}</label>
            <ImageUpload value={formCoverImage} onChange={setFormCoverImage} aspectRatio={16 / 9} recommendedSize="480x270px" label={t('Cover', '封面', lang)} lang={lang} />
          </div>

          {/* Language toggle + unified editor */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {activeLanguages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setEditLang(l.code)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${editLang === l.code ? 'bg-purple-700 text-white' : 'border border-border text-muted-foreground hover:text-foreground'}`}
                >{l.name}</button>
              ))}
            </div>
            {formTranslations.map((tr, idx) => tr.language === editLang ? (
              <div key={tr.language} className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('Title', '标题', lang)}</label>
                  <input
                    value={tr.title}
                    onChange={e => { markChanged(); setFormTranslations(prev => prev.map((t, i) => i === idx ? { ...t, title: e.target.value } : t)); }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('Content', '内容', lang)}</label>
                  <RichTextEditor
                    ref={editorRef}
                    value={tr.content}
                    onChange={(v: string) => { markChanged(); setFormTranslations(prev => prev.map((t, i) => i === idx ? { ...t, content: v } : t)); }}
                  />
                </div>
              </div>
            ) : null)}
          </div>
        </div>
      </div>
    );
  }

  // Default: list view + modal for other tabs
  return (
    <div className="static-page-editor">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">{title}</h2>
          {listPublishMsg && (
            <span className="text-xs text-purple-400 font-medium">{listPublishMsg}</span>
          )}
        </div>
        <button
          onClick={openNewForm}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          + {t('Add Page', '添加页面', lang)}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />)}</div>
      ) : pages.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t('No pages yet. Click "Add Page" to get started.', '暂无页面。点击"添加页面"开始。', lang)}
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => {
            const enTitle = page.content_page_translations?.find((t: { language: string }) => t.language === 'en')?.title || page.slug;
            return (
              <div key={page.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden">
                    {page.cover_image ? <img src={page.cover_image.startsWith('http') ? page.cover_image : `/api/image?key=${encodeURIComponent(page.cover_image)}`} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-primary">{enTitle.charAt(0)}</span>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{enTitle}</p>
                    <p className="text-xs text-muted-foreground">{page.slug} &middot; {page.is_published ? t('Published', '已发布', lang) : t('Unpublished', '未发布', lang)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await handleTogglePublish(page.id, page.is_published);
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${page.is_published ? 'border-purple-800 text-purple-400 hover:bg-purple-900/30 opacity-50 cursor-not-allowed' : 'border-purple-800 text-purple-400 hover:bg-purple-900/30'}`}
                  >
                    {t('Publish', '发布', lang)}
                  </button>
                  <button onClick={() => openEditForm(page)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors">{t('Edit', '编辑', lang)}</button>
                  <button onClick={() => handleDelete(page.id)} className="rounded-lg border border-red-800 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30 transition-colors">{t('Delete', '删除', lang)}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal - only for non-full-page tabs */}
      {!isFullPage && showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-3xl shadow-2xl relative">
            <button onClick={() => setShowForm(false)} className="absolute top-3 right-3 p-1 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold mb-4">{editingPage ? t('Edit Page', '编辑页面', lang) : t('Add Page', '添加页面', lang)}</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Slug</label>
                  <input value={formSlug} onChange={e => { markChanged(); setFormSlug(e.target.value); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. best-pod-system-2025" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Sort Order', '排序', lang)}</label>
                  <input type="number" value={formSortOrder} onChange={e => { markChanged(); setFormSortOrder(parseInt(e.target.value) || 0); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('Cover Image', '封面图', lang)}</label>
                <ImageUpload value={formCoverImage} onChange={setFormCoverImage} aspectRatio={16 / 9} recommendedSize="480x270px" label={t('Cover', '封面', lang)} lang={lang} />
              </div>

              {/* Language toggle + unified editor */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {activeLanguages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setEditLang(l.code)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${editLang === l.code ? 'bg-purple-700 text-white' : 'border border-border text-muted-foreground hover:text-foreground'}`}
                    >{l.name}</button>
                  ))}
                </div>
                {formTranslations.map((tr, idx) => tr.language === editLang ? (
                  <div key={tr.language} className="space-y-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t('Title', '标题', lang)}</label>
                      <input
                        value={tr.title}
                        onChange={e => { markChanged(); setFormTranslations(prev => prev.map((t, i) => i === idx ? { ...t, title: e.target.value } : t)); }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t('Content', '内容', lang)}</label>
                      <RichTextEditor
                        ref={editorRef}
                        value={tr.content}
                        onChange={(v: string) => { markChanged(); setFormTranslations(prev => prev.map((t, i) => i === idx ? { ...t, content: v } : t)); }}
                      />
                    </div>
                  </div>
                ) : null)}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {publishSuccess && (
                  <span className="text-xs text-purple-400 font-medium">{t('Published successfully!', '发布成功!', lang)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={handlePublish}
                disabled={saving || (formPublished && !hasFormChanges)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  saving || (formPublished && !hasFormChanges)
                    ? 'bg-purple-600/50 text-white cursor-default'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {saving ? t('Publishing...', '发布中...', lang) : t('Publish', '发布', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export interface StaticPageEditorRef {
  publish: () => Promise<void>;
}

// ============== Static Page Editor (Privacy Policy / About Us) ==============
const StaticPageEditor = forwardRef<StaticPageEditorRef, { slug: string; title: string; lang: string; activeLanguages: Language[] }>(function StaticPageEditor({ slug, title, lang, activeLanguages }, ref) {
  const [pageData, setPageData] = useState<{
    id: number;
    slug: string;
    is_published: boolean;
    static_page_translations: Array<{ id: number; language: string; content: string; draft_content: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  // Draft content being edited (starts from draft_content or content)
  const [translations, setTranslations] = useState<Array<{ id?: number; language: string; content: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editLang, setEditLang] = useState<string>('en');
  const staticEditorRef = useRef<RichTextEditorRef>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [originalTranslations, setOriginalTranslations] = useState<Array<{ id?: number; language: string; content: string }>>([]);

  // Expose publish method to parent via ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    publish: async () => {
      await handlePublish();
    },
  }));

  useEffect(() => {
    const fetchPage = async () => {
      setLoading(true);
      try {
        const res = await adminFetch(`/api/admin/static-pages?slug=${slug}`);
        const json = await res.json();
        if (json.success && json.data) {
          setPageData(json.data);
          const trans = activeLanguages.map(l => {
            const existing = json.data.static_page_translations?.find((t: { language: string }) => t.language === l.code);
            if (existing) {
              return { id: existing.id, language: existing.language, content: existing.content || '' };
            }
            return { language: l.code, content: '' };
          });
          setTranslations(trans);
          setOriginalTranslations(JSON.parse(JSON.stringify(trans)));
        }
      } catch (err) {
        console.error('Failed to fetch static page:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
  }, [slug]);

  // Publish: save content + publish in one step
  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Read content directly from Quill editor DOM to avoid React state staleness
      const publishTranslations = translations.map(t => ({ ...t }));
      const editorHTML = staticEditorRef.current?.getHTML();
      console.log('[StaticPage handlePublish] translations content lengths:', translations.map(t => ({ lang: t.language, len: t.content?.length })));
      console.log('[StaticPage handlePublish] editorHTML length:', editorHTML?.length, 'editLang:', editLang);
      if (editorHTML !== undefined) {
        const currentIdx = publishTranslations.findIndex(t => t.language === editLang);
        if (currentIdx !== -1) {
          publishTranslations[currentIdx] = {
            ...publishTranslations[currentIdx],
            content: editorHTML,
          };
        }
      }

      // Scan and upload any base64 images in content (safety net)
      const scanAndUploadBase64 = async (html: string): Promise<string> => {
        if (!html || !html.includes('data:image/')) return html;
        const base64Regex = /<img[^>]+src="(data:image\/([^;]+);base64,([^"]+))"[^>]*>/gi;
        const matches = [...html.matchAll(base64Regex)];
        if (matches.length === 0) return html;
        let result = html;
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const fullMatch = match[0];
          const dataUrl = match[1];
          const mimeType = `image/${match[2]}`;
          const base64Data = match[3];
          try {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let j = 0; j < byteCharacters.length; j++) {
              byteNumbers[j] = byteCharacters.charCodeAt(j);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            const ext = mimeType.split('/')[1] || 'png';
            const file = new File([blob], `publish-image-${Date.now()}-${i}.${ext}`, { type: mimeType });
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
            const uploadData = await uploadRes.json();
            const url = uploadData?.data?.url || uploadData?.data?.key || uploadData?.url || uploadData?.key;
            if (url) {
              result = result.replace(fullMatch, fullMatch.replace(dataUrl, url));
            }
          } catch (err) {
            console.error(`Failed to upload base64 image ${i + 1}:`, err);
          }
        }
        return result;
      };

      for (let i = 0; i < publishTranslations.length; i++) {
        const t = publishTranslations[i];
        if (t.content && t.content.includes('data:image/')) {
          try {
            const cleanHTML = await scanAndUploadBase64(t.content);
            if (cleanHTML) {
              publishTranslations[i] = { ...t, content: cleanHTML };
            }
          } catch (err) {
            console.error('Failed to upload base64 images for', t.language, err);
          }
        }
      }

      // Step 1: Save content first
      const saveRes = await adminFetch('/api/admin/static-pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          translations: publishTranslations.map(t => ({ id: t.id, language: t.language, content: t.content })),
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) {
        alert(saveJson.error || 'Save failed');
        return;
      }
      // Step 2: Publish
      const pubRes = await adminFetch('/api/admin/static-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const pubJson = await pubRes.json();
      if (pubJson.success) {
        setPublishSuccess(true);
        setTimeout(() => setPublishSuccess(false), 3000);
        // Sync React state
        setTranslations(publishTranslations);
        setOriginalTranslations(JSON.parse(JSON.stringify(publishTranslations)));
        // Refresh data
        const refreshRes = await adminFetch(`/api/admin/static-pages?slug=${slug}`);
        const refreshJson = await refreshRes.json();
        if (refreshJson.success && refreshJson.data) {
          setPageData(refreshJson.data);
          const trans = activeLanguages.map(l => {
            const existing = refreshJson.data.static_page_translations?.find((t: { language: string }) => t.language === l.code);
            if (existing) {
              return { id: existing.id, language: existing.language, content: existing.content || '' };
            }
            return { language: l.code, content: '' };
          });
          setTranslations(trans);
          setOriginalTranslations(JSON.parse(JSON.stringify(trans)));
        }
      } else {
        alert(pubJson.error || 'Publish failed');
      }
    } catch (err) {
      console.error('Publish error:', err);
    } finally {
      setPublishing(false);
    }
  };

  const isPublished = pageData?.is_published ?? false;
  const hasChanges = JSON.stringify(translations) !== JSON.stringify(originalTranslations);

  return (
    <div>
      <div className="sticky top-0 z-20 bg-card -mx-6 px-6 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>
          <div className="flex items-center gap-3">
            {publishSuccess && (
              <span className="text-xs text-purple-400 font-medium">{t('Published successfully!', '发布成功!', lang)}</span>
            )}
            <button
              onClick={handlePublish}
              disabled={publishing || (!hasChanges && isPublished)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                publishing || (!hasChanges && isPublished)
                  ? 'bg-purple-600/50 text-white cursor-default'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              {publishing ? t('Publishing...', '发布中...', lang) : t('Publish', '发布', lang)}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 mt-4">{Array.from({ length: 1 }).map((_, i) => <div key={i} className="h-48 rounded-lg bg-secondary animate-pulse" />)}</div>
      ) : (
        <div className="border border-border rounded-xl p-4 space-y-3 overflow-visible mt-4">
          <div className="flex items-center gap-2">
            {activeLanguages.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setEditLang(l.code)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${editLang === l.code ? 'bg-purple-700 text-white' : 'border border-border text-muted-foreground hover:text-foreground'}`}
              >
                {l.name}
              </button>
            ))}
          </div>
          {translations.map((tr, idx) => tr.language === editLang ? (
            <RichTextEditor
              ref={staticEditorRef}
              key={tr.language}
              value={tr.content}
              onChange={(v: string) => {
                setTranslations(prev => prev.map((t, i) => i === idx ? { ...t, content: v } : t));
              }}
            />
          ) : null)}
        </div>
      )}
    </div>
  );
});

// ============== Category Form Modal ==============
function CategoryFormModal({ category, onSave, lang, activeLanguages }: { category?: Category; onSave: () => void; lang: string; activeLanguages: Language[] }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(category?.slug || '');
  const [icon, setIcon] = useState(category?.icon || '');
  const [sortOrder, setSortOrder] = useState(category?.sort_order || 0);
  const [isActive, setIsActive] = useState(category?.is_active !== false);
  const [translations, setTranslations] = useState<{ language: string; name: string }[]>(
    category?.category_translations?.map((tr) => ({ language: tr.language, name: tr.name })) || activeLanguages.map(l => ({ language: l.code, name: '' }))
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!category;

  // Sync translations with active languages when opening
  useEffect(() => {
    if (open) {
      setTranslations(prev => {
        const existing = new Map(prev.map(t => [t.language, t.name]));
        return activeLanguages.map(l => ({ language: l.code, name: existing.get(l.code) || '' }));
      });
    }
  }, [open, activeLanguages]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = '/api/admin/categories';
      const method = isEdit ? 'PUT' : 'POST';
      const body = { id: category?.id, slug, icon: icon || null, sort_order: sortOrder, is_active: isActive, translations };
      const res = await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert(t('Error:', '错误：', lang) + ' ' + (json.error === 'Slug already exists' ? t('Slug already exists', '标识已存在，请使用不同的标识', lang) : json.error));
    } catch { alert(t('Failed to save', '保存失败', lang)); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        {isEdit ? t('Edit', '编辑', lang) : t('Add Category', '添加分类', lang)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-left">{isEdit ? t('Edit Category', '编辑分类', lang) : t('Add Category', '添加分类', lang)}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Slug', '标识', lang)}</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Icon (emoji)', '图标 (emoji)', lang)}</label>
                  <input value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Sort Order', '排序', lang)}</label>
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
                {translations.map((tr, idx) => {
                  const langInfo = activeLanguages.find(l => l.code === tr.language);
                  return (
                    <div key={tr.language} className="grid grid-cols-[60px_1fr] gap-2 mb-2 items-center">
                      <span className="text-sm font-medium text-muted-foreground uppercase">{tr.language}</span>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block text-left">{langInfo?.name || tr.language}</label>
                        <input value={tr.name} onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                    </div>
                  );
                })}
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

// ============== Admin Pagination ==============
function AdminPagination({
  currentPage,
  totalPages,
  total,
  onPageChange,
  lang,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  lang: string;
}) {
  const [jumpValue, setJumpValue] = useState("");

  const getPageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [];
    pages.push(1);
    if (currentPage > 4) {
      pages.push("...");
    }
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 3) {
      pages.push("...");
    }
    pages.push(totalPages);
    return pages;
  };

  const handleJump = () => {
    const num = parseInt(jumpValue, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num);
    }
    setJumpValue("");
  };

  const handleJumpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleJump();
    }
  };

  return (
    <div className="mt-4 flex items-center justify-center gap-1 select-none">
      {/* Previous button */}
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="flex items-center justify-center w-8 h-8 rounded border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:text-muted-foreground transition-colors text-xs"
        aria-label="Previous"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Page numbers */}
      {getPageNumbers().map((p, idx) =>
        p === "..." ? (
          <span key={`ellipsis-${idx}`} className="flex items-center justify-center w-8 h-8 text-muted-foreground text-sm">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium transition-colors ${
              currentPage === p
                ? "bg-primary text-primary-foreground border border-primary"
                : "border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {p}
          </button>
        )
      )}

      {/* Next button */}
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center w-8 h-8 rounded border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:text-muted-foreground transition-colors text-xs"
        aria-label="Next"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Jump to */}
      <div className="flex items-center gap-1.5 ml-3 text-sm text-muted-foreground">
        <span>{lang === "zh" ? "跳至" : "Go to"}</span>
        <input
          type="text"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={handleJumpKeyDown}
          className="w-10 h-8 rounded border border-border bg-card text-center text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
        <span>{lang === "zh" ? "页" : ""}</span>
      </div>

      {/* Total count */}
      <span className="ml-3 text-sm text-muted-foreground">
        {lang === "zh" ? `共 ${total} 条` : `${total} items`}
      </span>
    </div>
  );
}

// ============== Store Form Modal ==============
function StoreFormModal({ store, onSave, lang, defaultType, activeLanguages, allStores }: { store?: Store; onSave: () => void; lang: string; defaultType?: 'store' | 'official'; activeLanguages: Language[]; allStores: Store[] }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(store?.slug || '');
  const [logoKey, setLogoKey] = useState(store?.logo_key || store?.logo_url || '');
  const [websiteUrls, setWebsiteUrls] = useState<Array<{url: string; label?: string}>>(() => {
    if (Array.isArray(store?.website_urls) && store.website_urls.length > 0) return store.website_urls;
    if (store?.website_url) return [{ url: store.website_url }];
    return [];
  });
  const [storeType, setStoreType] = useState<'store' | 'official'>((store?.store_type === 'official' ? 'official' : store?.store_type === 'store' ? 'store' : null) || defaultType || 'store');
  const [isActive, setIsActive] = useState(store?.is_active !== false);
  const [regions, setRegions] = useState<Array<{region: string; currency: string}>>(Array.isArray(store?.regions) && store.regions.length > 0 ? store.regions : []);
  const [notes, setNotes] = useState(store?.notes || '');
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const [regionDropdownIdx, setRegionDropdownIdx] = useState<number | null>(null);

  const REGION_OPTIONS = ['Global', 'USA', 'Canada', 'UK', 'Russia', 'Japan', 'Europe'];
  const CURRENCY_OPTIONS = [
    { value: '$', label: 'USD ($)' },
    { value: '€', label: 'EUR (€)' },
    { value: '£', label: 'GBP (£)' },
    { value: 'Fr.', label: 'CHF (Fr.)' },
    { value: '₽', label: 'RUB (₽)' },
    { value: '¥', label: 'JPY (¥)' },
    { value: '₩', label: 'KRW (₩)' },
  ];
  const DEFAULT_CURRENCY_MAP: Record<string, string> = { Global: '$', USA: '$', Canada: '$', UK: '£', Russia: '₽', Japan: '¥', Europe: '€' };

  const addRegion = () => {
    setRegions([...regions, { region: '', currency: '' }]);
  };
  const removeRegion = (idx: number) => {
    setRegions(regions.filter((_, i) => i !== idx));
  };
  const updateRegion = (idx: number, field: 'region' | 'currency', value: string) => {
    const newRegions = [...regions];
    newRegions[idx] = { ...newRegions[idx], [field]: value };
    if (field === 'region') {
      newRegions[idx].currency = DEFAULT_CURRENCY_MAP[value] || '';
    }
    setRegions(newRegions);
  };
  const [translations, setTranslations] = useState<{ language: string; name: string }[]>(
    store?.store_translations?.map((tr) => ({ language: tr.language, name: tr.name })) || activeLanguages.map(l => ({ language: l.code, name: '' }))
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!store;

  // Sync translations with active languages when opening
  useEffect(() => {
    if (open) {
      setTranslations(prev => {
        const existing = new Map(prev.map(t => [t.language, t.name]));
        return activeLanguages.map(l => ({ language: l.code, name: existing.get(l.code) || '' }));
      });
    }
  }, [open, activeLanguages]);

  const handleSave = async () => {
    // Check for duplicate slug
    const trimmedSlug = slug.trim().toLowerCase();
    if (trimmedSlug) {
      const duplicate = allStores.find(s => s.slug.toLowerCase() === trimmedSlug && s.id !== store?.id);
      if (duplicate) {
        alert(t('Slug already exists', '标识已存在，请使用不同的标识', lang));
        return;
      }
    }
    setSaving(true);
    try {
      const url = '/api/admin/stores';
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        id: store?.id,
        slug,
        logo_url: logoKey || null,
        website_url: websiteUrls.length > 0 ? websiteUrls[0].url : null,
        website_urls: websiteUrls,
        store_type: storeType,
        is_active: isActive,
        regions,
        notes,
        translations,
      };
      const res = await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setOpen(false); onSave(); }
      else alert(t('Error:', '错误：', lang) + json.error);
    } catch { alert(t('Failed to save', '保存失败', lang)); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
        {isEdit ? t('Edit', '编辑', lang) : (storeType === 'official' ? t('Add Official', '添加官网', lang) : t('Add Store', '添加商城', lang))}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-left">{isEdit ? t('Edit Store', '编辑商城', lang) : (storeType === 'official' ? t('Add Official Website', '添加官网', lang) : t('Add Store', '添加商城', lang))}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground text-left block">{t('Slug', '标识', lang)}</label>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground text-left block">{t('Type', '类型', lang)}</label>
                <div className="mt-1 flex rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setStoreType('store')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${storeType === 'store' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                  >
                    {t('Store', '商城', lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreType('official')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${storeType === 'official' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                  >
                    {t('Official Website', '官网', lang)}
                  </button>
                </div>
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
                <label className="text-xs text-muted-foreground text-left block">{t('Website URL', '网站地址', lang)}</label>
                <div className="mt-1 space-y-2">
                  {websiteUrls.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        value={w.url}
                        onChange={(e) => {
                          const newUrls = [...websiteUrls];
                          newUrls[idx] = { ...newUrls[idx], url: e.target.value };
                          setWebsiteUrls(newUrls);
                        }}
                        placeholder="https://..."
                        className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                      />
                      <input
                        value={w.label || ''}
                        onChange={(e) => {
                          const newUrls = [...websiteUrls];
                          newUrls[idx] = { ...newUrls[idx], label: e.target.value };
                          setWebsiteUrls(newUrls);
                        }}
                        placeholder={t('Label', '标签', lang)}
                        className="w-24 rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                      />
                      <button type="button" onClick={() => setWebsiteUrls(websiteUrls.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setWebsiteUrls([...websiteUrls, { url: '', label: '' }])} className="text-xs text-primary hover:underline">
                    + {t('Add Website URL', '添加网站地址', lang)}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground text-left block">{t('Sales Region', '售卖地区', lang)}</label>
                <div className="mt-1 space-y-2">
                  {regions.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <button
                          type="button"
                          onClick={() => { setRegionDropdownOpen(regionDropdownOpen && regionDropdownIdx === idx ? false : true); setRegionDropdownIdx(idx); }}
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-left flex items-center justify-between"
                        >
                          <span>{r.region || t('Select Region', '选择地区', lang)}</span>
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {regionDropdownOpen && regionDropdownIdx === idx && (
                          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg">
                            {REGION_OPTIONS.map((opt) => {
                              const hasGlobal = regions.some((rr, ii) => ii !== idx && rr.region === 'Global');
                              const disabled = (opt === 'Global' && regions.some((rr, ii) => ii !== idx && rr.region !== '')) || (opt !== 'Global' && hasGlobal) || regions.some((rr, ii) => ii !== idx && rr.region === opt);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => { updateRegion(idx, 'region', opt); setRegionDropdownOpen(false); setRegionDropdownIdx(null); }}
                                  className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary'} ${r.region === opt ? 'bg-secondary' : ''}`}
                                >
                                  {r.region === opt && <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                  <span className={r.region === opt ? '' : 'ml-6'}>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <select
                          value={r.currency}
                          onChange={(e) => updateRegion(idx, 'currency', e.target.value)}
                          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                        >
                          <option value="">{t('Currency', '货币', lang)}</option>
                          {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <button type="button" onClick={() => removeRegion(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addRegion} className="text-xs text-primary hover:underline">
                    + {t('Add Sales Region', '添加售卖地区', lang)}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground text-left block">{t('Notes', '备注', lang)}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y" placeholder={t('Internal notes (not shown on frontend)', '内部备注（不在前端展示）', lang)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                {t('Active', '启用', lang)}
              </label>
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Translations', '翻译', lang)}</h3>
                {translations.map((tr, idx) => {
                  const langInfo = activeLanguages.find(l => l.code === tr.language);
                  return (
                    <div key={tr.language} className="grid grid-cols-[60px_1fr] gap-2 mb-2 items-center">
                      <span className="text-sm font-medium text-muted-foreground uppercase">{tr.language}</span>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block text-left">{langInfo?.name || tr.language}</label>
                        <input value={tr.name} onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                      </div>
                    </div>
                  );
                })}
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
function ProductFormModal({ product, categories, stores, onSave, lang, activeLanguages }: { product?: Product; categories: Category[]; stores: Store[]; onSave: () => void; lang: string; activeLanguages: Language[] }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(product?.slug || '');
  const [categoryId, setCategoryId] = useState<string>(product?.category_id?.toString() || '');

  const [imageKey, setImageKey] = useState(product?.image_key || product?.image_url || '');
  const [isActive, setIsActive] = useState(product?.is_active !== false);
  const [isFeatured, setIsFeatured] = useState(product?.is_featured || false);
  const [notes, setNotes] = useState(product?.notes || '');
  const [translations, setTranslations] = useState<{ language: string; name: string; description: string; features: string; specs: string }[]>(
    product?.product_translations?.map((tr) => ({
      language: tr.language,
      name: tr.name,
      description: tr.description || '',
      features: tr.features || '',
      specs: tr.specs || '',
    })) || activeLanguages.map(l => ({ language: l.code, name: '', description: '', features: '', specs: '' }))
  );
  const [prices, setPrices] = useState<{ store_id: string; current_price: string; original_price: string; product_url: string; discount_percent: string; currency: string; region: string }[]>(
    product?.product_prices?.map((p) => ({
      store_id: p.store_id.toString(),
      current_price: p.current_price,
      original_price: p.original_price || '',
      product_url: p.product_url,
      discount_percent: p.discount_percent?.toString() || '',
      currency: p.currency || '$',
      region: p.region || '',
    })) || [{ store_id: '', current_price: '', original_price: '', product_url: '', discount_percent: '', currency: '$', region: '' }]
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!product;

  // Sync translations with active languages when opening
  useEffect(() => {
    if (open) {
      setTranslations(prev => {
        const existing = new Map(prev.map(t => [t.language, t]));
        return activeLanguages.map(l => {
          const ex = existing.get(l.code);
          return ex || { language: l.code, name: '', description: '', features: '', specs: '' };
        });
      });
    }
  }, [open, activeLanguages]);

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
        notes,

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
          currency: p.currency || '$',
          region: p.region || '',
        })),
      };
      const res = await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{isEdit ? t('Edit Product', '编辑产品', lang) : t('Add Product', '添加产品', lang)}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Slug', '标识', lang)}</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Category', '分类', lang)}</label>
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

              {/* Notes - internal use only */}
              <div className="border-t border-border pt-3">
                <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Notes (Internal)', '备注 (内部)', lang)}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={lang === 'zh' ? '仅后台可见，用于记录备注信息' : 'Only visible in admin, for internal notes'}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y"
                />
              </div>

              {/* Translations */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Translations', '翻译', lang)}</h3>
                {translations.map((tr, idx) => {
                  const langInfo = activeLanguages.find(l => l.code === tr.language);
                  return (
                    <div key={tr.language} className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-muted-foreground uppercase">{tr.language}</span>
                        <span className="text-xs text-muted-foreground">{langInfo?.name || ''}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Product Name', '产品名称', lang)}</label>
                          <input value={tr.name} onChange={(e) => { const newT = [...translations]; newT[idx].name = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Description', '描述', lang)}</label>
                          <textarea value={tr.description} onChange={(e) => { const newT = [...translations]; newT[idx].description = e.target.value; setTranslations(newT); }} rows={2} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y min-h-[40px]" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Features (one per line)', '产品特性 (每行一条)', lang)}</label>
                          <textarea
                            value={(() => {
                              try { const arr = typeof tr.features === 'string' ? JSON.parse(tr.features) : tr.features; return Array.isArray(arr) ? arr.join('\n') : tr.features || ''; } catch { return tr.features || ''; }
                            })()}
                            onChange={(e) => { const newT = [...translations]; const lines = e.target.value.split('\n').filter(l => l.trim()); newT[idx].features = lines.length > 0 ? JSON.stringify(lines) : ''; setTranslations(newT); }}
                            rows={4}
                            placeholder={lang === 'zh' ? '每行输入一条特性\n例如：\n大烟雾量\n便携设计' : 'One feature per line\nExample:\nLarge vapor\nPortable design'}
                            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y min-h-[80px]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Specs (one per line)', '规格参数 (每行一条)：必须为英文格式', lang)}</label>
                          <textarea
                            value={(() => {
                              try { const arr = typeof tr.specs === 'string' ? JSON.parse(tr.specs) : tr.specs; if (Array.isArray(arr)) return arr.join('\n'); if (arr && typeof arr === 'object') return Object.entries(arr as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n'); return tr.specs || ''; } catch { return tr.specs || ''; }
                            })()}
                            onChange={(e) => { const newT = [...translations]; const lines = e.target.value.split('\n').filter(l => l.trim()); newT[idx].specs = lines.length > 0 ? JSON.stringify(lines) : ''; setTranslations(newT); }}
                            rows={5}
                            placeholder={lang === 'zh' ? '每行输入一条规格\n例如：\n尺寸: 120x30x20mm\n重量: 65g\n电池: 1000mAh' : 'One spec per line\nExample:\nSize: 120x30x20mm\nWeight: 65g\nBattery: 1000mAh'}
                            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y min-h-[100px]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Prices */}
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold mb-2">{t('Store Prices', '商城价格', lang)}</h3>
                {(() => {
                  // Group prices by store_id
                  const storeGroups: Array<{ storeId: string; indices: number[] }> = [];
                  prices.forEach((p, idx) => {
                    const gid = p.store_id || '__empty__' + idx;
                    let group = storeGroups.find(g => g.storeId === (p.store_id || '__empty__' + idx));
                    if (!group) {
                      group = { storeId: gid, indices: [] };
                      storeGroups.push(group);
                    }
                    group.indices.push(idx);
                  });
                  const selectedStoreIds = storeGroups.filter(g => !g.storeId.startsWith('__empty__')).map(g => Number(g.storeId));
                  return storeGroups.map((group) => {
                    const firstP = prices[group.indices[0]];
                    const selectedStore = stores.find(s => s.id === Number(firstP.store_id));
                    const storeRegions: Array<{region: string; currency: string}> = Array.isArray(selectedStore?.regions) && selectedStore.regions.length > 0 ? selectedStore.regions : [];
                    const hasMultipleCurrencies = group.indices.length > 1 || storeRegions.length > 1;
                    return (
                      <div key={group.storeId} className="mb-3 p-3 rounded-lg border border-border bg-secondary/30">
                        <div className="mb-2">
                          <label className="text-[10px] text-muted-foreground text-left block">{t('Store', '商城', lang)}</label>
                          <StoreSelect
                            stores={stores}
                            value={firstP.store_id}
                            lang={lang}
                            disabledStoreIds={selectedStoreIds.filter(id => id !== Number(group.storeId))}
                            onChange={(val) => {
                              const newP = [...prices];
                              const s = stores.find(st => st.id === Number(val));
                              const sRegions: Array<{region: string; currency: string}> = Array.isArray(s?.regions) && s.regions.length > 0 ? s.regions : [];
                              // Preserve existing price data for this store group by region
                              const existingByRegion: Record<string, typeof prices[0]> = {};
                              for (const idx of group.indices) {
                                const p = prices[idx];
                                const key = p.region || '__default__';
                                existingByRegion[key] = { ...p };
                              }
                              // Replace entries in-place to preserve position
                              const firstIdx = group.indices[0];
                              const newEntries: typeof prices = [];
                              if (sRegions.length <= 1) {
                                const r = sRegions[0] || { region: '', currency: '$' };
                                const existing = existingByRegion[r.region] || existingByRegion['__default__'];
                                newEntries.push({
                                  store_id: val,
                                  current_price: existing?.current_price || '',
                                  original_price: existing?.original_price || '',
                                  product_url: existing?.product_url || '',
                                  discount_percent: existing?.discount_percent || '',
                                  currency: r.currency,
                                  region: r.region,
                                });
                              } else {
                                for (const sr of sRegions) {
                                  const existing = existingByRegion[sr.region] || existingByRegion['__default__'];
                                  newEntries.push({
                                    store_id: val,
                                    current_price: existing?.current_price || '',
                                    original_price: existing?.original_price || '',
                                    product_url: existing?.product_url || '',
                                    discount_percent: existing?.discount_percent || '',
                                    currency: sr.currency || '$',
                                    region: sr.region || '',
                                  });
                                }
                              }
                              // Remove old entries, then splice new ones at the original position
                              const sortedDesc = [...group.indices].sort((a, b) => b - a);
                              for (const idx of sortedDesc) {
                                newP.splice(idx, 1);
                              }
                              newP.splice(firstIdx, 0, ...newEntries);
                              setPrices(newP);
                            }}
                          />
                        </div>
                        {hasMultipleCurrencies ? (
                          <div className="space-y-2">
                            {group.indices.map((pIdx) => {
                              const p = prices[pIdx];
                              const currencyLabel = p.currency || '$';
                              return (
                                <div key={pIdx} className="rounded-md border border-border/50 bg-card p-2">
                                  <div className="text-xs font-medium text-primary mb-1.5">{p.region || t('Default', '默认', lang)} ({currencyLabel})</div>
                                  <div className="grid grid-cols-2 gap-2 mb-1.5">
                                    <div>
                                      <label className="text-[10px] text-muted-foreground text-left block">{t('Current Price', '现价', lang)} ({currencyLabel})</label>
                                      <input value={p.current_price} onChange={(e) => {
                                        const newP = [...prices];
                                        newP[pIdx].current_price = e.target.value;
                                        // Auto-calculate discount
                                        const current = parseFloat(e.target.value);
                                        const original = parseFloat(p.original_price);
                                        if (!isNaN(current) && !isNaN(original) && original > 0 && original > current) {
                                          newP[pIdx].discount_percent = Math.round(((original - current) / original) * 100).toString();
                                        }
                                        setPrices(newP);
                                      }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0.00" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-muted-foreground text-left block">{t('Original Price', '原价', lang)} ({currencyLabel})</label>
                                      <input value={p.original_price} onChange={(e) => {
                                        const newP = [...prices];
                                        newP[pIdx].original_price = e.target.value;
                                        // Auto-calculate discount
                                        const current = parseFloat(p.current_price);
                                        const original = parseFloat(e.target.value);
                                        if (!isNaN(current) && !isNaN(original) && original > 0 && original > current) {
                                          newP[pIdx].discount_percent = Math.round(((original - current) / original) * 100).toString();
                                        } else {
                                          newP[pIdx].discount_percent = '';
                                        }
                                        setPrices(newP);
                                      }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0.00" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] text-muted-foreground text-left block">{t('Discount %', '折扣 %', lang)}</label>
                                      <div className="mt-0.5 w-full rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm text-muted-foreground">
                                        {p.discount_percent ? `${p.discount_percent}%` : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-muted-foreground text-left block">{t('Product URL', '产品链接', lang)}</label>
                                      <input value={p.product_url} onChange={(e) => { const newP = [...prices]; newP[pIdx].product_url = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="https://..." />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div>
                            <div className="grid grid-cols-2 gap-2 mb-1.5">
                              <div>
                                <label className="text-[10px] text-muted-foreground text-left block">{t('Current Price', '现价', lang)} ({firstP.currency || '$'})</label>
                                <input value={firstP.current_price} onChange={(e) => {
                                  const newP = [...prices];
                                  newP[group.indices[0]].current_price = e.target.value;
                                  const current = parseFloat(e.target.value);
                                  const original = parseFloat(firstP.original_price);
                                  if (!isNaN(current) && !isNaN(original) && original > 0 && original > current) {
                                    newP[group.indices[0]].discount_percent = Math.round(((original - current) / original) * 100).toString();
                                  }
                                  setPrices(newP);
                                }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0.00" />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground text-left block">{t('Original Price', '原价', lang)} ({firstP.currency || '$'})</label>
                                <input value={firstP.original_price} onChange={(e) => {
                                  const newP = [...prices];
                                  newP[group.indices[0]].original_price = e.target.value;
                                  const current = parseFloat(firstP.current_price);
                                  const original = parseFloat(e.target.value);
                                  if (!isNaN(current) && !isNaN(original) && original > 0 && original > current) {
                                    newP[group.indices[0]].discount_percent = Math.round(((original - current) / original) * 100).toString();
                                  } else {
                                    newP[group.indices[0]].discount_percent = '';
                                  }
                                  setPrices(newP);
                                }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="0.00" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-muted-foreground text-left block">{t('Discount %', '折扣 %', lang)}</label>
                                <div className="mt-0.5 w-full rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm text-muted-foreground">
                                  {firstP.discount_percent ? `${firstP.discount_percent}%` : '—'}
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground text-left block">{t('Product URL', '产品链接', lang)}</label>
                                <input value={firstP.product_url} onChange={(e) => { const newP = [...prices]; newP[group.indices[0]].product_url = e.target.value; setPrices(newP); }} className="mt-0.5 w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm" placeholder="https://..." />
                              </div>
                            </div>
                          </div>
                        )}
                        {prices.length > 1 && (
                          <button onClick={() => setPrices(prices.filter((_, i) => !group.indices.includes(i)))} className="mt-2 text-[10px] text-destructive hover:underline">
                            {t('Remove Store', '移除商城', lang)}
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}
                <button onClick={() => setPrices([...prices, { store_id: '', current_price: '', original_price: '', product_url: '', discount_percent: '', currency: '$', region: '' }])} className="text-xs text-primary hover:underline">
                  + {t('Add Store Price', '添加商城价格', lang)}
                </button>
              </div>            </div>
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
function BannerFormModal({ banner, onSave, lang, activeLanguages }: { banner?: Banner; onSave: () => void; lang: string; activeLanguages: Language[] }) {
  const [open, setOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState(banner?.link_url || '');
  const [sortOrder, setSortOrder] = useState(banner?.sort_order || 0);
  const [isActive, setIsActive] = useState(banner?.is_active !== false);
  const [defaultImageKey, setDefaultImageKey] = useState(banner?.image_key || '');
  const [defaultMobileImageKey, setDefaultMobileImageKey] = useState(banner?.mobile_image_key || '');
  const [translations, setTranslations] = useState<{ language: string; title: string; subtitle: string }[]>(
    banner?.banner_translations?.map((tr) => ({
      language: tr.language,
      title: tr.title || '',
      subtitle: tr.subtitle || '',
    })) || activeLanguages.map(l => ({ language: l.code, title: '', subtitle: '' }))
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!banner;

  // Sync translations with active languages when opening
  useEffect(() => {
    if (open) {
      setTranslations(prev => {
        const existing = new Map(prev.map(t => [t.language, t]));
        return activeLanguages.map(l => {
          const ex = existing.get(l.code);
          return ex || { language: l.code, title: '', subtitle: '' };
        });
      });
    }
  }, [open, activeLanguages]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = '/api/admin/banners';
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        id: banner?.id,
        image_key: defaultImageKey || null,
        mobile_image_key: defaultMobileImageKey || null,
        link_url: linkUrl || null,
        sort_order: sortOrder,
        is_active: isActive,
        translations: translations.map((tr) => ({
          language: tr.language,
          title: tr.title || null,
          subtitle: tr.subtitle || null,
        })),
      };
      const res = await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{isEdit ? t('Edit Banner', '编辑 Banner', lang) : t('Add Banner', '添加 Banner', lang)}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {/* Default Banner Image Upload (Web) */}
              <ImageUpload
                value={defaultImageKey}
                onUploadComplete={setDefaultImageKey}
                aspectRatio={21 / 6}
                suggestedSize="1200x343px"
                label={t('Web Banner Image (fallback if no language-specific image)', 'Web 端 Banner 图片（无语言专属图时使用）', lang)}
                folder="banners"
              />

              {/* Default Mobile Banner Image Upload */}
              <ImageUpload
                value={defaultMobileImageKey}
                onUploadComplete={setDefaultMobileImageKey}
                aspectRatio={750 / 422}
                suggestedSize="750x422px"
                label={t('Mobile Banner Image (fallback if no language-specific image)', '移动端 Banner 图片（无语言专属图时使用）', lang)}
                folder="banners"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Link URL (optional)', '链接地址 (可选)', lang)}</label>
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground text-left block">{t('Sort Order', '排序', lang)}</label>
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
                {translations.map((tr, idx) => {
                  const langInfo = activeLanguages.find(l => l.code === tr.language);
                  return (
                    <div key={tr.language} className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-medium text-muted-foreground uppercase">{tr.language}</span>
                        <span className="text-xs text-muted-foreground">{langInfo?.name || ''}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Title', '标题', lang)}</label>
                          <input value={tr.title} onChange={(e) => { setTranslations(prev => prev.map((t, i) => i === idx ? { ...t, title: e.target.value } : t)); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5 text-left">{t('Subtitle', '副标题', lang)}</label>
                          <input value={tr.subtitle} onChange={(e) => { const newT = [...translations]; newT[idx].subtitle = e.target.value; setTranslations(newT); }} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm" />
                        </div>
                      </div>
                    </div>
                  );
                })}
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

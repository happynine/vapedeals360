'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Upload,
  Loader2,
  AlertTriangle,
  Settings2,
  Store as StoreIcon,
  ChevronDown,
  Check,
  X,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { categoryKey, autoGuessCategory } from '@/lib/awin-compare';
import type {
  AdvertiserInfo,
  AdvertiserMapping,
  PreviewEntry,
  PreviewResponse,
  StoreInfo,
  CandidateStorePrice,
  FieldChoiceKey,
  FieldChoiceSource,
  FieldChoices,
} from '@/lib/awin-import-types';

const KIND_LABEL: Record<PreviewEntry['kind'], string> = {
  new: '新品',
  price_changed: '价格/链接',
  info_changed: '信息变动',
  unchanged: '无变化',
  possible_match: '疑似重复',
  missing: '待确认',
};

// Human labels for a store's recorded enrichment method.
const METHOD_LABEL: Record<string, string> = {
  none: 'feed 完整',
  woo_store_api: 'WooCommerce 补全',
  custom: '专属方法',
};

interface CommitSummary {
  batchId: number | null;
  created: number;
  updated: number;
  skipped: number;
  hidden: number;
  errors: string[];
}

export default function AwinImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [promoUrls, setPromoUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [advertisers, setAdvertisers] = useState<AdvertiserInfo[]>([]);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [mappings, setMappings] = useState<Record<string, AdvertiserMapping>>({});
  const [advNames, setAdvNames] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [advFilter, setAdvFilter] = useState<string>('__all__');
  const [catFilter, setCatFilter] = useState<string>('__all__');
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [error, setError] = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const [compareKey, setCompareKey] = useState<string | null>(null);
  // Single-store context: '__all__' or one ONLINE STORE id. Drives every view.
  const [activeAdv, setActiveAdv] = useState<string>('__all__');
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  // "Add advertiser" inline form.
  const [showAddAdv, setShowAddAdv] = useState(false);
  // Store-upload flow: upload one store's feed, identity is auto-detected, the
  // user only picks which existing online store it maps to.
  const [newAdvFile, setNewAdvFile] = useState<File | null>(null);
  const [newAdvDetected, setNewAdvDetected] = useState<{
    advertiserId: string;
    advertiserName: string;
    productCount: number;
    currency: string;
  } | null>(null);
  const [newAdvStoreId, setNewAdvStoreId] = useState<number | null>(null);
  // Logo picker for the add-store flow.
  const [newAdvPickerOpen, setNewAdvPickerOpen] = useState(false);
  const [detectingAdv, setDetectingAdv] = useState(false);
  // Category mapping editor: scope 'global' or an advertiser id.
  const [catMapScope, setCatMapScope] = useState<string>('global');
  const [catDraft, setCatDraft] = useState<Record<string, string>>({});
  const [savingMappings, setSavingMappings] = useState(false);
  const [mappingMsg, setMappingMsg] = useState('');
  // Batch "compare similar products" review mode. reviewKeys is a fixed
  // snapshot so mid-review candidate choices never change the list.
  const [batchReview, setBatchReview] = useState(false);
  const [finalCommit, setFinalCommit] = useState(false);
  const [reviewKeys, setReviewKeys] = useState<string[]>([]);

  // Load saved advertisers + internal stores on mount, so the "select store"
  // context works even before a feed is uploaded.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await adminFetch('/api/admin/awin-import/mappings');
        const data = await res.json();
        if (!alive || !res.ok || !data.success) return;
        setStores((prev) => (prev.length ? prev : data.stores));
        setAdvertisers((prev) => {
          if (prev.length) return prev;
          return (data.advertisers ?? []).map((a: any) => ({
            advertiserId: a.advertiser_id,
            advertiserName: a.advertiser_name || a.advertiser_id,
            productCount: 0,
            suggestedCurrency: a.currency,
            mapping: { storeId: a.store_id, region: a.region, currency: a.currency },
          }));
        });
        setMappings((prev) => {
          const next = { ...prev };
          for (const a of data.advertisers ?? []) {
            next[a.advertiser_id] = {
              storeId: a.store_id,
              region: a.region,
              currency: a.currency,
            };
          }
          return next;
        });
        setAdvNames((prev) => {
          const next = { ...prev };
          for (const a of data.advertisers ?? []) {
            next[a.advertiser_id] = a.advertiser_name || '';
          }
          return next;
        });
      } catch {
        // Non-fatal; uploading a feed will populate the same data.
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adminFetch = (url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'x-session': localStorage.getItem('admin_token') || '',
      },
    });

  // POST the file. When advertisers still lack mappings the server returns
  // ready=false with the advertiser list; once all mapped it returns entries.
  const postFile = async (
    nextMappings: Record<string, AdvertiserMapping>,
  ): Promise<PreviewResponse> => {
    if (!file) throw new Error('Please select a feed file first');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('promo_urls', promoUrls);
    fd.append('mappings', JSON.stringify(nextMappings));
    const res = await adminFetch('/api/admin/awin-import/preview', {
      method: 'POST',
      body: fd,
    });
    const data: PreviewResponse = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
    return data;
  };

  const handleInitialUpload = async () => {
    if (!file) {
      setError('Please select a feed file first');
      return;
    }
    setLoading(true);
    setError('');
    setSummary(null);
    setEntries([]);
    try {
      const data = await postFile(mappings);
      setPreview(data);
      setAdvertisers(data.advertisers);
      setStores(data.stores);

      setShowMapping(true);
      if (data.ready) {
        setEntries(data.entries);
        setShowMapping(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  // User edited one advertiser's mapping locally.
  const updateMapping = (advId: string, patch: Partial<AdvertiserMapping>) => {
    setMappings((prev) => {
      const base = prev[advId] ?? { storeId: 1, region: '', currency: '' };
      const next = { ...prev, [advId]: { ...base, ...patch } };
      return next;
    });
  };

  // Map an online store id → the advertiser id(s) mapped to it (one store may
  // be backed by several advertisers). Derived from the loaded mappings.
  const advsByStore = (() => {
    const map = new Map<string, string[]>();
    for (const a of advertisers) {
      const sid = a.mapping?.storeId;
      if (!sid) continue;
      const list = map.get(String(sid)) ?? [];
      list.push(a.advertiserId);
      map.set(String(sid), list);
    }
    return map;
  })();

  // Advertiser ids covered by the current store context (all → undefined).
  const contextAdvIds =
    activeAdv === '__all__' ? null : advsByStore.get(activeAdv) ?? [];

  // The store selector is the global context: switching it drives both the
  // entry-list advertiser filter and the category-analysis scope. A single
  // store may map to several advertisers, so the filter matches any of them.
  useEffect(() => {
    if (activeAdv === '__all__') {
      setAdvFilter('__all__');
      setCatMapScope('global');
    } else {
      // Keep the first backing advertiser as the scope; filtering uses the set.
      const [first] = advsByStore.get(activeAdv) ?? [];
      setAdvFilter(first ?? `__store_${activeAdv}`);
      setCatMapScope(first ?? 'global');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAdv]);

  // Persist a manually added advertiser mapping, then bring it into context.
  // Step 1: upload the store's feed and let the server detect its identity.
  const handleDetectAdvFile = async () => {
    if (!newAdvFile) {
      setError('请先选择该商城的 feed 文件');
      return;
    }
    setDetectingAdv(true);
    setError('');
    setNewAdvDetected(null);
    try {
      const fd = new FormData();
      fd.append('file', newAdvFile);
      fd.append('promo_urls', '');
      fd.append('mappings', '{}');
      const res = await adminFetch('/api/admin/awin-import/preview', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '读取失败');
      const first = (data.advertisers ?? [])[0];
      if (!first) throw new Error('文件中没有识别到商城');
      setNewAdvDetected({
        advertiserId: first.advertiserId,
        advertiserName: first.advertiserName,
        productCount: first.productCount,
        currency: first.suggestedCurrency || 'USD',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      setDetectingAdv(false);
    }
  };

  // Step 2: map the detected advertiser to an existing online store and save.
  const handleAddAdvertiser = async () => {
    if (!newAdvDetected) {
      setError('请先上传并读取商城 feed');
      return;
    }
    if (!newAdvStoreId) {
      setError('请选择对应的线上已有商城');
      return;
    }
    const store = stores.find((s) => s.id === newAdvStoreId);
    if (!store) {
      setError('请选择有效的线上商城');
      return;
    }
    // Region/currency are carried over from the existing store, not typed.
    const region = store.regions?.[0] || 'USA';
    const currency =
      store.currencies?.[0] || newAdvDetected.currency || 'USD';
    const { advertiserId, advertiserName } = newAdvDetected;
    setSavingMappings(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/awin-import/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advertiserMappings: {
            [advertiserId]: {
              storeId: newAdvStoreId,
              region,
              currency,
              advertiserName,
            },
          },
          categoryMappings: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.errors?.join('；') || '添加失败');
      }
      setMappings((prev) => ({
        ...prev,
        [advertiserId]: { storeId: newAdvStoreId, region, currency },
      }));
      setAdvNames((prev) => ({ ...prev, [advertiserId]: advertiserName }));
      setAdvertisers((prev) => {
        const without = prev.filter((a) => a.advertiserId !== advertiserId);
        return [
          ...without,
          {
            advertiserId,
            advertiserName,
            productCount: newAdvDetected.productCount,
            suggestedCurrency: currency,
            mapping: { storeId: newAdvStoreId, region, currency },
          },
        ];
      });
      setMappingMsg(
        `已添加「${advertiserName}」并对应到线上商城「${store.name}」。`,
      );
      resetAddAdv();
      setActiveAdv(String(newAdvStoreId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSavingMappings(false);
    }
  };

  const resetAddAdv = () => {
    setShowAddAdv(false);
    setNewAdvFile(null);
    setNewAdvDetected(null);
    setNewAdvStoreId(null);
    setNewAdvPickerOpen(false);
  };

  // Re-send once every advertiser has a complete mapping.
  const handleApplyMappings = async () => {
    const complete = advertisers.every(
      (a) =>
        mappings[a.advertiserId] &&
        mappings[a.advertiserId].storeId &&
        mappings[a.advertiserId].region &&
        mappings[a.advertiserId].currency,
    );
    if (!complete) {
      setError('请先为每个商城设置好 店铺 / 地区 / 货币');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await postFile(mappings);
      setPreview(data);
      if (!data.ready) {
        setAdvertisers(data.advertisers);
        setError('仍有商城未完成映射');
        return;
      }
      setEntries(data.entries);
      setShowMapping(false);
      setAdvFilter('__all__');
      setCatFilter('__all__');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const updateEntry = (key: string, patch: Partial<PreviewEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  // Groups are built from the RESOLVED INTERNAL category slug (e.category), so
  // they work for every feed format including native feeds whose own buckets
  // are empty. Missing rows (no category) are bucketed as uncategorized.
  const internalCategoryGroups = (() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (contextAdvIds !== null && !contextAdvIds.includes(e.advertiserId))
        continue;
      const slug = e.category || 'uncategorized';
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    const nameOf = (slug: string) =>
      slug === 'uncategorized'
        ? 'Uncategorized'
        : preview?.internalCategories.find((c) => c.slug === slug)?.name || slug;
    return [...counts.entries()]
      .map(([slug, count]) => ({ slug, label: nameOf(slug), count }))
      .sort((a, b) =>
        a.slug === 'uncategorized'
          ? 1
          : b.slug === 'uncategorized'
            ? -1
            : a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
      );
  })();

  const inCategory = (e: PreviewEntry) => {
    if (catFilter === '__all__') return true;
    return (e.category || 'uncategorized') === catFilter;
  };

  const visibleEntries = entries.filter(
    (e) =>
      (contextAdvIds === null || contextAdvIds.includes(e.advertiserId)) &&
      inCategory(e) &&
      (!onlyPromo || !!e.promo),
  );

  // Selection state per internal category: all / some / none, scoped to store.
  const categorySelection = (slug: string): 'all' | 'some' | 'none' => {
    const group = entries.filter(
      (e) =>
        (contextAdvIds === null || contextAdvIds.includes(e.advertiserId)) &&
        (e.category || 'uncategorized') === slug,
    );
    if (group.length === 0) return 'none';
    const sel = group.filter((e) => e.selected).length;
    if (sel === 0) return 'none';
    return sel === group.length ? 'all' : 'some';
  };

  const toggleCategorySelection = (slug: string) => {
    const target = categorySelection(slug) !== 'all';
    const keys = new Set(
      entries
        .filter(
          (e) =>
            (contextAdvIds === null ||
              contextAdvIds.includes(e.advertiserId)) &&
            (e.category || 'uncategorized') === slug,
        )
        .map((e) => e.key),
    );
    setEntries((prev) =>
      prev.map((e) =>
        keys.has(e.key) ? { ...e, selected: target } : e,
      ),
    );
  };

  const handleStartCompare = () => {
    if (entries.filter((e) => e.selected).length === 0) {
      setError('请先勾选要核对的产品');
      return;
    }
    setError('');
    setReviewKeys(entries.filter((e) => e.selected).map((e) => e.key));
    setBatchReview(true);
  };

  const setVisibleSelected = (value: boolean) => {
    const keys = new Set(visibleEntries.map((e) => e.key));
    setEntries((prev) => prev.map((e) => (keys.has(e.key) ? { ...e, selected: value } : e)));
  };

  const handleCommit = async () => {
    if (!preview) return;
    setCommitting(true);
    setError('');
    try {
      const payload = {
        fileName: file?.name,
        // Only send mappings for advertisers actually present in the file.
        mappings: Object.fromEntries(
          advertisers.map((a) => [a.advertiserId, mappings[a.advertiserId]]),
        ),
        entries: entries.map((e) => ({
          kind: e.kind,
          selected: e.selected,
          advertiserId: e.advertiserId,
          awProductId: e.awProductId,
          merchantProductId: e.merchantProductId,
          productId: e.productId,
          mergeProductId:
            e.kind === 'possible_match' && e.selected ? e.productId : null,
          fieldChoices: e.fieldChoices,
          slug: e.slug,
          name: e.name,
          description: e.description,
          imageUrl: e.imageUrl,
          category: e.category,
          brand: e.brand,
          prices: e.prices.map((p) => ({
            priceId: p.priceId,
            storeId: p.storeId,
            region: p.region,
            newPrice: p.newPrice,
            newOriginalPrice: p.newOriginalPrice,
            currency: p.currency,
            newUrl: p.newUrl,
            inStock: p.inStock,
          })),
        })),
      };
      const res = await adminFetch('/api/admin/awin-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Commit failed');
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const mappedCount = advertisers.filter(
    (a) => mappings[a.advertiserId]?.region,
  ).length;

  // The store's own RAW top-level categories. With one online store selected,
  // scope to the advertiser(s) backing it; all-stores unions every advertiser
  // and tags the source, since raw names are not shared across stores.
  const feedCategoryNames = (() => {
    const seen = new Map<string, { label: string; advs: string[] }>();
    const inScope = (advId: string) =>
      contextAdvIds === null || contextAdvIds.includes(advId);
    for (const e of entries) {
      if (!inScope(e.advertiserId)) continue;
      for (const raw of [e.rawFeedCategory || '', ...e.extraRawFeedCategories]) {
        if (!raw) continue;
        const key = categoryKey(raw);
        if (!key) continue;
        const row = seen.get(key);
        if (row) {
          if (!row.advs.includes(e.advertiserId)) row.advs.push(e.advertiserId);
        } else {
          seen.set(key, { label: raw, advs: [e.advertiserId] });
        }
      }
    }
    return [...seen.entries()]
      .map(([key, v]) => [key, v.label, v.advs] as [string, string, string[]])
      .sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const advName = (advId: string) =>
    advertisers.find((a) => a.advertiserId === advId)?.advertiserName || advId;

  // When the scope (global / one advertiser) changes, seed the draft with the
  // saved rows for that scope; blank rows fall back to the current entry guess.
  useEffect(() => {
    if (!preview) return;
    const saved = new Map<string, string>();
    for (const m of preview.savedCategoryMappings ?? []) {
      const wantAdv =
        contextAdvIds === null ? null : (m.advertiser_id ?? null);
      const inScope =
        contextAdvIds === null
          ? wantAdv === null
          : wantAdv !== null && contextAdvIds.includes(wantAdv);
      if (inScope) {
        saved.set(categoryKey(m.feed_category), m.category_slug);
      }
    }
    // Guess is taken from entries whose own raw category equals the key.
    const guess = new Map<string, string>();
    for (const e of entries) {
      if (contextAdvIds !== null && !contextAdvIds.includes(e.advertiserId)) continue;
      for (const raw of [e.rawFeedCategory || '', ...e.extraRawFeedCategories]) {
        const key = categoryKey(raw);
        if (key && e.category) guess.set(key, e.category);
      }
    }
    const draft: Record<string, string> = {};
    for (const [key] of feedCategoryNames) {
      const v = saved.get(key) ?? guess.get(key) ?? '';
      if (v) draft[key] = v;
    }
    setCatDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catMapScope, preview?.generatedAt]);

  // Persist both kinds of mappings independently of the final import commit.
  const handleSaveMappings = async () => {
    setSavingMappings(true);
    setMappingMsg('');
    setError('');
    try {
      const payload = {
        advertiserMappings: Object.fromEntries(
          advertisers
            .filter((a) => mappings[a.advertiserId]?.region)
            .map((a) => [a.advertiserId, mappings[a.advertiserId]]),
        ),
        categoryMappings: Object.entries(catDraft)
          .filter(([, slug]) => slug)
          .flatMap(([key, slug]) => {
            const row = feedCategoryNames.find(([k]) => k === key);
            const advs = row?.[2] ?? [];
            if (contextAdvIds !== null) {
              // Store scope: persist the raw name for each backing advertiser
              // that actually uses it.
              return advs.map((advId) => ({
                advertiserId: advId,
                feedCategory: key,
                categorySlug: slug,
              }));
            }
            // All-stores: raw store-specific names must not become global
            // defaults. Only persist the key when it is one of the normalized
            // shared buckets; other rows stay as auto-guess defaults.
            const shared = new Set(
              entries.flatMap((e) => [categoryKey(e.feedCategory || ''), ...e.extraFeedCategories.map((c) => categoryKey(c))]),
            );
            return shared.has(key)
              ? [{ advertiserId: null, feedCategory: key, categorySlug: slug }]
              : [];
          }),
      };
      const res = await adminFetch('/api/admin/awin-import/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
      setMappingMsg(
        `已保存：商城映射 ${data.savedAdvertisers} 个 · 品类映射 ${data.savedCategories} 条，正在刷新预览…${
          data.errors?.length ? `（提示：${data.errors.join('；')}）` : ''
        }`,
      );
      // Recompute the preview so the new mappings take effect this session.
      if (file && data.ready !== false) {
        const fresh = await postFile(mappings);
        setPreview(fresh);
        if (fresh.ready) setEntries(fresh.entries);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingMappings(false);
    }
  };

  // One-click: fill every still-unmapped row with the built-in smart guess.
  // Rows the guesser cannot resolve are left as "不映射" for manual review.
  const handleAutofillCategories = () => {
    if (!preview) return;
    const dbCats = preview.internalCategories.map((c) => ({
      id: 0,
      slug: c.slug,
      name: c.name,
    }));
    let filled = 0;
    setCatDraft((prev) => {
      const next = { ...prev };
      for (const [key, , advs] of feedCategoryNames) {
        if (next[key]) continue;
        const guess = autoGuessCategory(key, dbCats, advs[0]);
        if (guess) {
          next[key] = guess;
          filled++;
        }
      }
      return next;
    });
    setMappingMsg('');
    // Defer the count message until state settles; count synchronously too.
    let n = 0;
    for (const [key, , advs] of feedCategoryNames) {
      if (catDraft[key]) continue;
      if (autoGuessCategory(key, dbCats, advs[0])) n++;
    }
    setMappingMsg(n > 0 ? `已智能填充 ${n} 个分类，请核对后保存。` : '所有分类已有映射，无需填充。');
  };

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-white">Awin 联盟数据导入</h3>
          <p className="text-sm text-zinc-400 mt-1">
            上传从 Awin 下载的 feed（.csv / .csv.gz）。系统会读出文件里的所有商城，你逐个设置对应关系，同款产品合并、按商城挂价格。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Single-store context selector (online stores, logo + name) */}
          <div className="relative flex items-center gap-2">
            <span className="text-xs text-zinc-400 whitespace-nowrap">选商城</span>
            <button
              type="button"
              onClick={() => setStorePickerOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 hover:border-zinc-500 min-w-[150px]"
            >
              {activeAdv === '__all__' ? (
                <StoreIcon className="h-5 w-5 text-zinc-400" />
              ) : (
                <StoreLogo
                  src={stores.find((s) => String(s.id) === activeAdv)?.logoUrl}
                  alt={stores.find((s) => String(s.id) === activeAdv)?.name ?? ''}
                />
              )}
              <span className="flex-1 text-left truncate">
                {activeAdv === '__all__'
                  ? '全部商城'
                  : stores.find((s) => String(s.id) === activeAdv)?.name ?? '商城'}
              </span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>
            {storePickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setStorePickerOpen(false)}
                />
                <div className="absolute left-12 top-full z-30 mt-1 max-h-72 w-60 overflow-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAdv('__all__');
                      setStorePickerOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-700 ${
                      activeAdv === '__all__' ? 'text-purple-300' : 'text-zinc-200'
                    }`}
                  >
                    <StoreIcon className="h-5 w-5 text-zinc-400" />
                    <span className="flex-1">全部商城</span>
                    {activeAdv === '__all__' && <Check className="h-4 w-4" />}
                  </button>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActiveAdv(String(s.id));
                        setStorePickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-700 ${
                        activeAdv === String(s.id) ? 'text-purple-300' : 'text-zinc-200'
                      }`}
                    >
                      <StoreLogo src={s.logoUrl} alt={s.name} />
                      <span className="flex-1 truncate">{s.name}</span>
                      {activeAdv === String(s.id) && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Input
            type="file"
            accept=".csv,.gz"
            className="max-w-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-zinc-200"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            onClick={handleInitialUpload}
            disabled={loading || !file}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            读取商城
          </Button>
          {advertisers.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowMapping((v) => !v)}
              className="border-zinc-700 text-zinc-300"
            >
              <Settings2 className="w-4 h-4 mr-2" />
              商城对应关系（{mappedCount}/{advertisers.length}）
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowAddAdv((v) => !v)}
            className="border-emerald-700 text-emerald-300 hover:bg-emerald-900/20"
          >
            <Plus className="w-4 h-4 mr-1" />
            添加商城
          </Button>
        </div>

        {/* Add advertiser: upload that store's feed, pick online store, then
            set its category mapping one store at a time. */}
        {showAddAdv && (
          <div className="rounded-md border border-emerald-800/60 bg-emerald-950/20 p-3 space-y-3">
            <p className="text-sm font-medium text-emerald-200">
              并联增加一个商城的独立分析（不影响已分析好的商城）。流程：①
              上传该商城 feed 并读取 → ② 选择它对应的线上商城 → ③
              保存后，按此商城单独建立「品类对应关系」与专属补救方法。每个商城的方法各自独立记录，全部配好后再统一对比跨商城相似产品。
            </p>
            {preview?.storeProfiles && preview.storeProfiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <span>已记录分析方法：</span>
                {preview.storeProfiles.map((p) => (
                  <span
                    key={p.advertiserId}
                    className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5"
                    title={p.method}
                  >
                    {p.name} · {METHOD_LABEL[p.method] || p.method}
                  </span>
                ))}
              </div>
            )}

            {/* Step 1: file + read */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">1</span>
              <Input
                type="file"
                accept=".csv,.gz"
                className="max-w-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-zinc-200"
                onChange={(e) => {
                  setNewAdvFile(e.target.files?.[0] ?? null);
                  setNewAdvDetected(null);
                  setNewAdvStoreId(null);
                }}
              />
              <Button
                onClick={handleDetectAdvFile}
                disabled={detectingAdv || !newAdvFile}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {detectingAdv && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                <Upload className="w-4 h-4 mr-1" />
                读取商城
              </Button>
              {newAdvDetected && (
                <div className="rounded-md border border-emerald-700/50 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-100">
                  已识别：<b>{newAdvDetected.advertiserName}</b> · ID{' '}
                  {newAdvDetected.advertiserId} ·{' '}
                  {newAdvDetected.productCount} 个产品
                </div>
              )}
            </div>

            {/* Step 2: pick existing online store (logo picker) */}
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">2</span>
              <span className="text-xs text-zinc-300 whitespace-nowrap font-medium">
                选择对应的线上商城
              </span>
              <div className="relative">
                <button
                  type="button"
                  disabled={!newAdvDetected}
                  onClick={() => setNewAdvPickerOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 hover:border-zinc-500 min-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newAdvStoreId === null ? (
                    <StoreIcon className="h-5 w-5 text-zinc-400" />
                  ) : (
                    <StoreLogo
                      src={stores.find((s) => s.id === newAdvStoreId)?.logoUrl}
                      alt={stores.find((s) => s.id === newAdvStoreId)?.name ?? ''}
                    />
                  )}
                  <span className="flex-1 text-left truncate">
                    {newAdvStoreId === null
                      ? newAdvDetected
                        ? '请选择线上商城'
                        : '请先读取商城'
                      : stores.find((s) => s.id === newAdvStoreId)?.name ?? '商城'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                </button>
                {newAdvPickerOpen && newAdvDetected && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setNewAdvPickerOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                      {stores.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setNewAdvStoreId(s.id);
                            setNewAdvPickerOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-700 ${
                            newAdvStoreId === s.id ? 'text-emerald-300' : 'text-zinc-200'
                          }`}
                        >
                          <StoreLogo src={s.logoUrl} alt={s.name} />
                          <span className="flex-1 truncate">{s.name}</span>
                          {newAdvStoreId === s.id && (
                            <Check className="h-4 w-4 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <span className="text-[11px] text-zinc-500">
                地区 / 货币自动用该线上商城设置；保存后即可按此商城设置品类对应
              </span>
            </div>

            {/* Step 3: save */}
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">3</span>
              <Button
                onClick={handleAddAdvertiser}
                disabled={savingMappings || !newAdvDetected || !newAdvStoreId}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {savingMappings && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Check className="w-4 h-4 mr-1" />
                保存对应商城
              </Button>
              <Button
                variant="ghost"
                onClick={resetAddAdv}
                className="text-zinc-400"
              >
                取消
              </Button>
            </div>
          </div>
        )}

        <label className="block text-xs text-zinc-400 space-y-1">
          促销 / 优惠页网址（可选，每行一个，自动标注促销价、划线原价与优惠码）
          <Textarea
            value={promoUrls}
            onChange={(e) => setPromoUrls(e.target.value)}
            placeholder={'https://vapesourcing.com/remit.html\nhttps://vapesourcing.com/sale.html'}
            className="text-xs text-zinc-200 h-16"
          />
        </label>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
      </div>

      {/* Advertiser mapping area */}
      {showMapping && advertisers.length > 0 && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-amber-200 flex items-center gap-2">
              <StoreIcon className="w-4 h-4" />
              文件包含 {advertisers.length} 个商城，请设置对应关系
            </h4>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSaveMappings}
                disabled={savingMappings || loading}
                variant="outline"
                className="border-amber-600/60 text-amber-200 hover:bg-amber-900/30"
                title="把商城对应关系保存下来，以后上传自动带出"
              >
                {savingMappings && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Check className="w-4 h-4 mr-1" />
                保存对应关系
              </Button>
              <Button
                onClick={handleApplyMappings}
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                生成预览
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {advertisers.map((a) => {
              const m = mappings[a.advertiserId];
              return (
                <div
                  key={a.advertiserId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3"
                >
                  <div className="min-w-[220px]">
                    <p className="text-sm text-white">{a.advertiserName}</p>
                    <p className="text-xs text-zinc-500">
                      ID {a.advertiserId} · {a.productCount} 个产品
                    </p>
                  </div>
                  <MappingSelects
                    stores={stores}
                    value={m}
                    onChange={(patch) => updateMapping(a.advertiserId, patch)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category mapping editor (visible whenever a preview exists) */}
      {preview && feedCategoryNames.length > 0 && (
        <div className="rounded-lg border border-sky-800/60 bg-sky-950/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-sky-200 flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              品类对应关系（保存后以后上传自动生效）
            </h4>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAutofillCategories}
                disabled={savingMappings}
                variant="outline"
                className="border-sky-600/60 text-sky-200 hover:bg-sky-900/30"
                title="把所有仍未映射的分类按智能建议自动填上"
              >
                <Settings2 className="w-4 h-4 mr-1" />
                智能填充未映射
              </Button>
              <Button
                onClick={handleSaveMappings}
                disabled={savingMappings}
                className="bg-sky-600 hover:bg-sky-700"
              >
                {savingMappings && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Check className="w-4 h-4 mr-1" />
                保存品类对应
              </Button>
            </div>
          </div>

          {/* Context follows the top "选商城" selector; shown read-only. */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-300/90">
            <span>正在分析：</span>
            <span className="rounded-full border border-sky-700/60 bg-sky-900/30 px-2.5 py-0.5 font-medium text-sky-100">
              {activeAdv === '__all__'
                ? '全部商城（通用默认）'
                : stores.find((s) => String(s.id) === activeAdv)?.name || '商城'}
            </span>
            <span className="text-sky-400/70">
              {activeAdv === '__all__'
                ? '下方只保存所有商城共用的通用品类'
                : '下方是该商城自己的原始分类，独立保存、优先于全局'}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {feedCategoryNames.map(([key, label, advs]) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm text-zinc-200"
                    title={label}
                  >
                    {label}
                  </p>
                  {activeAdv === '__all__' && advs.length > 0 && (
                    <p className="truncate text-[10px] text-zinc-500" title={advs.map(advName).join('、')}>
                      {advs.map(advName).join('、')}
                    </p>
                  )}
                </div>
                <select
                  value={catDraft[key] ?? ''}
                  onChange={(ev) =>
                    setCatDraft((prev) => ({ ...prev, [key]: ev.target.value }))
                  }
                  className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200"
                >
                  <option value="">— 不映射 —</option>
                  {preview.internalCategories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {mappingMsg && (
            <p className="text-xs text-emerald-300">{mappingMsg}</p>
          )}
          <p className="text-xs text-zinc-500">
            品类对应按商城各自的原始分类名保存；切换商城看到的分类各自独立。全局范围只保存所有商城共用的通用品类，商城专属的分类请在对应商城标签里设置，且优先于全局。
          </p>
        </div>
      )}

      {/* Result summary after commit */}
      {summary && (
        <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-4 text-sm text-emerald-200 space-y-1">
          <p className="font-semibold">导入完成（批次 #{summary.batchId}）</p>
          <p>
            新建 {summary.created} · 更新 {summary.updated} · 隐藏 {summary.hidden} · 跳过{' '}
            {summary.skipped}
          </p>
          {summary.errors.length > 0 && (
            <ul className="list-disc pl-5 text-red-300">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Filters + entries */}
      {entries.length > 0 && (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
            {/* Context comes from the top store selector. */}
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              当前商城：
              <span className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 font-medium text-zinc-200">
                {activeAdv === '__all__' ? (
                  '全部商城'
                ) : (
                  <>
                    <StoreLogo
                      src={stores.find((s) => String(s.id) === activeAdv)?.logoUrl}
                      alt=""
                    />
                    {stores.find((s) => String(s.id) === activeAdv)?.name || '商城'}
                  </>
                )}
              </span>
            </div>
            {/* Category chips (resolved internal categories; click to filter,
                checkbox to select the whole category for import). */}
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={catFilter === '__all__'}
                onClick={() => setCatFilter('__all__')}
              >
                全部品类
              </FilterChip>
              {internalCategoryGroups.map((g) => {
                const sel = categorySelection(g.slug);
                return (
                  <div
                    key={g.slug}
                    className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 text-xs transition ${
                      catFilter === g.slug
                        ? 'border-purple-500 bg-purple-600 text-white'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    <label
                      className="flex items-center"
                      title="勾选则选中该品类全部产品"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <Checkbox
                        checked={sel === 'some' ? 'indeterminate' : sel === 'all'}
                        onCheckedChange={() => toggleCategorySelection(g.slug)}
                        className="h-3.5 w-3.5 border-zinc-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setCatFilter(g.slug)}
                      className="whitespace-nowrap"
                    >
                      {g.label} {g.count}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <Checkbox
                  checked={onlyPromo}
                  onCheckedChange={(v) => setOnlyPromo(v === true)}
                />
                仅看促销
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleSelected(true)}
                className="border-zinc-700 text-zinc-300"
              >
                勾选当前列表
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleSelected(false)}
                className="border-zinc-700 text-zinc-300"
              >
                取消当前列表
              </Button>
              <div className="ml-auto">
                <Button
                  onClick={handleStartCompare}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  对比相似产品（{entries.filter((e) => e.selected).length}）
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {visibleEntries.map((e) => (
              <EntryRow
                key={e.key}
                entry={e}
                updateEntry={updateEntry}
                onCompare={(key) => setCompareKey(key)}
              />
            ))}
            {visibleEntries.length === 0 && (
              <p className="text-sm text-zinc-500 p-4">当前筛选下没有产品。</p>
            )}
          </div>
        </>
      )}

      <CompareModal
        entry={
          (batchReview
            ? (reviewKeys
                .map((k) => entries.find((e) => e.key === k))
                .find((e): e is PreviewEntry | undefined => !!e) ??
              null)
            : entries.find((e) => e.key === compareKey)) ?? null
        }
        allEntries={entries}
        stores={stores}
        batch={batchReview}
        reviewKeys={reviewKeys}
        finalCommit={finalCommit}
        committing={committing}
        onClose={() => {
          setCompareKey(null);
          setBatchReview(false);
          setFinalCommit(false);
          setReviewKeys([]);
        }}
        onApply={(key, patch) => {
          updateEntry(key, patch);
          setCompareKey(null);
        }}
        onApplyStay={(key, patch) => updateEntry(key, patch)}
        onApplyMany={(updates) => {
          for (const { key, patch } of updates) updateEntry(key, patch);
          setCompareKey(null);
        }}
        onFinalImport={async () => {
          setFinalCommit(true);
          await handleCommit();
          setBatchReview(false);
          setFinalCommit(false);
          setReviewKeys([]);
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs border transition ${
        active
          ? 'bg-purple-600 border-purple-500 text-white'
          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
      }`}
    >
      {children}
    </button>
  );
}

/** Custom store dropdown: shows logo, A-Z sorted, native <option> can't render images. */
function StoreSelect({
  stores,
  value,
  onChange,
}: {
  stores: StoreInfo[];
  value: number;
  onChange: (storeId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = stores.find((s) => s.id === value);
  const btnCls =
    'flex h-9 w-[230px] items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-200';

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={btnCls} onClick={() => setOpen((v) => !v)}>
        <StoreLogo src={current?.logoUrl} alt={current?.name ?? ''} />
        <span className="flex-1 truncate text-left">
          {current ? `${current.name} (#${current.id})` : `#${value}`}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-70 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-[260px] overflow-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-zinc-700/70 ${
                s.id === value ? 'text-white' : 'text-zinc-300'
              }`}
            >
              <StoreLogo src={s.logoUrl} alt={s.name} />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-xs text-zinc-500">#{s.id}</span>
              {s.id === value && <Check className="h-4 w-4 text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small rounded store logo with a fallback icon. */
function StoreLogo({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-700">
        <StoreIcon className="h-3 w-3 text-zinc-300" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 rounded bg-white object-contain"
    />
  );
}

/** Store / region / currency selects for one advertiser, cross-linked. */
function MappingSelects({
  stores,
  value,
  onChange,
}: {
  stores: StoreInfo[];
  value?: AdvertiserMapping;
  onChange: (patch: Partial<AdvertiserMapping>) => void;
}) {
  const storeId = value?.storeId ?? stores[0]?.id ?? 0;
  const store = stores.find((s) => s.id === storeId);
  // Options come only from what this store has configured (capabilities).
  const regions = store?.regions ?? [];
  const currencies = store?.currencies ?? [];

  const selectCls =
    'h-9 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-200';

  return (
    <>
      <StoreSelect
        stores={stores}
        value={storeId}
        onChange={(id) => {
          const s = stores.find((x) => x.id === id);
          onChange({
            storeId: id,
            region: s?.regions[0] ?? '',
            currency: s?.currencies[0] ?? '',
          });
        }}
      />
      <select
        className={selectCls}
        value={value?.region ?? ''}
        onChange={(e) => onChange({ region: e.target.value })}
      >
        {(!value?.region || regions.length === 0) && <option value="">地区</option>}
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={value?.currency ?? ''}
        onChange={(e) => onChange({ currency: e.target.value })}
      >
        {(!value?.currency || currencies.length === 0) && (
          <option value="">货币</option>
        )}
        {currencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </>
  );
}

/** One preview row with identity + candidates + price. */
function EntryRow({
  entry,
  updateEntry,
  onCompare,
}: {
  entry: PreviewEntry;
  updateEntry: (key: string, patch: Partial<PreviewEntry>) => void;
  onCompare: (key: string) => void;
}) {
  const price = entry.prices[0];
  const cross = entry.matchCandidates.filter((c) => c.source === 'cross_store');
  const internal = entry.matchCandidates.filter((c) => c.source === 'internal');

  const chooseCandidate = (productId: number) =>
    updateEntry(entry.key, { productId, selected: true });

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={entry.selected}
          onCheckedChange={(v) => updateEntry(entry.key, { selected: v === true })}
          className="mt-1"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.imageUrl}
          alt={entry.name}
          className="h-14 w-14 rounded object-cover border border-zinc-800 bg-zinc-800"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = '0.3';
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white">
            <span className="text-zinc-500 mr-2">[{KIND_LABEL[entry.kind]}]</span>
            {entry.name}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="whitespace-nowrap">
              {entry.advertiserName} · {entry.categoryLabel || entry.category} · SKU{' '}
              {entry.merchantProductId || entry.awProductId}
            </span>
            {entry.storeUrl && (
              <a
                href={entry.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap"
              >
                <ExternalLink className="h-3 w-3" />
                去商城查看
              </a>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-emerald-400">
            {price?.newPrice ?? '—'} {price?.currency}
          </p>
          {price?.oldPrice !== null && price?.oldPrice !== undefined && (
            <p className="text-xs text-zinc-500 line-through">
              {price.oldPrice} {price.currency}
            </p>
          )}
        </div>
      </div>

      {entry.matchCandidates.length > 0 && (
        <div className="mt-3 space-y-2 pl-7">
          {cross.length > 0 && (
            <CandidateGroup
              title="① 其他商城也在卖的同款"
              tone="emerald"
              candidates={cross}
              activeId={entry.productId}
              onChoose={chooseCandidate}
            />
          )}
          {internal.length > 0 && (
            <CandidateGroup
              title="② 站内目录同款"
              tone="blue"
              candidates={internal}
              activeId={entry.productId}
              onChoose={chooseCandidate}
            />
          )}
          <div className="flex items-center gap-4">
            <button
              onClick={() => updateEntry(entry.key, { productId: null, selected: true })}
              className="text-xs text-zinc-400 hover:text-zinc-200 underline"
            >
              都不是，作为新品
            </button>
            <button
              onClick={() => onCompare(entry.key)}
              className="text-xs text-purple-300 hover:text-purple-200 underline"
            >
              对比
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateGroup({
  title,
  tone,
  candidates,
  activeId,
  onChoose,
}: {
  title: string;
  tone: 'emerald' | 'blue';
  candidates: PreviewEntry['matchCandidates'];
  activeId: number | null;
  onChoose: (productId: number) => void;
}) {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-800/60 bg-emerald-950/20'
      : 'border-blue-800/60 bg-blue-950/20';
  return (
    <div className={`rounded-md border p-2 space-y-1 ${toneCls}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-300">{title}</p>
        <span className="text-[10px] text-zinc-500">（VapeDeals360 站内商城）</span>
      </div>
      {candidates.map((c) => (
        <button
          key={c.productId}
          onClick={() => onChoose(c.productId)}
          className={`w-full rounded px-2 py-1.5 text-left text-xs ${
            activeId === c.productId ? 'bg-zinc-700 text-white' : 'text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.imageUrl || ''} alt="" className="h-8 w-8 rounded object-cover bg-zinc-800" />
            <span className="flex-1">{c.name}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">#{c.productId}</span>
          </div>
          {c.sellingStores.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-10">
              <span className="text-[10px] text-zinc-500">在售商城：</span>
              {c.sellingStores.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300"
                >
                  <StoreLogo src={s.logoUrl} alt={s.name} />
                  {s.name}
                  <span className="text-zinc-500">#{s.id}</span>
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compare modal: three columns (feed / other stores / current site)   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Compare modal                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_CHOICES: FieldChoices = {
  image: 'canonical',
  name: 'canonical',
  description: 'canonical',
};

function CompareModal({
  entry: initialEntry,
  allEntries,
  stores,
  batch,
  reviewKeys,
  finalCommit,
  committing,
  onClose,
  onApply,
  onApplyStay,
  onApplyMany,
  onFinalImport,
}: {
  entry: PreviewEntry | null;
  allEntries: PreviewEntry[];
  stores: StoreInfo[];
  batch?: boolean;
  reviewKeys?: string[];
  finalCommit?: boolean;
  committing?: boolean;
  onClose: () => void;
  onApply: (key: string, patch: Partial<PreviewEntry>) => void;
  onApplyStay: (key: string, patch: Partial<PreviewEntry>) => void;
  onApplyMany: (updates: Array<{ key: string; patch: Partial<PreviewEntry> }>) => void;
  onFinalImport: () => void;
}) {
  // Batch review navigation across the fixed snapshot of entries taken when
  // the review started, so candidate choices never shrink the list.
  const reviewList = batch
    ? (reviewKeys ?? [])
        .map((k) => allEntries.find((e) => e.key === k))
        .filter((e): e is PreviewEntry => !!e)
    : [];
  // Per-entry state so sibling feed duplicates can be confirmed together.
  const [modeByKey, setModeByKey] = useState<Record<string, 'merge' | 'new'>>({});
  const [choicesByKey, setChoicesByKey] = useState<Record<string, FieldChoices>>({});
  // Which match candidate is currently displayed (0 = top scored).
  const [candIdxByKey, setCandIdxByKey] = useState<Record<string, number>>({});
  // Position within the fixed batch snapshot; -1 / unused in single mode.
  const [batchPos, setBatchPos] = useState(0);

  useEffect(() => {
    setBatchPos(0);
  }, [reviewKeys?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (entry) {
      // Direct "Compare" click: default to the best candidate + merge mode so
      // columns B and the site-value column are never blank.
      const hasCand = entry.matchCandidates.length > 0;
      setModeByKey((m) => ({
        ...m,
        [entry.key]: m[entry.key] ?? (entry.mergeProductId || hasCand ? 'merge' : 'new'),
      }));
      setChoicesByKey((c) => ({
        ...c,
        [entry.key]: c[entry.key] ?? entry.fieldChoices ?? DEFAULT_CHOICES,
      }));
      const preSel = entry.matchCandidates.findIndex(
        (c) => c.productId === entry.mergeProductId,
      );
      setCandIdxByKey((c) => ({
        ...c,
        [entry.key]: c[entry.key] ?? (preSel >= 0 ? preSel : 0),
      }));
    }
  }, [entry?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = batch ? reviewList[batchPos] ?? null : initialEntry;
  if (!entry) return null;
  const reviewIndex = batchPos;

  const candIdx = Math.min(
    candIdxByKey[entry.key] ?? 0,
    Math.max(0, entry.matchCandidates.length - 1),
  );
  const candidate = entry.matchCandidates[candIdx] ?? null;

  // The feed row's target store lives on its price row (no top-level field).
  const targetStoreId = entry.prices[0]?.storeId ?? null;
  const advertiserName =
    stores.find((s) => s.id === targetStoreId)?.name ?? 'A商城';

  // Sibling feed rows in the SAME batch that are duplicates of this product.
  const normName = (s?: string | null) =>
    (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const siblings = allEntries.filter(
    (o) =>
      o.key !== entry.key &&
      ((entry.merchantProductId &&
        o.merchantProductId &&
        o.merchantProductId.toUpperCase() === entry.merchantProductId.toUpperCase()) ||
        normName(o.name) === normName(entry.name)),
  );

  const relatedKeys = [entry.key, ...siblings.map((s) => s.key)];

  const getMode = (k: string): 'merge' | 'new' =>
    modeByKey[k] ?? (allEntries.find((e) => e.key === k)?.mergeProductId ? 'merge' : 'new');
  const getChoices = (k: string): FieldChoices =>
    choicesByKey[k] ?? allEntries.find((e) => e.key === k)?.fieldChoices ?? DEFAULT_CHOICES;

  const storeById = (id?: number | null) => stores.find((s) => s.id === id);

  // Per-store deduped SKU rows (a store may have several price regions).
  const otherStores: CandidateStorePrice[] = [];
  for (const sp of candidate?.storePrices ?? []) {
    if (sp.storeId === targetStoreId) continue;
    if (otherStores.some((x) => x.storeId === sp.storeId)) continue;
    otherStores.push(sp);
  }

  const buildPatch = (
    k: string,
  ): { key: string; patch: Partial<PreviewEntry> } => {
    const mode = getMode(k);
    const choices = getChoices(k);
    return {
      key: k,
      patch:
        mode === 'merge' && candidate
          ? { kind: 'merge', mergeProductId: candidate.productId, fieldChoices: choices }
          : { kind: 'new', mergeProductId: null, fieldChoices: choices },
    };
  };

  // Persist the current entry's choices before moving to another selected row.
  const saveCurrentAndGo = (nextIndex: number) => {
    const patch = buildPatch(entry.key);
    onApplyStay(patch.key, patch.patch);
    setBatchPos(nextIndex);
  };

  const goPrev = () => {
    if (batchPos > 0) saveCurrentAndGo(batchPos - 1);
  };
  const goNext = () => {
    if (batchPos < reviewList.length - 1) saveCurrentAndGo(batchPos + 1);
  };

  const handleConfirm = () => {
    if (batch) {
      const patch = buildPatch(entry.key);
      onApplyStay(patch.key, patch.patch);
      if (batchPos < reviewList.length - 1) {
        goNext();
        return;
      }
      return;
    }
    const updates: Array<{ key: string; patch: Partial<PreviewEntry> }> = [];
    for (const k of relatedKeys) {
      const mode = getMode(k);
      const choices = getChoices(k);
      updates.push({
        key: k,
        patch:
          mode === 'merge' && candidate
            ? { kind: 'merge', mergeProductId: candidate.productId, fieldChoices: choices }
            : { kind: 'new', mergeProductId: null, fieldChoices: choices },
      });
    }
    if (updates.length === 1) onApply(updates[0].key, updates[0].patch);
    else onApplyMany(updates);
  };

  const mergeMode = getMode(entry.key);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              {batch ? '对比相似产品' : '对比相同产品'}
            </h3>
            {batch && (
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-300">
                {reviewIndex + 1} / {reviewList.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Candidate switcher: lets the user pick which local product to compare */}
          {entry.matchCandidates.length > 0 && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                站内疑似同款（{entry.matchCandidates.length}）— 点击切换对比对象
              </p>
              <div className="flex flex-wrap gap-2">
                {entry.matchCandidates.map((c, i) => (
                  <button
                    key={c.productId}
                    onClick={() => {
                      setCandIdxByKey((m) => ({ ...m, [entry.key]: i }));
                      setModeByKey((m) => ({ ...m, [entry.key]: 'merge' }));
                    }}
                    className={`flex items-center gap-2 rounded border px-2 py-1 text-[11px] transition ${
                      i === candIdx
                        ? 'border-purple-500 bg-purple-500/15 text-purple-200'
                        : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    <img
                      src={c.imageUrl || ''}
                      alt=""
                      className="h-6 w-6 rounded bg-zinc-700 object-cover"
                    />
                    <span className="max-w-[260px] truncate">{c.name}</span>
                    <span className="text-zinc-500">#{c.productId}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Header */}
          <div className="grid grid-cols-[110px_1fr_1fr] gap-3">
            <div />
            <div className="rounded bg-purple-500/15 px-3 py-2 text-center text-[11px] font-semibold leading-tight text-purple-300 ring-1 ring-purple-500/30">
              A商城 · 本次导入
              <div className="mt-0.5 font-normal text-purple-300/80">{advertiserName}</div>
            </div>
            <div className="rounded bg-blue-500/10 px-3 py-2 text-center text-[11px] font-semibold text-blue-300 ring-1 ring-blue-500/25">
              VapeDeals360 · 站内现值
            </div>
          </div>

          {/* B stores — consolidated once; brand/category/name are not per-store. */}
          {otherStores.length > 0 && (
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
              <p className="mb-2 text-[11px] font-semibold text-emerald-300">
                B商城 · 其他在售店（VapeDeals360 站内，共 {otherStores.length} 家，本次不改动）
              </p>
              <div className="flex flex-wrap gap-2">
                {otherStores.map((s) => (
                  <span
                    key={s.storeId}
                    className="flex items-center gap-1.5 rounded bg-zinc-800/70 px-2 py-1 text-[11px] text-zinc-300"
                  >
                    <StoreLogo src={s.logoUrl} alt={s.storeName} />
                    {s.storeName}
                    {s.region && <span className="text-zinc-500">· {s.region}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Image */}
          <FieldRow label="配图">
            <ChoiceCell
              label="采用本次导入"
              checked={mergeMode && getChoices(entry.key).image === 'feed'}
              disabled={!mergeMode}
              onChange={() =>
                setChoicesByKey((m) => ({
                  ...m,
                  [entry.key]: { ...getChoices(entry.key), image: 'feed' },
                }))
              }
            >
              <CompareThumb src={entry.imageUrl} />
            </ChoiceCell>
            <ChoiceCell
              label="保留站内现值"
              checked={mergeMode && getChoices(entry.key).image === 'canonical'}
              disabled={!mergeMode}
              onChange={() =>
                setChoicesByKey((m) => ({
                  ...m,
                  [entry.key]: { ...getChoices(entry.key), image: 'canonical' },
                }))
              }
            >
              <CompareThumb src={candidate?.imageUrl} />
            </ChoiceCell>
          </FieldRow>

          {/* Name */}
          <FieldRow label="产品名">
            <ChoiceCell
              label="采用本次导入"
              checked={mergeMode && getChoices(entry.key).name === 'feed'}
              disabled={!mergeMode}
              onChange={() =>
                setChoicesByKey((m) => ({
                  ...m,
                  [entry.key]: { ...getChoices(entry.key), name: 'feed' },
                }))
              }
            >
              <CompareText>{entry.name}</CompareText>
            </ChoiceCell>
            <ChoiceCell
              label="保留站内现值"
              checked={mergeMode && getChoices(entry.key).name === 'canonical'}
              disabled={!mergeMode}
              onChange={() =>
                setChoicesByKey((m) => ({
                  ...m,
                  [entry.key]: { ...getChoices(entry.key), name: 'canonical' },
                }))
              }
            >
              <CompareText>{candidate?.name}</CompareText>
            </ChoiceCell>
          </FieldRow>

          {/* Other params */}
          <FieldRow label="其他参数">
            <div className="space-y-1.5 rounded bg-zinc-800/60 p-2.5 text-[11px]">
              <ParamLine label="品牌" value={entry.brand || '—'} />
              <ParamLine label="分类" value={entry.category || '—'} />
              <ParamLine label="SKU" value={entry.merchantProductId || '—'} mono />
            </div>
            <div className="space-y-1.5 rounded bg-zinc-800/60 p-2.5 text-[11px]">
              <ParamLine label="品牌" value="—" />
              <ParamLine label="分类" value={entry.category || '—'} />
              <ParamLine label="产品 #" value={candidate ? String(candidate.productId) : '—'} mono />
            </div>
          </FieldRow>

          {/* Description */}
          <FieldRow label="详情描述">
            <ChoiceCell
              label="采用本次导入"
              checked={mergeMode && getChoices(entry.key).description === 'feed'}
              disabled={!mergeMode}
              onChange={() =>
                setChoicesByKey((m) => ({
                  ...m,
                  [entry.key]: { ...getChoices(entry.key), description: 'feed' },
                }))
              }
            >
              <CompareText>{entry.description}</CompareText>
            </ChoiceCell>
            <ChoiceCell
              label="保留站内现值"
              checked={mergeMode && getChoices(entry.key).description === 'canonical'}
              disabled={!mergeMode}
              onChange={() =>
                setChoicesByKey((m) => ({
                  ...m,
                  [entry.key]: { ...getChoices(entry.key), description: 'canonical' },
                }))
              }
            >
              <CompareText>{candidate?.description}</CompareText>
            </ChoiceCell>
          </FieldRow>

          {/* Store SKUs for verification */}
          <div className="rounded-md border border-zinc-800 p-3">
            <p className="mb-2 text-[11px] font-semibold text-zinc-300">
              各商城 SKU（用于官方验证产品信息）
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded bg-purple-500/10 px-2.5 py-2 text-[11px] ring-1 ring-purple-500/20">
                <StoreLogo src={storeById(targetStoreId)?.logoUrl} alt={advertiserName} />
                <span className="flex-1 truncate text-zinc-300">{advertiserName}</span>
                <span className="font-mono text-purple-300">{entry.merchantProductId || '—'}</span>
              </div>
              {otherStores.map((s) => (
                <div
                  key={s.storeId}
                  className="flex items-center gap-2 rounded bg-zinc-800/70 px-2.5 py-2 text-[11px]"
                >
                  <StoreLogo src={s.logoUrl} alt={s.storeName} />
                  <span className="flex-1 truncate text-zinc-300">{s.storeName}</span>
                  <span className="font-mono text-zinc-200">{s.sku || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prices — Edit Product style */}
          <div className="rounded-md border border-zinc-800 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-zinc-300">商城报价对比（按商城独立维护）</p>
              <p className="text-[10px] text-zinc-500">
                产品名、配图、描述全站唯一；本次导入只新增/更新 A 商城报价
              </p>
            </div>

            {/* The importing store: one merged card (new price or update). */}
            {(() => {
              const q = entry.prices[0];
              if (!q) return <EmptyNote text="无报价信息" />;
              const exists = !!q.priceId;
              return (
                <QuoteCard
                  logo={storeById(targetStoreId)?.logoUrl ?? null}
                  name={advertiserName}
                  badge={exists ? '站内已有 · 将更新' : '站内新增'}
                  badgeTone={exists ? 'amber' : 'emerald'}
                >
                  <QuoteFields
                    currency={q.currency}
                    current={q.newPrice}
                    original={q.newOriginalPrice}
                    url={q.newUrl}
                    inStock={q.inStock}
                    existing={exists ? q.oldPrice : null}
                  />
                </QuoteCard>
              );
            })()}

            {/* Other stores: names only, no price/link details. */}
            {otherStores.length > 0 && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <p className="mb-2 text-[10px] text-zinc-500">
                  其他在售店（共 {otherStores.length} 家，本次不改动，店铺信息见上方 B商城 区块）
                </p>
                <div className="flex flex-wrap gap-2">
                  {otherStores.map((sp) => (
                    <span
                      key={sp.storeId}
                      className="flex items-center gap-1.5 rounded bg-zinc-800/70 px-2 py-1 text-[11px] text-zinc-400"
                    >
                      <StoreLogo src={sp.logoUrl} alt={sp.storeName} />
                      {sp.storeName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mode */}
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-800/30 p-3">
            <ModeOption
              checked={mergeMode === 'merge' && !!candidate}
              disabled={!candidate}
              onChange={() => setModeByKey((m) => ({ ...m, [entry.key]: 'merge' }))}
              title="使用 VapeDeals360 的产品信息，只导入到商城"
              hint="挂接同款，不改产品内容；上面勾了「采用本次导入」的字段除外"
            />
            <ModeOption
              checked={mergeMode === 'new'}
              onChange={() => setModeByKey((m) => ({ ...m, [entry.key]: 'new' }))}
              title="不是相似产品，作为新品导入"
              hint=""
            />
          </div>

          {siblings.length > 0 && (
            <p className="rounded bg-zinc-800/60 px-3 py-2 text-[11px] text-zinc-400">
              本次 feed 中另有 <span className="font-semibold text-zinc-200">{siblings.length}</span> 个商城
              （{siblings.map((s) => storeById(s.prices[0]?.storeId)?.name).join('、')}）的同款产品，确认后将一起挂接到该产品。
            </p>
          )}
        </div>

        <div
          className={`flex items-center gap-3 border-t border-zinc-800 px-5 py-3 ${
            batch ? 'justify-between' : 'justify-end'
          }`}
        >
          {batch ? (
            <>
              <button
                onClick={goPrev}
                disabled={reviewIndex <= 0}
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
              >
                ← 上一个
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800"
                >
                  取消
                </button>
                {reviewIndex < reviewList.length - 1 ? (
                  <button
                    onClick={handleConfirm}
                    className="rounded-md bg-purple-600 px-5 py-2 text-xs font-medium text-white transition hover:bg-purple-500"
                  >
                    确认并下一个 →
                  </button>
                ) : (
                  <button
                    onClick={onFinalImport}
                    disabled={committing || finalCommit}
                    className="rounded-md bg-emerald-600 px-5 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {(committing || finalCommit) && (
                      <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    )}
                    核对无误，导入全部所选
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-md border border-zinc-700 px-4 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-md bg-purple-600 px-5 py-2 text-xs font-medium text-white transition hover:bg-purple-500"
              >
                确认选择
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr_1fr] items-start gap-3 rounded-md border border-zinc-800 p-3">
      <span className="pt-1 text-[11px] font-semibold text-zinc-400">{label}</span>
      {children}
    </div>
  );
}

function ChoiceCell({
  label,
  checked,
  disabled,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`block rounded p-2 transition ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-zinc-800/70'
      } ${checked ? 'bg-zinc-800 ring-1 ring-purple-500/50' : ''}`}
    >
      <span className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-purple-300">
        <input
          type="radio"
          className="h-3.5 w-3.5 accent-purple-500"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        {label}
      </span>
      {children}
    </label>
  );
}

function CompareThumb({ src }: { src?: string | null }) {
  return (
    <div className="flex h-28 items-center justify-center overflow-hidden rounded bg-white/5">
      {src ? (
        <img src={src} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[10px] text-zinc-600">无图片</span>
      )}
    </div>
  );
}

function CompareText({ children }: { children?: string | null }) {
  return (
    <div className="max-h-28 overflow-y-auto rounded bg-black/20 p-2 text-[11px] leading-relaxed text-zinc-300">
      {children ? children : <span className="text-zinc-600">—</span>}
    </div>
  );
}

function EmptyNote({ text = '—' }: { text?: string }) {
  return <span className="text-[11px] text-zinc-600">{text}</span>;
}

function ParamLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-zinc-500">{label}：</span>
      <span className={`text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function QuoteCard({
  logo,
  name,
  badge,
  badgeTone,
  children,
}: {
  logo: string | null;
  name: string;
  badge: string;
  badgeTone: 'purple' | 'emerald' | 'amber' | 'zinc';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    purple: 'bg-purple-500/15 text-purple-300',
    emerald: 'bg-emerald-500/15 text-emerald-300',
    amber: 'bg-amber-500/15 text-amber-300',
    zinc: 'bg-zinc-700/60 text-zinc-400',
  };
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StoreLogo src={logo} alt={name} />
          <span className="truncate text-xs font-medium text-zinc-200">{name}</span>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${tones[badgeTone]}`}>
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function QuoteFields({
  currency,
  current,
  original,
  url,
  inStock,
  readOnly,
  existing,
}: {
  currency: string;
  current?: number | null;
  original?: number | null;
  url?: string | null;
  inStock?: boolean;
  readOnly?: boolean;
  /** Site's current price before this import, for direct comparison. */
  existing?: number | null;
}) {
  const money = (v?: number | null) =>
    v === null || v === undefined || Number.isNaN(v)
      ? '—'
      : `${v.toFixed(2)}${currency ? ` ${currency}` : ''}`;
  // Price movement vs the site's current value.
  let deltaNote: string | null = null;
  if (
    existing !== null &&
    existing !== undefined &&
    current !== null &&
    current !== undefined &&
    !Number.isNaN(existing) &&
    !Number.isNaN(current)
  ) {
    const d = current - existing;
    if (Math.abs(d) < 0.005) deltaNote = '价格持平';
    else
      deltaNote = `${d < 0 ? '↓ 降价' : '↑ 涨价'} ${Math.abs(d).toFixed(2)} ${currency || ''}`;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3 text-[11px]">
        <div>
          <p className="mb-1 text-zinc-500">站内现值{currency ? ` (${currency})` : ''}</p>
          <p className="rounded bg-black/25 px-2.5 py-1.5 font-medium text-blue-300">{money(existing)}</p>
        </div>
        <div>
          <p className="mb-1 text-zinc-500">本次导入{currency ? ` (${currency})` : ''}</p>
          <p className="rounded bg-black/25 px-2.5 py-1.5 font-medium text-emerald-300">{money(current)}</p>
        </div>
        <div>
          <p className="mb-1 text-zinc-500">Original Price</p>
          <p className="rounded bg-black/25 px-2.5 py-1.5 text-zinc-300">{money(original)}</p>
        </div>
      </div>
      {deltaNote && (
        <p
          className={`text-[11px] ${
            deltaNote.includes('降')
              ? 'text-emerald-300'
              : deltaNote.includes('涨')
                ? 'text-red-300'
                : 'text-zinc-400'
          }`}
        >
          {deltaNote}
        </p>
      )}
      <div>
        <p className="mb-1 text-[11px] text-zinc-500">Product URL</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block truncate rounded bg-black/25 px-2.5 py-1.5 text-[11px] text-sky-400 hover:underline"
          >
            {url}
          </a>
        ) : (
          <p className="rounded bg-black/25 px-2.5 py-1.5 text-[11px] text-zinc-600">—</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={`rounded px-2 py-0.5 font-medium ${
            inStock ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
          }`}
        >
          {inStock ? 'In Stock' : 'Out of Stock'}
        </span>
        {readOnly && <span className="text-zinc-600">（仅展示，本次不改动）</span>}
      </div>
    </div>
  );
}

function ModeOption({
  checked,
  disabled,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        className="mt-0.5 h-3.5 w-3.5 accent-purple-500"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="text-xs text-zinc-200">
        {title}
        {hint && <span className="ml-1 text-zinc-500">（{hint}）</span>}
      </span>
    </label>
  );
}

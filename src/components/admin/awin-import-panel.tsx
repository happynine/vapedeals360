'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Loader2,
  AlertTriangle,
  Settings2,
  Store as StoreIcon,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  AdvertiserInfo,
  AdvertiserMapping,
  PreviewEntry,
  PreviewResponse,
  StoreInfo,
} from '@/lib/awin-import-types';

const KIND_LABEL: Record<PreviewEntry['kind'], string> = {
  new: '新品',
  price_changed: '价格/链接',
  info_changed: '信息变动',
  unchanged: '无变化',
  possible_match: '疑似重复',
  missing: '待确认',
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
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [advFilter, setAdvFilter] = useState<string>('__all__');
  const [catFilter, setCatFilter] = useState<string>('__all__');
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [error, setError] = useState('');
  const [showMapping, setShowMapping] = useState(false);

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
      const pre: Record<string, AdvertiserMapping> = {};
      for (const a of data.advertisers) if (a.mapping) pre[a.advertiserId] = a.mapping;
      setMappings(pre);
      setAdvFilter('__all__');
      setCatFilter('__all__');
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

  const inCategory = (e: PreviewEntry) => {
    if (catFilter === '__all__') return true;
    const buckets = [e.feedCategory || 'Uncategorized', ...e.extraFeedCategories];
    return buckets.includes(catFilter);
  };

  const visibleEntries = entries.filter(
    (e) =>
      (advFilter === '__all__' || e.advertiserId === advFilter) &&
      inCategory(e) &&
      (!onlyPromo || !!e.promo),
  );

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
        </div>

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
            <Button
              onClick={handleApplyMappings}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              生成预览
            </Button>
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
            {/* Advertiser tabs */}
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={advFilter === '__all__'}
                onClick={() => setAdvFilter('__all__')}
              >
                全部商城
              </FilterChip>
              {advertisers.map((a) => (
                <FilterChip
                  key={a.advertiserId}
                  active={advFilter === a.advertiserId}
                  onClick={() => setAdvFilter(a.advertiserId)}
                >
                  {a.advertiserName}（{a.productCount}）
                </FilterChip>
              ))}
            </div>
            {/* Category chips */}
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={catFilter === '__all__'}
                onClick={() => setCatFilter('__all__')}
              >
                全部品类
              </FilterChip>
              {preview?.categoryGroups.map((g) => (
                <FilterChip
                  key={g.key || '__uncat__'}
                  active={catFilter === g.key}
                  onClick={() => setCatFilter(g.key)}
                >
                  {g.label} {g.count}
                </FilterChip>
              ))}
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
                  onClick={handleCommit}
                  disabled={committing}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {committing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  确认导入所选（{entries.filter((e) => e.selected).length}）
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {visibleEntries.map((e) => (
              <EntryRow key={e.key} entry={e} updateEntry={updateEntry} />
            ))}
            {visibleEntries.length === 0 && (
              <p className="text-sm text-zinc-500 p-4">当前筛选下没有产品。</p>
            )}
          </div>
        </>
      )}
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
  children: React.ReactNode;
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
}: {
  entry: PreviewEntry;
  updateEntry: (key: string, patch: Partial<PreviewEntry>) => void;
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
          <p className="text-xs text-zinc-500 mt-0.5">
            {entry.advertiserName} · {entry.categoryLabel || entry.category} · SKU{' '}
            {entry.merchantProductId || entry.awProductId}
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
          <button
            onClick={() => updateEntry(entry.key, { productId: null, selected: true })}
            className="text-xs text-zinc-400 hover:text-zinc-200 underline"
          >
            都不是，作为新品
          </button>
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

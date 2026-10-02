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
  const [compareKey, setCompareKey] = useState<string | null>(null);

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
        entry={entries.find((e) => e.key === compareKey) ?? null}
        allEntries={entries}
        stores={stores}
        onClose={() => setCompareKey(null)}
        onApply={(key, patch) => {
          updateEntry(key, patch);
          setCompareKey(null);
        }}
        onApplyMany={(updates) => {
          for (const { key, patch } of updates) updateEntry(key, patch);
          setCompareKey(null);
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
  entry,
  allEntries,
  stores,
  onClose,
  onApply,
  onApplyMany,
}: {
  entry: ImportEntry | null;
  allEntries: ImportEntry[];
  stores: StoreInfo[];
  onClose: () => void;
  onApply: (key: string, patch: Partial<ImportEntry>) => void;
  onApplyMany: (updates: Array<{ key: string; patch: Partial<ImportEntry> }>) => void;
}) {
  // Per-entry state so sibling feed duplicates can be confirmed together.
  const [modeByKey, setModeByKey] = useState<Record<string, 'merge' | 'new'>>({});
  const [choicesByKey, setChoicesByKey] = useState<Record<string, FieldChoices>>({});
  // Which match candidate is currently displayed (0 = top scored).
  const [candIdxByKey, setCandIdxByKey] = useState<Record<string, number>>({});

  useEffect(() => {
    if (entry) {
      // Direct "Compare" click: default to the best candidate + merge mode so
      // columns B and the site-value column are never blank.
      const hasCand = entry.matchCandidates.length > 0;
      setModeByKey({ [entry.key]: entry.mergeProductId || hasCand ? 'merge' : 'new' });
      setChoicesByKey({ [entry.key]: entry.fieldChoices ?? DEFAULT_CHOICES });
      const preSel = entry.matchCandidates.findIndex(
        (c) => c.productId === entry.mergeProductId,
      );
      setCandIdxByKey({ [entry.key]: preSel >= 0 ? preSel : 0 });
    }
  }, [entry?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return null;

  const candIdx = Math.min(
    candIdxByKey[entry.key] ?? 0,
    Math.max(0, entry.matchCandidates.length - 1),
  );
  const candidate = entry.matchCandidates[candIdx] ?? null;

  const advertiserName = stores.find((s) => s.id === entry.targetStore)?.name ?? 'A商城';

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

  const handleConfirm = () => {
    const updates: Array<{ key: string; patch: Partial<ImportEntry> }> = [];
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
          <h3 className="text-sm font-semibold text-zinc-100">对比相同产品</h3>
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
          <div className="grid grid-cols-[110px_1fr_1fr_1fr] gap-3">
            <div />
            <div className="rounded bg-purple-500/15 px-3 py-2 text-center text-[11px] font-semibold leading-tight text-purple-300 ring-1 ring-purple-500/30">
              A商城 · 本次导入
              <div className="mt-0.5 font-normal text-purple-300/80">{advertiserName}</div>
            </div>
            <div className="rounded bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
              B商城 · 其他在售店（VapeDeals360 站内）
            </div>
            <div className="rounded bg-blue-500/10 px-3 py-2 text-center text-[11px] font-semibold text-blue-300 ring-1 ring-blue-500/25">
              VapeDeals360 · 站内现值
            </div>
          </div>

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
            <MiddleCell>
              {candidate && candidate.sellingStores.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {candidate.sellingStores.map((s) => (
                    <div key={s.id} className="flex items-center gap-1 text-[11px] text-zinc-300">
                      <StoreLogo src={s.logoUrl} alt={s.name} />
                      {s.name}
                      <span className="text-zinc-500">· {regionOfStore(s.id, candidate)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyNote />
              )}
            </MiddleCell>
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
            <MiddleCell>
              {candidate ? (
                <div className="space-y-0.5 text-[11px] text-zinc-400">
                  {candidate.sellingStores.map((s) => (
                    <div key={s.id}>
                      {s.name} · {regionOfStore(s.id, candidate)}
                    </div>
                  ))}
                  <p className="pt-1 text-zinc-500">各店产品名统一使用 VapeDeals360 站内产品名</p>
                </div>
              ) : (
                <EmptyNote />
              )}
            </MiddleCell>
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
            <MiddleCell>
              <p className="text-[11px] text-zinc-500">品牌、分类等参数不按店区分，统一使用站内值</p>
            </MiddleCell>
            <div className="space-y-1.5 rounded bg-zinc-800/60 p-2.5 text-[11px]">
              <ParamLine label="品牌" value={candidate ? '—' : '—'} />
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
            <MiddleCell>
              <p className="text-[11px] text-zinc-500">描述统一使用站内值</p>
            </MiddleCell>
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
                <StoreLogo src={storeById(entry.targetStore)?.logoUrl} alt={advertiserName} />
                <span className="flex-1 truncate text-zinc-300">{advertiserName}</span>
                <span className="font-mono text-purple-300">{entry.merchantProductId || '—'}</span>
              </div>
              {candidate?.storeSkus.map((s) => (
                <div
                  key={s.storeId}
                  className="flex items-center gap-2 rounded bg-zinc-800/70 px-2.5 py-2 text-[11px]"
                >
                  <StoreLogo src={storeById(s.storeId)?.logoUrl} alt={s.name} />
                  <span className="flex-1 truncate text-zinc-300">{s.name}</span>
                  <span className="font-mono text-zinc-200">{s.merchantProductId || '—'}</span>
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

            {/* A store quote card */}
            <QuoteCard
              logo={storeById(entry.targetStore)?.logoUrl ?? null}
              name={advertiserName}
              badge="本次导入 · A商城"
              badgeTone="purple"
            >
              <QuoteFields
                currency={entry.prices[0]?.currency ?? ''}
                current={entry.prices[0]?.newPrice}
                original={entry.prices[0]?.newOriginalPrice}
                url={entry.prices[0]?.newUrl}
                inStock={entry.prices[0]?.inStock ?? true}
              />
            </QuoteCard>

            {/* Existing store cards, aligned with the feed store when it already exists */}
            <div className="mt-2 space-y-2">
              {entry.prices.map((p) => (
                <QuoteCard
                  key={`feed-${p.priceId ?? 'new'}`}
                  logo={storeById(p.storeId)?.logoUrl ?? null}
                  name={storeById(p.storeId)?.name ?? `Store #${p.storeId}`}
                  badge={p.priceId ? '站内已有 · 将更新' : '站内新增'}
                  badgeTone={p.priceId ? 'amber' : 'emerald'}
                >
                  <QuoteFields
                    currency={p.currency}
                    current={p.newPrice}
                    original={p.newOriginalPrice}
                    url={p.newUrl}
                    inStock={p.inStock}
                  />
                </QuoteCard>
              ))}
            </div>

            {/* Other selling stores with their current prices */}
            {candidate && candidate.storePrices.length > 0 && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <p className="mb-2 text-[10px] text-zinc-500">其他在售店现价（本次不改动）</p>
                <div className="space-y-2">
                  {candidate.storePrices.map((sp) => (
                    <QuoteCard
                      key={sp.storeId}
                      logo={storeById(sp.storeId)?.logoUrl ?? null}
                      name={sp.name}
                      badge={`${sp.region || ''} ${sp.currency || ''}`.trim()}
                      badgeTone="zinc"
                    >
                      <QuoteFields
                        currency=""
                        current={sp.currentPrice}
                        original={sp.originalPrice}
                        url={sp.productUrl}
                        inStock={sp.inStock}
                        readOnly
                      />
                    </QuoteCard>
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
              （{siblings.map((s) => storeById(s.targetStore)?.name).join('、')}）的同款产品，确认后将一起挂接到该产品。
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-5 py-3">
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
        </div>
      </div>
    </div>
  );
}

function regionOfStore(storeId: number, candidate: MatchCandidate): string {
  const p = candidate.storePrices.find((sp) => sp.storeId === storeId);
  if (p?.region) return p.region;
  return candidate.sellingStores.find((s) => s.id === storeId) ? '' : '';
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr_1fr_1fr] items-start gap-3 rounded-md border border-zinc-800 p-3">
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

function MiddleCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center rounded bg-emerald-500/5 p-2.5 ring-1 ring-emerald-500/15">
      {children}
    </div>
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
}: {
  currency: string;
  current?: number | null;
  original?: number | null;
  url?: string | null;
  inStock?: boolean;
  readOnly?: boolean;
}) {
  const money = (v?: number | null) =>
    v === null || v === undefined || Number.isNaN(v)
      ? '—'
      : `${v.toFixed(2)}${currency ? ` ${currency}` : ''}`;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <p className="mb-1 text-zinc-500">Current Price{currency ? ` (${currency})` : ''}</p>
          <p className="rounded bg-black/25 px-2.5 py-1.5 font-medium text-emerald-300">{money(current)}</p>
        </div>
        <div>
          <p className="mb-1 text-zinc-500">Original Price</p>
          <p className="rounded bg-black/25 px-2.5 py-1.5 text-zinc-300">{money(original)}</p>
        </div>
      </div>
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

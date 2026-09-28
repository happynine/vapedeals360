'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  PreviewEntry,
  PreviewResponse,
} from '@/lib/awin-import-types';

type FilterTab = 'all' | PreviewEntry['kind'];

const KIND_META: Record<
  PreviewEntry['kind'],
  { label: string; color: string }
> = {
  new: { label: '新产品', color: 'text-blue-400' },
  price_changed: { label: '价格/链接', color: 'text-green-400' },
  info_changed: { label: '信息变动', color: 'text-yellow-400' },
  unchanged: { label: '无变化', color: 'text-zinc-400' },
  missing: { label: '待确认', color: 'text-orange-400' },
};

interface CommitSummary {
  created: number;
  updated: number;
  skipped: number;
  hidden: number;
  errors: string[];
}

export default function AwinImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [error, setError] = useState('');

  const adminFetch = (url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'x-session': localStorage.getItem('admin_token') || '',
      },
    });

  const handlePreview = async () => {
    if (!file) {
      setError('Please select a feed file first');
      return;
    }
    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('currency', currency);
      const res = await adminFetch('/api/admin/awin-import/preview', {
        method: 'POST',
        body: fd,
      });
      const data: PreviewResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Preview failed');
      }
      setPreview(data);
      setEntries(data.entries);
      // Default to showing actionable rows first.
      setFilter('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const updateEntry = (key: string, patch: Partial<PreviewEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.key === key ? { ...e, ...patch } : e)),
    );
  };

  const handleCommit = async () => {
    if (!preview) return;
    setCommitting(true);
    setError('');
    try {
      const payload = {
        advertiserId: preview.advertiserId,
        storeId: preview.storeId,
        entries: entries.map((e) => ({
          kind: e.kind,
          selected: e.selected,
          awProductId: e.awProductId,
          merchantProductId: e.merchantProductId,
          productId: e.productId,
          slug: e.slug,
          name: e.name,
          description: e.description,
          imageUrl: e.imageUrl,
          category: e.category,
          brand: e.brand,
          prices: e.prices.map((p) => ({
            priceId: p.priceId,
            storeId: p.storeId,
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
      if (!res.ok) throw new Error(data.error || 'Commit failed');
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const filtered = entries.filter(
    (e) => filter === 'all' || e.kind === filter,
  );
  const selectedCount = entries.filter((e) => e.selected).length;

  return (
    <div className="space-y-4">
      {/* Upload controls */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-white">Awin 联盟数据导入</h3>
          <p className="text-sm text-zinc-400 mt-1">
            上传广告主的 Awin 产品 feed（.csv 或 .csv.gz），先预览对比、核对修改，确认后再导入。链接会替换为 Awin 佣金链接。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept=".csv,.gz"
            className="max-w-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-zinc-200"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">货币</span>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="w-20 text-zinc-200"
            />
          </div>
          <Button
            onClick={handlePreview}
            disabled={loading || !file}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            生成预览
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
      </div>

      {/* Summary + filters */}
      {preview && (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-zinc-300">
                广告主：<span className="text-white font-medium">{preview.advertiserName}</span>
                {' '}（ID {preview.advertiserId}） · 店铺：
                <span className="text-white font-medium">{preview.storeName}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {(['new', 'price_changed', 'info_changed', 'unchanged', 'missing'] as const).map(
                  (k) => (
                    <button
                      key={k}
                      onClick={() => setFilter(k)}
                      className={`${KIND_META[k].color} ${
                        filter === k ? 'font-bold underline' : ''
                      }`}
                    >
                      {KIND_META[k].label} {preview.totals[k]}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setFilter('all')}
                  className={`text-zinc-300 ${filter === 'all' ? 'font-bold underline' : ''}`}
                >
                  全部
                </button>
              </div>
            </div>
            {preview.unmappedCategories.length > 0 && (
              <p className="text-xs text-yellow-500">
                {preview.unmappedCategories.length} 个分类未自动匹配，已按名称生成，导入前请核对分类列。
              </p>
            )}
          </div>

          {/* Entries */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filtered.map((entry) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                onChange={(patch) => updateEntry(entry.key, patch)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-6">
                当前筛选下没有记录
              </p>
            )}
          </div>

          {/* Commit bar */}
          <div className="sticky bottom-0 rounded-lg border border-zinc-700 bg-zinc-900 p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-zinc-300">
              已选 <span className="font-bold text-white">{selectedCount}</span> 条
              {entries.find((e) => e.kind === 'missing' && e.selected) && (
                <span className="text-orange-400 ml-2">
                  （含勾选的「待确认」，将标记为缺货）
                </span>
              )}
            </div>
            <Button
              onClick={handleCommit}
              disabled={committing || selectedCount === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {committing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              确认导入选中项
            </Button>
          </div>
        </>
      )}

      {/* Result */}
      {summary && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
          <h4 className="font-semibold text-white">导入结果</h4>
          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <span className="text-blue-400">新建 {summary.created}</span>
            <span className="text-green-400">更新 {summary.updated}</span>
            <span className="text-orange-400">标记缺货 {summary.hidden}</span>
            <span className="text-zinc-400">跳过 {summary.skipped}</span>
          </div>
          {summary.errors.length > 0 && (
            <ul className="text-xs text-red-400 list-disc list-inside max-h-40 overflow-y-auto">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  onChange,
}: {
  entry: PreviewEntry;
  onChange: (patch: Partial<PreviewEntry>) => void;
}) {
  const meta = KIND_META[entry.kind];
  const price = entry.prices[0];
  const linkChanged =
    price?.oldUrl &&
    price?.newUrl &&
    price.oldUrl !== price.newUrl &&
    entry.kind !== 'new';

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={entry.selected}
          onCheckedChange={(v) => onChange({ selected: v === true })}
          className="mt-1"
        />
        {entry.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.imageUrl}
            alt=""
            className="w-12 h-12 rounded object-cover bg-zinc-800 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-sm text-white font-medium truncate">
              {entry.name || entry.slug}
            </span>
          </div>
          {entry.merchantProductId && (
            <p className="text-xs text-zinc-500">SKU: {entry.merchantProductId}</p>
          )}
        </div>
        {/* Price */}
        <div className="text-right flex-shrink-0">
          {entry.kind === 'missing' ? (
            <span className="text-sm text-orange-400">本次 feed 未返回</span>
          ) : (
            <>
              {price?.oldPrice !== null && price?.oldPrice !== undefined && (
                <span className="text-xs text-zinc-500 line-through mr-2">
                  {price.oldPrice}
                </span>
              )}
              <span className="text-sm font-semibold text-green-400">
                {price?.newPrice ?? '—'} {price?.currency}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Link change highlight */}
      {linkChanged && (
        <div className="ml-7 rounded bg-orange-500/10 border border-orange-500/30 px-2 py-1 text-xs space-y-1">
          <p className="text-orange-300 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> 链接将替换为佣金链接
          </p>
          <p className="text-zinc-500 break-all">旧：{price.oldUrl}</p>
          <p className="text-green-400 break-all">新：{price.newUrl}</p>
        </div>
      )}

      {/* Editable fields: shown for selected actionable rows */}
      {entry.selected && entry.kind !== 'missing' && entry.kind !== 'unchanged' && (
        <div className="ml-7 grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="text-xs text-zinc-400 space-y-1">
            名称
            <Input
              value={entry.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="text-sm text-zinc-200"
            />
          </label>
          <label className="text-xs text-zinc-400 space-y-1">
            分类
            <Input
              value={entry.category}
              onChange={(e) => onChange({ category: e.target.value })}
              className="text-sm text-zinc-200"
            />
          </label>
          <label className="text-xs text-zinc-400 space-y-1 md:col-span-2">
            佣金链接
            <Input
              value={price?.newUrl || ''}
              onChange={(e) =>
                onChange({
                  prices: entry.prices.map((p, i) =>
                    i === 0 ? { ...p, newUrl: e.target.value } : p,
                  ),
                })
              }
              className="text-xs text-zinc-200"
            />
          </label>
          <label className="text-xs text-zinc-400 space-y-1 md:col-span-2">
            描述
            <Textarea
              value={entry.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className="text-xs text-zinc-200 h-20"
            />
          </label>
        </div>
      )}

      {entry.kind === 'missing' && entry.selected && (
        <p className="ml-7 text-xs text-orange-400">
          将把该店价格行标记为缺货（不删除），你也可以取消勾选以原样保留。
        </p>
      )}
    </div>
  );
}

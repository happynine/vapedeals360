// 商城「地区 / 货币 / 美国专区设置」能力解析
//
// stores.regions (JSONB) 支持两种历史结构：
//  1) 旧（配对）：Array<{ region, currency, us_site_type?, us_ship_from?, banned_states? }>
//  2) 新（解耦）：{ regions: string[], currencies: string[],
//                   us_site_type?, us_ship_from?, banned_states? }
// 本模块把两种结构统一解析成 StoreCapabilities，供前后台共用。

export type UsSiteType = 'domestic' | 'international';
export type UsShipFrom = 'us_warehouse' | 'intl_warehouse';

export interface RegionCurrencyPair {
  region: string;
  currency: string; // 货币代码，如 USD
}

export interface StoreCapabilities {
  regions: string[];
  currencies: string[];
  us_site_type?: UsSiteType;
  us_ship_from?: UsShipFrom;
  banned_states?: string[];
}

export interface RawStoreRegionRow {
  region?: string | null;
  currency?: string | null;
  us_site_type?: UsSiteType | null;
  us_ship_from?: UsShipFrom | null;
  banned_states?: string[] | null;
}

interface DecoupledShape {
  regions?: unknown;
  currencies?: unknown;
  us_site_type?: UsSiteType | null;
  us_ship_from?: UsShipFrom | null;
  banned_states?: string[] | null;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim()).filter((x) => x !== '');
}

function isDecoupled(v: unknown): v is DecoupledShape {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 统一解析商城的 regions JSONB 为能力对象（兼容新旧结构） */
export function parseStoreCapabilities(raw: unknown): StoreCapabilities {
  if (isDecoupled(raw)) {
    return {
      regions: toStringArray(raw.regions),
      currencies: toStringArray(raw.currencies),
      us_site_type: raw.us_site_type ?? undefined,
      us_ship_from: raw.us_ship_from ?? undefined,
      banned_states: Array.isArray(raw.banned_states) ? raw.banned_states : undefined,
    };
  }
  if (Array.isArray(raw)) {
    const rows = raw as RawStoreRegionRow[];
    const regions: string[] = [];
    const currencies: string[] = [];
    let us: Pick<StoreCapabilities, 'us_site_type' | 'us_ship_from' | 'banned_states'> = {};
    for (const r of rows) {
      const rg = String(r.region ?? '').trim();
      const cu = String(r.currency ?? '').trim();
      if (rg && !regions.includes(rg)) regions.push(rg);
      if (cu && !currencies.includes(cu)) currencies.push(cu);
      // 旧结构里美国专区设置挂在 USD 那条上
      if (cu === 'USD' && (rg === '' || rg === 'USA' || rg === 'Global')) {
        us = {
          us_site_type: r.us_site_type ?? undefined,
          us_ship_from: r.us_ship_from ?? undefined,
          banned_states: Array.isArray(r.banned_states) ? r.banned_states : undefined,
        };
      }
    }
    return { regions, currencies, ...us };
  }
  return { regions: [], currencies: [] };
}

/**
 * 由独立的地区 / 货币清单推导「地区-货币」配对。
 * 用于产品价格录入槽位生成：
 *  - 仅一个地区：该地区 × 全部货币
 *  - 仅一个货币：全部地区 × 该货币
 *  - 数量一致：按下标一一对应
 *  - 其余（多对多且数量不等）：按下标对应，不足侧用另一侧的首个值兜底
 * 已录入的价格行自带 region/currency，始终保留，不被此推导覆盖。
 */
export function derivePairs(caps: StoreCapabilities): RegionCurrencyPair[] {
  const R = caps.regions;
  const C = caps.currencies;
  if (R.length === 0 && C.length === 0) return [];
  if (R.length === 1 && C.length > 0) return C.map((currency) => ({ region: R[0], currency }));
  if (C.length === 1 && R.length > 0) return R.map((region) => ({ region, currency: C[0] }));
  if (R.length === C.length) return R.map((region, i) => ({ region, currency: C[i] }));

  const n = Math.max(R.length, C.length);
  const r0 = R[0] || '';
  const c0 = C[0] || '';
  const out: RegionCurrencyPair[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ region: R[i] || r0, currency: C[i] || c0 });
  }
  return out;
}

/** 商城是否具备美国专区准入：货币含 USD 且 地区含 Global 或 USA */
export function canEnterUsZone(caps: StoreCapabilities): boolean {
  if (!caps.currencies.includes('USD')) return false;
  return caps.regions.includes('Global') || caps.regions.includes('USA');
}

/** 商城是否在某地区销售（official 类型由调用方按业务另行处理） */
export function storeServesRegion(caps: StoreCapabilities, region: string | null | undefined): boolean {
  if (!region) return true;
  if (caps.regions.length === 0) return true;
  if (caps.regions.includes('Global')) return true;
  return caps.regions.includes(region);
}

/**
 * 当商城未显式配置 us_site_type / us_ship_from 时，按已填写的地区清单
 * 推断美国专区归类，避免「能进美国、也没禁该州」的商城因字段留空而被
 * 整条隐藏：
 *  - 地区含 USA（无论是否同时含其它地区）→ 美国本土店 / 美国仓发货
 *  - 仅含 Global（不含 USA）→ 国际店 / 国际仓发货（如官方品牌站）
 * 已显式配置的字段保持原样，不被覆盖。
 */
export function resolveUsClassification(
  caps: StoreCapabilities,
): { us_site_type: UsSiteType; us_ship_from: UsShipFrom } {
  if (caps.us_site_type && caps.us_ship_from) {
    return { us_site_type: caps.us_site_type, us_ship_from: caps.us_ship_from };
  }
  const domestic = caps.regions.includes('USA');
  const siteType: UsSiteType = caps.us_site_type ?? (domestic ? 'domestic' : 'international');
  const shipFrom: UsShipFrom = caps.us_ship_from ?? (domestic ? 'us_warehouse' : 'intl_warehouse');
  return { us_site_type: siteType, us_ship_from: shipFrom };
}

// 美国州级「产品/品类合规」规则
//
// 州页推荐必须只从「本州允许的产品池」中读取。除商城级 banned_states
// （stores.regions.banned_states，按商城勾选）之外，某些州还有按「产品品类
// (categories.slug)」的法律限制，需要在推荐时统一过滤。
//
// 结构可扩展：后续其他州有品类级禁令时，直接在 STATE_BANNED_CATEGORY_SLUGS
// 增加一项即可。'suppress' 表示该州暂不推荐任何产品（如 Texas，因禁中国制造）。

export interface StateProductRule {
  /** 该州禁售的品类 slug（categories.slug），命中即不推荐 */
  bannedCategorySlugs?: string[];
  /** true = 该州暂时不推荐任何产品 */
  suppress?: boolean;
}

export const STATE_PRODUCT_RULES: Record<string, StateProductRule> = {
  // California：AB 762 + UTL，一次性（battery-embedded disposable）设备不推荐。
  CA: { bannedCategorySlugs: ['disposable-vapes'] },
  // Texas：SB 2024 禁中国制造，合规货源另行处理，暂不推荐任何产品。
  TX: { suppress: true },
};

export function getStateProductRule(stateCode?: string): StateProductRule | undefined {
  if (!stateCode) return undefined;
  return STATE_PRODUCT_RULES[stateCode];
}

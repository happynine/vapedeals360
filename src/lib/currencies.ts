// Shared currency definitions used by both client hooks and server components.
// Symbols match the values stored in product_prices.currency.

export type CurrencyInfo = {
  code: string;
  symbol: string;
  flag: string;
  flagAlt: string;
  name: string;
};

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', flag: '/flags/us.png', flagAlt: 'US', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', flag: '/flags/gb.png', flagAlt: 'GB', name: 'British Pound' },
  { code: 'EUR', symbol: '€', flag: '/flags/eu.png', flagAlt: 'EU', name: 'Euro' },
  { code: 'CAD', symbol: 'CA$', flag: '/flags/ca.png', flagAlt: 'CA', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', flag: '/flags/jp.png', flagAlt: 'JP', name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', flag: '/flags/kr.png', flagAlt: 'KR', name: 'Korean Won' },
  { code: 'AUD', symbol: 'A$', flag: '/flags/au.png', flagAlt: 'AU', name: 'Australian Dollar' },
  { code: 'RUB', symbol: '₽', flag: '/flags/ru.png', flagAlt: 'RU', name: 'Russian Ruble' },
  { code: 'IDR', symbol: 'Rp', flag: '/flags/id.png', flagAlt: 'ID', name: 'Indonesian Rupiah' },
];

export const DEFAULT_CURRENCY_CODE = 'USD';

// Currency code aliases / historical symbols that all map to USD.
const USD_SYMBOLS = new Set(['$', 'US$', 'USD']);

export function symbolForCode(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '$';
}

export function codeForSymbol(symbol: string): string {
  if (USD_SYMBOLS.has(symbol)) return 'USD';
  return CURRENCIES.find((c) => c.symbol === symbol)?.code ?? DEFAULT_CURRENCY_CODE;
}

// Normalize any stored currency value ($/US$/USD) to the canonical DB symbol.
export function normalizeSymbol(value: string | null | undefined): string {
  if (!value) return '$';
  if (USD_SYMBOLS.has(value)) return '$';
  return value;
}

export function isValidCode(code: string | null | undefined): code is string {
  return !!code && CURRENCIES.some((c) => c.code === code);
}

// Cookie + localStorage keys shared with the client hook.
export const CURRENCY_COOKIE = 'currency';
export const CURRENCY_STORAGE_KEY = 'currency';
export const CURRENCY_EVENT = 'currency-change';

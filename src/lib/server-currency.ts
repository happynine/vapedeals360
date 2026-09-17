import { cookies } from 'next/headers';
import {
  DEFAULT_CURRENCY_CODE,
  isValidCode,
  symbolForCode,
  CURRENCY_COOKIE,
} from './currencies';

/**
 * Read the visitor's selected currency from the cookie set by useCurrency.
 * Server components / SSR recommendation blocks call this to filter prices.
 * Defaults to USD when the cookie is absent or invalid.
 */
export async function getServerCurrency(): Promise<{ code: string; symbol: string }> {
  const store = await cookies();
  const raw = store.get(CURRENCY_COOKIE)?.value;
  const code = isValidCode(raw) ? raw : DEFAULT_CURRENCY_CODE;
  return { code, symbol: symbolForCode(code) };
}

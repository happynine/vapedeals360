'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  CURRENCY_COOKIE,
  CURRENCY_STORAGE_KEY,
  CURRENCY_EVENT,
  isValidCode,
  symbolForCode,
} from '@/lib/currencies';

export interface CurrencyState {
  /** Currency code, e.g. USD / GBP */
  currencyCode: string;
  /** DB symbol, e.g. $ / £ / CA$ */
  currencySymbol: string;
  currencies: typeof CURRENCIES;
  setCurrency: (code: string) => void;
}

function readInitialCode(): string {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY_CODE;
  // cookie is the cross-tab/server-shared source of truth
  const cookieMatch = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CURRENCY_COOKIE}=`));
  const fromCookie = cookieMatch ? decodeURIComponent(cookieMatch.split('=')[1]) : null;
  if (isValidCode(fromCookie)) return fromCookie;
  const fromStorage = localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (isValidCode(fromStorage)) return fromStorage;
  return DEFAULT_CURRENCY_CODE;
}

function persistCurrency(code: string) {
  localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  // 1 year, site-wide; SSR reads this on the next request
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${CURRENCY_COOKIE}=${code}; path=/; expires=${expires}; SameSite=Lax`;
}

/**
 * Site-wide currency selection, mirrors the language hook pattern.
 * Persists to localStorage + cookie and broadcasts a window event so every
 * mounted component updates. Server-rendered recommendation blocks read the
 * cookie, so changing currency reloads the page to keep them consistent.
 */
export function useCurrency(): CurrencyState {
  const [currencyCode, setCurrencyCode] = useState<string>(DEFAULT_CURRENCY_CODE);

  useEffect(() => {
    setCurrencyCode(readInitialCode());

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (isValidCode(detail)) setCurrencyCode(detail);
    };
    window.addEventListener(CURRENCY_EVENT, handler);
    // Sync across tabs via storage events
    const storageHandler = (e: StorageEvent) => {
      if (e.key === CURRENCY_STORAGE_KEY && isValidCode(e.newValue)) {
        setCurrencyCode(e.newValue);
      }
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(CURRENCY_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const setCurrency = useCallback((code: string) => {
    if (!isValidCode(code)) return;
    const prev = readInitialCode();
    persistCurrency(code);
    window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: code }));
    setCurrencyCode(code);
    // Reload so server-rendered blocks (home index, related, popular, detail
    // offer tables) all reflect the new currency in the initial HTML.
    if (code !== prev && typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  return {
    currencyCode,
    currencySymbol: symbolForCode(currencyCode),
    currencies: CURRENCIES,
    setCurrency,
  };
}

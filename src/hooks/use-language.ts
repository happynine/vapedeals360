'use client';

import { useState, useEffect, useCallback } from 'react';

export interface LanguageInfo {
  code: string;
  name: string;
  is_active: boolean;
  is_hidden: boolean;
  sort_order: number;
}

// Default fallback languages
const DEFAULT_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', is_active: true, is_hidden: false, sort_order: 0 },
  { code: 'zh', name: '中文', is_active: true, is_hidden: false, sort_order: 1 },
];

// Singleton cache for languages
let languagesCache: LanguageInfo[] | null = null;
let languagesFetchPromise: Promise<LanguageInfo[]> | null = null;

export function invalidateLanguagesCache() {
  languagesCache = null;
  languagesFetchPromise = null;
}

export async function fetchActiveLanguages(): Promise<LanguageInfo[]> {
  if (languagesCache) return languagesCache;
  if (languagesFetchPromise) return languagesFetchPromise;

  languagesFetchPromise = (async () => {
    try {
      const res = await fetch('/api/languages');
      if (res.ok) {
        const json = await res.json();
        const langs = json.data || json;
        if (Array.isArray(langs) && langs.length > 0) {
          languagesCache = langs.map((l: { code: string; name: string }) => ({
            code: l.code,
            name: l.name,
            is_active: true,
            is_hidden: false,
            sort_order: 0,
          }));
          return languagesCache;
        }
      }
    } catch {
      // fallback to defaults
    }
    languagesCache = DEFAULT_LANGUAGES;
    return languagesCache;
  })();

  return languagesFetchPromise;
}

/**
 * Shared language hook that:
 * 1. Reads initial language from localStorage
 * 2. Listens for 'language-change' custom events dispatched by the header
 * 3. Syncs state across all components using this hook
 * 
 * Usage: const { language, setLanguage } = useLanguage();
 */
export function useLanguage() {
  const [language, setLanguageState] = useState<string>('en');
  const [activeLanguages, setActiveLanguages] = useState<LanguageInfo[]>(DEFAULT_LANGUAGES);

  // Load active languages from API
  useEffect(() => {
    invalidateLanguagesCache();
    fetchActiveLanguages().then((langs) => {
      setActiveLanguages(langs);
      // If current language is no longer available, switch to first available
      setLanguageState(prev => {
        if (prev && langs.some(l => l.code === prev)) return prev;
        const first = langs[0]?.code || 'en';
        localStorage.setItem('language', first);
        return first;
      });
    });
  }, []);

  // Initialize from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('language');
    if (saved) {
      setLanguageState(saved);
    }
  }, []);

  // Listen for language-change events from other components (e.g. header)
  useEffect(() => {
    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setLanguageState(customEvent.detail);
      }
    };

    window.addEventListener('language-change', handleLanguageChange);
    return () => window.removeEventListener('language-change', handleLanguageChange);
  }, []);

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    // Dispatch event so all other components update
    window.dispatchEvent(new CustomEvent('language-change', { detail: lang }));
  }, []);

  return { language, setLanguage, activeLanguages };
}

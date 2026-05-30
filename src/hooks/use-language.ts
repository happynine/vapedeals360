'use client';

import { useState, useEffect, useCallback } from 'react';

export type Language = 'en' | 'zh';

/**
 * Shared language hook that:
 * 1. Reads initial language from localStorage
 * 2. Listens for 'language-change' custom events dispatched by the header
 * 3. Syncs state across all components using this hook
 * 
 * Usage: const { language, setLanguage } = useLanguage();
 */
export function useLanguage() {
  const [language, setLanguageState] = useState<Language>('en');

  // Initialize from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('language') as Language | null;
    if (saved === 'zh' || saved === 'en') {
      setLanguageState(saved);
    }
  }, []);

  // Listen for language-change events from other components (e.g. header)
  useEffect(() => {
    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent<Language>;
      if (customEvent.detail) {
        setLanguageState(customEvent.detail);
      }
    };

    window.addEventListener('language-change', handleLanguageChange);
    return () => window.removeEventListener('language-change', handleLanguageChange);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    // Dispatch event so all other components update
    window.dispatchEvent(new CustomEvent('language-change', { detail: lang }));
  }, []);

  return { language, setLanguage };
}

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

interface SiteSettingsContextType {
  siteSettings: SiteSettings | null;
  loading: boolean;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  siteSettings: null,
  loading: true,
});

const CACHE_KEY = 'site-settings-cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedSettings(): SiteSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedSettings(data: SiteSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore storage errors
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Read from localStorage cache first for instant render
    const cached = getCachedSettings();
    if (cached) {
      setSiteSettings(cached);
      setLoading(false);
    }

    // 2. Fetch fresh data from API
    fetch('/api/site-settings')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setSiteSettings(d.data);
          setCachedSettings(d.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ siteSettings, loading }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

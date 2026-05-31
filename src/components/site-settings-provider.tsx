'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

interface SocialLink {
  id: number;
  platform: string;
  url: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

interface SiteSettingsContextType {
  siteSettings: SiteSettings | null;
  socialLinks: SocialLink[];
  loading: boolean;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  siteSettings: null,
  socialLinks: [],
  loading: true,
});

const CACHE_KEY = 'site-settings-cache';
const SOCIAL_CACHE_KEY = 'social-links-cache';
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

function getCachedSocialLinks(): SocialLink[] {
  try {
    const raw = localStorage.getItem(SOCIAL_CACHE_KEY);
    if (!raw) return [];
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(SOCIAL_CACHE_KEY);
      return [];
    }
    return data;
  } catch {
    return [];
  }
}

function setCachedSocialLinks(data: SocialLink[]) {
  try {
    localStorage.setItem(SOCIAL_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore storage errors
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  // Read localStorage cache synchronously on first render to prevent flash
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(() => getCachedSettings());
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(() => getCachedSocialLinks());
  const [loading, setLoading] = useState(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return true;
      const { timestamp } = JSON.parse(raw);
      return Date.now() - timestamp > CACHE_TTL;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    // Fetch fresh data from API
    Promise.all([
      fetch('/api/site-settings').then(r => r.json()),
      fetch('/api/social-links').then(r => r.json()),
    ])
      .then(([settingsData, socialData]) => {
        if (settingsData.success && settingsData.data) {
          setSiteSettings(settingsData.data);
          setCachedSettings(settingsData.data);
        }
        if (socialData.success && socialData.data) {
          setSocialLinks(socialData.data);
          setCachedSocialLinks(socialData.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ siteSettings, socialLinks, loading }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

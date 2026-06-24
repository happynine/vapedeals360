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
  // 初始状态设为 null/空数组，避免 SSR 和 CSR 不一致
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);

  // 在 useEffect 中读取 localStorage 和 fetch 数据（仅客户端）
  useEffect(() => {
    // 先尝试从 localStorage 读取缓存
    const cachedSettings = getCachedSettings();
    const cachedSocialLinks = getCachedSocialLinks();
    
    if (cachedSettings) {
      setSiteSettings(cachedSettings);
    }
    if (cachedSocialLinks.length > 0) {
      setSocialLinks(cachedSocialLinks);
    }

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

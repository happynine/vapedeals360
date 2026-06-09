'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Cookie, Shield, BarChart3, Settings, Megaphone } from 'lucide-react';

interface CookieConsentData {
  essential: boolean;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

const STORAGE_KEY = 'cookie_consent';

const DEFAULT_CONSENT: CookieConsentData = {
  essential: true,
  analytics: false,
  functional: false,
  marketing: false,
};

const i18n = {
  en: {
    title: 'We Value Your Privacy',
    description:
      'We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. By clicking "Accept All", you consent to our use of cookies.',
    acceptAll: 'Accept All',
    rejectAll: 'Reject All',
    managePreferences: 'Manage Preferences',
    savePreferences: 'Save Preferences',
    back: 'Back',
    categories: {
      essential: {
        title: 'Essential Cookies',
        description:
          'These cookies are necessary for the website to function and cannot be switched off. They are usually only set in response to actions made by you such as setting your privacy preferences, logging in, or filling in forms.',
      },
      analytics: {
        title: 'Analytics Cookies',
        description:
          'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us to know which pages are the most and least popular and see how visitors move around the site.',
      },
      functional: {
        title: 'Functional Cookies',
        description:
          'These cookies enable the website to provide enhanced functionality and personalization. They may be set by us or by third-party providers whose services we have added to our pages.',
      },
      marketing: {
        title: 'Marketing Cookies',
        description:
          'These cookies may be set through our site by our advertising partners. They may be used by those companies to build a profile of your interests and show you relevant adverts on other sites.',
      },
    },
    alwaysActive: 'Always Active',
    on: 'On',
    off: 'Off',
  },
  zh: {
    title: '我们重视您的隐私',
    description:
      '我们使用 Cookie 来提升您的浏览体验、提供个性化内容并分析流量。点击"全部接受"即表示您同意我们使用 Cookie。',
    acceptAll: '全部接受',
    rejectAll: '仅保留必要',
    managePreferences: '管理偏好',
    savePreferences: '保存偏好',
    back: '返回',
    categories: {
      essential: {
        title: '必要 Cookie',
        description:
          '这些 Cookie 是网站运行所必需的，无法关闭。它们通常仅在您设置隐私偏好、登录或填写表单等操作时才会设置。',
      },
      analytics: {
        title: '分析类 Cookie',
        description:
          '这些 Cookie 允许我们统计访问量和流量来源，以便衡量和改善网站性能。它们帮助我们了解哪些页面最受欢迎以及访客如何在网站中移动。',
      },
      functional: {
        title: '功能性 Cookie',
        description:
          '这些 Cookie 使网站能够提供增强的功能和个性化设置。它们可能由我们或我们添加到页面中的第三方提供商设置。',
      },
      marketing: {
        title: '营销类 Cookie',
        description:
          '这些 Cookie 可能由我们的广告合作伙伴通过我们的网站设置。这些公司可能会使用它们来建立您的兴趣画像，并在其他网站上向您展示相关广告。',
      },
    },
    alwaysActive: '始终启用',
    on: '开',
    off: '关',
  },
};

type CookieCategory = keyof Omit<CookieConsentData, 'essential'>;

const CATEGORY_META: {
  key: CookieCategory | 'essential';
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'essential', icon: Shield },
  { key: 'analytics', icon: BarChart3 },
  { key: 'functional', icon: Settings },
  { key: 'marketing', icon: Megaphone },
];

export default function CookieConsent() {
  const { language } = useLanguage();
  const t = i18n[language as keyof typeof i18n] || i18n.en;

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [consent, setConsent] = useState<CookieConsentData>(DEFAULT_CONSENT);

  // Read stored consent on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CookieConsentData;
        setConsent(parsed);
        // Already consented — don't show banner
        setVisible(false);
      } else {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
    setMounted(true);
  }, []);

  const saveConsent = useCallback((data: CookieConsentData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setConsent(data);
    setVisible(false);
    setShowPreferences(false);

    // Dispatch custom event so other components can react
    window.dispatchEvent(
      new CustomEvent('cookie-consent-change', { detail: data })
    );
  }, []);

  const handleAcceptAll = useCallback(() => {
    saveConsent({
      essential: true,
      analytics: true,
      functional: true,
      marketing: true,
    });
  }, [saveConsent]);

  const handleRejectAll = useCallback(() => {
    saveConsent({
      essential: true,
      analytics: false,
      functional: false,
      marketing: false,
    });
  }, [saveConsent]);

  const handleSavePreferences = useCallback(() => {
    saveConsent(consent);
  }, [consent, saveConsent]);

  const toggleCategory = useCallback(
    (key: CookieCategory) => {
      setConsent((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  // Don't render during SSR or before mount
  if (!mounted || !visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/10">
        {!showPreferences ? (
          /* ====== Main Banner ====== */
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100">
                <Cookie className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  {t.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  {t.description}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500 sm:mr-auto"
                onClick={() => setShowPreferences(true)}
              >
                {t.managePreferences}
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRejectAll}
                >
                  {t.rejectAll}
                </Button>
                <Button size="sm" onClick={handleAcceptAll}>
                  {t.acceptAll}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ====== Preferences Panel ====== */
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="inline-flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                {t.back}
              </button>
            </div>

            <div className="space-y-4">
              {CATEGORY_META.map(({ key, icon: Icon }) => {
                const isEssential = key === 'essential';
                const isChecked = isEssential ? true : consent[key as CookieCategory];

                return (
                  <div
                    key={key}
                    className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-purple-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                        <Icon className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {t.categories[key].title}
                          </h4>
                          <div className="flex items-center gap-2">
                            {isEssential && (
                              <span className="text-xs font-medium text-purple-600">
                                {t.alwaysActive}
                              </span>
                            )}
                            <Switch
                              checked={isChecked}
                              disabled={isEssential}
                              onCheckedChange={() => {
                                if (!isEssential) {
                                  toggleCategory(key as CookieCategory);
                                }
                              }}
                              className="data-[state=checked]:bg-purple-600"
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          {t.categories[key].description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRejectAll}
              >
                {t.rejectAll}
              </Button>
              <Button size="sm" onClick={handleSavePreferences}>
                {t.savePreferences}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

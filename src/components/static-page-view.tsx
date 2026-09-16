'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { cleanRichText } from '@/lib/utils';

interface StaticPageViewProps {
  slug: string;
  title: string;
  initialContent: string;
}

/**
 * Static policy/info page client view.
 * Server renders the English content into initial HTML (SEO/affiliate review);
 * when the visitor switches language, the translated content is fetched client-side.
 */
export function StaticPageView({ slug, title, initialContent }: StaticPageViewProps) {
  const { language } = useLanguage();
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (language === 'en') {
      setContent(initialContent);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/static-pages?slug=${slug}&language=${language}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.success && d.data?.content) {
          setContent(cleanRichText(d.data.content));
        } else {
          setContent(initialContent);
        }
      })
      .catch(() => { if (!cancelled) setContent(initialContent); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [language, slug, initialContent]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold mb-6">{title}</h1>
          {loading ? (
            <div className="text-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-purple-700 border-t-transparent rounded-full mx-auto mb-4" />
            </div>
          ) : content ? (
            <div
              className="rich-text-content"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <div className="text-gray-500">
              <p>{title} content will be available soon.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

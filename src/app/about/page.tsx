'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { cleanRichText } from '@/lib/utils';

interface StaticPageData {
  id: number;
  slug: string;
  content: string;
}

export default function AboutPage() {
  const { language } = useLanguage();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    setLoading(true);
    fetch(`/api/static-pages?slug=about-us&language=${language}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setContent(cleanRichText(d.data.content || ''));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-6">About Us</h1>
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
            <p>Welcome to VapeDeals360 - your trusted source for vape price comparison and deals.</p>
            <p className="mt-4">We help you find the best prices across multiple vape stores, saving you time and money on e-cigarettes, pod systems, mods, and e-liquids.</p>
          </div>
        )}
      </div>
      </main>

    </div>
  );
}

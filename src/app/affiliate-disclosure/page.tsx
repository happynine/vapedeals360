'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';

export default function AffiliateDisclosurePage() {
  const { language } = useLanguage();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/static-pages?slug=affiliate-disclosure&language=${language}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          if (d.data.content) {
            setContent(d.data.content);
          } else {
            const translations = d.data.static_page_translations || d.data.translations;
            if (translations?.length > 0) {
              setContent(translations[0].content || '');
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-6">Affiliate Disclosure</h1>
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
          <div className="text-gray-500 space-y-4">
            <p><strong>Affiliate Disclosure for VapeDeals360</strong></p>
            <p>At VapeDeals360, we believe in transparency and want to disclose that some of the links on our website are affiliate links. This means that if you click on one of these links and make a purchase, we may receive a small commission at no additional cost to you.</p>
            <p><strong>How We Earn Commissions</strong></p>
            <p>Our website participates in affiliate marketing programs with various vape retailers and online stores. When you click on an affiliate link on our site and make a purchase, we may earn a commission from the retailer. These commissions help us maintain and operate our website, create quality content, and continue providing you with valuable price comparison services.</p>
            <p><strong>Our Commitment to You</strong></p>
            <p>The presence of affiliate links does not influence our product reviews, rankings, or price comparisons. We are committed to providing accurate, unbiased information to help you make informed purchasing decisions. Our editorial content is independent of our affiliate partnerships.</p>
            <p>We always strive to present the best deals and lowest prices available, regardless of whether we earn a commission. Our primary goal is to help you save money on vape products.</p>
            <p><strong>Product Prices and Availability</strong></p>
            <p>While we make every effort to display accurate prices and product availability, prices may change between the time we publish our content and when you visit the retailer&apos;s website. We are not responsible for price discrepancies or product availability changes on third-party sites.</p>
            <p><strong>Affiliate Partners</strong></p>
            <p>Our website may contain affiliate links to, but not limited to, the following types of retailers:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Online vape shops and retailers</li>
              <li>E-cigarette manufacturers</li>
              <li>E-liquid and vape juice brands</li>
              <li>Vape accessory suppliers</li>
            </ul>
            <p><strong>FTC Compliance</strong></p>
            <p>This disclosure is provided in accordance with the Federal Trade Commission&apos;s guidelines on endorsements and testimonials (16 CFR Part 255). We are committed to full compliance with FTC regulations regarding affiliate marketing and sponsored content.</p>
            <p><strong>Your Trust Matters</strong></p>
            <p>We value your trust and are committed to maintaining the highest standards of integrity in our affiliate relationships. If you have any questions about our affiliate partnerships or this disclosure, please do not hesitate to <Link href="/contact" className="text-purple-700 hover:underline">contact us</Link>.</p>
          </div>
        )}
      </div>
      </main>

    </div>
  );
}

export const dynamic = 'force-dynamic';

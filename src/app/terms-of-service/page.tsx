'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';

export default function TermsOfServicePage() {
  const { language } = useLanguage();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/static-pages?slug=terms-of-service&language=${language}`)
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
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
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
            <p><strong>Terms of Service for VapeDeals360</strong></p>
            <p>Welcome to VapeDeals360. By accessing and using this website, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use our website.</p>
            <p><strong>1. Acceptance of Terms</strong></p>
            <p>By accessing or using the VapeDeals360 website, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service, as well as our Privacy Policy and Affiliate Disclosure.</p>
            <p><strong>2. Age Requirement</strong></p>
            <p>You must be at least 21 years of age to use this website. By using this site, you represent and warrant that you are at least 21 years old and of legal age to purchase tobacco and nicotine products in your jurisdiction.</p>
            <p><strong>3. Use of the Website</strong></p>
            <p>You agree to use our website only for lawful purposes and in accordance with these Terms. You are responsible for ensuring that your use of the website complies with all applicable laws and regulations.</p>
            <p><strong>4. Price Information</strong></p>
            <p>While we strive to provide accurate and up-to-date pricing information, we do not guarantee the accuracy, completeness, or reliability of any price data displayed on our website. Prices are subject to change without notice, and we are not responsible for any discrepancies between the prices shown on our site and the actual prices charged by retailers.</p>
            <p><strong>5. Affiliate Links and Third-Party Websites</strong></p>
            <p>Our website may contain affiliate links to third-party retailers. We are not responsible for the content, privacy practices, or terms of service of these third-party websites. Your interactions with third-party retailers are governed solely by their own terms and conditions.</p>
            <p><strong>6. Product Information</strong></p>
            <p>Product descriptions, specifications, and images are provided for informational purposes only. We do not manufacture, sell, or distribute any products listed on our website. All product-related inquiries, including warranty claims and returns, should be directed to the respective retailer or manufacturer.</p>
            <p><strong>7. Intellectual Property</strong></p>
            <p>All content on this website, including but not limited to text, graphics, logos, and images, is the property of VapeDeals360 or its content suppliers and is protected by intellectual property laws. You may not reproduce, distribute, or modify any content without our prior written consent.</p>
            <p><strong>8. Limitation of Liability</strong></p>
            <p>To the fullest extent permitted by law, VapeDeals360 shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the website.</p>
            <p><strong>9. Disclaimer of Warranties</strong></p>
            <p>The website is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied. We do not warrant that the website will be uninterrupted, error-free, or free of viruses.</p>
            <p><strong>10. Changes to Terms</strong></p>
            <p>We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting on the website. Your continued use of the website following any changes constitutes your acceptance of the new terms.</p>
            <p><strong>11. Governing Law</strong></p>
            <p>These Terms of Service shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</p>
            <p><strong>12. Contact Us</strong></p>
            <p>If you have any questions about these Terms of Service, please <Link href="/contact" className="text-purple-700 hover:underline">contact us</Link>.</p>
          </div>
        )}
      </div>
      </main>

    </div>
  );
}

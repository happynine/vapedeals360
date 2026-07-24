'use client';

import Link from 'next/link';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';
import { useSocialLinks } from '@/hooks/use-social-links';

export default function SiteFooter() {
  const { language } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const { socialLinks, getSocialIcon } = useSocialLinks();

  return (
    <>
      {/* Footer Navigation */}
      <footer className="bg-[#0a0a0e] border-t border-gray-800 mt-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {/* Contact Column */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                {siteSettings?.logo_url ? (
                  <img
                    src={siteSettings.logo_url.startsWith('http') ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                    alt={siteSettings.site_name}
                    className="h-10 w-10 rounded-md object-contain"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-base">
                    {siteSettings?.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}
                  </div>
                )}
                <span className="text-xl font-bold text-white">{siteSettings?.site_name || '\u00A0'}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-4 max-w-xs">
                {language === 'zh'
                  ? 'VapeDeals360 电子烟价格比价平台，致力于帮助成年电子烟用户找到最优惠的购买方案'
                  : 'Helping adult vapers find the best deals. We track prices across trusted retailers, compare offers in real time.'}
              </p>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">
                Email: info@vapedeals360.com
              </a>
              {socialLinks.length > 0 && (
                <div className="flex items-center gap-3">
                  {socialLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      title={link.platform}
                    >
                      {getSocialIcon(link.platform)}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {/* Navigation Column */}
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
              </div>
            </div>
            {/* About Column */}
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
              <div className="flex flex-col gap-2">
                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
                <Link href="/disclaimer" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Disclaimer</Link>
                <Link href="/affiliate-disclosure" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Affiliate Disclosure</Link>
                <Link href="/terms-of-service" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Terms of Service</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* FDA & NIXODINE Disclaimer */}
      <div className="bg-[#0a0a0e] border-t border-gray-800 py-8">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-2">FDA Disclaimer</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              The statements made regarding these products have not been evaluated by the Food and Drug Administration. The efficacy of these products has not been confirmed by FDA-approved research. These products are not intended to diagnose, treat, cure or prevent any disease. All information presented here is not meant as a substitute for or alternative to information from health care practitioners. Please consult your health care professional about potential interactions or other possible complications before using any product. The Federal Food, Drug, and Cosmetic Act requires this notice.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-2">NIXODINE DISCLAIMER</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Nixodine products contain nicotine which is a highly addictive substance. This product is intended for use by adults over the age of 21. It is not intended for use by women who are pregnant or breastfeeding, or persons with or at risk of heart disease, high blood pressure, diabetes, or taking medicine for depression or asthma. Keep out of reach of children and pets. Ingestion of the non-vaporized concentrated ingredients in the liquid can be poisonous. If you are a smoker, quitting smoking is the best thing you can do to improve your health.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-2">CALIFORNIA PROPOSITION 65 WARNING</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              This product can expose you to chemicals including nicotine, which is known to the State of California to cause birth defects or other reproductive harm, and which is known to the State of California to cause cancer. For more information, go to www.P65Warnings.ca.gov.
            </p>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="bg-[#0a0a0e] border-t border-gray-800 py-6 text-center text-xs text-gray-500">
        21+ ONLY | © Vapedeals360.com All Rights Reserved.
      </div>
    </>
  );
}

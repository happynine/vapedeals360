import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { SiteSettingsProvider } from '@/components/site-settings-provider';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import FrontendWrapper from '@/components/frontend-wrapper';

export const metadata: Metadata = {
  title: {
    default: 'VapeDeals360 - Best Vape Deals & Price Comparison',
    template: '%s | VapeDeals360',
  },
  description: 'Find the best vape deals. Compare prices across multiple stores and save big on e-cigarettes, pod systems, mods, and e-liquids.',
  keywords: ['vape deals', 'vape price comparison', 'e-cigarette deals', 'pod system', 'vape mods', 'e-liquid'],
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics (GA4) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-7EL5HGNE98"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7EL5HGNE98');
          `}
        </Script>
      </head>
      <body className="min-h-screen antialiased">
        <SupabaseConfigProvider>
          <SiteSettingsProvider>
            <FrontendWrapper>{children}</FrontendWrapper>
          </SiteSettingsProvider>
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}

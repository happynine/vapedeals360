import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { SiteSettingsProvider } from '@/components/site-settings-provider';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import FrontendWrapper from '@/components/frontend-wrapper';

const SITE_URL = 'https://www.vapedeals360.com';
const SITE_NAME = 'VapeDeals360';
const DEFAULT_DESC =
  'Find the best vape deals. Compare prices across multiple stores and save big on e-cigarettes, pod systems, mods, and e-liquids.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'VapeDeals360 - Best Vape Deals & Price Comparison',
    template: '%s | VapeDeals360',
  },
  description: DEFAULT_DESC,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'VapeDeals360 - Best Vape Deals & Price Comparison',
    description: DEFAULT_DESC,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VapeDeals360 - Best Vape Deals & Price Comparison',
    description: DEFAULT_DESC,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

// Site-wide structured data: organization identity + website with sitelinks
// search box. Page-specific schemas (Product, Article) are added per route.
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.ico`,
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          type="application/ld+json"
          id="ld-organization"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <Script
          type="application/ld+json"
          id="ld-website"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
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

import type { Metadata } from 'next';
import './globals.css';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';
import { SiteSettingsProvider } from '@/components/site-settings-provider';


async function getSiteLogo(): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('logo_url')
      .limit(1)
      .maybeSingle();

    if (error || !data?.logo_url) return null;
    return getPresignedUrl(data.logo_url);
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await getSiteLogo();

  return {
    title: {
      default: 'VapeDeal - Best Vape Deals & Price Comparison',
      template: '%s | VapeDeal',
    },
    description: 'Find the best vape deals. Compare prices across multiple stores and save big on e-cigarettes, pod systems, mods, and e-liquids.',
    keywords: ['vape deals', 'vape price comparison', 'e-cigarette deals', 'pod system', 'vape mods', 'e-liquid'],
    icons: logoUrl ? [{ url: logoUrl, type: 'image/png' }] : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SiteSettingsProvider>
          <div className="bg-yellow-500 text-center py-1.5 px-4 text-xs font-bold text-black tracking-wide">
            WARNING: This product contains nicotine. Nicotine is an addictive chemical.
          </div>
          <div className="flex flex-col min-h-[calc(100vh-30px)]">
            <div className="flex-1">{children}</div>
            <div className="bg-[#0a0a0e] text-center py-4 px-4 text-xs text-gray-400">
              ©Vapedeals360.com All Rights Reserved.
            </div>
          </div>
        </SiteSettingsProvider>
      </body>
    </html>
  );
}

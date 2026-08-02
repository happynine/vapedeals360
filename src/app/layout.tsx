文件已生成。去 GitHub 把 src/app/layout.tsx 的内容替换为下面的完整代码：

tsx
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { SiteSettingsProvider } from '@/components/site-settings-provider';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import FrontendWrapper from '@/components/frontend-wrapper';
export const metadata: Metadata = {
  title: {
    default: 'VapeDeal360 - Best Vape Deals & Price Comparison',
    template: '%s | VapeDeal360',
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

改动说明：

新增 import Script from 'next/script'
在 <head> 中添加了 GA4 的两段脚本
使用 strategy="afterInteractive" 确保不影响页面加载速度

替换后提交，Vercel 部署完成就生效了。

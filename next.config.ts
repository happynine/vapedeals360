import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ['*.dev.coze.site'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    dangerouslyAllowSVG: true,
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // 缓存 headers 配置 - 让 Cloudflare 和 Vercel 边缘可以缓存
  async headers() {
    return [
      {
        // Admin 页面需要 SharedArrayBuffer（裁图上传），加跨域隔离头
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
        ],
      },
      {
        // HTML 页面 - ISR 缓存 60 秒
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=300',
          },
        ],
      },
      {
        // 静态资源（JS, CSS, 图片等） - 长期缓存
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // public 目录下的静态资源
        source: '/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // API routes - 不缓存（动态数据）
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

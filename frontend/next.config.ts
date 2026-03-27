import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const apiBaseUrl = (
  process.env.API_BASE_URL
  || process.env.NEXT_PUBLIC_API_BASE_URL
  || 'http://localhost:8000'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${apiBaseUrl}/auth/:path*`,
      },
      {
        source: '/health',
        destination: `${apiBaseUrl}/health`,
      },
      {
        source: '/ready',
        destination: `${apiBaseUrl}/ready`,
      },
      {
        source: '/metrics',
        destination: `${apiBaseUrl}/metrics`,
      },
      {
        source: '/ws/:path*',
        destination: `${apiBaseUrl}/ws/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);

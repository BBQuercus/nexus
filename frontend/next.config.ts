import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return {
      // beforeFiles rewrites are checked before pages/public files
      // We want /auth/callback to serve the Next.js page, NOT proxy to backend
      beforeFiles: [],
      // afterFiles rewrites are checked after pages but before fallback
      afterFiles: [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
        {
          source: '/auth/login',
          destination: 'http://localhost:8000/auth/login',
        },
        {
          source: '/auth/logout',
          destination: 'http://localhost:8000/auth/logout',
        },
        {
          source: '/auth/me',
          destination: 'http://localhost:8000/auth/me',
        },
        {
          source: '/ws/:path*',
          destination: 'http://localhost:8000/ws/:path*',
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;

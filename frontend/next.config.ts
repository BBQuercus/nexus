import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    if (!backendUrl) return [];
    return [
      {
        source: '/auth/login',
        destination: `${backendUrl}/auth/login`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

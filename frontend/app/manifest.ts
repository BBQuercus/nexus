import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Artifact Nexus',
    short_name: 'Nexus',
    description: 'AI-powered workspace with sandboxed code execution',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0F14',
    theme_color: '#0B0F14',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/favicon.ico',
        sizes: '64x64',
        type: 'image/svg+xml',
      },
    ],
  };
}

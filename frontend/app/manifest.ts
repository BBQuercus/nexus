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
    orientation: 'any',
    categories: ['productivity', 'developer tools'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

import type { MetadataRoute } from 'next';

const BASE_URL = 'https://nexus.example.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
    },
  ];
}

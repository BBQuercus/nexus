import type { MetadataRoute } from 'next';

const BASE_URL = 'https://artifact-nexus.up.railway.app';

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

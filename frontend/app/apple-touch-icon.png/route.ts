import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function GET() {
  const iconPath = join(process.cwd(), 'app', 'icon.svg');
  const icon = await readFile(iconPath, 'utf8');

  return new Response(icon, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

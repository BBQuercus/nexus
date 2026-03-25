import type { Metadata, Viewport } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
import { SkipNav } from '@/components/accessibility';

export const metadata: Metadata = {
  title: 'Nexus',
  description: 'AI-powered workspace with sandboxed code execution',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-hidden">
        <SkipNav />
        {children}
      </body>
    </html>
  );
}

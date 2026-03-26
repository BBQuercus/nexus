import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SkipNav } from '@/components/accessibility';
import AuthProvider from '@/components/auth-provider';
import OfflineBanner from '@/components/offline-banner';
import QueryProvider from '@/components/query-provider';
import { ServiceWorkerRegister } from '@/components/sw-register';

export const metadata: Metadata = {
  title: 'Nexus',
  description: 'AI-powered workspace with sandboxed code execution',
  icons: {
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nexus',
  },
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
        <ServiceWorkerRegister />
        <OfflineBanner />
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

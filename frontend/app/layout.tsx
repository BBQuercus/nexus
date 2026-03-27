import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { SkipNav } from '@/components/accessibility';
import AuthProvider from '@/components/auth-provider';
import OfflineBanner from '@/components/offline-banner';
import QueryProvider from '@/components/query-provider';
import { ServiceWorkerRegister } from '@/components/sw-register';
import ThemeProvider from '@/components/theme-provider';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="h-dvh overflow-hidden">
        <NextIntlClientProvider messages={messages}>
          <SkipNav />
          <ServiceWorkerRegister />
          <OfflineBanner />
          <QueryProvider>
            <AuthProvider>
              <ThemeProvider />
              {children}
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

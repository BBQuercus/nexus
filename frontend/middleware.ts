import { NextRequest, NextResponse } from 'next/server';
import { defaultLocale, locales, type Locale } from './i18n/config';

function parseAcceptLanguage(header: string): Locale | undefined {
  const parts = header.split(',');
  for (const part of parts) {
    const lang = part.split(';')[0].trim().split('-')[0].toLowerCase();
    if (locales.includes(lang as Locale)) {
      return lang as Locale;
    }
  }
  return undefined;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes, auth, static files, etc.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/ws/') ||
    pathname.startsWith('/health') ||
    pathname.startsWith('/ready') ||
    pathname.startsWith('/metrics') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // If no locale cookie is set, detect from Accept-Language and set cookie
  const localeCookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (!localeCookie || !locales.includes(localeCookie as Locale)) {
    const acceptLang = request.headers.get('accept-language') || '';
    const detected = parseAcceptLanguage(acceptLang) ?? defaultLocale;
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', detected, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 1 year
      sameSite: 'lax',
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png).*)'],
};

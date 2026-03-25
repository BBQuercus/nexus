import { NextResponse } from 'next/server';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getBackendUrl(): string | null {
  const configured = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) return null;
  return trimTrailingSlash(configured);
}

export async function GET(request: Request) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.redirect(`${backendUrl}/auth/login`);
}

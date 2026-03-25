import { test, expect } from '@playwright/test';

/**
 * Smoke tests for critical Nexus user journeys.
 *
 * These require a running frontend (and optionally backend) at E2E_BASE_URL.
 * Run with: npx playwright test
 *
 * For CI, set E2E_BASE_URL to the deployed staging/production URL.
 * For local dev: npm run dev, then npx playwright test
 */

test.describe('App loads', () => {
  test('login page renders without errors', async ({ page }) => {
    await page.goto('/login');
    // Should show login form or auth options
    await expect(page.locator('body')).toBeVisible();
    // No uncaught errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('unauthenticated root redirects to login', async ({ page }) => {
    await page.goto('/');
    // Should redirect to login or show auth screen
    await page.waitForURL(/\/(login)?/, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('manifest is valid JSON', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons).toBeDefined();
    expect(manifest.display).toBe('standalone');
  });
});

test.describe('Backend health', () => {
  test('/ready returns 200', async ({ request }) => {
    const apiBase = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase) {
      test.skip();
      return;
    }
    const response = await request.get(`${apiBase}/ready`);
    expect(response.ok()).toBeTruthy();
  });

  test('/health returns 200 with status', async ({ request }) => {
    const apiBase = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase) {
      test.skip();
      return;
    }
    const response = await request.get(`${apiBase}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBeDefined();
  });

  test('/metrics returns prometheus metrics', async ({ request }) => {
    const apiBase = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase) {
      test.skip();
      return;
    }
    const response = await request.get(`${apiBase}/metrics`);
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toContain('nexus_http_requests_total');
  });
});

test.describe('Auth flow', () => {
  test('login page has auth options', async ({ page }) => {
    await page.goto('/login');
    // Should have some form of login (OAuth buttons, email/password form, etc.)
    const body = await page.textContent('body');
    const hasAuthElements =
      body?.includes('Sign in') ||
      body?.includes('Log in') ||
      body?.includes('Login') ||
      body?.includes('Microsoft') ||
      body?.includes('GitHub') ||
      body?.includes('Email') ||
      body?.includes('password');
    expect(hasAuthElements).toBeTruthy();
  });
});

test.describe('Static assets', () => {
  test('favicon/icon loads', async ({ request }) => {
    const response = await request.get('/icon.svg');
    expect(response.ok()).toBeTruthy();
  });

  test('service worker is served', async ({ request }) => {
    const response = await request.get('/sw.js');
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toContain('CACHE_NAME');
  });
});

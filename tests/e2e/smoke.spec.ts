import { test, expect } from '@playwright/test';

/**
 * Smoke tests — exercise the most common flows so we catch the obvious
 * regressions before agents do. Not exhaustive; covers:
 *
 *   1. login → land on dashboard
 *   2. agent dashboard renders
 *   3. clients list renders
 *   4. global search returns hits
 *   5. wrong password is rejected
 *   6. unauthenticated request gets bounced to /login
 */

const AGENT = { email: 'agent@team.local', password: 'Agent@1234' };
const ADMIN = { email: 'admin@team.local', password: 'Admin@1234' };

async function login(page: import('@playwright/test').Page, who: { email: string; password: string }) {
  await page.goto('/login');
  // Login form's labels aren't htmlFor-bound — use input type/role instead
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: /登入/ }).click();
}

test('agent can log in and see the dashboard', async ({ page }) => {
  await login(page, AGENT);
  await page.waitForURL(/\/(?:$|\?)/);  // root
  await expect(page.getByRole('heading', { name: '主頁' })).toBeVisible();
});

test('clients list renders for agent', async ({ page }) => {
  await login(page, AGENT);
  // Wait for the post-login navigation to settle before requesting /clients
  await page.waitForURL(/^http:\/\/localhost:3000\/(\?.*)?$/, { timeout: 10000 });
  await page.goto('/clients');
  await page.waitForURL('**/clients', { timeout: 10000 });
  await expect(page.locator('h1', { hasText: '我的客戶' })).toBeVisible({ timeout: 10000 });
});

test('global search returns the seeded client', async ({ page, request }) => {
  // Login via the API, then call /api/search with the cookie
  const res = await request.post('/api/auth/login', { data: AGENT });
  expect(res.ok()).toBeTruthy();
  const search = await request.get('/api/search?q=' + encodeURIComponent('陳家'));
  expect(search.ok()).toBeTruthy();
  const json = await search.json();
  expect(json.hits.length).toBeGreaterThan(0);
  expect(json.hits.some((h: { kind: string }) => h.kind === 'client')).toBeTruthy();
});

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(AGENT.email);
  await page.locator('input[type="password"]').fill('definitely-not-the-password');
  await page.getByRole('button', { name: /登入/ }).click();
  await expect(page.getByText(/帳號或密碼錯誤/)).toBeVisible();
});

test('unauthenticated request is redirected to /login', async ({ request }) => {
  const res = await request.get('/clients', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()['location']).toContain('/login');
});

test('admin gets 403 from non-admin route check', async ({ request }) => {
  await request.post('/api/auth/login', { data: AGENT });
  const res = await request.get('/api/admin/users');
  expect(res.status()).toBe(403);

  await request.post('/api/auth/login', { data: ADMIN });
  const ok = await request.get('/api/admin/users');
  expect(ok.ok()).toBeTruthy();
});

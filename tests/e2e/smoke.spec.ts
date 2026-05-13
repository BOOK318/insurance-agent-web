import { test, expect } from '@playwright/test';

/**
 * Smoke tests — exercise the most common flows so we catch the obvious
 * regressions before agents do. Not exhaustive; covers:
 *
 *   1. login → land on dashboard
 *   2. agent dashboard renders
 *   3. clients list renders
 *   4. dashboard search opens the global search page
 *   5. global search returns hits
 *   6. push settings can read and use VAPID config
 *   7. transcribe rejects browser-compressed audio before Whisper
 *   8. wrong password is rejected
 *   9. unauthenticated request gets bounced to /login
 */

const AGENT = { email: 'agent@team.local', password: 'Agent@1234' };
const ADMIN = { email: 'admin@team.local', password: 'Admin@1234' };

test.beforeAll(async ({ request }) => {
  const adminLogin = await request.post('/api/auth/login', { data: ADMIN });
  expect(adminLogin.ok()).toBeTruthy();

  const usersRes = await request.get('/api/admin/users');
  expect(usersRes.ok()).toBeTruthy();
  const users = await usersRes.json() as Array<{ id: string; email: string; is_active: boolean }>;
  const existingAgent = users.find(user => user.email === AGENT.email);

  if (existingAgent) {
    const patch = await request.patch('/api/admin/users', {
      data: { id: existingAgent.id, password: AGENT.password, is_active: true },
    });
    expect(patch.ok()).toBeTruthy();
  } else {
    const create = await request.post('/api/admin/users', {
      data: {
        name: '測試 Agent',
        email: AGENT.email,
        role: 'agent',
        password: AGENT.password,
      },
    });
    expect(create.ok()).toBeTruthy();
  }

  await request.post('/api/auth/login', { data: AGENT });
  const existingClients = await request.get('/api/clients?q=' + encodeURIComponent('陳家'));
  expect(existingClients.ok()).toBeTruthy();
  const clients = await existingClients.json() as Array<{ id: string }>;
  if (clients.length === 0) {
    const createClient = await request.post('/api/clients', {
      data: {
        name_zh: '陳家俊',
        name_en: 'Ka Chun Chan',
        phone: '+852 9123 4567',
        email: 'kachun.chan@example.com',
        occupation: '金融分析師',
        annual_income: 850000,
        family_notes: '已婚，育有兩名子女。',
      },
    });
    expect(createClient.ok()).toBeTruthy();
  }
});

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
  await page.getByRole('link', { name: '設定' }).click();
  await page.waitForURL('**/settings', { timeout: 10000 });
  await expect(page.getByRole('heading', { name: '通知設定' })).toBeVisible();
});

test('clients list renders for agent', async ({ page }) => {
  await login(page, AGENT);
  // Wait for the post-login navigation to settle before requesting /clients
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });
  await page.goto('/clients');
  await page.waitForURL('**/clients', { timeout: 10000 });
  await expect(page.locator('h1', { hasText: '我的客戶' })).toBeVisible({ timeout: 10000 });
});

test('agent can search from the dashboard shortcut', async ({ page }) => {
  await login(page, AGENT);
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });
  await page.getByLabel('主頁快速搜尋').fill('陳家');
  await page.getByRole('button', { name: '搜尋' }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole('heading', { name: '搜尋' })).toBeVisible();
  await expect(page.getByLabel('搜尋關鍵字')).toHaveValue('陳家');
  await expect(page.getByText('陳家俊')).toBeVisible();
});

test('search page has a back button to the dashboard', async ({ page }) => {
  await login(page, AGENT);
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });
  await page.goto('/search?q=' + encodeURIComponent('陳家'));
  await page.getByRole('link', { name: '返回主頁' }).click();
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });
  await expect(page.getByRole('heading', { name: '主頁' })).toBeVisible();
});

test('mobile bottom navigation does not include search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, AGENT);
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });
  const mobileNav = page.getByRole('navigation', { name: '手機主導航' });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: /搜尋/ })).toHaveCount(0);
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

test('push settings can read the runtime VAPID public key', async ({ request }) => {
  const loginRes = await request.post('/api/auth/login', { data: AGENT });
  expect(loginRes.ok()).toBeTruthy();
  const res = await request.get('/api/push/public-key');
  expect(res.ok()).toBeTruthy();
  const json = await res.json() as { publicKey?: string };
  expect(json.publicKey).toBeTruthy();
});

test('push test endpoint accepts the configured VAPID key pair', async ({ request }) => {
  const loginRes = await request.post('/api/auth/login', { data: AGENT });
  expect(loginRes.ok()).toBeTruthy();
  const res = await request.post('/api/push/test');
  expect(res.ok()).toBeTruthy();
  const json = await res.json() as { sent?: number };
  expect(typeof json.sent).toBe('number');
});

test('transcribe rejects browser-compressed audio before Whisper', async ({ request }) => {
  const loginRes = await request.post('/api/auth/login', { data: AGENT });
  expect(loginRes.ok()).toBeTruthy();
  const res = await request.post('/api/transcribe', {
    multipart: {
      audio: {
        name: 'recording.m4a',
        mimeType: 'audio/mp4',
        buffer: Buffer.from([0, 1, 2, 3]),
      },
    },
  });
  expect(res.status()).toBe(400);
  const json = await res.json() as { error?: string };
  expect(json.error).toContain('WAV');
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

test('admin mobile pages expose main navigation links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, ADMIN);
  await page.waitForURL('**/head', { timeout: 10000 });
  await page.goto('/admin/users');

  await expect(page.getByRole('link', { name: '主頁' })).toBeVisible();
  await expect(page.getByRole('link', { name: '客戶' })).toBeVisible();
  await expect(page.getByRole('link', { name: '保單' })).toBeVisible();
  await expect(page.getByRole('link', { name: '業績' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AI知識' })).toBeVisible();
});

test('admin settings no longer exposes Anthropic API key editing', async ({ page }) => {
  await login(page, ADMIN);
  await page.waitForURL('**/head', { timeout: 10000 });
  await page.goto('/admin/settings');

  await expect(page.getByRole('heading', { name: '系統設定' })).toBeVisible();
  await expect(page.getByText('Anthropic API Key')).toHaveCount(0);
  await expect(page.getByPlaceholder('sk-ant-…')).toHaveCount(0);
});

test('admin can delete a user and recreate the same email', async ({ request }) => {
  await request.post('/api/auth/login', { data: ADMIN });
  const email = `delete-recreate-${Date.now()}@team.local`;
  const payload = {
    name: 'Delete Recreate',
    email,
    role: 'agent',
    password: 'Agent@1234',
  };

  const create = await request.post('/api/admin/users', { data: payload });
  expect(create.ok()).toBeTruthy();
  const created = await create.json() as { id: string };

  const del = await request.delete(`/api/admin/users?id=${created.id}`);
  expect(del.ok()).toBeTruthy();

  const recreate = await request.post('/api/admin/users', { data: payload });
  expect(recreate.ok()).toBeTruthy();
  const recreated = await recreate.json() as { id: string };

  await request.delete(`/api/admin/users?id=${recreated.id}`);
});

test('admin can add and delete AI sales knowledge', async ({ request }) => {
  await request.post('/api/auth/login', { data: ADMIN });
  const title = `測試銷售話術 ${Date.now()}`;
  const content = '如果客戶話其他公司回報較好，先認同客戶重視回報，再引導比較公司背景、公信力、保證及非保證部分，所有數字以最新核准材料為準。';

  const create = await request.post('/api/admin/knowledge', {
    data: {
      company: 'BOC Life',
      title,
      content,
    },
  });
  expect(create.ok()).toBeTruthy();
  const created = await create.json() as { id: string };

  const list = await request.get('/api/admin/knowledge');
  expect(list.ok()).toBeTruthy();
  const rows = await list.json() as Array<{ id: string; title: string; content: string; is_active: boolean }>;
  expect(rows.some(row => row.id === created.id && row.title === title && row.content.includes('公信力'))).toBeTruthy();

  const disable = await request.patch('/api/admin/knowledge', {
    data: { id: created.id, is_active: false },
  });
  expect(disable.ok()).toBeTruthy();

  const del = await request.delete(`/api/admin/knowledge?id=${created.id}`);
  expect(del.ok()).toBeTruthy();
});

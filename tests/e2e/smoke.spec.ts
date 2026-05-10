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

test('client voice recording releases the microphone when leaving the page', async ({ page }) => {
  await page.addInitScript(() => {
    const increment = (key: string) => {
      localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? '0') + 1));
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => increment('mockTracksStopped') }],
        }),
      },
    });

    class MockAudioContext {
      sampleRate = 16000;
      destination = {};
      resume() { return Promise.resolve(); }
      close() { increment('mockAudioClosed'); return Promise.resolve(); }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createScriptProcessor() {
        return { onaudioprocess: null, connect() {}, disconnect() {} };
      }
      createGain() {
        return { gain: { value: 1 }, connect() {}, disconnect() {} };
      }
    }

    Object.defineProperty(window, 'AudioContext', { configurable: true, value: MockAudioContext });
  });

  await login(page, AGENT);
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });
  await page.goto('/clients/new');
  await page.getByRole('button', { name: '語音輸入' }).click();
  await expect(page.getByText('本地錄音中…')).toBeVisible();
  await page.getByRole('link', { name: '主頁' }).click();
  await page.waitForURL(/\/(?:$|\?)/, { timeout: 10000 });

  const cleanupState = await page.evaluate(() => ({
    audioClosed: Number(localStorage.getItem('mockAudioClosed') ?? '0'),
    tracksStopped: Number(localStorage.getItem('mockTracksStopped') ?? '0'),
  }));
  expect(cleanupState.audioClosed).toBe(1);
  expect(cleanupState.tracksStopped).toBe(1);
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

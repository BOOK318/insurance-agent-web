/**
 * Reminders worker — runs as a separate Node process. Polls every minute:
 *   1. reminders rows where remind_at <= now() AND pushed_at IS NULL → push, mark pushed
 *   2. policies with active status, expiry_date in 30/14/7/1 days → push once
 *
 * Run locally:
 *   npm run worker
 *
 * In production: add as a sidecar service in docker-compose.prod.yml.
 *
 * The worker reads .env.local (dev) or container env (prod). It owns its own
 * pg pool and webpush instance — no Next.js runtime needed.
 */

import 'dotenv/config';
import { config as dotenv } from 'dotenv';
import pg from 'pg';
import webpush from 'web-push';

// In dev, also load .env.local explicitly (Node doesn't read it otherwise).
dotenv({ path: '.env.local' });

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@team.local';
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 60_000);

if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
if (!PUBLIC_KEY || !PRIVATE_KEY) {
  console.error('VAPID keys not set'); process.exit(1);
}

webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
const pool = new Pool({ connectionString: DATABASE_URL });

async function getSubscriptions(userId) {
  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  return rows;
}

async function sendToUser(userId, payload) {
  const subs = await getSubscriptions(userId);
  const json = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json
      );
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {});
      } else {
        console.error('[worker] push send error', code, err?.body ?? err?.message);
      }
    }
  }
  return subs.length;
}

async function processDueReminders() {
  const { rows } = await pool.query(
    `SELECT r.id, r.agent_id, r.title, r.message, r.client_id,
            c.name_zh, c.name_en
     FROM reminders r
     LEFT JOIN clients c ON c.id = r.client_id AND c.deleted_at IS NULL
     WHERE r.remind_at <= NOW()
       AND r.pushed_at IS NULL
     ORDER BY r.remind_at ASC
     LIMIT 50`
  );

  for (const r of rows) {
    const clientName = r.name_zh ?? r.name_en;
    const body = clientName ? `${clientName} · ${r.message ?? r.title}` : (r.message ?? r.title);
    await sendToUser(r.agent_id, {
      title: r.title,
      body,
      url: r.client_id ? `/clients/${r.client_id}` : '/reminders',
      tag: 'reminder-' + r.id,
    });
    await pool.query('UPDATE reminders SET pushed_at = NOW() WHERE id = $1', [r.id]);
    if (rows.length > 0) console.log(`[worker] pushed reminder ${r.id} to agent ${r.agent_id}`);
  }
}

/**
 * Auto-create reminders for policies expiring in 30 / 7 / 1 days. We dedupe
 * by writing a sentinel reminder per (policy, threshold) — if it already
 * exists we skip. This way the worker is idempotent and re-running it
 * doesn't double-fire.
 */
async function scheduleExpiringPolicies() {
  const thresholds = [30, 7, 1]; // days out
  for (const days of thresholds) {
    await pool.query(
      `INSERT INTO reminders (agent_id, client_id, type, title, message, remind_at)
       SELECT p.agent_id, p.client_id, 'renewal',
              '保單到期提醒',
              CONCAT(
                COALESCE(p.product_name, p.type),
                ' · ',
                COALESCE(c.name_zh, c.name_en, '客戶'),
                ' · ',
                $1::int, ' 日後到期'
              ),
              NOW()
       FROM policies p
       JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND p.status = 'active'
         AND p.expiry_date IS NOT NULL
         AND p.expiry_date::date = (NOW() + ($1::int || ' days')::interval)::date
         AND NOT EXISTS (
           SELECT 1 FROM reminders r
           WHERE r.client_id = p.client_id
             AND r.type = 'renewal'
             AND r.title = '保單到期提醒'
             AND r.message LIKE CONCAT('%', $1::int, ' 日後到期%')
         )`,
      [days]
    );
  }
}

async function tick() {
  try {
    await scheduleExpiringPolicies();
    await processDueReminders();
  } catch (err) {
    console.error('[worker] tick error', err);
  }
}

console.log(`[worker] starting — polling every ${POLL_MS / 1000}s`);
await tick();
setInterval(tick, POLL_MS);

import webpush from 'web-push';
import { db } from './db';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@team.local';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys missing — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Send to every subscription belonging to a user. Removes dead subscriptions. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensureConfigured();
  const { rows } = await db.query<Subscription>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  const json = JSON.stringify(payload);
  let sent = 0;
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json
      );
      sent++;
      await db.query(
        'UPDATE push_subscriptions SET last_used = NOW() WHERE id = $1',
        [sub.id]
      ).catch(() => {});
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // 404 / 410 = subscription is gone (browser revoked, app uninstalled)
      if (code === 404 || code === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
      } else {
        console.error('[push] send error', code, err);
      }
    }
  }
  return sent;
}

/** Broadcast to every active user with a given role (or everyone). */
export async function sendPushToRole(role: 'agent' | 'head' | 'admin' | 'all', payload: PushPayload) {
  const sql = role === 'all'
    ? 'SELECT id FROM users WHERE is_active = TRUE'
    : 'SELECT id FROM users WHERE is_active = TRUE AND role = $1';
  const params = role === 'all' ? [] : [role];
  const { rows } = await db.query<{ id: string }>(sql, params);
  let total = 0;
  for (const u of rows) total += await sendPushToUser(u.id, payload);
  return total;
}

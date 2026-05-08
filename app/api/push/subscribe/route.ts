import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

export const runtime = 'nodejs';

type SubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<SubscribeBody>;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }

  const ua = req.headers.get('user-agent')?.slice(0, 250) ?? null;
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
    [user.id, body.endpoint, body.keys.p256dh, body.keys.auth, ua]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body?.endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  }
  await db.query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [user.id, body.endpoint]
  );
  return NextResponse.json({ ok: true });
}

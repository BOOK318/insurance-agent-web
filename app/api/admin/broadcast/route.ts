import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { sendPushToRole } from '../../../../lib/push';

export const runtime = 'nodejs';

const ROLES = new Set(['agent', 'head', 'admin', 'all']);

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.body === 'string' ? body.body.trim() : '';
  const role = typeof body.role === 'string' ? body.role : 'all';
  const url = typeof body.url === 'string' ? body.url : '/';

  if (!title || !message) {
    return NextResponse.json({ error: 'title 同 body 都唔可以空' }, { status: 400 });
  }
  if (!ROLES.has(role)) {
    return NextResponse.json({ error: 'role 不正確' }, { status: 400 });
  }

  const sent = await sendPushToRole(role as 'agent' | 'head' | 'admin' | 'all', {
    title,
    body: message,
    url,
    tag: 'admin-broadcast',
  });
  return NextResponse.json({ ok: true, sent });
}

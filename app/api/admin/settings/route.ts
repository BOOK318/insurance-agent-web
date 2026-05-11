import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { setSetting } from '../../../../lib/settings';
import { db } from '../../../../lib/db';
import { writeAuditLog } from '../../../../lib/audit';
import { getClientIp } from '../../../../lib/security';

const ALLOWED_KEYS = new Set(['ANTHROPIC_API_KEY']);

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { key, value } = (await req.json()) as { key: string; value: string };
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  // Whitelist what admins are allowed to write through the UI
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Unsupported key' }, { status: 400 });
  }

  await setSetting(key, value);
  await writeAuditLog({
    actorUserId: user.id,
    action: 'admin.setting.updated',
    targetType: 'setting',
    metadata: { key },
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Unsupported key' }, { status: 400 });
  }
  await db.query('DELETE FROM settings WHERE key = $1', [key]);
  await writeAuditLog({
    actorUserId: user.id,
    action: 'admin.setting.deleted',
    targetType: 'setting',
    metadata: { key },
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}

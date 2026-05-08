import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { setSetting } from '../../../../lib/settings';
import { db } from '../../../../lib/db';

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
  const ALLOWED = new Set(['ANTHROPIC_API_KEY']);
  if (!ALLOWED.has(key)) {
    return NextResponse.json({ error: 'Unsupported key' }, { status: 400 });
  }

  await setSetting(key, value);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  await db.query('DELETE FROM settings WHERE key = $1', [key]);
  return NextResponse.json({ ok: true });
}

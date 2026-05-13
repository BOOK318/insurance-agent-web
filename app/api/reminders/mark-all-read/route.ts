import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rowCount } = await db.query(
    'UPDATE reminders SET is_sent = TRUE WHERE agent_id = $1 AND is_sent = FALSE',
    [user.id],
  );
  return NextResponse.json({ ok: true, marked: rowCount ?? 0 });
}

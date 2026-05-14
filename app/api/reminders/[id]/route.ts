import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

type Params = { params: Promise<{ id: string }> };

/**
 * Mark a single reminder as read. Gmail-style: clicking a row in the inbox
 * navigates AND marks read in the same gesture.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { read?: unknown };
  if (body.read !== true) {
    return NextResponse.json({ error: '只支援 { read: true }' }, { status: 400 });
  }

  const { rowCount } = await db.query(
    `UPDATE reminders SET is_sent = TRUE
     WHERE id = $1 AND agent_id = $2 AND is_sent = FALSE`,
    [id, user.id],
  );
  // rowCount = 0 is fine — either id not owned by this agent, or already read.
  // We don't distinguish (mild defense against id enumeration).
  return NextResponse.json({ ok: true, marked: rowCount ?? 0 });
}

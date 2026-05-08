import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

export async function GET(_req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await db.query(
    `SELECT r.*, c.name_zh, c.name_en
     FROM reminders r LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.agent_id = $1 AND r.is_sent = FALSE
     ORDER BY r.remind_at ASC`,
    [user.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await req.json() as Record<string, unknown>;
  const { rows } = await db.query(
    `INSERT INTO reminders (agent_id, client_id, type, title, message, remind_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [user.id, b.client_id, b.type, b.title, b.message, b.remind_at]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

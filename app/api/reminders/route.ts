import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function validDate(value: unknown) {
  const result = text(value);
  if (!result) return null;
  const time = Date.parse(result);
  return Number.isFinite(time) ? result : null;
}

export async function GET(_req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Inbox-style: return every reminder for this agent. Read/unread is
  // expressed by is_sent; the page surfaces it as a blue dot.
  const { rows } = await db.query(
    `SELECT r.*, c.name_zh, c.name_en
     FROM reminders r
     LEFT JOIN clients c
       ON c.id = r.client_id
      AND c.agent_id = r.agent_id
      AND c.deleted_at IS NULL
     WHERE r.agent_id = $1
     ORDER BY COALESCE(r.pushed_at, r.remind_at) DESC`,
    [user.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await req.json() as Record<string, unknown>;
  const clientId = nullableText(b.client_id);
  const type = text(b.type);
  const title = text(b.title);
  const message = nullableText(b.message);
  const remindAt = validDate(b.remind_at);

  if (!type || !title || !remindAt) {
    return NextResponse.json({ error: '請填妥提醒類型、標題同時間' }, { status: 400 });
  }

  if (clientId) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
      [clientId, user.id]
    );
    if (rowCount === 0) {
      return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
    }
  }

  const { rows } = await db.query(
    `INSERT INTO reminders (agent_id, client_id, type, title, message, remind_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [user.id, clientId, type, title, message, remindAt]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

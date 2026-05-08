import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

const CLAIM_STATUSES = new Set(['pending', 'approved', 'rejected', 'paid']);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

export async function GET(_req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await db.query(
    `SELECT cl.*, c.name_zh, c.name_en, p.product_name, p.policy_number
     FROM claims cl
     JOIN clients c ON c.id = cl.client_id
     LEFT JOIN policies p ON p.id = cl.policy_id AND p.deleted_at IS NULL
     WHERE cl.agent_id = $1 AND cl.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY cl.created_at DESC`,
    [user.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await req.json() as Record<string, unknown>;
  const clientId = text(b.client_id);
  const policyId = nullableText(b.policy_id);
  const claimType = text(b.claim_type);
  const status = text(b.status) || 'pending';
  const amountClaimed = nullableNumber(b.amount_claimed);
  const amountApproved = nullableNumber(b.amount_approved);

  if (!clientId || !claimType) {
    return NextResponse.json({ error: '請選擇客戶同 Claim 類型' }, { status: 400 });
  }
  if (Number.isNaN(amountClaimed) || Number.isNaN(amountApproved)) {
    return NextResponse.json({ error: '金額格式不正確' }, { status: 400 });
  }
  if (!CLAIM_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Claim 狀態不正確' }, { status: 400 });
  }

  const { rowCount: clientCount } = await db.query(
    'SELECT 1 FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
    [clientId, user.id]
  );
  if (clientCount === 0) {
    return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  }

  if (policyId) {
    const { rowCount: policyCount } = await db.query(
      'SELECT 1 FROM policies WHERE id = $1 AND client_id = $2 AND agent_id = $3 AND deleted_at IS NULL',
      [policyId, clientId, user.id]
    );
    if (policyCount === 0) {
      return NextResponse.json({ error: '保單不屬於此客戶' }, { status: 400 });
    }
  }

  const { rows } = await db.query(
    `INSERT INTO claims
       (agent_id, client_id, policy_id, claim_number, claim_type, incident_date,
        submitted_date, amount_claimed, amount_approved, status, current_step,
        documents_required, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [user.id, clientId, policyId, nullableText(b.claim_number), claimType, nullableText(b.incident_date),
     nullableText(b.submitted_date), amountClaimed, amountApproved, status, nullableText(b.current_step),
     nullableText(b.documents_required), nullableText(b.notes)]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

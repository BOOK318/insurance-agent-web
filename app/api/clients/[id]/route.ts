import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getSession } from '../../../../lib/auth';

const GENDERS = new Set(['M', 'F', 'Other']);

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

function nullableDate(value: unknown) {
  const result = text(value);
  return result || null;
}

function nullableGender(value: unknown) {
  const result = nullableText(value);
  if (!result) return null;
  return GENDERS.has(result) ? result : '__INVALID__';
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { rows } = await db.query(
    'SELECT * FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL', [id, user.id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ rows: policies }, { rows: claims }] = await Promise.all([
    db.query('SELECT * FROM policies WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [id]),
    db.query('SELECT * FROM claims WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [id]),
  ]);

  return NextResponse.json({ ...rows[0], policies, claims });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const b = await req.json() as Record<string, unknown>;
  const nameZh = nullableText(b.name_zh);
  const nameEn = nullableText(b.name_en);
  const annualIncome = nullableNumber(b.annual_income);
  const monthlyExpenses = nullableNumber(b.monthly_expenses);
  const mortgageBalance = nullableNumber(b.mortgage_balance);
  const dependentsCount = nullableNumber(b.dependents_count);
  const gender = nullableGender(b.gender);

  if (!nameZh && !nameEn) {
    return NextResponse.json({ error: '請輸入客戶姓名' }, { status: 400 });
  }
  if ([annualIncome, monthlyExpenses, mortgageBalance, dependentsCount].some(Number.isNaN)) {
    return NextResponse.json({ error: '數字格式不正確' }, { status: 400 });
  }
  if (gender === '__INVALID__') {
    return NextResponse.json({ error: '性別格式不正確' }, { status: 400 });
  }

  const { rows } = await db.query(
    `UPDATE clients SET
       name_zh=$1, name_en=$2, phone=$3, email=$4, occupation=$5,
       annual_income=$6, monthly_expenses=$7, mortgage_balance=$8,
       liabilities_notes=$9, dependents_count=$10, existing_coverage_notes=$11,
       financial_goals=$12, dob=$13, gender=$14, family_notes=$15,
       assets_notes=$16, property_notes=$17, preferences=$18, nationality=$19,
       notes=$20, updated_at=NOW()
     WHERE id=$21 AND agent_id=$22 AND deleted_at IS NULL RETURNING *`,
    [nameZh, nameEn, nullableText(b.phone), nullableText(b.email), nullableText(b.occupation),
     annualIncome, monthlyExpenses, mortgageBalance,
     nullableText(b.liabilities_notes), dependentsCount, nullableText(b.existing_coverage_notes),
     nullableText(b.financial_goals), nullableDate(b.dob), gender, nullableText(b.family_notes), nullableText(b.assets_notes),
     nullableText(b.property_notes), nullableText(b.preferences), nullableText(b.nationality), nullableText(b.notes), id, user.id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  // Soft delete — preserves history for audit / DSAR. Cascade soft-delete to
  // policies and claims so they disappear from agent views too.
  const { rowCount } = await db.query(
    `UPDATE clients SET deleted_at = NOW()
     WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL`,
    [id, user.id]
  );
  if (rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.query('UPDATE policies SET deleted_at = NOW() WHERE client_id = $1 AND deleted_at IS NULL', [id]);
  await db.query('UPDATE claims SET deleted_at = NOW() WHERE client_id = $1 AND deleted_at IS NULL', [id]);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q');
  let sql = 'SELECT * FROM clients WHERE agent_id = $1 AND deleted_at IS NULL';
  const params: unknown[] = [user.id];

  if (q) {
    sql += ` AND (name_zh ILIKE $2 OR name_en ILIKE $2 OR phone ILIKE $2 OR nationality ILIKE $2 OR preferences ILIKE $2)`;
    params.push(`%${q}%`);
  }
  sql += ' ORDER BY name_zh NULLS LAST, name_en';

  const { rows } = await db.query(sql, params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { name_zh, name_en, phone, email, occupation, annual_income,
          monthly_expenses, mortgage_balance, liabilities_notes, dependents_count,
          existing_coverage_notes, financial_goals, dob, gender, family_notes,
          assets_notes, property_notes, preferences, nationality, notes } = body;

  const { rows } = await db.query(
    `INSERT INTO clients
       (agent_id, name_zh, name_en, phone, email, occupation, annual_income,
        monthly_expenses, mortgage_balance, liabilities_notes, dependents_count,
        existing_coverage_notes, financial_goals, dob, gender, family_notes,
        assets_notes, property_notes, preferences, nationality, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [user.id, name_zh, name_en, phone, email, occupation, annual_income,
     monthly_expenses, mortgage_balance, liabilities_notes, dependents_count,
     existing_coverage_notes, financial_goals, dob, gender, family_notes,
     assets_notes, property_notes, preferences, nationality, notes]
  );

  return NextResponse.json(rows[0], { status: 201 });
}

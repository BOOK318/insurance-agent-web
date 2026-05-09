import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

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
  const nameZh = nullableText(body.name_zh);
  const nameEn = nullableText(body.name_en);
  const annualIncome = nullableNumber(body.annual_income);
  const monthlyExpenses = nullableNumber(body.monthly_expenses);
  const mortgageBalance = nullableNumber(body.mortgage_balance);
  const dependentsCount = nullableNumber(body.dependents_count);
  const gender = nullableGender(body.gender);

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
    `INSERT INTO clients
       (agent_id, name_zh, name_en, phone, email, occupation, annual_income,
        monthly_expenses, mortgage_balance, liabilities_notes, dependents_count,
        existing_coverage_notes, financial_goals, dob, gender, family_notes,
        assets_notes, property_notes, preferences, nationality, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [user.id, nameZh, nameEn, nullableText(body.phone), nullableText(body.email), nullableText(body.occupation), annualIncome,
     monthlyExpenses, mortgageBalance, nullableText(body.liabilities_notes), dependentsCount,
     nullableText(body.existing_coverage_notes), nullableText(body.financial_goals), nullableDate(body.dob), gender, nullableText(body.family_notes),
     nullableText(body.assets_notes), nullableText(body.property_notes), nullableText(body.preferences), nullableText(body.nationality), nullableText(body.notes)]
  );

  return NextResponse.json(rows[0], { status: 201 });
}

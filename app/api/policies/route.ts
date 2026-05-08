import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

const POLICY_STATUSES = new Set(['active', 'lapsed', 'surrendered']);
const POLICY_TYPES = new Set(['醫療', '危疾', '人壽', '年金', '意外', '儲蓄', '投資相連', '其他']);
const CURRENCIES = new Set(['HKD', 'USD', 'CNY', 'AUD', 'CAD', 'GBP', 'EUR', 'SGD']);

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

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get('client_id');
  let sql = `SELECT p.*, c.name_zh, c.name_en
             FROM policies p JOIN clients c ON c.id = p.client_id
             WHERE p.agent_id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL`;
  const params: unknown[] = [user.id];

  if (clientId) { sql += ' AND p.client_id = $2'; params.push(clientId); }
  sql += ' ORDER BY p.expiry_date ASC NULLS LAST';

  const { rows } = await db.query(sql, params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await req.json() as Record<string, unknown>;
  const clientId = text(b.client_id);
  const policyNumber = text(b.policy_number);
  const company = text(b.company);
  const type = text(b.type);
  const currency = text(b.currency) || 'HKD';
  const status = text(b.status) || 'active';
  const premium = nullableNumber(b.premium);
  const sumAssured = nullableNumber(b.sum_assured);
  const deathBenefit = nullableNumber(b.death_benefit);
  const breakevenYear = nullableNumber(b.breakeven_year);
  const scenario20yPessimistic = nullableNumber(b.scenario_20y_pessimistic);
  const scenario20yOptimistic = nullableNumber(b.scenario_20y_optimistic);

  if (!clientId || !policyNumber || !company || !type) {
    return NextResponse.json({ error: '請填妥客戶、保單號碼、保險公司同保單類型' }, { status: 400 });
  }
  if (!POLICY_TYPES.has(type)) {
    return NextResponse.json({ error: '保單類型不正確' }, { status: 400 });
  }
  if (!CURRENCIES.has(currency)) {
    return NextResponse.json({ error: '貨幣不正確' }, { status: 400 });
  }
  if (
    Number.isNaN(premium) ||
    Number.isNaN(sumAssured) ||
    Number.isNaN(deathBenefit) ||
    Number.isNaN(breakevenYear) ||
    Number.isNaN(scenario20yPessimistic) ||
    Number.isNaN(scenario20yOptimistic)
  ) {
    return NextResponse.json({ error: '金額格式不正確' }, { status: 400 });
  }
  if (!POLICY_STATUSES.has(status)) {
    return NextResponse.json({ error: '保單狀態不正確' }, { status: 400 });
  }

  const { rowCount } = await db.query(
    'SELECT 1 FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
    [clientId, user.id]
  );
  if (rowCount === 0) {
    return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  }

  const { rows } = await db.query(
    `INSERT INTO policies
       (agent_id, client_id, policy_number, company, type, product_name,
        currency, premium, premium_frequency, sum_assured, death_benefit, policyholder_name, insured_name,
        payment_period, breakeven_year, breakeven_date, maturity_date,
        scenario_20y_pessimistic, scenario_20y_optimistic, cash_value_notes,
        start_date, expiry_date, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [user.id, clientId, policyNumber, company, type, nullableText(b.product_name),
     currency, premium, nullableText(b.premium_frequency), sumAssured, deathBenefit, nullableText(b.policyholder_name), nullableText(b.insured_name),
     nullableText(b.payment_period), breakevenYear, nullableText(b.breakeven_date), nullableText(b.maturity_date),
     scenario20yPessimistic, scenario20yOptimistic, nullableText(b.cash_value_notes),
     nullableText(b.start_date), nullableText(b.expiry_date), status, nullableText(b.notes)]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

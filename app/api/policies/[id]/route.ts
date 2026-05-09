import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getSession } from '../../../../lib/auth';

const POLICY_STATUSES = new Set(['active', 'lapsed', 'surrendered']);
const POLICY_TYPES = new Set(['醫療', '危疾', '人壽', '年金', '意外', '儲蓄', '投資相連', '其他']);
const LEGACY_POLICY_TYPES: Record<string, string> = {
  medical: '醫療',
  critical_illness: '危疾',
  life: '人壽',
  accident: '意外',
  savings: '儲蓄',
  travel: '其他',
};
const CURRENCIES = new Set(['HKD', 'USD', 'CNY', 'AUD', 'CAD', 'GBP', 'EUR', 'SGD']);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function normalizePolicyType(value: unknown) {
  const result = text(value);
  return LEGACY_POLICY_TYPES[result] ?? result;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { rows } = await db.query(
    `SELECT p.*, c.name_zh, c.name_en
     FROM policies p JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1 AND p.agent_id = $2 AND p.deleted_at IS NULL`,
    [id, user.id]
  );

  if (!rows[0]) return NextResponse.json({ error: '找不到保單' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const b = await req.json() as Record<string, unknown>;
  const clientId = text(b.client_id);
  const policyNumber = text(b.policy_number);
  const company = text(b.company);
  const type = normalizePolicyType(b.type);
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

  const [{ rowCount: clientCount }, { rowCount: policyCount }] = await Promise.all([
    db.query('SELECT 1 FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL', [clientId, user.id]),
    db.query('SELECT 1 FROM policies WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL', [id, user.id]),
  ]);
  if (policyCount === 0) {
    return NextResponse.json({ error: '找不到保單' }, { status: 404 });
  }
  if (clientCount === 0) {
    return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  }

  const { rows } = await db.query(
    `UPDATE policies SET
       client_id = $1,
       policy_number = $2,
       company = $3,
       type = $4,
       product_name = $5,
       currency = $6,
       premium = $7,
       premium_frequency = $8,
       sum_assured = $9,
       death_benefit = $10,
       policyholder_name = $11,
       insured_name = $12,
       payment_period = $13,
       breakeven_year = $14,
       breakeven_date = $15,
       maturity_date = $16,
       scenario_20y_pessimistic = $17,
       scenario_20y_optimistic = $18,
       cash_value_notes = $19,
       start_date = $20,
       expiry_date = $21,
       status = $22,
       notes = $23
     WHERE id = $24 AND agent_id = $25 AND deleted_at IS NULL
     RETURNING *`,
    [
      clientId,
      policyNumber,
      company,
      type,
      nullableText(b.product_name),
      currency,
      premium,
      nullableText(b.premium_frequency),
      sumAssured,
      deathBenefit,
      nullableText(b.policyholder_name),
      nullableText(b.insured_name),
      nullableText(b.payment_period),
      breakevenYear,
      nullableText(b.breakeven_date),
      nullableText(b.maturity_date),
      scenario20yPessimistic,
      scenario20yOptimistic,
      nullableText(b.cash_value_notes),
      nullableText(b.start_date),
      nullableText(b.expiry_date),
      status,
      nullableText(b.notes),
      id,
      user.id,
    ]
  );

  return NextResponse.json(rows[0]);
}

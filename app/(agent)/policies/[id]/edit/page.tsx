import { notFound, redirect } from 'next/navigation';
import { getSession } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import {
  NewPolicyForm,
  type PolicyClientOption,
  type PolicyFormInitial,
} from '../../new/policy-form';

export const dynamic = 'force-dynamic';

const LEGACY_POLICY_TYPES: Record<string, string> = {
  medical: '醫療',
  critical_illness: '危疾',
  life: '人壽',
  accident: '意外',
  savings: '儲蓄',
  travel: '其他',
};

const POLICY_FIELDS: Array<keyof PolicyFormInitial> = [
  'client_id',
  'policy_number',
  'company',
  'type',
  'product_name',
  'currency',
  'premium',
  'premium_frequency',
  'sum_assured',
  'death_benefit',
  'policyholder_name',
  'insured_name',
  'payment_period',
  'breakeven_year',
  'breakeven_date',
  'maturity_date',
  'scenario_20y_pessimistic',
  'scenario_20y_optimistic',
  'cash_value_notes',
  'start_date',
  'expiry_date',
  'status',
  'notes',
];

function serializePolicy(policy: Record<string, unknown>): PolicyFormInitial {
  const initial: PolicyFormInitial = {};
  for (const key of POLICY_FIELDS) {
    const value = policy[key];
    if (value instanceof Date) {
      initial[key] = value.toISOString().slice(0, 10);
    } else if (value === null || value === undefined) {
      initial[key] = '';
    } else if (key === 'type') {
      const type = String(value);
      initial[key] = LEGACY_POLICY_TYPES[type] ?? type;
    } else {
      initial[key] = String(value);
    }
  }
  return initial;
}

export default async function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { id } = await params;

  const [{ rows: policies }, { rows: clients }] = await Promise.all([
    db.query<Record<string, unknown>>(
      'SELECT * FROM policies WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
      [id, user.id]
    ),
    db.query<PolicyClientOption>(
      `SELECT id, name_zh, name_en, phone
       FROM clients
       WHERE agent_id = $1 AND deleted_at IS NULL
       ORDER BY COALESCE(name_zh, name_en), created_at DESC`,
      [user.id]
    ),
  ]);

  const policy = policies[0];
  if (!policy) notFound();

  const selectedClientId = String(policy.client_id ?? '');

  return (
    <NewPolicyForm
      clients={clients}
      selectedClientId={selectedClientId}
      initialPolicy={serializePolicy(policy)}
      policyId={id}
    />
  );
}

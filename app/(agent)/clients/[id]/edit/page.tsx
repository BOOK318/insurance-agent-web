import { notFound, redirect } from 'next/navigation';
import { getSession } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { EditClientForm, type ClientFormFields } from './edit-client-form';

export const dynamic = 'force-dynamic';

const CLIENT_FIELDS: Array<keyof ClientFormFields> = [
  'name_zh',
  'name_en',
  'phone',
  'email',
  'occupation',
  'annual_income',
  'monthly_expenses',
  'mortgage_balance',
  'liabilities_notes',
  'dependents_count',
  'existing_coverage_notes',
  'financial_goals',
  'dob',
  'gender',
  'nationality',
  'family_notes',
  'assets_notes',
  'property_notes',
  'preferences',
  'notes',
];

function serializeClient(client: Record<string, unknown>): ClientFormFields {
  const initial: Partial<ClientFormFields> = {};
  for (const key of CLIENT_FIELDS) {
    const value = client[key];
    if (value instanceof Date) {
      initial[key] = value.toISOString().slice(0, 10);
    } else if (value === null || value === undefined) {
      initial[key] = '';
    } else {
      initial[key] = String(value);
    }
  }
  return initial as ClientFormFields;
}

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { id } = await params;
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
    [id, user.id]
  );

  const client = rows[0];
  if (!client) notFound();

  return <EditClientForm clientId={id} initial={serializeClient(client)} />;
}

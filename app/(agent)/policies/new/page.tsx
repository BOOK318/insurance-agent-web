import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { NewPolicyForm, type PolicyClientOption } from './policy-form';

export const dynamic = 'force-dynamic';

export default async function NewPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { client, client_id } = await searchParams;
  const requestedClientId = client ?? client_id ?? '';

  const { rows: clients } = await db.query<PolicyClientOption>(
    `SELECT id, name_zh, name_en, phone
     FROM clients
     WHERE agent_id = $1 AND deleted_at IS NULL
     ORDER BY COALESCE(name_zh, name_en), created_at DESC`,
    [user.id]
  );

  const selectedClientId = clients.some(c => c.id === requestedClientId)
    ? requestedClientId
    : '';

  return <NewPolicyForm clients={clients} selectedClientId={selectedClientId} />;
}

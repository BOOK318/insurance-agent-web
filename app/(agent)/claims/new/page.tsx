import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { NewClaimForm, type ClaimClientOption, type ClaimPolicyOption } from './claim-form';

export const dynamic = 'force-dynamic';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { client, client_id } = await searchParams;
  const requestedClientId = client ?? client_id ?? '';

  const [{ rows: clients }, { rows: policies }] = await Promise.all([
    db.query<ClaimClientOption>(
      `SELECT id, name_zh, name_en, phone
       FROM clients
       WHERE agent_id = $1 AND deleted_at IS NULL
       ORDER BY COALESCE(name_zh, name_en), created_at DESC`,
      [user.id]
    ),
    db.query<ClaimPolicyOption>(
      `SELECT id, client_id, policy_number, company, type, product_name
       FROM policies
       WHERE agent_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [user.id]
    ),
  ]);

  const selectedClientId = clients.some(c => c.id === requestedClientId)
    ? requestedClientId
    : '';

  return (
    <NewClaimForm
      clients={clients}
      policies={policies}
      selectedClientId={selectedClientId}
    />
  );
}

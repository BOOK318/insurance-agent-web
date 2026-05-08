import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';

type Hit = {
  kind: 'client' | 'policy' | 'claim';
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return NextResponse.json({ hits: [] });

  const term = `%${q}%`;
  const hits: Hit[] = [];

  // Clients — name (zh/en), phone, email, occupation, nationality, preferences
  const { rows: clients } = await db.query<{
    id: string; name_zh: string | null; name_en: string | null;
    phone: string | null; occupation: string | null; nationality: string | null;
  }>(
    `SELECT id, name_zh, name_en, phone, occupation, nationality
     FROM clients
     WHERE agent_id = $1 AND deleted_at IS NULL
       AND (name_zh ILIKE $2 OR name_en ILIKE $2 OR phone ILIKE $2
            OR email ILIKE $2 OR occupation ILIKE $2
            OR nationality ILIKE $2 OR preferences ILIKE $2)
     ORDER BY COALESCE(name_zh, name_en) LIMIT 20`,
    [user.id, term]
  );
  for (const c of clients) {
    hits.push({
      kind: 'client',
      id: c.id,
      title: c.name_zh ?? c.name_en ?? '未命名',
      subtitle: [c.occupation, c.nationality, c.phone].filter(Boolean).join(' · '),
      href: `/clients/${c.id}`,
    });
  }

  // Policies — policy number, company, product name; show client too
  const { rows: policies } = await db.query<{
    id: string; client_id: string; policy_number: string;
    company: string; product_name: string | null; type: string;
    name_zh: string | null; name_en: string | null;
  }>(
    `SELECT p.id, p.client_id, p.policy_number, p.company, p.product_name, p.type,
            c.name_zh, c.name_en
     FROM policies p JOIN clients c ON c.id = p.client_id
     WHERE p.agent_id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL
       AND (p.policy_number ILIKE $2 OR p.company ILIKE $2
            OR p.product_name ILIKE $2 OR p.type ILIKE $2)
     ORDER BY p.created_at DESC LIMIT 20`,
    [user.id, term]
  );
  for (const p of policies) {
    hits.push({
      kind: 'policy',
      id: p.id,
      title: p.product_name ?? p.type,
      subtitle: `${p.company} · ${p.policy_number} · ${p.name_zh ?? p.name_en ?? ''}`,
      href: `/policies/${p.id}/edit`,
    });
  }

  // Claims — claim number, claim type
  const { rows: claims } = await db.query<{
    id: string; client_id: string; claim_number: string | null;
    claim_type: string; name_zh: string | null; name_en: string | null;
  }>(
    `SELECT cl.id, cl.client_id, cl.claim_number, cl.claim_type,
            c.name_zh, c.name_en
     FROM claims cl JOIN clients c ON c.id = cl.client_id
     WHERE cl.agent_id = $1 AND cl.deleted_at IS NULL AND c.deleted_at IS NULL
       AND (cl.claim_number ILIKE $2 OR cl.claim_type ILIKE $2)
     ORDER BY cl.created_at DESC LIMIT 20`,
    [user.id, term]
  );
  for (const cl of claims) {
    hits.push({
      kind: 'claim',
      id: cl.id,
      title: cl.claim_type,
      subtitle: `${cl.claim_number ?? '—'} · ${cl.name_zh ?? cl.name_en ?? ''}`,
      href: `/clients/${cl.client_id}`,
    });
  }

  return NextResponse.json({ hits });
}

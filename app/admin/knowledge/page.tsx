import { db } from '../../../lib/db';
import { KnowledgeAdminPanel, type KnowledgeRow } from './knowledge-admin-panel';

export const dynamic = 'force-dynamic';

export default async function AdminKnowledgePage() {
  const { rows } = await db.query<KnowledgeRow>(
    `SELECT id, company, category, product_name, title, content, source_url, is_active, updated_at
     FROM company_knowledge
     WHERE category = 'sales'
     ORDER BY updated_at DESC, title ASC
     LIMIT 200`
  );

  return <KnowledgeAdminPanel initialRows={rows} />;
}

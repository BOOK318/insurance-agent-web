import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { writeAuditLog } from '../../../../lib/audit';
import { getClientIp } from '../../../../lib/security';

const CATEGORY = 'sales';

type KnowledgeRow = {
  id: string;
  company: string;
  category: string;
  product_name: string | null;
  title: string;
  content: string;
  source_url: string | null;
  is_active: boolean;
  updated_at: string;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function requireAdmin() {
  const user = await getSession();
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { rows } = await db.query<KnowledgeRow>(
    `SELECT id, company, category, product_name, title, content, source_url, is_active, updated_at
     FROM company_knowledge
     WHERE category = $1
     ORDER BY updated_at DESC, title ASC
     LIMIT 200`,
    [CATEGORY]
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const company = text(body.company) || 'BOC Life';
  const productName = text(body.product_name) || null;
  const title = text(body.title);
  const content = text(body.content);

  if (!title || !content) {
    return NextResponse.json({ error: '請填標題同內容' }, { status: 400 });
  }
  if (title.length > 160) {
    return NextResponse.json({ error: '標題太長' }, { status: 400 });
  }
  if (content.length > 6000) {
    return NextResponse.json({ error: '內容太長，請分開幾條知識' }, { status: 400 });
  }

  const { rows } = await db.query<KnowledgeRow>(
    `INSERT INTO company_knowledge
       (company, category, product_name, title, content, source_url, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
     ON CONFLICT (company, category, title)
     DO UPDATE SET
       product_name = EXCLUDED.product_name,
       content = EXCLUDED.content,
       source_url = EXCLUDED.source_url,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING id, company, category, product_name, title, content, source_url, is_active, updated_at`,
    [company, CATEGORY, productName, title, content, 'manual://admin/sales']
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'admin.knowledge.upserted',
    targetType: 'company_knowledge',
    targetId: rows[0].id,
    metadata: { company, category: CATEGORY, title },
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id);
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : null;
  if (!id || isActive === null) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { rows } = await db.query<KnowledgeRow>(
    `UPDATE company_knowledge
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND category = $3
     RETURNING id, company, category, product_name, title, content, source_url, is_active, updated_at`,
    [isActive, id, CATEGORY]
  );
  if (!rows[0]) return NextResponse.json({ error: '找不到知識' }, { status: 404 });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'admin.knowledge.updated',
    targetType: 'company_knowledge',
    targetId: rows[0].id,
    metadata: { is_active: isActive },
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = text(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: '缺少知識 ID' }, { status: 400 });

  const { rows } = await db.query<{ id: string; title: string }>(
    `DELETE FROM company_knowledge
     WHERE id = $1 AND category = $2
     RETURNING id, title`,
    [id, CATEGORY]
  );
  if (!rows[0]) return NextResponse.json({ error: '找不到知識' }, { status: 404 });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'admin.knowledge.deleted',
    targetType: 'company_knowledge',
    targetId: rows[0].id,
    metadata: { title: rows[0].title },
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ ok: true });
}

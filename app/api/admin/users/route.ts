import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import type { Role } from '../../../../lib/db';
import { getClientIp, getMaxActiveUsers, isStrongPassword } from '../../../../lib/security';
import { writeAuditLog } from '../../../../lib/audit';

const ROLES = new Set<Role>(['agent', 'head', 'admin']);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function activeUserCount(excludingId?: string) {
  const params: unknown[] = [];
  let sql = 'SELECT COUNT(*)::int AS count FROM users WHERE is_active = TRUE';
  if (excludingId) {
    params.push(excludingId);
    sql += ` AND id <> $${params.length}`;
  }
  const { rows } = await db.query<{ count: number }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function requireAdmin() {
  const user = await getSession();
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { rows } = await db.query(
    `SELECT id, name, email, role, is_active, created_at
     FROM users
     ORDER BY
       CASE role WHEN 'admin' THEN 0 WHEN 'head' THEN 1 ELSE 2 END,
       created_at DESC`
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  const role = text(body.role) as Role;
  const password = text(body.password);

  if (!name || !email || !role || !password) {
    return NextResponse.json({ error: '請填妥姓名、Email、角色同密碼' }, { status: 400 });
  }
  if (!ROLES.has(role)) {
    return NextResponse.json({ error: '角色不正確' }, { status: 400 });
  }
  if (!isStrongPassword(password)) {
    return NextResponse.json({ error: '密碼最少 10 個字，並要包含大楷、小楷同數字' }, { status: 400 });
  }

  const maxActiveUsers = getMaxActiveUsers();
  const currentActive = await activeUserCount();
  if (currentActive >= maxActiveUsers) {
    return NextResponse.json(
      { error: `已達系統上限：最多 ${maxActiveUsers} 個啟用帳號。請先停用離職或暫停使用嘅帳號。` },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await db.query<{
      id: string;
      name: string;
      email: string;
      role: Role;
      is_active: boolean;
      created_at: string;
    }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email, passwordHash, role]
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: 'admin.user.created',
      targetType: 'user',
      targetId: rows[0].id,
      metadata: { email, role },
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Email 已經存在' }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const id = text(body.id);
  const password = text(body.password);
  const hasActive = typeof body.is_active === 'boolean';

  if (!id) {
    return NextResponse.json({ error: '缺少帳號 ID' }, { status: 400 });
  }
  if (!password && !hasActive) {
    return NextResponse.json({ error: '沒有需要更新嘅資料' }, { status: 400 });
  }
  if (password && !isStrongPassword(password)) {
    return NextResponse.json({ error: '密碼最少 10 個字，並要包含大楷、小楷同數字' }, { status: 400 });
  }
  if (hasActive && body.is_active === false && id === user.id) {
    return NextResponse.json({ error: '唔可以停用自己嘅管理員帳號' }, { status: 400 });
  }
  if (hasActive && body.is_active === true) {
    const maxActiveUsers = getMaxActiveUsers();
    const currentActive = await activeUserCount(id);
    if (currentActive >= maxActiveUsers) {
      return NextResponse.json(
        { error: `已達系統上限：最多 ${maxActiveUsers} 個啟用帳號。請先停用其他帳號。` },
        { status: 400 }
      );
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (password) {
    params.push(await bcrypt.hash(password, 10));
    sets.push(`password_hash = $${params.length}`);
  }
  if (hasActive) {
    params.push(body.is_active);
    sets.push(`is_active = $${params.length}`);
  }

  params.push(id);
  const { rows } = await db.query<{
    id: string;
    name: string;
    email: string;
    role: Role;
    is_active: boolean;
    created_at: string;
  }>(
    `UPDATE users
     SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING id, name, email, role, is_active, created_at`,
    params
  );

  if (!rows[0]) {
    return NextResponse.json({ error: '找不到帳號' }, { status: 404 });
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: password ? 'admin.user.password_reset' : 'admin.user.updated',
    targetType: 'user',
    targetId: rows[0].id,
    metadata: hasActive ? { is_active: body.is_active } : null,
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json(rows[0]);
}

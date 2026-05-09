import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { setSession } from '../../../../lib/auth';
import { getUserByEmail } from '../../../../lib/db';
import {
  getClientIp,
  getLoginBlock,
  recordLoginFailure,
  recordLoginSuccess,
} from '../../../../lib/security';
import { writeAuditLog } from '../../../../lib/audit';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({})) as { email?: string; password?: string };
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const rawPassword = typeof password === 'string' ? password : '';
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent');

  if (!normalizedEmail || !rawPassword) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
  }

  const block = getLoginBlock(req, normalizedEmail);
  if (block) {
    await writeAuditLog({
      action: 'auth.login.blocked',
      metadata: { email: normalizedEmail, retry_after_seconds: block.retryAfterSeconds },
      ip,
      userAgent,
    });
    return NextResponse.json(
      { error: `登入嘗試太多，請 ${Math.ceil(block.retryAfterSeconds / 60)} 分鐘後再試。` },
      { status: 429, headers: { 'Retry-After': String(block.retryAfterSeconds) } }
    );
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    const failure = recordLoginFailure(req, normalizedEmail);
    await writeAuditLog({
      action: 'auth.login.failed',
      metadata: { email: normalizedEmail, reason: 'unknown_user', failures: failure.failures },
      ip,
      userAgent,
    });
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
  }

  const valid = await bcrypt.compare(rawPassword, user.password_hash);
  if (!valid) {
    const failure = recordLoginFailure(req, normalizedEmail);
    await writeAuditLog({
      actorUserId: user.id,
      action: 'auth.login.failed',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: normalizedEmail, reason: 'bad_password', failures: failure.failures },
      ip,
      userAgent,
    });
    const headers = failure.locked ? { 'Retry-After': String(failure.retryAfterSeconds) } : undefined;
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401, headers });
  }

  recordLoginSuccess(req, normalizedEmail);
  await setSession(user);
  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.login.success',
    targetType: 'user',
    targetId: user.id,
    ip,
    userAgent,
  });

  // 根據角色決定redirect
  const redirectTo = user.role === 'agent' ? '/' : '/head';
  return NextResponse.json({ role: user.role, redirectTo });
}

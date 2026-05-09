import { cookies } from 'next/headers';
import type { User } from './db';
import { COOKIE, signToken, verifyToken } from './jwt';

export { signToken, verifyToken } from './jwt';

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;

  const { db } = await import('./db');
  const { rows } = await db.query<User>(
    'SELECT id, name, email, role, is_active FROM users WHERE id = $1 AND is_active = TRUE',
    [payload.id]
  );
  return rows[0] ?? null;
}

export async function setSession(user: User) {
  const token = await signToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7日
    path: '/',
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

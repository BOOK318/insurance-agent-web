import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { User } from './db';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const COOKIE = 'insurance_token';

export async function signToken(user: User) {
  return new SignJWT({ id: user.id, name: user.name, role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as User;
  } catch { return null; }
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
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

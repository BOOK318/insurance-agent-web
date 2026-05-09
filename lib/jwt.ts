import { SignJWT, jwtVerify } from 'jose';
import type { User } from './db';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
export const COOKIE = 'insurance_token';

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
  } catch {
    return null;
  }
}


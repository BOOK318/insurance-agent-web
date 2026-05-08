import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
    pool.query<T>(text, params),
};

export type Role = 'agent' | 'head' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

export async function getUserByEmail(email: string) {
  const { rows } = await db.query<User & { password_hash: string }>(
    'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
    [email]
  );
  return rows[0] ?? null;
}

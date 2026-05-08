import { db } from './db';

/**
 * Read a setting from DB; falls back to a process.env var if the row is missing.
 * Settings table lets admins update keys (e.g. ANTHROPIC_API_KEY) without
 * editing .env.local and restarting the server.
 */
export async function getSetting(
  key: string,
  envFallback?: string
): Promise<string | null> {
  try {
    const { rows } = await db.query<{ value: string | null }>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    if (rows[0]?.value) return rows[0].value;
  } catch {
    // table may not exist on first boot — fall through to env
  }
  return envFallback ?? null;
}

export async function setSetting(key: string, value: string) {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

/** Mask a secret for display: keep first 4 + last 4 chars. */
export function maskSecret(value: string | null): string {
  if (!value) return '';
  if (value.length <= 12) return '•'.repeat(value.length);
  return value.slice(0, 6) + '••••••••' + value.slice(-4);
}

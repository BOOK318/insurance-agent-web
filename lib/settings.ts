import { db } from './db';
import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1';

function settingsSecret() {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SETTINGS_ENCRYPTION_KEY or JWT_SECRET is required to decrypt settings');
  }
  return secret ?? null;
}

function encryptionKey() {
  const secret = settingsSecret();
  return secret ? crypto.createHash('sha256').update(secret).digest() : null;
}

function encryptSettingValue(value: string) {
  const key = encryptionKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTED_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

function decryptSettingValue(value: string) {
  if (!value.startsWith(`${ENCRYPTED_PREFIX}:`)) return value;

  const key = encryptionKey();
  if (!key) {
    throw new Error('settings encryption key missing');
  }

  const [, , iv, tag, encrypted] = value.split(':');
  if (!iv || !tag || !encrypted) {
    throw new Error('invalid encrypted setting format');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Read a setting from DB; falls back to a process.env var if the row is missing.
 * Settings table lets admins update keys (e.g. ANTHROPIC_API_KEY) without
 * editing .env.local and restarting the server.
 */
export async function getSetting(
  key: string,
  envFallback?: string
): Promise<string | null> {
  let storedValue: string | null | undefined;
  try {
    const { rows } = await db.query<{ value: string | null }>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    storedValue = rows[0]?.value;
  } catch {
    // table may not exist on first boot — fall through to env
  }
  if (storedValue) return decryptSettingValue(storedValue);
  return envFallback ?? null;
}

export async function setSetting(key: string, value: string) {
  const storedValue = encryptSettingValue(value);
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, storedValue]
  );
}

/** Mask a secret for display: keep first 4 + last 4 chars. */
export function maskSecret(value: string | null): string {
  if (!value) return '';
  if (value.length <= 12) return '•'.repeat(value.length);
  return value.slice(0, 6) + '••••••••' + value.slice(-4);
}

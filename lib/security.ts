import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { db } from './db';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;
const DEFAULT_MAX_ACTIVE_USERS = 15;

type LoginAttempt = {
  firstFailureAt: number;
  failures: number;
  lockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

export function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    forwarded ??
    'local'
  );
}

function rawLoginKey(req: NextRequest, email: string) {
  return `${getClientIp(req)}:${email.trim().toLowerCase()}`;
}

function loginKey(req: NextRequest, email: string) {
  return crypto.createHash('sha256').update(rawLoginKey(req, email)).digest('hex');
}

function cleanupMemoryExpired(now: number) {
  for (const [key, attempt] of loginAttempts.entries()) {
    const windowExpired = now - attempt.firstFailureAt > LOGIN_WINDOW_MS;
    const lockExpired = attempt.lockedUntil > 0 && attempt.lockedUntil <= now;
    if (windowExpired || lockExpired) loginAttempts.delete(key);
  }
}

function getMemoryLoginBlock(req: NextRequest, email: string) {
  const now = Date.now();
  cleanupMemoryExpired(now);

  const attempt = loginAttempts.get(loginKey(req, email));
  if (!attempt || attempt.lockedUntil <= now) return null;

  return {
    retryAfterSeconds: Math.max(1, Math.ceil((attempt.lockedUntil - now) / 1000)),
  };
}

function recordMemoryLoginFailure(req: NextRequest, email: string) {
  const now = Date.now();
  cleanupMemoryExpired(now);

  const key = loginKey(req, email);
  const existing = loginAttempts.get(key);
  const attempt: LoginAttempt = existing && now - existing.firstFailureAt <= LOGIN_WINDOW_MS
    ? existing
    : { firstFailureAt: now, failures: 0, lockedUntil: 0 };

  attempt.failures += 1;
  if (attempt.failures >= MAX_LOGIN_FAILURES) {
    attempt.lockedUntil = now + LOGIN_LOCK_MS;
  }
  loginAttempts.set(key, attempt);

  return {
    failures: attempt.failures,
    locked: attempt.lockedUntil > now,
    retryAfterSeconds: attempt.lockedUntil > now
      ? Math.ceil((attempt.lockedUntil - now) / 1000)
      : 0,
  };
}

function recordMemoryLoginSuccess(req: NextRequest, email: string) {
  loginAttempts.delete(loginKey(req, email));
}

async function cleanupExpiredAttempts() {
  await db.query(
    `DELETE FROM login_attempts
     WHERE first_failure_at < NOW() - ($1 * INTERVAL '1 millisecond')
        OR (locked_until IS NOT NULL AND locked_until <= NOW())`,
    [LOGIN_WINDOW_MS]
  );
}

export async function getLoginBlock(req: NextRequest, email: string) {
  try {
    await cleanupExpiredAttempts();
    const { rows } = await db.query<{ retry_after_seconds: string | number }>(
      `SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW()))) AS retry_after_seconds
       FROM login_attempts
       WHERE key = $1 AND locked_until > NOW()`,
      [loginKey(req, email)]
    );
    const retryAfterSeconds = Number(rows[0]?.retry_after_seconds ?? 0);
    return retryAfterSeconds > 0 ? { retryAfterSeconds } : null;
  } catch {
    return getMemoryLoginBlock(req, email);
  }
}

export async function recordLoginFailure(req: NextRequest, email: string) {
  try {
    await cleanupExpiredAttempts();
    const { rows } = await db.query<{ failures: number; locked_until: Date | string | null }>(
      `WITH attempt AS (
         INSERT INTO login_attempts (key, first_failure_at, failures, locked_until, updated_at)
         VALUES ($1, NOW(), 1, NULL, NOW())
         ON CONFLICT (key) DO UPDATE SET
           first_failure_at = CASE
             WHEN login_attempts.first_failure_at < NOW() - ($2 * INTERVAL '1 millisecond')
             THEN NOW()
             ELSE login_attempts.first_failure_at
           END,
           failures = CASE
             WHEN login_attempts.first_failure_at < NOW() - ($2 * INTERVAL '1 millisecond')
             THEN 1
             ELSE login_attempts.failures + 1
           END,
           updated_at = NOW()
         RETURNING failures
       )
       UPDATE login_attempts
       SET locked_until = CASE
         WHEN attempt.failures >= $3 THEN NOW() + ($4 * INTERVAL '1 millisecond')
         ELSE NULL
       END
       FROM attempt
       WHERE login_attempts.key = $1
       RETURNING login_attempts.failures, login_attempts.locked_until`,
      [loginKey(req, email), LOGIN_WINDOW_MS, MAX_LOGIN_FAILURES, LOGIN_LOCK_MS]
    );

    const failures = Number(rows[0]?.failures ?? 1);
    const lockedUntil = rows[0]?.locked_until ? new Date(rows[0].locked_until).getTime() : 0;
    const now = Date.now();
    return {
      failures,
      locked: lockedUntil > now,
      retryAfterSeconds: lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0,
    };
  } catch {
    return recordMemoryLoginFailure(req, email);
  }
}

export async function recordLoginSuccess(req: NextRequest, email: string) {
  try {
    await db.query('DELETE FROM login_attempts WHERE key = $1', [loginKey(req, email)]);
  } catch {
    recordMemoryLoginSuccess(req, email);
  }
}

export function getMaxActiveUsers() {
  const configured = Number(process.env.SYSTEM_MAX_ACTIVE_USERS);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return DEFAULT_MAX_ACTIVE_USERS;
}

export function isStrongPassword(password: string) {
  return (
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

import { NextRequest } from 'next/server';

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

function loginKey(req: NextRequest, email: string) {
  return `${getClientIp(req)}:${email.trim().toLowerCase()}`;
}

function cleanupExpired(now: number) {
  for (const [key, attempt] of loginAttempts.entries()) {
    const windowExpired = now - attempt.firstFailureAt > LOGIN_WINDOW_MS;
    const lockExpired = attempt.lockedUntil > 0 && attempt.lockedUntil <= now;
    if (windowExpired || lockExpired) loginAttempts.delete(key);
  }
}

export function getLoginBlock(req: NextRequest, email: string) {
  const now = Date.now();
  cleanupExpired(now);

  const attempt = loginAttempts.get(loginKey(req, email));
  if (!attempt || attempt.lockedUntil <= now) return null;

  return {
    retryAfterSeconds: Math.max(1, Math.ceil((attempt.lockedUntil - now) / 1000)),
  };
}

export function recordLoginFailure(req: NextRequest, email: string) {
  const now = Date.now();
  cleanupExpired(now);

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

export function recordLoginSuccess(req: NextRequest, email: string) {
  loginAttempts.delete(loginKey(req, email));
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


import { SignJWT, jwtVerify } from 'jose';
import type { User } from './db';

const BUILD_PLACEHOLDER = 'build_time_placeholder_change_at_runtime';
const MIN_SECRET_LEN = 32;

/**
 * Decide whether a JWT_SECRET value is acceptable for the current phase.
 * Pure: returns the secret string on success, or an Error (un-thrown) on
 * failure. Callers decide whether to throw. Pure + non-throwing means the
 * function is trivially unit-testable.
 *
 * Special carve-out: during `next build` (NEXT_PHASE = phase-production-build)
 * we accept the build-time placeholder so the Dockerfile's two-stage build
 * still works. The bytes captured at build time never serve real traffic —
 * by the time `node server.js` runs, this module is re-loaded with the real
 * runtime env, and the strict checks kick in.
 */
export function validateJwtSecret(
  rawValue: string | undefined,
  phase: string | undefined,
): string | Error {
  if (phase === 'phase-production-build') {
    return rawValue || BUILD_PLACEHOLDER;
  }
  if (!rawValue) {
    return new Error(
      `JWT_SECRET is required at runtime. Set it to a random string at least ${MIN_SECRET_LEN} chars long.`,
    );
  }
  if (rawValue === BUILD_PLACEHOLDER) {
    return new Error(
      'JWT_SECRET is still the build-time placeholder. Set a real secret in your runtime env.',
    );
  }
  if (rawValue.length < MIN_SECRET_LEN) {
    return new Error(
      `JWT_SECRET is too short (${rawValue.length} chars). Use at least ${MIN_SECRET_LEN} chars.`,
    );
  }
  return rawValue;
}

const validation = validateJwtSecret(process.env.JWT_SECRET, process.env.NEXT_PHASE);
if (validation instanceof Error) {
  throw validation;
}

const SECRET = new TextEncoder().encode(validation);
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


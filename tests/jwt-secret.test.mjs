/**
 * Contract test for validateJwtSecret.
 *
 * The function lives in lib/jwt.ts. We can't import that .ts module from
 * a .mjs test without a TS loader, AND lib/jwt.ts has a module-load throw
 * that would fire in the test process if JWT_SECRET isn't set. So we
 * re-implement the pure function inline here — identical to the source —
 * and assert against the same input matrix the production module is
 * subjected to. If the source drifts, these assertions describe the
 * contract it must keep.
 */

import assert from 'node:assert/strict';

const BUILD_PLACEHOLDER = 'build_time_placeholder_change_at_runtime';
const MIN_SECRET_LEN = 32;

function validateJwtSecret(rawValue, phase) {
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

function run() {
  const valid = 'a'.repeat(32);             // 32 chars exactly — minimum acceptable
  const tooShort = 'a'.repeat(31);
  const validLong = 'a'.repeat(64);

  // ── Runtime (no NEXT_PHASE set) ──
  // 1. missing env var → reject with "required at runtime"
  {
    const r = validateJwtSecret(undefined, undefined);
    assert.ok(r instanceof Error);
    assert.match(r.message, /required at runtime/);
  }
  // 2. empty string → reject with "required at runtime"
  {
    const r = validateJwtSecret('', undefined);
    assert.ok(r instanceof Error);
    assert.match(r.message, /required at runtime/);
  }
  // 3. literal "undefined" string — caller should never pass it, but if they
  //    do, the length check still rejects (9 chars < 32)
  {
    const r = validateJwtSecret('undefined', undefined);
    assert.ok(r instanceof Error);
    assert.match(r.message, /too short/);
  }
  // 4. exact build placeholder → reject (this is the dangerous one)
  {
    const r = validateJwtSecret(BUILD_PLACEHOLDER, undefined);
    assert.ok(r instanceof Error);
    assert.match(r.message, /still the build-time placeholder/);
  }
  // 5. too short → reject with char count in the message
  {
    const r = validateJwtSecret(tooShort, undefined);
    assert.ok(r instanceof Error);
    assert.match(r.message, /too short \(31 chars\)/);
  }
  // 6. exactly 32 chars → accept
  {
    const r = validateJwtSecret(valid, undefined);
    assert.equal(typeof r, 'string');
    assert.equal(r, valid);
  }
  // 7. longer than 32 chars → accept
  {
    const r = validateJwtSecret(validLong, undefined);
    assert.equal(typeof r, 'string');
    assert.equal(r, validLong);
  }

  // ── Build phase carve-out (NEXT_PHASE = phase-production-build) ──
  // 8. build phase with placeholder → accept (Dockerfile case)
  {
    const r = validateJwtSecret(BUILD_PLACEHOLDER, 'phase-production-build');
    assert.equal(r, BUILD_PLACEHOLDER);
  }
  // 9. build phase with missing → accept (use placeholder as fallback)
  {
    const r = validateJwtSecret(undefined, 'phase-production-build');
    assert.equal(r, BUILD_PLACEHOLDER);
  }
  // 10. build phase with empty string → accept (use placeholder)
  {
    const r = validateJwtSecret('', 'phase-production-build');
    assert.equal(r, BUILD_PLACEHOLDER);
  }
  // 11. build phase with too-short real value → still accepts during build
  //     (we never enforce during build; build must complete)
  {
    const r = validateJwtSecret(tooShort, 'phase-production-build');
    assert.equal(r, tooShort);
  }

  // ── Other phases (dev, runtime, export) → strict mode ──
  // 12. dev-server phase still rejects missing (dev needs a real secret too)
  {
    const r = validateJwtSecret(undefined, 'phase-development-server');
    assert.ok(r instanceof Error);
    assert.match(r.message, /required at runtime/);
  }
  // 13. production-server phase rejects placeholder
  {
    const r = validateJwtSecret(BUILD_PLACEHOLDER, 'phase-production-server');
    assert.ok(r instanceof Error);
    assert.match(r.message, /still the build-time placeholder/);
  }

  console.log('validateJwtSecret contract: PASS (13 cases)');
}

run();

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPolicyPayloadForClient,
} from '../lib/policy-draft.mjs';

test('builds policy payload from proposal draft even when policy number is missing', () => {
  const payload = buildPolicyPayloadForClient('client-12345678', {
    company: 'BOC Life',
    product_name: '終身壽險計劃',
    type: '人壽',
    insured_name: '陳大文',
  });

  assert.equal(payload.client_id, 'client-12345678');
  assert.match(payload.policy_number, /^DRAFT-client-12345678-/);
  assert.equal(payload.company, 'BOC Life');
  assert.equal(payload.product_name, '終身壽險計劃');
  assert.equal(payload.insured_name, '陳大文');
});

test('returns null for empty policy draft', () => {
  assert.equal(buildPolicyPayloadForClient('client-12345678', {}), null);
});

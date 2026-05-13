import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractClientAndPolicyFromPolicyText,
} from '../lib/client-policy-pdf.mjs';

test('extracts insured contact and policy draft while ignoring agent contact', () => {
  const text = `
    Insurance Agent Name: Dennis Wong
    Agent Mobile: 6123 4567
    保險中介人電話：61234567

    Policyholder Name: Chan Tai Man
    Life Insured: Chan Tai Man
    Insured Mobile: 9123 4567
    Email: client@example.com
    Policy Number: BOC123456
    Company: BOC Life
    Product Name: Smart Saver Plan
    Policy Currency: USD
    Annual Premium: USD 12,000
    Sum Assured: USD 100,000
    Effective Date: 2026-05-01
  `;

  const result = extractClientAndPolicyFromPolicyText(text);

  assert.equal(result.client.name_en, 'Chan Tai Man');
  assert.equal(result.client.phone, '+852 91234567');
  assert.equal(result.client.email, 'client@example.com');
  assert.equal(result.policy.policy_number, 'BOC123456');
  assert.equal(result.policy.company, 'BOC Life');
  assert.equal(result.policy.product_name, 'Smart Saver Plan');
  assert.equal(result.policy.currency, 'USD');
  assert.equal(result.policy.premium, 12000);
  assert.equal(result.policy.sum_assured, 100000);
  assert.equal(result.policy.policyholder_name, 'Chan Tai Man');
  assert.equal(result.policy.insured_name, 'Chan Tai Man');
  assert.equal(result.policy.start_date, '2026-05-01');
});

test('normalizes spaced insured phone before falling back to agent phone', () => {
  const text = `
    Insurance Agent Name: Dennis Wong Agent Mobile: 6123 4567
    Life Insured: Chan Tai Man Insured Mobile: 9 1 2 3 4 5 6 7
    Policy Number: BOC123456 Company: BOC Life Product Name: Smart Saver Plan
  `;

  const result = extractClientAndPolicyFromPolicyText(text);

  assert.equal(result.client.phone, '+852 91234567');
});

test('prefers insured mobile when agent mobile appears earlier on the same extracted PDF line', () => {
  const text = 'Insurance Agent Name: Dennis Wong Agent Mobile: 6123 4567 Policyholder Name: Chan Tai Man Life Insured: Chan Tai Man Insured Mobile: 9123 4567 Email: client@example.com Policy Number: BOC123456 Company: BOC Life';

  const result = extractClientAndPolicyFromPolicyText(text);

  assert.equal(result.client.phone, '+852 91234567');
});

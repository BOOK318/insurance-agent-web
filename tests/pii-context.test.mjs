import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnonymizedContext } from '../lib/pii-filter.ts';

test('client AI context includes existing policies without policy numbers or names', () => {
  const { context } = buildAnonymizedContext({
    name_zh: '陳家進',
    dob: '1988-01-01',
    annual_income: 600000,
    policies: [
      {
        policy_number: '13IHK0520240709170101',
        company: 'BOC Life',
        type: '儲蓄',
        product_name: '目標五年網上保險計劃',
        currency: 'USD',
        premium: 20000,
        premium_frequency: '年繳',
        sum_assured: 100000,
        death_benefit: 110000,
        payment_period: '5年',
        breakeven_year: 8,
        scenario_20y_pessimistic: 150000,
        scenario_20y_optimistic: 180000,
        cash_value_notes: '第10年現金價值穩定',
        start_date: '2024-01-01',
        expiry_date: '2044-01-01',
        status: 'active',
        policyholder_name: '陳家進',
        insured_name: '陳家進',
      },
    ],
  });

  assert.match(context, /現有保單/);
  assert.match(context, /目標五年網上保險計劃/);
  assert.match(context, /儲蓄/);
  assert.match(context, /USD 20,000\/年繳/);
  assert.match(context, /保額：USD 100,000/);
  assert.match(context, /20年情景：悲觀 USD 150,000，樂觀 USD 180,000/);
  assert.doesNotMatch(context, /13IHK0520240709170101/);
  assert.doesNotMatch(context, /陳家進/);
});

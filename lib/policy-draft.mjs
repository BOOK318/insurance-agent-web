export function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function hasUsablePolicyDraft(policy) {
  return Boolean(policy?.policy_number || policy?.company || policy?.product_name);
}

export function buildPolicyPayloadForClient(clientId, policy) {
  if (!clientId || !hasUsablePolicyDraft(policy)) return null;

  const policyNumber = textOrNull(policy.policy_number) || `DRAFT-${clientId}-${Date.now()}`;
  const company = textOrNull(policy.company) || 'BOC Life';

  return {
    client_id: clientId,
    policy_number: policyNumber,
    company,
    type: textOrNull(policy.type) || '其他',
    product_name: textOrNull(policy.product_name),
    currency: textOrNull(policy.currency) || 'HKD',
    premium: numberOrNull(policy.premium),
    premium_frequency: textOrNull(policy.premium_frequency),
    sum_assured: numberOrNull(policy.sum_assured),
    death_benefit: numberOrNull(policy.death_benefit),
    policyholder_name: textOrNull(policy.policyholder_name),
    insured_name: textOrNull(policy.insured_name),
    start_date: textOrNull(policy.start_date),
    expiry_date: textOrNull(policy.expiry_date),
    status: 'active',
    notes: textOrNull(policy.notes) || '由客戶 PDF 上載時同步建立，請覆核保單資料。',
  };
}

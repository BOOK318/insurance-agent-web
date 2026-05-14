/**
 * PII Tokenization — runs locally, never touches Claude.
 *
 * Replaces identifying fields with placeholder tokens before sending
 * to Claude, then swaps them back in the response.
 *
 * Tokens used:
 *   [CLIENT]  — client name (zh or en)
 *   [PHONE]   — phone number
 *   [EMAIL]   — email address
 *   [HKID]    — HKID (if stored in notes)
 *
 * Fields sent to Claude (anonymized):
 *   age, occupation, annual_income, gender, nationality,
 *   family_notes, preferences, assets_notes, policies
 *
 * Fields NEVER sent to Claude:
 *   name_zh, name_en, phone, email, dob
 */

export interface TokenMap {
  [token: string]: string;
}

function formatMoney(value: unknown, currency = 'HKD') {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${currency} ${num.toLocaleString()}`;
}

function formatDateOnly(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function buildPolicyContextLines(policies: unknown[], scrubNotes: (s: string) => string) {
  if (!Array.isArray(policies) || policies.length === 0) return [];

  const lines = ['現有保單：'];
  policies.slice(0, 20).forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const policy = raw as Record<string, unknown>;
    const currency = String(policy.currency ?? 'HKD');
    const parts = [
      `#${index + 1}`,
      policy.status ? `狀態：${policy.status as string}` : null,
      policy.company ? `公司：${policy.company as string}` : null,
      policy.type ? `類型：${policy.type as string}` : null,
      policy.product_name ? `產品：${policy.product_name as string}` : null,
      formatMoney(policy.premium, currency)
        ? `保費：${formatMoney(policy.premium, currency)}${policy.premium_frequency ? `/${policy.premium_frequency as string}` : ''}`
        : null,
      formatMoney(policy.sum_assured, currency) ? `保額：${formatMoney(policy.sum_assured, currency)}` : null,
      formatMoney(policy.death_benefit, currency) ? `身故保障：${formatMoney(policy.death_benefit, currency)}` : null,
      policy.payment_period ? `供款期：${policy.payment_period as string}` : null,
      policy.breakeven_year ? `回本年：約第 ${Number(policy.breakeven_year).toLocaleString()} 年` : null,
      policy.scenario_20y_pessimistic || policy.scenario_20y_optimistic
        ? `20年情景：悲觀 ${formatMoney(policy.scenario_20y_pessimistic, currency) ?? 'N/A'}，樂觀 ${formatMoney(policy.scenario_20y_optimistic, currency) ?? 'N/A'}`
        : null,
      formatDateOnly(policy.start_date) ? `開始日：${formatDateOnly(policy.start_date)}` : null,
      formatDateOnly(policy.expiry_date) ? `到期日：${formatDateOnly(policy.expiry_date)}` : null,
      policy.cash_value_notes ? `現金價值/回報備註：${scrubNotes(policy.cash_value_notes as string)}` : null,
      policy.notes ? `保單備註：${scrubNotes(policy.notes as string)}` : null,
    ].filter((part): part is string => !!part);

    lines.push(`- ${parts.join('；')}`);
  });

  if (policies.length > 20) {
    lines.push(`- 另有 ${policies.length - 20} 張保單未列出，請先查閱保單頁再作完整建議。`);
  }

  return lines;
}

/** Build anonymized context string + a token→real-value map */
export function buildAnonymizedContext(client: Record<string, unknown>): {
  context: string;
  tokenMap: TokenMap;
} {
  const tokenMap: TokenMap = {};

  // Name token
  const name = ((client.name_zh ?? client.name_en) as string | null) ?? '此客戶';
  tokenMap['[CLIENT]'] = name;

  // Phone token (only if exists)
  if (client.phone) {
    tokenMap['[PHONE]'] = client.phone as string;
  }

  // Email token
  if (client.email) {
    tokenMap['[EMAIL]'] = client.email as string;
  }

  const scrubNotes = (s: string) => scrubFreeTextPII(s);

  // Build anonymized context lines (NO name, phone, email, DOB)
  const age =
    client.dob
      ? Math.floor(
          (Date.now() - new Date(client.dob as string).getTime()) /
            31_536_000_000
        )
      : (client.age as number | null) ?? null;

  const income = client.annual_income
    ? `HK$${Number(client.annual_income).toLocaleString()}/年`
    : null;

  const lines: string[] = [
    '客戶代號：[CLIENT]',
    age != null ? `年齡：${age}歲` : null,
    client.gender ? `性別：${client.gender === 'M' ? '男' : '女'}` : null,
    client.nationality ? `國籍：${scrubNotes(client.nationality as string)}` : null,
    client.occupation ? `職業：${client.occupation as string}` : null,
    income ? `年薪：${income}` : null,
    client.family_notes
      ? `家庭：${scrubNotes(client.family_notes as string)}`
      : null,
    client.preferences ? `喜好：${scrubNotes(client.preferences as string)}` : null,
    client.assets_notes
      ? `資產：${scrubNotes(client.assets_notes as string)}`
      : null,
    client.property_notes ? `物業：${scrubNotes(client.property_notes as string)}` : null,
    client.monthly_expenses ? `每月開支：約 HK$${Number(client.monthly_expenses).toLocaleString()}` : null,
    client.mortgage_balance ? `按揭/物業負債：約 HK$${Number(client.mortgage_balance).toLocaleString()}` : null,
    client.liabilities_notes ? `其他負債：${scrubNotes(client.liabilities_notes as string)}` : null,
    client.dependents_count != null ? `供養人數：${client.dependents_count as number}` : null,
    client.existing_coverage_notes ? `現有保障：${scrubNotes(client.existing_coverage_notes as string)}` : null,
    client.financial_goals ? `財務目標：${scrubNotes(client.financial_goals as string)}` : null,
    client.notes ? `備註：${scrubNotes(client.notes as string)}` : null,
    ...buildPolicyContextLines(client.policies as unknown[], scrubNotes),
  ].filter((l): l is string => l !== null);

  return { context: lines.join('\n'), tokenMap };
}

/** Replace tokens in Claude's response with real values */
export function detokenize(text: string, tokenMap: TokenMap): string {
  let result = text;
  for (const [token, value] of Object.entries(tokenMap)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

/** Quick helper: is a string a PII-like value we should not log? */
export function looksLikePII(s: string): boolean {
  // HKID pattern
  if (/^[A-Z]{1,2}\d{6}[\d(A)]$/i.test(s.trim())) return true;
  // HK phone
  if (/^\+?852[-\s]?\d{4}[-\s]?\d{4}$/.test(s.trim())) return true;
  return false;
}

/**
 * Best-effort scrubber for free-text extracted from images/voice before it
 * leaves the machine. Replaces obvious PII patterns with placeholder tokens.
 * Names are NOT scrubbed here (no NER) — only structured patterns.
 */
export function scrubFreeTextPII(text: string): string {
  return text
    // HKID e.g. A1234567 / A1234567(8) / AB1234567
    .replace(/\b[A-Z]{1,2}\d{6}\(?[\dA]\)?/gi, '[HKID]')
    // HK 8-digit phone, optionally with +852 / 852 prefix and spaces/dashes
    .replace(/(?:\+?852[-\s]?)?\b[2-9]\d{3}[-\s]?\d{4}\b/g, '[PHONE]')
    // Email
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[EMAIL]');
}

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

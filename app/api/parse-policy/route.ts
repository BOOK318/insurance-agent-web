import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { scrubFreeTextPII } from '../../../lib/pii-filter';
import { getSetting } from '../../../lib/settings';

export const runtime = 'nodejs';

const MODEL = 'claude-haiku-4-5';
const MAX_TOTAL_CHARS = 220_000;
const DIRECT_CHARS = 55_000;
const CHUNK_CHARS = 18_000;
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? 'qwen2.5vl:7b';
const MAX_OCR_IMAGES = 6;

type ClientRow = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
};

type TokenizedClient = {
  token: string;
  id: string;
  displayName: string;
  names: string[];
  hits: number;
};

type PolicyExtraction = {
  matched_client_token?: string | null;
  policyholder_name?: string | null;
  insured_name?: string | null;
  policy_number?: string | null;
  company?: string | null;
  type?: string | null;
  product_name?: string | null;
  currency?: string | null;
  premium?: number | string | null;
  premium_frequency?: string | null;
  sum_assured?: number | string | null;
  death_benefit?: number | string | null;
  payment_period?: string | null;
  breakeven_year?: number | string | null;
  breakeven_date?: string | null;
  maturity_date?: string | null;
  scenario_20y_pessimistic?: number | string | null;
  scenario_20y_optimistic?: number | string | null;
  cash_value_notes?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
};

type PolicyScanImage = {
  page?: number;
  base64?: string;
  mediaType?: string;
};

const TEXT_FIELDS: Array<keyof PolicyExtraction> = [
  'matched_client_token',
  'policyholder_name',
  'insured_name',
  'policy_number',
  'company',
  'type',
  'product_name',
  'currency',
  'premium_frequency',
  'payment_period',
  'cash_value_notes',
  'notes',
];

const NUMBER_FIELDS: Array<keyof PolicyExtraction> = [
  'premium',
  'sum_assured',
  'death_benefit',
  'breakeven_year',
  'scenario_20y_pessimistic',
  'scenario_20y_optimistic',
];

const DATE_FIELDS: Array<keyof PolicyExtraction> = [
  'breakeven_date',
  'maturity_date',
  'start_date',
  'expiry_date',
];

const SYSTEM_PROMPT = `你係香港保單 PDF 資料提取助手。

你收到嘅保單文字已經遮蔽個人身份資料。你只可以根據文件內容抽取欄位，唔好估客戶真名、身份證、電話或電郵。

請只回覆 JSON，唔好加 markdown。未搵到嘅欄位用 null。

欄位：
{
  "matched_client_token": "[CLIENT_1] 或 null",
  "policyholder_name": "[CLIENT_1] / [PERSON] / null",
  "insured_name": "[CLIENT_1] / [PERSON] / null",
  "policy_number": string|null,
  "company": string|null,
  "type": "醫療"|"危疾"|"人壽"|"年金"|"意外"|"儲蓄"|"投資相連"|"其他"|null,
  "product_name": string|null,
  "currency": "HKD"|"USD"|"CNY"|"AUD"|"CAD"|"GBP"|"EUR"|"SGD"|null,
  "premium": number|null,
  "premium_frequency": "月繳"|"季繳"|"半年繳"|"年繳"|"一次性"|null,
  "sum_assured": number|null,
  "death_benefit": number|null,
  "payment_period": string|null,
  "breakeven_year": number|null,
  "breakeven_date": "YYYY-MM-DD"|null,
  "maturity_date": "YYYY-MM-DD"|null,
  "scenario_20y_pessimistic": number|null,
  "scenario_20y_optimistic": number|null,
  "cash_value_notes": string|null,
  "start_date": "YYYY-MM-DD"|null,
  "expiry_date": "YYYY-MM-DD"|null,
  "notes": string|null
}

規則：
- 金額只輸出數字；貨幣按文件顯示輸出 currency，未見到先用 HKD。
- 20 年悲觀情況：優先用第 20 個保單年度嘅保證現金價值 / 保證退保價值。
- 20 年樂觀情況：優先用第 20 個保單年度嘅非保證 / illustrated / projected / high case 總價值。
- 回本期：如果文件有現金價值表，計第一個「現金價值或預計退保價值 >= 累積已繳保費」嘅年度；只得非保證表都可以用非保證預計回本。
- 身故賠償同基本保額唔同時，death_benefit 用文件寫明嘅身故賠償 / death benefit / amount payable on death。
- 唔好輸出 HKID、電話、電郵、地址。`;

function normalizeInput(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').replace(/\r\n/g, '\n').trim()
    : '';
}

async function callOllamaVision(imageBase64: string, pageLabel: string) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: '你係香港保單 OCR 助手。讀取保單/建議書圖片，提取所有可見文字、表格、數字、日期同保單資料。保持原有結構；只輸出提取文字，唔好加評論。',
        },
        {
          role: 'user',
          content: `請 OCR ${pageLabel}，保留保單號碼、公司、產品、保費、保額、現金價值表、身故賠償、日期等資料。`,
          images: [imageBase64],
        },
      ],
      stream: false,
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama Vision ${res.status}: ${text}`);
  }

  const data = await res.json() as { message?: { content?: string }; response?: string };
  return (data.message?.content ?? data.response ?? '').trim();
}

async function ocrPolicyImages(images: PolicyScanImage[]) {
  const validImages = images
    .filter(image => typeof image.base64 === 'string' && image.base64.length > 0)
    .slice(0, MAX_OCR_IMAGES);

  const pages: string[] = [];
  for (const image of validImages) {
    const pageLabel = image.page ? `第 ${image.page} 頁` : '其中一頁';
    const text = await callOllamaVision(image.base64 as string, pageLabel);
    if (text) {
      pages.push(`[本機 Ollama Vision OCR：${pageLabel}]\n${scrubFreeTextPII(text)}`);
    }
  }

  return {
    text: pages.join('\n\n').trim(),
    pagesProcessed: validImages.length,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeKnownClients(text: string, clients: ClientRow[]) {
  let result = text;
  const tokenized = clients.map((client, index): TokenizedClient => {
    const names = [client.name_zh, client.name_en]
      .filter((name): name is string => !!name && name.trim().length > 0)
      .map(name => name.trim());
    return {
      token: `[CLIENT_${index + 1}]`,
      id: client.id,
      displayName: names[0] ?? '未命名客戶',
      names,
      hits: 0,
    };
  });

  const replacements = tokenized
    .flatMap(client => client.names.map(name => ({ name, client })))
    .sort((a, b) => b.name.length - a.name.length);

  for (const { name, client } of replacements) {
    const pattern = new RegExp(escapeRegExp(name), 'gi');
    const matches = result.match(pattern);
    if (!matches) continue;
    client.hits += matches.length;
    result = result.replace(pattern, client.token);
  }

  return { text: result, clients: tokenized };
}

function redactLabeledNames(text: string) {
  const pattern =
    /(擬受保人|保單持有人|持有人|投保人|申請人|受保人|被保人|受益人|客戶姓名|保險中介人姓名|姓名|Policyholder Name|Policy Holder|Policyholder|Owner|Applicant|Proposer|Insured Name|Life Insured|Insured|Beneficiary)\s*([:：])\s*([^\n\r,，;；|]{2,80})/gi;

  return text.replace(pattern, (match, label: string, colon: string, value: string) => {
    if (/\[CLIENT_\d+\]/.test(value) || /\[(PERSON|HKID|PHONE|EMAIL)\]/.test(value)) {
      return match;
    }
    const nextLabelIndex = value.search(
      /(保障年期|性別|保費繳費年期|年齡|投保時之每年保費|保單貨幣|保險代理|聯絡電話)\s*[:：]/
    );
    if (nextLabelIndex > 0) {
      return `${label}${colon} [PERSON] ${value.slice(nextLabelIndex).trim()}`;
    }
    return `${label}${colon} [PERSON]`;
  });
}

function sanitizeForClaude(rawText: string, clients: ClientRow[]) {
  const limitedText = rawText.slice(0, MAX_TOTAL_CHARS);
  const { text: tokenizedText, clients: tokenizedClients } =
    tokenizeKnownClients(limitedText, clients);
  const scrubbed = redactLabeledNames(scrubFreeTextPII(tokenizedText))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    text: scrubbed,
    tokenizedClients,
    truncated: rawText.length > MAX_TOTAL_CHARS,
  };
}

function splitText(text: string) {
  if (text.length <= DIRECT_CHARS) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_CHARS, text.length);
    const nextBreak = text.lastIndexOf('\n\n', end);
    if (nextBreak > start + CHUNK_CHARS * 0.6) end = nextBreak;
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

function parseJSON<T>(text: string): T | null {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function asText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || /^null$/i.test(trimmed) || /^n\/a$/i.test(trimmed)) return null;
  return trimmed;
}

function asNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value.replace(/[,，]/g, '').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const num = Number(value.replace(/[,，]/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function normalizeCurrency(text: string) {
  if (/美元|USD/i.test(text)) return 'USD';
  if (/港元|港幣|HKD/i.test(text)) return 'HKD';
  if (/人民幣|CNY|RMB/i.test(text)) return 'CNY';
  if (/澳元|AUD/i.test(text)) return 'AUD';
  if (/加元|CAD/i.test(text)) return 'CAD';
  if (/英鎊|GBP/i.test(text)) return 'GBP';
  if (/歐羅|EUR/i.test(text)) return 'EUR';
  if (/新加坡元|SGD/i.test(text)) return 'SGD';
  return null;
}

type MainProjectionRow = {
  year: number;
  paid: number;
  guaranteedCash: number;
  cashTotal: number;
  deathTotal: number;
};

type ScenarioProjectionRow = {
  year: number;
  paid: number;
  guaranteedAmount: number;
  pessimisticTotal: number;
  optimisticTotal: number;
};

function uniqueRowsByYear<T extends { year: number }>(rows: T[]) {
  const map = new Map<number, T>();
  for (const row of rows) map.set(row.year, row);
  return Array.from(map.values()).sort((a, b) => a.year - b.year);
}

function sliceTableSection(
  text: string,
  headerIndex: number,
  maxChars: number,
  stopMarkers: string[]
) {
  let end = Math.min(text.length, headerIndex + maxChars);
  for (const marker of stopMarkers) {
    const markerIndex = text.indexOf(marker, headerIndex + 20);
    if (markerIndex !== -1 && markerIndex < end) end = markerIndex;
  }
  return text.slice(headerIndex, end);
}

function parseMainProjectionRows(text: string): MainProjectionRow[] {
  const rows: MainProjectionRow[] = [];
  const header = '保單 年度 終結 已繳總保費 現金價值總額 身故賠償總額';
  let searchFrom = 0;

  while (true) {
    const headerIndex = text.indexOf(header, searchFrom);
    if (headerIndex === -1) break;
    const section = sliceTableSection(text, headerIndex, 6000, [
      '基本計劃–現金價值總額–不同投資回報下',
      '基本計劃–身故賠償總額–不同投資回報下',
      '基本計劃–說明摘要–預繳保費戶口',
      '以上摘要說明',
    ]);
    const rowPattern =
      /(?:^|\s)(\d{1,3})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g;

    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(section)) !== null) {
      const year = Number(match[1]);
      const paid = parseMoney(match[2]);
      const guaranteedCash = parseMoney(match[3]);
      const cashTotal = parseMoney(match[6]);
      const deathTotal = parseMoney(match[10]);
      if (
        year >= 1 &&
        year <= 120 &&
        paid !== null &&
        guaranteedCash !== null &&
        cashTotal !== null &&
        deathTotal !== null
      ) {
        rows.push({ year, paid, guaranteedCash, cashTotal, deathTotal });
      }
    }

    searchFrom = headerIndex + header.length;
  }

  return uniqueRowsByYear(rows);
}

function parseScenarioRows(text: string, header: string): ScenarioProjectionRow[] {
  const headerIndex = text.indexOf(header);
  if (headerIndex === -1) return [];
  const section = sliceTableSection(text, headerIndex, 5000, [
    '基本計劃–現金價值總額–不同投資回報下',
    '基本計劃–身故賠償總額–不同投資回報下',
    '中銀集團人壽保險有限公司',
    '以上摘要說明',
  ]);
  const rows: ScenarioProjectionRow[] = [];
  const rowPattern =
    /(?:^|\s)(\d{1,3})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const year = Number(match[1]);
    const paid = parseMoney(match[2]);
    const guaranteedAmount = parseMoney(match[3]);
    const pessimisticTotal = parseMoney(match[6]);
    const optimisticTotal = parseMoney(match[9]);
    if (
      year >= 1 &&
      year <= 120 &&
      paid !== null &&
      guaranteedAmount !== null &&
      pessimisticTotal !== null &&
      optimisticTotal !== null
    ) {
      rows.push({ year, paid, guaranteedAmount, pessimisticTotal, optimisticTotal });
    }
  }

  return uniqueRowsByYear(rows);
}

function appendNote(notes: string[], note: string) {
  if (!notes.includes(note)) notes.push(note);
}

function extractLocalProposalFields(text: string): PolicyExtraction {
  const fields: PolicyExtraction = {};
  const notes: string[] = [];

  if (text.includes('中銀集團人壽保險有限公司')) {
    fields.company = '中銀集團人壽保險有限公司';
  }
  if (text.includes('鑄富世代環球終身壽險計劃')) {
    fields.product_name = '鑄富世代環球終身壽險計劃';
    fields.type = '人壽';
  }

  const currencyMatch = text.match(/保單貨幣\s*:\s*([^\s]+)/);
  const currency = normalizeCurrency(currencyMatch?.[1] ?? text.slice(0, 4000));
  if (currency) fields.currency = currency;

  const proposalNumber = asText(text.match(/建議書編號\s*:\s*([A-Z0-9]+)/i)?.[1]);
  if (proposalNumber) {
    fields.policy_number = proposalNumber;
    appendNote(notes, `建議書編號：${proposalNumber}`);
  }

  const printDate = text.match(/編印日期\s*:\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (printDate) {
    const yyyy = printDate[1];
    const mm = printDate[2].padStart(2, '0');
    const dd = printDate[3].padStart(2, '0');
    appendNote(notes, `編印日期：${yyyy}-${mm}-${dd}`);
  }

  const premium = parseMoney(text.match(/投保時之每年保費\s*:\s*([\d,]+(?:\.\d+)?)/)?.[1]);
  if (premium !== null) {
    fields.premium = premium;
    fields.premium_frequency = '年繳';
  }

  const paymentPeriod = text.match(/保費繳費年期\s*:\s*(\d+)\s*年/);
  if (paymentPeriod) fields.payment_period = `${paymentPeriod[1]} 年`;

  const notionalAmount = parseMoney(text.match(/名義金額\s*:\s*([\d,]+)/)?.[1]);
  if (notionalAmount !== null) {
    fields.sum_assured = notionalAmount;
    appendNote(notes, `名義金額：${currency ?? 'HKD'} ${notionalAmount.toLocaleString('zh-HK')}`);
  }

  const mainRows = parseMainProjectionRows(text);
  const cashScenarioRows = parseScenarioRows(
    text,
    '保單 年度 終結 已繳總保費 現金價值總額 保證金額 悲觀情景 樂觀情景'
  );
  const deathScenarioRows = parseScenarioRows(
    text,
    '保單 年度 終結 已繳總保費 身故賠償總額 保證金額 悲觀情景 樂觀情景'
  );

  const projectedBreakeven = mainRows.find(row => row.cashTotal >= row.paid);
  if (projectedBreakeven) {
    fields.breakeven_year = projectedBreakeven.year;
    appendNote(
      notes,
      `預計回本：第 ${projectedBreakeven.year} 個保單年度，現金價值總額 ${projectedBreakeven.cashTotal.toLocaleString('zh-HK')} >= 已繳總保費 ${projectedBreakeven.paid.toLocaleString('zh-HK')}。實際回本日期需按正式保單生效日計算。`
    );
  }

  const guaranteedBreakeven = mainRows.find(row => row.guaranteedCash >= row.paid);
  if (guaranteedBreakeven && guaranteedBreakeven.year !== projectedBreakeven?.year) {
    appendNote(notes, `保證現金價值回本：約第 ${guaranteedBreakeven.year} 個保單年度。`);
  }

  const mainYear20 = mainRows.find(row => row.year === 20);
  if (mainYear20) {
    fields.death_benefit = mainYear20.deathTotal;
    appendNote(
      notes,
      `第20年現時假設：現金價值總額 ${mainYear20.cashTotal.toLocaleString('zh-HK')}；身故賠償總額 ${mainYear20.deathTotal.toLocaleString('zh-HK')}。`
    );
  }

  const cashYear20 = cashScenarioRows.find(row => row.year === 20);
  if (cashYear20) {
    fields.scenario_20y_pessimistic = cashYear20.pessimisticTotal;
    fields.scenario_20y_optimistic = cashYear20.optimisticTotal;
    appendNote(
      notes,
      `第20年現金價值情景：悲觀 ${cashYear20.pessimisticTotal.toLocaleString('zh-HK')}；樂觀 ${cashYear20.optimisticTotal.toLocaleString('zh-HK')}。`
    );
  }

  const deathYear20 = deathScenarioRows.find(row => row.year === 20);
  if (deathYear20) {
    appendNote(
      notes,
      `第20年身故賠償情景：悲觀 ${deathYear20.pessimisticTotal.toLocaleString('zh-HK')}；樂觀 ${deathYear20.optimisticTotal.toLocaleString('zh-HK')}。`
    );
  }

  if (notes.length > 0) fields.cash_value_notes = notes.join('\n');
  return fields;
}

function appendUnique(current: string | null | undefined, next: string) {
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current}\n${next}`;
}

function replaceClientTokens(value: string, tokenizedClients: TokenizedClient[]) {
  let result = value;
  for (const client of tokenizedClients) {
    result = result.replaceAll(client.token, client.displayName);
  }
  return result.replace(/\[PERSON\]/g, '').trim() || null;
}

function mergeExtractions(parts: PolicyExtraction[], tokenizedClients: TokenizedClient[]) {
  const merged: PolicyExtraction = {};
  const mergedRecord = merged as Record<string, unknown>;

  for (const part of parts) {
    for (const field of TEXT_FIELDS) {
      const value = asText(part[field]);
      if (!value) continue;

      if (field === 'matched_client_token') {
        if (!merged[field]) merged[field] = value;
        continue;
      }

      if (field === 'cash_value_notes' || field === 'notes') {
        merged[field] = appendUnique(merged[field] as string | null, replaceClientTokens(value, tokenizedClients) ?? value);
        continue;
      }

      if (merged[field]) continue;
      if ((field === 'policyholder_name' || field === 'insured_name') && value === '[PERSON]') continue;
      merged[field] = replaceClientTokens(value, tokenizedClients) ?? value;
    }

    for (const field of NUMBER_FIELDS) {
      if (mergedRecord[field] !== undefined && mergedRecord[field] !== null) continue;
      const value = asNumber(part[field]);
      if (value !== null) mergedRecord[field] = value;
    }

    for (const field of DATE_FIELDS) {
      if (mergedRecord[field]) continue;
      const value = asDate(part[field]);
      if (value) mergedRecord[field] = value;
    }
  }

  return merged;
}

function applyLocalProposalFields(
  aiFields: PolicyExtraction,
  localFields: PolicyExtraction
) {
  const merged = { ...aiFields };
  const mergedRecord = merged as Record<string, unknown>;
  const localRecord = localFields as Record<string, unknown>;
  const reliableLocalFields = new Set([
    'company',
    'type',
    'product_name',
    'currency',
    'policy_number',
    'premium',
    'premium_frequency',
    'sum_assured',
    'payment_period',
    'breakeven_year',
    'death_benefit',
    'scenario_20y_pessimistic',
    'scenario_20y_optimistic',
  ]);

  for (const [key, value] of Object.entries(localRecord)) {
    if (value === null || value === undefined || value === '') continue;

    if (key === 'cash_value_notes') {
      const current = asText(mergedRecord[key]);
      const next = asText(value);
      if (next) mergedRecord[key] = appendUnique(current, next);
      continue;
    }

    if (reliableLocalFields.has(key) || !mergedRecord[key]) {
      mergedRecord[key] = value;
    }
  }

  return merged;
}

function dateAfterPolicyYears(startDate: unknown, years: unknown) {
  const date = asDate(startDate);
  const yearCount = asNumber(years);
  if (!date || yearCount === null) return null;
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCFullYear(result.getUTCFullYear() + Math.floor(yearCount));
  return result.toISOString().slice(0, 10);
}

function resolveClientId(merged: PolicyExtraction, tokenizedClients: TokenizedClient[]) {
  const tokenValues = [
    merged.matched_client_token,
    merged.policyholder_name,
    merged.insured_name,
  ].filter((value): value is string => typeof value === 'string');

  for (const value of tokenValues) {
    const token = value.match(/\[CLIENT_\d+\]/)?.[0];
    const match = tokenizedClients.find(client => client.token === token);
    if (match) return match.id;
  }

  const mentioned = tokenizedClients.filter(client => client.hits > 0);
  return mentioned.length === 1 ? mentioned[0].id : null;
}

function buildUserPrompt(chunk: string, index: number, total: number, tokenizedClients: TokenizedClient[]) {
  const activeTokens = tokenizedClients
    .filter(client => client.hits > 0)
    .map(client => client.token)
    .join(', ') || '沒有';

  return `文件分段 ${index}/${total}
已知客戶代號：${activeTokens}

請從以下保單文字抽取 JSON：

${chunk}`;
}

async function extractChunk(
  anthropic: Anthropic,
  chunk: string,
  index: number,
  total: number,
  tokenizedClients: TokenizedClient[]
) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1600,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(chunk, index, total, tokenizedClients),
      },
    ],
  });

  const block = response.content[0];
  const raw = block?.type === 'text' ? block.text : '';
  return parseJSON<PolicyExtraction>(raw);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    text?: string;
    fileName?: string;
    images?: PolicyScanImage[];
  };
  let rawText = normalizeInput(body.text);
  let scannedPagesProcessed = 0;

  if (rawText.length < 1000 && Array.isArray(body.images) && body.images.length > 0) {
    try {
      const ocr = await ocrPolicyImages(body.images);
      scannedPagesProcessed = ocr.pagesProcessed;
      rawText = [rawText, ocr.text].filter(Boolean).join('\n\n').trim();
    } catch (err) {
      if (rawText.length < 20) {
        return NextResponse.json(
          { error: '掃描版 PDF OCR 失敗：' + (err as Error).message + '。請確認本機 Ollama Vision 已啟動。' },
          { status: 503 }
        );
      }
    }
  }

  if (rawText.length < 20) {
    return NextResponse.json(
      { error: 'PDF 入面未讀到足夠文字；如果係掃描 PDF，請確認本機 Ollama Vision 已啟動後再試。' },
      { status: 400 }
    );
  }

  const localFields = extractLocalProposalFields(rawText);
  const hasLocalFields = Object.keys(localFields).some(key => {
    const value = (localFields as Record<string, unknown>)[key];
    return value !== null && value !== undefined && value !== '';
  });

  const apiKey = await getSetting('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY);
  if (!apiKey || apiKey.startsWith('sk-ant-replace')) {
    if (hasLocalFields) {
      return NextResponse.json({
        client_id: null,
        fields: localFields,
        chunks_processed: 0,
        redacted: true,
        truncated: rawText.length > MAX_TOTAL_CHARS,
        file_name: body.fileName ?? null,
        local_rules: true,
        scanned_pages_processed: scannedPagesProcessed,
      });
    }
    return NextResponse.json(
      { error: 'AI 未配置，請先喺管理員設定 Anthropic API key。' },
      { status: 503 }
    );
  }

  const { rows: clients } = await db.query<ClientRow>(
    'SELECT id, name_zh, name_en FROM clients WHERE agent_id = $1 AND deleted_at IS NULL',
    [user.id]
  );
  const sanitized = sanitizeForClaude(rawText, clients);
  const chunks = splitText(sanitized.text);

  const isOAuth = apiKey.startsWith('sk-ant-oat');
  const anthropic = isOAuth
    ? new Anthropic({
        apiKey: null,
        authToken: apiKey,
        defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
      })
    : new Anthropic({ apiKey });

  const extractions: PolicyExtraction[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const extraction = await extractChunk(
      anthropic,
      chunk,
      index + 1,
      chunks.length,
      sanitized.tokenizedClients
    );
    if (extraction) extractions.push(extraction);
  }

  if (extractions.length === 0) {
    if (hasLocalFields) {
      return NextResponse.json({
        client_id: null,
        fields: localFields,
        chunks_processed: chunks.length,
        redacted: true,
        truncated: sanitized.truncated,
        file_name: body.fileName ?? null,
        local_rules: true,
        scanned_pages_processed: scannedPagesProcessed,
      });
    }
    return NextResponse.json(
      { error: 'AI 未能從 PDF 抽取保單資料，請改用較清晰文字版 PDF 或手動輸入。' },
      { status: 422 }
    );
  }

  const fields = applyLocalProposalFields(
    mergeExtractions(extractions, sanitized.tokenizedClients),
    localFields
  );
  if (!fields.breakeven_date && fields.start_date && fields.breakeven_year) {
    fields.breakeven_date = dateAfterPolicyYears(fields.start_date, fields.breakeven_year);
  }
  const clientId = resolveClientId(fields, sanitized.tokenizedClients);
  delete fields.matched_client_token;

  return NextResponse.json({
    client_id: clientId,
    fields,
    chunks_processed: chunks.length,
    redacted: true,
    truncated: sanitized.truncated,
    file_name: body.fileName ?? null,
    scanned_pages_processed: scannedPagesProcessed,
  });
}

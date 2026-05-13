const CLIENT_NAME_LABELS = [
  'Life Insured',
  'Insured Name',
  'Insured',
  '受保人姓名',
  '受保人',
  '被保人',
  'Policyholder Name',
  'Policy Holder',
  'Policyholder',
  'Owner',
  'Applicant',
  'Proposer',
  '保單持有人',
  '投保人',
  '申請人',
];

const CLIENT_PHONE_LABELS = [
  'Insured Mobile',
  'Insured Phone',
  'Life Insured Mobile',
  'Life Insured Phone',
  'Mobile',
  'Phone',
  'Tel',
  '受保人電話',
  '受保人手提',
  '客戶電話',
  '手提電話',
  '電話',
];

const AGENT_MARKERS = [
  'agent',
  'advisor',
  'adviser',
  'consultant',
  'producer',
  'intermediary',
  '中介',
  '代理',
  '顧問',
  '業務員',
  '保險中介人',
];

const FIELD_LABELS = [
  ...CLIENT_NAME_LABELS,
  ...CLIENT_PHONE_LABELS,
  'Email',
  'E-mail',
  '電郵',
  '電子郵件',
  'Policy Number',
  'Policy No',
  'Policy / Proposal Number',
  'Proposal Number',
  '保單號碼',
  '保單編號',
  '建議書編號',
  'Company',
  'Insurer',
  'Insurance Company',
  '保險公司',
  'Product Name',
  'Plan Name',
  'Product',
  '產品名稱',
  '計劃名稱',
  'Policy Currency',
  'Currency',
  '保單貨幣',
  '貨幣',
  'Annual Premium',
  'Premium',
  '每年保費',
  '保費',
  'Sum Assured',
  'Basic Sum Assured',
  'Notional Amount',
  '名義金額',
  '保額',
  'Death Benefit',
  '身故賠償',
  'Effective Date',
  'Start Date',
  'Issue Date',
  '生效日期',
  '保單生效日',
];

const PDF_CJK_GLYPH_MAP = new Map([
  ['⼈', '人'],
  ['⼤', '大'],
  ['⽂', '文'],
  ['⽣', '生'],
  ['⾝', '身'],
]);

function normalizePdfCjkGlyphs(value) {
  return String(value ?? '').replace(/[⼈⼤⽂⽣⾝]/g, char => PDF_CJK_GLYPH_MAP.get(char) ?? char);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizePolicyPdfText(text) {
  return normalizePdfCjkGlyphs(text)
    .normalize('NFKC')
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactText(text) {
  return normalizePolicyPdfText(text).replace(/\s+/g, ' ').trim();
}

function isAgentContext(text) {
  const lower = text.toLowerCase();
  return AGENT_MARKERS.some(marker => lower.includes(marker.toLowerCase()));
}

function labelPattern(labels) {
  return labels
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
}

function readLabelValue(text, labels) {
  const normalized = compactText(text);
  const labelsRe = labelPattern(labels);
  const nextRe = labelPattern(FIELD_LABELS);
  const re = new RegExp(`(?:${labelsRe})\\s*[:：]?\\s*(.*?)(?=\\s+(?:${nextRe})\\s*[:：]?|$)`, 'i');
  return normalized.match(re)?.[1]?.trim() || null;
}

function readNonAgentLabelValue(text, labels) {
  const lines = normalizePolicyPdfText(text).split('\n');
  const labelsRe = new RegExp(`(?:${labelPattern(labels)})\\s*[:：]?\\s*(.+)$`, 'i');
  for (const line of lines) {
    if (isAgentContext(line)) continue;
    const value = line.match(labelsRe)?.[1]?.trim();
    if (value) return value;
  }
  return readLabelValue(text, labels);
}

function firstEmail(text) {
  return compactText(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
}

function normalizePhone(value) {
  if (!value) return null;
  const match = value.match(/(?:\+?852[\s-]?)?([569](?:[\s-]?\d){7})/);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length === 8 ? `+852 ${digits}` : null;
}

function findClientPhone(text) {
  const highConfidenceLabeled = normalizePhone(readLabelValue(text, [
    'Insured Mobile',
    'Insured Phone',
    'Life Insured Mobile',
    'Life Insured Phone',
    'Client Mobile',
    'Client Phone',
    'Customer Mobile',
    'Customer Phone',
    '受保人電話',
    '受保人手提',
    '被保人電話',
    '被保人手提',
    '客戶電話',
    '客戶手提',
  ]));
  if (highConfidenceLabeled) return highConfidenceLabeled;

  return null;
}

function normalizeAmount(value) {
  if (!value) return null;
  const match = String(value).match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function normalizeCurrency(text) {
  if (!text) return null;
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

function inferPolicyType(text) {
  if (/危疾|critical/i.test(text)) return '危疾';
  if (/醫療|medical|VHIS/i.test(text)) return '醫療';
  if (/年金|annuity/i.test(text)) return '年金';
  if (/意外|accident/i.test(text)) return '意外';
  if (/儲蓄|saving|saver|wealth|cash value/i.test(text)) return '儲蓄';
  if (/投資相連|investment linked|ILAS/i.test(text)) return '投資相連';
  if (/人壽|life|death benefit/i.test(text)) return '人壽';
  return '其他';
}

function cleanName(value) {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+(?:Gender|Sex|Phone|Mobile|Tel|Email|DOB|Date of birth|Policy Number|保單號碼|電話|電郵|性別)\b.*$/i, '')
    .replace(/[，,。；;|].*$/u, '')
    .replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/gu, '')
    .replace(/\s*(?:先生|女士|小姐|太太)\s*$/u, '')
    .trim();

  if (!cleaned) return null;
  if (cleaned.length > 60) return null;
  if (/(保單|保費|權益|條款|保障|計劃|預繳|退保|現金價值|利率|身故|摘要|建議書|申請|%|\d{4,})/u.test(cleaned)) {
    return null;
  }

  const chinese = cleaned.match(/^[\u4e00-\u9fff]{2,8}$/u)?.[0];
  if (chinese) return chinese;

  const english = cleaned.match(/^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,5}$/)?.[0];
  if (english) return english;

  return null;
}

function findProposalAddresseeName(text) {
  const lines = normalizePolicyPdfText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    if (!/(敬啟者|敬啓者|台鑒|鈞鑒|尊敬的客戶)/u.test(lines[i])) continue;

    for (const candidateLine of lines.slice(i + 1, i + 4)) {
      const candidate = cleanName(candidateLine);
      if (candidate) return candidate;
    }
  }

  const compact = compactText(text);
  const inline = compact.match(/(?:敬啟者|敬啓者|台鑒|鈞鑒|尊敬的客戶)\s+([\u4e00-\u9fff]{2,8})(?:\s*(?:先生|女士|小姐|太太))?/u)?.[1];
  return cleanName(inline);
}

export function extractClientAndPolicyFromPolicyText(text) {
  const normalized = normalizePolicyPdfText(text);
  const compact = compactText(normalized);
  const insuredName = cleanName(readNonAgentLabelValue(normalized, [
    'Life Insured',
    'Insured Name',
    'Insured',
    '受保人姓名',
    '受保人',
    '被保人',
  ]));
  const policyholderName = cleanName(readNonAgentLabelValue(normalized, [
    'Policyholder Name',
    'Policy Holder',
    'Policyholder',
    'Owner',
    'Applicant',
    'Proposer',
    '保單持有人',
    '投保人',
    '申請人',
  ]));
  const proposalAddresseeName = findProposalAddresseeName(normalized);
  const clientName = insuredName || policyholderName || proposalAddresseeName;

  const policyNumber = readLabelValue(normalized, [
    'Policy / Proposal Number',
    'Policy Number',
    'Policy No',
    'Proposal Number',
    '保單號碼',
    '保單編號',
    '建議書編號',
  ]);
  const company = readLabelValue(normalized, [
    'Insurance Company',
    'Company',
    'Insurer',
    '保險公司',
  ]);
  const productName = readLabelValue(normalized, [
    'Product Name',
    'Plan Name',
    'Product',
    '產品名稱',
    '計劃名稱',
  ]);
  const currencyText = readLabelValue(normalized, ['Policy Currency', 'Currency', '保單貨幣', '貨幣']) || compact.slice(0, 2000);
  const premiumText = readLabelValue(normalized, ['Annual Premium', 'Premium', '每年保費', '保費']);
  const sumAssuredText = readLabelValue(normalized, ['Sum Assured', 'Basic Sum Assured', 'Notional Amount', '名義金額', '保額']);
  const deathBenefitText = readLabelValue(normalized, ['Death Benefit', '身故賠償']);
  const startDateText = readLabelValue(normalized, ['Effective Date', 'Start Date', 'Issue Date', '生效日期', '保單生效日']);

  const client = {};
  if (clientName) {
    if (/[\u4e00-\u9fff]/.test(clientName)) client.name_zh = clientName;
    else client.name_en = clientName;
  }

  const phone = findClientPhone(normalized);
  if (phone) client.phone = phone;

  const email = firstEmail(normalized);
  if (email) client.email = email;

  const policy = {};
  if (policyNumber) policy.policy_number = policyNumber;
  if (company) policy.company = company;
  if (productName) policy.product_name = productName;

  const policyContext = [productName, compact.slice(0, 4000)].filter(Boolean).join(' ');
  if (policyNumber || company || productName) policy.type = inferPolicyType(policyContext);

  const currency = normalizeCurrency(currencyText);
  if (currency) policy.currency = currency;

  const premium = normalizeAmount(premiumText);
  if (premium !== null) {
    policy.premium = premium;
    policy.premium_frequency = /monthly|每月|月繳/i.test(premiumText) ? '月繳' : '年繳';
  }

  const sumAssured = normalizeAmount(sumAssuredText);
  if (sumAssured !== null) policy.sum_assured = sumAssured;

  const deathBenefit = normalizeAmount(deathBenefitText);
  if (deathBenefit !== null) policy.death_benefit = deathBenefit;

  const startDate = normalizeDate(startDateText);
  if (startDate) policy.start_date = startDate;

  if (policyholderName || proposalAddresseeName) policy.policyholder_name = policyholderName || proposalAddresseeName;
  if (insuredName || proposalAddresseeName) policy.insured_name = insuredName || proposalAddresseeName;

  return { client, policy };
}

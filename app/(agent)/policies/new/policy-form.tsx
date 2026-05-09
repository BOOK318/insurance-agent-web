'use client';

import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, Save, Upload, X } from 'lucide-react';

export type PolicyClientOption = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
  phone: string | null;
};

export type PolicyFields = {
  client_id: string;
  policy_number: string;
  company: string;
  type: string;
  product_name: string;
  currency: string;
  premium: string;
  premium_frequency: string;
  sum_assured: string;
  death_benefit: string;
  policyholder_name: string;
  insured_name: string;
  payment_period: string;
  breakeven_year: string;
  breakeven_date: string;
  maturity_date: string;
  scenario_20y_pessimistic: string;
  scenario_20y_optimistic: string;
  cash_value_notes: string;
  start_date: string;
  expiry_date: string;
  status: string;
  notes: string;
};

export type PolicyFormInitial = Partial<Record<keyof PolicyFields, string | number | null>>;

type ParsePolicyResponse = {
  client_id?: string | null;
  fields?: Partial<Record<keyof PolicyFields, string | number | null>>;
  chunks_processed?: number;
  truncated?: boolean;
  scanned_pages_processed?: number;
  local_rules?: boolean;
  error?: string;
};

type PolicyScanImage = {
  page: number;
  base64: string;
  mediaType: 'image/jpeg';
};

type ExtractedPolicyPdf = {
  text: string;
  scannedImages: PolicyScanImage[];
  totalPages: number;
};

const MAX_POLICY_TEXT_CHARS = 220_000;
const POLICY_TYPES = ['醫療', '危疾', '人壽', '年金', '意外', '儲蓄', '投資相連', '其他'];
const CURRENCY_OPTIONS = ['HKD', 'USD', 'CNY', 'AUD', 'CAD', 'GBP', 'EUR', 'SGD'];
const PREMIUM_FREQUENCIES = ['月繳', '季繳', '半年繳', '年繳', '一次性'];
const STATUS_OPTIONS = [
  { value: 'active', label: '生效' },
  { value: 'lapsed', label: '失效' },
  { value: 'surrendered', label: '退保' },
];

function clientName(client: PolicyClientOption) {
  return client.name_zh || client.name_en || '未命名客戶';
}

function cleanText(value: string) {
  const text = value.trim();
  return text || null;
}

function cleanNumber(value: string) {
  const text = value.trim();
  return text ? Number(text) : null;
}

function cleanDate(value: string) {
  return value || null;
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function toFieldString(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toInputDate(value: string | number | null | undefined) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : '';
}

export function NewPolicyForm({
  clients,
  selectedClientId,
  initialPolicy,
  policyId,
}: {
  clients: PolicyClientOption[];
  selectedClientId: string;
  initialPolicy?: PolicyFormInitial;
  policyId?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEditing = Boolean(policyId);
  const [fields, setFields] = useState<PolicyFields>({
    client_id: toFieldString(initialPolicy?.client_id) || selectedClientId,
    policy_number: toFieldString(initialPolicy?.policy_number),
    company: toFieldString(initialPolicy?.company),
    type: toFieldString(initialPolicy?.type),
    product_name: toFieldString(initialPolicy?.product_name),
    currency: toFieldString(initialPolicy?.currency) || 'HKD',
    premium: toFieldString(initialPolicy?.premium),
    premium_frequency: toFieldString(initialPolicy?.premium_frequency) || '年繳',
    sum_assured: toFieldString(initialPolicy?.sum_assured),
    death_benefit: toFieldString(initialPolicy?.death_benefit),
    policyholder_name: toFieldString(initialPolicy?.policyholder_name),
    insured_name: toFieldString(initialPolicy?.insured_name),
    payment_period: toFieldString(initialPolicy?.payment_period),
    breakeven_year: toFieldString(initialPolicy?.breakeven_year),
    breakeven_date: toInputDate(initialPolicy?.breakeven_date),
    maturity_date: toInputDate(initialPolicy?.maturity_date),
    scenario_20y_pessimistic: toFieldString(initialPolicy?.scenario_20y_pessimistic),
    scenario_20y_optimistic: toFieldString(initialPolicy?.scenario_20y_optimistic),
    cash_value_notes: toFieldString(initialPolicy?.cash_value_notes),
    start_date: toInputDate(initialPolicy?.start_date),
    expiry_date: toInputDate(initialPolicy?.expiry_date),
    status: toFieldString(initialPolicy?.status) || 'active',
    notes: toFieldString(initialPolicy?.notes),
  });
  const [saving, setSaving] = useState(false);
  const [parsingPolicy, setParsingPolicy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [importNote, setImportNote] = useState('');

  const backHref = fields.client_id ? `/clients/${fields.client_id}` : '/policies';

  function set<K extends keyof PolicyFields>(key: K, value: PolicyFields[K]) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  function applyParsedPolicy(data: ParsePolicyResponse) {
    const parsed = data.fields ?? {};
    setFields(prev => {
      const next = { ...prev };
      if (data.client_id && clients.some(client => client.id === data.client_id)) {
        next.client_id = data.client_id;
      }

      const textFields: Array<keyof PolicyFields> = [
        'policy_number',
        'company',
        'type',
        'product_name',
        'currency',
        'premium',
        'premium_frequency',
        'sum_assured',
        'death_benefit',
        'policyholder_name',
        'insured_name',
        'payment_period',
        'breakeven_year',
        'scenario_20y_pessimistic',
        'scenario_20y_optimistic',
        'cash_value_notes',
        'notes',
      ];

      for (const key of textFields) {
        const value = toFieldString(parsed[key]);
        if (value) next[key] = value;
      }

      const dateFields: Array<keyof PolicyFields> = [
        'breakeven_date',
        'maturity_date',
        'start_date',
        'expiry_date',
      ];
      for (const key of dateFields) {
        const value = toInputDate(parsed[key]);
        if (value) next[key] = value;
      }

      return next;
    });
  }

  async function parsePolicyPdf(file: File) {
    if (!isPdf(file)) {
      setError('請上傳 PDF 檔案');
      return;
    }

    setParsingPolicy(true);
    setError('');
    setImportNote('');

    try {
      const extracted = await extractPolicyPdf(file);
      const res = await fetch('/api/parse-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: extracted.text,
          images: extracted.scannedImages,
          fileName: file.name,
        }),
      });
      const data = await res.json().catch(() => ({})) as ParsePolicyResponse;
      if (!res.ok) throw new Error(data.error || 'PDF 解析失敗');

      applyParsedPolicy(data);
      const chunkText = data.chunks_processed ? `，已分析 ${data.chunks_processed} 段` : '';
      const scannedText = data.scanned_pages_processed
        ? `，掃描版 OCR ${data.scanned_pages_processed} 頁`
        : extracted.scannedImages.length > 0
          ? `，已提交掃描 OCR ${extracted.scannedImages.length} 頁`
          : '';
      const truncated = data.truncated ? '。文件太長，已先處理前段主要內容' : '';
      const localOnly = data.local_rules ? '（只用本地規則，未經 Claude）' : '';
      setImportNote(`已從 PDF 自動填入保單資料${chunkText}${scannedText}${truncated}${localOnly}，請覆核後儲存。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 解析失敗，請再試一次');
    } finally {
      setParsingPolicy(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fields.client_id || !fields.policy_number.trim() || !fields.company.trim() || !fields.type) {
      setError('請填妥客戶、保單號碼、保險公司同保單類型');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(policyId ? `/api/policies/${policyId}` : '/api/policies', {
        method: policyId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: fields.client_id,
          policy_number: fields.policy_number.trim(),
          company: fields.company.trim(),
          type: fields.type,
          product_name: cleanText(fields.product_name),
          currency: fields.currency || 'HKD',
          premium: cleanNumber(fields.premium),
          premium_frequency: cleanText(fields.premium_frequency),
          sum_assured: cleanNumber(fields.sum_assured),
          death_benefit: cleanNumber(fields.death_benefit),
          policyholder_name: cleanText(fields.policyholder_name),
          insured_name: cleanText(fields.insured_name),
          payment_period: cleanText(fields.payment_period),
          breakeven_year: cleanNumber(fields.breakeven_year),
          breakeven_date: cleanDate(fields.breakeven_date),
          maturity_date: cleanDate(fields.maturity_date),
          scenario_20y_pessimistic: cleanNumber(fields.scenario_20y_pessimistic),
          scenario_20y_optimistic: cleanNumber(fields.scenario_20y_optimistic),
          cash_value_notes: cleanText(fields.cash_value_notes),
          start_date: cleanDate(fields.start_date),
          expiry_date: cleanDate(fields.expiry_date),
          status: fields.status,
          notes: cleanText(fields.notes),
        }),
      });

      const data = await res.json().catch(() => ({})) as { client_id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || (isEditing ? '更新保單失敗' : '儲存保單失敗'));

      router.push(`/clients/${data.client_id ?? fields.client_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEditing ? '更新保單失敗，請再試一次' : '儲存保單失敗，請再試一次'));
      setSaving(false);
    }
  }

  function handleDrag(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (parsingPolicy) return;
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (parsingPolicy) return;

    const file = Array.from(e.dataTransfer.files).find(isPdf);
    if (!file) {
      setError('請上傳 PDF 檔案');
      return;
    }
    void parsePolicyPdf(file);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Link
          href={backHref}
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{isEditing ? '編輯保單' : '新增保單'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isEditing ? '更新保單資料、回本同保障數字' : '記低客戶保單資料同到期日'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {importNote && (
        <div className="mb-4 bg-blue-50 border border-blue-100 text-blue-800 text-sm rounded-2xl px-4 py-3">
          {importNote}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`bg-white rounded-2xl shadow-sm border p-4 transition ${
            dragActive ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void parsePolicyPdf(file);
              e.currentTarget.value = '';
            }}
          />
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              {parsingPolicy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">PDF 匯入保單資料</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEditing ? '可重新匯入 PDF 覆蓋表格內容' : '文字版直接抽取；掃描版會用本機 Ollama Vision OCR 前幾頁'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsingPolicy}
              className="shrink-0 rounded-full bg-blue-700 text-white text-xs font-semibold px-3 py-2 hover:bg-blue-800 disabled:opacity-60 transition"
            >
              {parsingPolicy ? '分析中' : '選 PDF'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-700" />
            <p className="text-sm font-semibold text-gray-900">保單資料</p>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">客戶</label>
            <select
              value={fields.client_id}
              onChange={e => set('client_id', e.target.value)}
              disabled={clients.length === 0}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
            >
              <option value="">{clients.length === 0 ? '未有客戶' : '選擇客戶'}</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {clientName(client)}{client.phone ? ` · ${client.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="保單/建議書號碼" value={fields.policy_number} onChange={v => set('policy_number', v)} required />
            <Field label="保險公司" value={fields.company} onChange={v => set('company', v)} required />
            <div>
              <label className="text-xs text-gray-400 block mb-1">保單類型</label>
              <select
                value={fields.type}
                onChange={e => set('type', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">選擇類型</option>
                {POLICY_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <Field label="產品名稱" value={fields.product_name} onChange={v => set('product_name', v)} placeholder="例如 VHIS / 儲蓄人壽" />
            <div>
              <label className="text-xs text-gray-400 block mb-1">貨幣</label>
              <select
                value={fields.currency}
                onChange={e => set('currency', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {CURRENCY_OPTIONS.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </div>
            <Field label={`保費 (${fields.currency || 'HKD'})`} value={fields.premium} onChange={v => set('premium', v)} type="number" inputMode="decimal" />
            <div>
              <label className="text-xs text-gray-400 block mb-1">繳費模式</label>
              <select
                value={fields.premium_frequency}
                onChange={e => set('premium_frequency', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {PREMIUM_FREQUENCIES.map(freq => (
                  <option key={freq} value={freq}>{freq}</option>
                ))}
              </select>
            </div>
            <Field label={`保額 (${fields.currency || 'HKD'})`} value={fields.sum_assured} onChange={v => set('sum_assured', v)} type="number" inputMode="decimal" />
            <Field label={`身故賠償 (${fields.currency || 'HKD'})`} value={fields.death_benefit} onChange={v => set('death_benefit', v)} type="number" inputMode="decimal" />
            <Field label="保單持有人" value={fields.policyholder_name} onChange={v => set('policyholder_name', v)} />
            <Field label="受保人" value={fields.insured_name} onChange={v => set('insured_name', v)} />
            <div>
              <label className="text-xs text-gray-400 block mb-1">狀態</label>
              <select
                value={fields.status}
                onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map(status => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
            <Field label="供款期" value={fields.payment_period} onChange={v => set('payment_period', v)} placeholder="例如 10 年 / 至 65 歲" />
            <Field label="生效日期" value={fields.start_date} onChange={v => set('start_date', v)} type="date" />
            <Field label="到期日" value={fields.expiry_date} onChange={v => set('expiry_date', v)} type="date" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">回本同現金價值</p>
            <p className="text-xs text-gray-400 mt-0.5">非保證數字會當預計值處理</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="預計回本期 (年)" value={fields.breakeven_year} onChange={v => set('breakeven_year', v)} type="number" inputMode="decimal" />
            <Field label="回本日期" value={fields.breakeven_date} onChange={v => set('breakeven_date', v)} type="date" />
            <Field label="期滿日期" value={fields.maturity_date} onChange={v => set('maturity_date', v)} type="date" />
            <Field label={`20 年悲觀情況 (${fields.currency || 'HKD'})`} value={fields.scenario_20y_pessimistic} onChange={v => set('scenario_20y_pessimistic', v)} type="number" inputMode="decimal" />
            <Field label={`20 年樂觀情況 (${fields.currency || 'HKD'})`} value={fields.scenario_20y_optimistic} onChange={v => set('scenario_20y_optimistic', v)} type="number" inputMode="decimal" />
          </div>

          <TextArea label="現金價值備註" value={fields.cash_value_notes} onChange={v => set('cash_value_notes', v)} />
          <TextArea label="備註" value={fields.notes} onChange={v => set('notes', v)} />
        </div>

        <button
          type="submit"
          disabled={saving || parsingPolicy || clients.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-3.5 rounded-2xl font-semibold hover:bg-blue-800 disabled:opacity-60 transition"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? (isEditing ? '更新中...' : '儲存中...') : (isEditing ? '更新保單' : '儲存保單')}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">
        {label}{required ? ' *' : ''}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}

async function extractPolicyPdf(file: File): Promise<ExtractedPolicyPdf> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  let totalLength = 0;
  let truncated = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) continue;
    const pageText = `第 ${pageNumber} 頁：${text}`;
    totalLength += pageText.length;
    pages.push(pageText);

    if (totalLength > MAX_POLICY_TEXT_CHARS) {
      truncated = true;
      break;
    }
  }

  let extracted = pages.join('\n\n').trim();
  if (truncated && extracted.length > MAX_POLICY_TEXT_CHARS) {
    extracted = `${extracted.slice(0, MAX_POLICY_TEXT_CHARS)}\n\n[文件較長，已先讀取前 ${MAX_POLICY_TEXT_CHARS.toLocaleString('zh-HK')} 字。]`;
  }

  const scannedImages = extracted.length < 1000
    ? await renderPolicyPagesForOcr(pdf, Math.min(pdf.numPages, 6))
    : [];

  if (!extracted && scannedImages.length === 0) {
    throw new Error('PDF 入面未讀到文字；如屬掃描版 PDF，請確認瀏覽器支援 PDF render 後再試。');
  }

  return { text: extracted, scannedImages, totalPages: pdf.numPages };
}

async function renderPolicyPagesForOcr(
  pdf: import('pdfjs-dist').PDFDocumentProxy,
  pageLimit: number
): Promise<PolicyScanImage[]> {
  const images: PolicyScanImage[] = [];

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;

    images.push({
      page: pageNumber,
      base64: canvas.toDataURL('image/jpeg', 0.78).split(',')[1],
      mediaType: 'image/jpeg',
    });
  }

  return images;
}

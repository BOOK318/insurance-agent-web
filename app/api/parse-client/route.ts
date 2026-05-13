/**
 * POST /api/parse-client
 * Scenario 1 — runs ENTIRELY on Ollama (local Mac mini).
 * PII never leaves the machine.
 *
 * Body: { text?: string; imageBase64?: string; mediaType?: string }
 * Returns: structured client fields
 *
 * Ollama config (set in .env):
 *   OLLAMA_URL          default: http://localhost:11434
 *   OLLAMA_MODEL        default: qwen2.5:7b       (text)
 *   OLLAMA_VISION_MODEL default: llava             (images)
 */
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getSession } from '../../../lib/auth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const runtime = 'nodejs';

GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
).href;

const OLLAMA_URL   = process.env.OLLAMA_URL           ?? 'http://localhost:11434';
// EXTRACT_MODEL is purpose-built for structured extraction (e.g. NuExtract).
// Falls back to OLLAMA_MODEL if not set, then to qwen2.5:7b.
const TEXT_MODEL   = process.env.OLLAMA_EXTRACT_MODEL ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL  ?? 'qwen2.5vl:7b';

const SYSTEM_PROMPT = `你係香港保險業嘅資料提取助手。從用戶輸入提取客戶資料，回覆指定 JSON。

只可以從用戶輸入提取資料。如果輸入冇提及某個欄位，該欄位必須係 null。
唔好用其他來源、唔好假設、唔好猜測、唔好添加唔存在嘅資料。

格式化規則：
- 姓名：保留原文（例如「陳大明」就係「陳大明」，唔好譯做拼音）
- 電話：8 位數字加 "+852 " 前綴
- 年薪：「80萬」→ 800000，「2.5M」→ 2500000
- 每月開支、按揭、負債金額：轉完整數字
- 性別：男 / Male → "M"，女 / Female → "F"
- 日期：YYYY-MM-DD（例：1985年3月12號 → "1985-03-12"）
- 國籍：只喺輸入明確提到時填寫，例如「香港」、「中國」、「加拿大」
- 喜好：只記錄客戶偏好，例如聯絡方式、語言、投資/家庭關注、溝通風格

JSON schema（每個欄位必須出現，未提及就係 null）：
{
  "name_zh": null,
  "name_en": null,
  "phone": null,
  "email": null,
  "occupation": null,
  "annual_income": null,
  "monthly_expenses": null,
  "mortgage_balance": null,
  "liabilities_notes": null,
  "dependents_count": null,
  "existing_coverage_notes": null,
  "financial_goals": null,
  "dob": null,
  "gender": null,
  "nationality": null,
  "family_notes": null,
  "assets_notes": null,
  "property_notes": null,
  "preferences": null,
  "notes": null
}

只回覆填好嘅 JSON object，無其他文字。`;

interface OllamaResponse {
  message?: { content: string };
  response?: string;          // /api/generate fallback
  error?: string;
}

function normalizeExtractedText(text: string) {
  return text.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

async function extractPdfText(file: Blob) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    const normalized = normalizeExtractedText(pageText);
    if (normalized) pages.push(`[P${i}] ${normalized}`);
  }

  return normalizeExtractedText(pages.join('\n'));
}

async function callOllama(
  model: string,
  userContent: string,
  imageBase64?: string
): Promise<string> {
  // Build message — Ollama /api/chat format
  const message: Record<string, unknown> = {
    role: 'user',
    content: userContent,
  };
  if (imageBase64) {
    message.images = [imageBase64];
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        message,
      ],
      stream: false,
      format: 'json',                  // force valid JSON output
      options: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as OllamaResponse;
  return data.message?.content ?? data.response ?? '';
}

function parseJSON(raw: string): Record<string, unknown> {
  // Strip markdown code fences if model adds them
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find first { ... } block
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found');

  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: 'No PDF provided' }, { status: 400 });
    }

    const type = (file.type || '').split(';')[0];
    if (type !== 'application/pdf') {
      return NextResponse.json({ error: '只支援 PDF 文件' }, { status: 400 });
    }

    try {
      const text = await extractPdfText(file);
      if (!text) {
        return NextResponse.json({ error: 'PDF 沒有可讀文字，請改用拍照掃描' }, { status: 422 });
      }

      const prompt = `PDF文件內容：\n${text.slice(0, 20000)}\n\n請從這份PDF提取客戶資料，以指定 JSON 格式回覆。`;
      const rawResponse = await callOllama(TEXT_MODEL, prompt);
      const data = parseJSON(rawResponse);
      return NextResponse.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { error: 'Ollama 未啟動。請在 Mac mini 執行：ollama serve', ollamaDown: true },
          { status: 503 }
        );
      }
      console.error('[parse-client-pdf]', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const body = await req.json() as {
    text?: string;
    imageBase64?: string;
    mediaType?: string;
  };

  if (!body.text && !body.imageBase64) {
    return NextResponse.json({ error: 'No input provided' }, { status: 400 });
  }

  try {
    let rawResponse: string;

    if (body.imageBase64) {
      // Vision path — use vision model
      const prompt = body.text
        ? `${body.text}\n\n請從上面的文件/圖片提取客戶資料，以指定 JSON 格式回覆。`
        : '請從這份文件/圖片提取客戶資料，以指定 JSON 格式回覆。';

      rawResponse = await callOllama(VISION_MODEL, prompt, body.imageBase64);
    } else {
      // Text / voice path — use text model
      const prompt = `語音輸入：\n${body.text}\n\n請提取客戶資料，以指定 JSON 格式回覆。`;
      rawResponse = await callOllama(TEXT_MODEL, prompt);
    }

    const data = parseJSON(rawResponse);
    return NextResponse.json(data);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // If Ollama is not running, return a clear error the UI can handle
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'Ollama 未啟動。請在 Mac mini 執行：ollama serve', ollamaDown: true },
        { status: 503 }
      );
    }

    console.error('[parse-client]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

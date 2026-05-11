/**
 * POST /api/ai
 *
 * Local-first architecture: every input is preprocessed by local Ollama
 * before anything reaches Claude. Three paths:
 *
 *   ┌─ User text/voice/image
 *   ▼
 * [Ollama: image → text extraction]      (vision model)
 * [Ollama: intent detection]             (text model)
 *   │
 *   ├─ "save_client"   → INSERT into DB, reply locally, never call Claude
 *   ├─ "query_client"  → DB lookup → tokenize PII → Claude → detokenize
 *   └─ "general"       → tokenize (if context loaded) → Claude → detokenize
 *
 * Body: { messages, clientId? }
 *   messages: [{role, content, imageBase64?, mediaType?}]
 *   clientId: optional owned client id. The server loads and tokenizes the row.
 *
 * Returns: { reply, action?, client?, processedNote? }
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '../../../lib/auth';
import { buildAnonymizedContext, detokenize, scrubFreeTextPII } from '../../../lib/pii-filter';
import { getSetting } from '../../../lib/settings';
import { db } from '../../../lib/db';
import { getRelevantKnowledgeContext } from '../../../lib/knowledge';

const OLLAMA_URL    = process.env.OLLAMA_URL          ?? 'http://localhost:11434';
const TEXT_MODEL    = process.env.OLLAMA_MODEL        ?? 'qwen2.5:7b';
const VISION_MODEL  = process.env.OLLAMA_VISION_MODEL ?? 'qwen2.5vl:7b';

const BASE_SYSTEM = `你係一個專業嘅香港保險Agent AI助手。

職責：
- 根據客戶背景分析保障缺口，提供銷售建議
- 解答保險問題（產品、核保、理賠流程）
- 幫助分析財務需求、提供跟進策略
- 分析客戶文件、表格、保單

注意：客戶資料會用代號顯示（[CLIENT]、[PHONE] 等）。
回覆時直接用代號，唔好嘗試猜測或填入真實個人資料。

溝通：用廣東話，簡潔專業。涉及金額用HKD。`;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

interface IntentResult {
  intent: 'save_client' | 'query_client' | 'general';
  matched_client?: { id: string; name: string; row: Record<string, unknown> } | null;
  extracted_data?: Record<string, unknown> | null;
}

async function saveConversation(agentId: string, role: 'user' | 'assistant', content: string) {
  const trimmed = content.trim();
  if (!trimmed) return;
  await db.query(
    'INSERT INTO conversations (agent_id, role, content) VALUES ($1, $2, $3)',
    [agentId, role, trimmed.slice(0, 6000)]
  );
}

// Keywords that strongly indicate "save new client" intent
const SAVE_CLIENT_KEYWORDS = [
  '新客戶', '新增客戶', '記低呢個客', '幫我記低', '記錄呢個客戶',
  '幫我加', '加個客', 'add a client', 'add client', 'save client',
  'new client', '新增', '建立客戶',
];

// ─────────────────────────────────────────────────────────────
// Local Ollama helpers
// ─────────────────────────────────────────────────────────────
async function callOllama(
  model: string,
  systemPrompt: string,
  userContent: string,
  imageBase64?: string
): Promise<string> {
  const userMsg: Record<string, unknown> = { role: 'user', content: userContent };
  if (imageBase64) userMsg.images = [imageBase64];

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, userMsg],
      stream: false,
      format: 'json',                  // force valid JSON for extraction tasks
      options: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama ${res.status}: ${text}`);
  }
  const data = await res.json() as { message?: { content: string }; response?: string };
  return data.message?.content ?? data.response ?? '';
}

function tryParseJSON<T = Record<string, unknown>>(s: string): T | null {
  const cleaned = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { return null; }
}

/** Run image through local vision model — extract text/data, never sent raw to Claude. */
async function imageToText(imageBase64: string): Promise<string> {
  const sys = '你係文件分析助手。讀取圖片內容，提取所有可見文字（包括表格、數字、姓名、日期等），保留結構。只輸出提取結果，無需額外解釋。';
  const user = '請列出圖片中所有資料和文字。';
  return await callOllama(VISION_MODEL, sys, user, imageBase64);
}

/**
 * Detect intent — deterministic where possible:
 *  1. Match against DB client names → query_client (most common case, 100% reliable)
 *  2. Keyword match for save phrases → call Ollama JUST to extract fields
 *  3. Otherwise → general
 */
async function detectIntent(text: string, agentId: string): Promise<IntentResult> {
  // Step 1: Deterministic name match against agent's clients
  const { rows: clients } = await db.query<{ id: string; name_zh: string | null; name_en: string | null }>(
    'SELECT id, name_zh, name_en FROM clients WHERE agent_id = $1 AND deleted_at IS NULL',
    [agentId]
  );
  const lowerText = text.toLowerCase();
  for (const c of clients) {
    if (c.name_zh && text.includes(c.name_zh)) {
      const { rows: full } = await db.query<Record<string, unknown>>(
        'SELECT * FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
        [c.id, agentId]
      );
      if (full[0]) return { intent: 'query_client', matched_client: { id: c.id, name: c.name_zh, row: full[0] } };
    }
    if (c.name_en && lowerText.includes(c.name_en.toLowerCase())) {
      const { rows: full } = await db.query<Record<string, unknown>>(
        'SELECT * FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
        [c.id, agentId]
      );
      if (full[0]) return { intent: 'query_client', matched_client: { id: c.id, name: c.name_en, row: full[0] } };
    }
  }

  // Step 2: Save-client keyword + LLM-based field extraction
  const saveTriggered = SAVE_CLIENT_KEYWORDS.some(k => lowerText.includes(k.toLowerCase()));
  if (saveTriggered) {
    const sys = `你係資料提取助手。從用戶輸入提取新客戶資料，回覆 JSON。
只可從輸入提取，未提及嘅欄位用 null。
姓名保留原文。電話加 "+852 " 前綴（8 位數字）。年薪、每月開支、按揭/負債金額轉完整數字（80萬→800000）。
性別：男→"M"，女→"F"。日期：YYYY-MM-DD。國籍同喜好只可喺用戶明確提到時填。
schema: {name_zh, name_en, phone, email, occupation, annual_income, monthly_expenses, mortgage_balance, liabilities_notes, dependents_count, existing_coverage_notes, financial_goals, dob, gender, nationality, family_notes, assets_notes, property_notes, preferences, notes}
只回覆 JSON。`;
    try {
      const raw = await callOllama(TEXT_MODEL, sys, text);
      const parsed = tryParseJSON(raw);
      if (parsed) return { intent: 'save_client', extracted_data: parsed };
    } catch (err) {
      console.error('[save extraction]', err);
    }
  }

  return { intent: 'general' };
}

async function getAgentClientNames(agentId: string): Promise<string[]> {
  const { rows } = await db.query<{ name_zh: string | null; name_en: string | null }>(
    'SELECT name_zh, name_en FROM clients WHERE agent_id = $1 AND deleted_at IS NULL',
    [agentId]
  );

  return rows
    .flatMap(row => [row.name_zh, row.name_en])
    .filter((name): name is string => !!name && name.trim().length > 0)
    .sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prepareMessageForClaude(
  content: string,
  tokenMap: Record<string, string>,
  knownClientNames: string[]
) {
  let result = scrubFreeTextPII(content);

  for (const [token, value] of Object.entries(tokenMap)) {
    if (!value) continue;
    result = result.replaceAll(value, token);
  }

  for (const name of knownClientNames) {
    result = result.replace(new RegExp(escapeRegExp(name), 'gi'), '[CLIENT]');
  }

  return result;
}

async function getOwnedClientContext(agentId: string, clientId: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
    [clientId, agentId]
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await db.query<{ role: 'user' | 'assistant'; content: string; created_at: string }>(
    `SELECT role, content, created_at
     FROM conversations
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [user.id]
  );

  return NextResponse.json({
    messages: rows.reverse().map(row => ({
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messages, clientId, clientContext: legacyClientContext } = await req.json() as {
    messages: IncomingMessage[];
    clientId?: string;
    clientContext?: Record<string, unknown> | string;
  };

  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) {
    return NextResponse.json({ error: 'No user message' }, { status: 400 });
  }

  // ── STEP 1: Preprocess any image via local Ollama vision ──
  // Never send raw images to Claude.
  const processedMessages: IncomingMessage[] = [];
  let imageWasProcessed = false;
  for (const m of messages) {
    if (m.imageBase64) {
      try {
        const rawExtracted = await imageToText(m.imageBase64);
        // Scrub HKID/phone/email patterns before anything leaves this server.
        const extracted = scrubFreeTextPII(rawExtracted);
        processedMessages.push({
          role: m.role,
          content:
            (m.content ? m.content + '\n\n' : '') +
            `[本地 Ollama 從圖片提取嘅內容（已遮蔽 HKID/電話/電郵）]\n${extracted}`,
        });
        imageWasProcessed = true;
      } catch (err) {
        return NextResponse.json(
          { error: '本地 Ollama 處理圖片失敗：' + (err as Error).message + '。請確認 Ollama 已啟動。' },
          { status: 503 }
        );
      }
    } else {
      processedMessages.push({ role: m.role, content: m.content });
    }
  }
  // Refresh "lastUser" since image content may have been merged into it
  const lastUserProcessed = [...processedMessages].reverse().find(m => m.role === 'user');
  const lastUserText = lastUserProcessed?.content ?? lastUser.content;
  await saveConversation(user.id, 'user', lastUserText);

  // ── STEP 2: Local intent detection (deterministic name match + keyword) ──
  const intent = await detectIntent(lastUserText, user.id);

  // ── STEP 3a: SAVE_CLIENT path — never touches Claude ──
  if (intent.intent === 'save_client' && intent.extracted_data) {
    const d = intent.extracted_data as Record<string, unknown>;
    if (!d.name_zh && !d.name_en) {
      const reply = '我聽到你想新增客戶，但未提取到客戶姓名。可唔可以再講一次，包括客戶嘅中文或英文名？';
      await saveConversation(user.id, 'assistant', reply);
      return NextResponse.json({
        reply,
        processedNote: '本地處理 — 冇傳送 Claude',
      });
    }
    try {
      const { rows } = await db.query<Record<string, unknown>>(
        `INSERT INTO clients (agent_id, name_zh, name_en, phone, email, occupation,
                              annual_income, monthly_expenses, mortgage_balance,
                              liabilities_notes, dependents_count, existing_coverage_notes,
                              financial_goals, dob, gender, nationality, family_notes, assets_notes,
                              property_notes, preferences, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [
          user.id,
          d.name_zh ?? null,
          d.name_en ?? null,
          d.phone ?? null,
          d.email ?? null,
          d.occupation ?? null,
          d.annual_income ?? null,
          d.monthly_expenses ?? null,
          d.mortgage_balance ?? null,
          d.liabilities_notes ?? null,
          d.dependents_count ?? null,
          d.existing_coverage_notes ?? null,
          d.financial_goals ?? null,
          d.dob ?? null,
          d.gender ?? null,
          d.nationality ?? null,
          d.family_notes ?? null,
          d.assets_notes ?? null,
          d.property_notes ?? null,
          d.preferences ?? null,
          d.notes ?? null,
        ]
      );
      const client = rows[0];
      const displayName = (client.name_zh ?? client.name_en) as string;
      const summary = [
        `✅ 已儲存客戶：**${displayName}**`,
        d.phone ? `· 電話：${d.phone}` : null,
        d.occupation ? `· 職業：${d.occupation}` : null,
        d.annual_income ? `· 年薪：HK$${Number(d.annual_income).toLocaleString()}` : null,
        '',
        '🔒 全程本地處理，冇經過 Claude。',
      ].filter(Boolean).join('\n');
      await saveConversation(user.id, 'assistant', summary);
      return NextResponse.json({
        reply: summary,
        action: 'saved_client',
        client,
        processedNote: imageWasProcessed
          ? '本地 Ollama 從圖片提取資料 → 直接儲存（冇經過 Claude）'
          : '本地處理 — 冇傳送 Claude',
      });
    } catch (err) {
      return NextResponse.json(
        { error: '儲存失敗：' + (err as Error).message },
        { status: 500 }
      );
    }
  }

  // ── STEP 3b: QUERY_CLIENT — already-resolved DB row from intent ──
  const requestedClientId =
    typeof clientId === 'string'
      ? clientId.trim()
      : legacyClientContext && typeof legacyClientContext === 'object' && typeof legacyClientContext.id === 'string'
        ? legacyClientContext.id.trim()
        : '';
  let clientContext = requestedClientId
    ? await getOwnedClientContext(user.id, requestedClientId)
    : null;
  let resolvedClientName: string | null = null;
  if (requestedClientId && !clientContext) {
    return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  }
  if (!clientContext && intent.intent === 'query_client' && intent.matched_client) {
    clientContext = intent.matched_client.row;
    resolvedClientName = intent.matched_client.name;
  }

  // ── STEP 4: Build anonymized prompt for Claude ──
  let systemPrompt = BASE_SYSTEM;
  let tokenMap: Record<string, string> = {};

  if (clientContext) {
    if (typeof clientContext === 'object') {
      const { context, tokenMap: tm } = buildAnonymizedContext(clientContext);
      systemPrompt += `\n\n當前客戶資料（已匿名）：\n${context}`;
      tokenMap = tm;
    }
  }

  const knowledgeContext = await getRelevantKnowledgeContext(lastUserText);
  if (knowledgeContext) {
    systemPrompt += `\n\n公司知識庫（本地整理，只作 agent 參考；產品條款以官方保單文件為準）：\n${knowledgeContext}`;
  }

  // ── STEP 5: Resolve API key & build Anthropic client ──
  const apiKey = await getSetting('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY);
  if (!apiKey || apiKey.startsWith('sk-ant-replace')) {
    return NextResponse.json(
      { error: 'AI 未配置，請聯絡管理員設定 Anthropic API key（/admin/settings）' },
      { status: 503 }
    );
  }

  const isOAuth = apiKey.startsWith('sk-ant-oat');
  const anthropic = isOAuth
    ? new Anthropic({
        apiKey: null,
        authToken: apiKey,
        defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
      })
    : new Anthropic({ apiKey });

  // ── STEP 6: Send tokenized text-only payload to Claude ──
  const knownClientNames = await getAgentClientNames(user.id);
  const anthropicMessages: Anthropic.MessageParam[] = processedMessages.map(m => ({
    role: m.role,
    content: prepareMessageForClaude(m.content, tokenMap, knownClientNames),
  }));

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  const block = response.content[0];
  const rawReply = block.type === 'text' ? block.text : '...';
  const reply = detokenize(rawReply, tokenMap);
  await saveConversation(user.id, 'assistant', reply);

  // Note about how the input was processed (for UI transparency)
  const processedNote = [
    imageWasProcessed ? '🔒 圖片由本地 Ollama 提取文字後傳送' : null,
    resolvedClientName ? `📂 自動載入客戶：${resolvedClientName}（PII 已匿名）` : null,
    clientContext && !resolvedClientName ? '🔐 客戶資料已匿名後傳送' : null,
  ].filter(Boolean).join(' · ') || null;

  return NextResponse.json({
    reply,
    processedNote,
    clientLoaded: resolvedClientName,
  });
}

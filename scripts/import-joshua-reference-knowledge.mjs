import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const EXPLICIT_DATABASE_URL = process.env.DATABASE_URL;

dotenv.config({ path: '.env.local' });
dotenv.config();

if (!EXPLICIT_DATABASE_URL && process.env.DB_PASSWORD && !process.env.FORCE_DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_OVERRIDE ||
    `postgres://admin:${process.env.DB_PASSWORD}@127.0.0.1:${process.env.DB_PORT || '5432'}/insurance`;
}

const { Pool } = pg;

const DEFAULT_ROOT = '/Users/book/Documents/insurance app Joshua/public-insurance-information-app';
const DEFAULT_PDF_ROOT = '/Users/book/Documents/insurance app Joshua';
const INPUT_ROOT = path.resolve(process.env.JOSHUA_REFERENCE_ROOT ?? DEFAULT_ROOT);
const PDF_ROOT = path.resolve(process.env.JOSHUA_REFERENCE_PDF_ROOT ?? DEFAULT_PDF_ROOT);

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text, size = 3000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function walkFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
        stack.push(full);
      } else if (predicate(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function flattenJson(value, prefix = '') {
  const lines = [];
  const label = prefix ? `${prefix}: ` : '';

  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value !== 'object') {
    const normalized = normalizeText(value);
    return normalized ? [`${label}${normalized}`] : [];
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      lines.push(...flattenJson(item, `${prefix}[${index + 1}]`));
    });
    return lines;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    lines.push(...flattenJson(child, nextPrefix));
  }
  return lines;
}

function classifyFile(filePath) {
  const rel = path.relative(INPUT_ROOT, filePath);
  const base = path.basename(filePath);
  const lower = `${rel} ${base}`.toLowerCase();

  if (lower.includes('/data/boc/') || lower.startsWith('data/boc/')) {
    return { company: 'BOC Life Joshua Reference', category: 'product' };
  }
  if (lower.includes('/data/medical/') && lower.includes('boc')) {
    return { company: 'BOC Life Joshua Reference', category: 'product' };
  }
  if (lower.includes('fwd')) {
    return { company: 'FWD Joshua Reference', category: 'product' };
  }
  return { company: 'Joshua Reference', category: 'other' };
}

async function upsertKnowledge(client, { company, category, title, content, sourceUrl, productName = null }) {
  await client.query(
    `INSERT INTO company_knowledge (company, category, product_name, title, content, source_url, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
     ON CONFLICT (company, category, title)
     DO UPDATE SET product_name = EXCLUDED.product_name,
                   content = EXCLUDED.content,
                   source_url = EXCLUDED.source_url,
                   is_active = TRUE,
                   updated_at = NOW()`,
    [company, category, productName, title, content, sourceUrl]
  );
}

function extractProductName(filePath, data) {
  const candidates = [
    data?.quoteProfile?.productNameZh,
    data?.productNameZh,
    data?.productName,
    data?.name,
    data?.planName,
  ];
  const found = candidates.find((value) => typeof value === 'string' && value.trim());
  if (found) return found.trim();

  const base = path.basename(filePath).replace(/\.(json|md|csv|txt)$/i, '');
  const match = base.match(/boc-([a-z0-9]+)-/i);
  return match ? match[1].toUpperCase() : null;
}

async function importTextLikeFile(client, filePath) {
  const { company, category } = classifyFile(filePath);
  const sourceUrl = `local:${filePath}`;
  const base = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  let productName = null;

  if (ext === '.json') {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    productName = extractProductName(filePath, data);
    const flattened = flattenJson(data).join('\n');
    const pretty = JSON.stringify(data, null, 2);
    text = normalizeText(`${flattened}\n\nRAW JSON:\n${pretty}`);
  } else {
    text = normalizeText(fs.readFileSync(filePath, 'utf8'));
  }

  if (!text) return { filePath, rows: 0, skipped: true };

  const digest = sha256File(filePath);
  const chunks = chunkText(text, 3000);
  await upsertKnowledge(client, {
    company,
    category,
    productName,
    title: `Joshua資料｜${base}｜摘要`,
    content: `檔名：${base}。SHA256：${digest}。來源folder：insurance app Joshua。已加入AI檢索。`,
    sourceUrl,
  });

  for (let i = 0; i < chunks.length; i += 1) {
    await upsertKnowledge(client, {
      company,
      category,
      productName,
      title: `Joshua資料｜${base}｜片段 ${i + 1}/${chunks.length}`,
      content: chunks[i],
      sourceUrl,
    });
  }

  return { filePath, rows: chunks.length + 1, skipped: false };
}

async function extractPdfText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    const normalized = normalizeText(pageText);
    if (normalized) pages.push(`[P${i}] ${normalized}`);
  }
  return { numPages: doc.numPages, text: normalizeText(pages.join('\n')) };
}

async function importPdfFile(client, filePath) {
  const sourceUrl = `local:${filePath}`;
  const base = path.basename(filePath);
  const company = base.toLowerCase().includes('boc') ? 'BOC Life Joshua PDF Reference' : 'FWD Joshua PDF Reference';
  const category = 'product';
  const digest = sha256File(filePath);
  const extracted = await extractPdfText(filePath);
  if (!extracted.text) return { filePath, rows: 0, skipped: true };

  const chunks = chunkText(extracted.text, 3000);
  const productName = base
    .replace(/^\d{8}_/u, '')
    .replace(/\.pdf$/iu, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  await upsertKnowledge(client, {
    company,
    category,
    productName,
    title: `Joshua PDF正文｜${base}｜摘要`,
    content: `檔名：${base}。SHA256：${digest}。頁數：${extracted.numPages}。已完成PDF正文抽取，可用於AI檢索。`,
    sourceUrl,
  });

  for (let i = 0; i < chunks.length; i += 1) {
    await upsertKnowledge(client, {
      company,
      category,
      productName,
      title: `Joshua PDF正文｜${base}｜片段 ${i + 1}/${chunks.length}`,
      content: chunks[i],
      sourceUrl,
    });
  }

  return { filePath, rows: chunks.length + 1, skipped: false };
}

function formatBucket(bucket) {
  if (!bucket) return null;
  const mode = bucket.bucket || bucket.comparisonBucket || '';
  const status = bucket.status || '';
  const actual = bucket.actualPremium != null ? `actual ${bucket.actualPremium}` : null;
  const target = bucket.targetPremium != null ? `target ${bucket.targetPremium}` : null;
  return [mode, status, actual, target].filter(Boolean).join(' / ');
}

async function importBocComparisonSummary(client) {
  const bocDir = path.join(INPUT_ROOT, 'data', 'boc');
  const categoryMapPath = path.join(bocDir, 'boc-product-category-map-2026-05-12.json');
  const bucketMatrixPath = path.join(bocDir, 'boc-standard-bucket-matrix-2026-05-12.json');
  const captureLogPath = path.join(bocDir, 'boc-standard-capture-log-2026-05-12.json');
  if (!fs.existsSync(categoryMapPath) || !fs.existsSync(bucketMatrixPath) || !fs.existsSync(captureLogPath)) {
    return { filePath: 'BOC comparison summary', rows: 0, skipped: true };
  }

  const categoryMap = JSON.parse(fs.readFileSync(categoryMapPath, 'utf8'));
  const bucketMatrix = JSON.parse(fs.readFileSync(bucketMatrixPath, 'utf8'));
  const captureLog = JSON.parse(fs.readFileSync(captureLogPath, 'utf8'));

  const savingsGroup = (categoryMap.groups || []).find((group) =>
    String(group.category || '').includes('儲蓄') ||
    String(group.normalizedCategory || '').includes('savings')
  );
  const savingsProductsByCode = new Map((savingsGroup?.products || []).map((product) => [product.code, product]));
  for (const capture of captureLog.captures || []) {
    if (!capture.productCode || !capture.productNameZh) continue;
    if (
      String(capture.categoryNormalized || '').includes('savings') ||
      String(capture.categoryPortal || '').includes('儲蓄') ||
      String(capture.categoryPortal || '').includes('終身')
    ) {
      savingsProductsByCode.set(capture.productCode, {
        code: capture.productCode,
        name: capture.productNameZh,
      });
    }
  }
  const savingsProducts = [...savingsProductsByCode.values()].sort((a, b) =>
    String(a.code).localeCompare(String(b.code))
  );
  const matrixByCode = new Map((bucketMatrix.products || []).map((product) => [product.productCode, product]));
  const captureByCode = new Map();
  for (const capture of captureLog.captures || []) {
    if (!capture.productCode) continue;
    const list = captureByCode.get(capture.productCode) || [];
    list.push(capture);
    captureByCode.set(capture.productCode, list);
  }

  const lines = [];
  lines.push('BOC比較摘要：當 agent 問「BOC 有邊幾份 saving / 儲蓄可以做比較」時，優先用以下清單回答。');
  lines.push('候選儲蓄/類儲蓄比較產品（來自 Joshua BOC category map）：');
  for (const product of savingsProducts) {
    const matrix = matrixByCode.get(product.code);
    const generatedFromMatrix = (matrix?.buckets || []).filter((bucket) => bucket.status === 'PROPOSAL_GENERATED');
    const generatedFromCaptures = (captureByCode.get(product.code) || []).filter((capture) =>
      capture.status === 'PROPOSAL_GENERATED'
    );
    const generated = generatedFromMatrix.length ? generatedFromMatrix : generatedFromCaptures;
    const liveTerms = matrix?.liveOptionsSummary?.payTerms?.join('/') || '';
    const livePayModes = matrix?.liveOptionsSummary?.payModes?.join('/') || '';
    const generatedText = generated.length ? generated.map(formatBucket).join('； ') : '未有已生成 proposal 數字，只可作產品候選/portal option 參考';
    lines.push(`- ${product.code} ${product.name}：live pay terms ${liveTerms || '未記錄'}；pay modes ${livePayModes || '未記錄'}；已生成比較數據：${generatedText}`);
  }
  lines.push('已有詳細 proposal / illustration 數字可比較的重點產品：IBW65 薪火傳承環球終身壽險計劃、IBW66 鑄富世代環球終身壽險計劃、IBW69 薪粹傳承環球終身保險計劃。');
  lines.push('IBW65 有 2Y/5Y/10Y 的 monthly/annual proposal generated；single buckets 按目前規則標記為 NOT_EXPLICIT_SINGLE_PER_USER_RULE。');
  lines.push('IBW66 有 5Y monthly/annual proposal generated。');
  lines.push('IBW69 有 2Y monthly/annual proposal generated。');
  lines.push('IBE66 守躍保險計劃、IBN12 目標三年保險計劃出現在 savings candidate / live options，但目前未有完整 generated proposal 數字。');
  lines.push('標準比較基準：USD monthly 1300、annual 15600、single 15600；以已入庫 proposal JSON 的 break-even、cash value、death benefit 作詳細比較。');

  for (const [code, captures] of captureByCode.entries()) {
    const useful = captures.filter((capture) =>
      capture.status === 'PROPOSAL_GENERATED' ||
      String(capture.categoryNormalized || '').includes('savings')
    );
    if (!useful.length) continue;
    lines.push(`${code} captured buckets：${useful.map((capture) => formatBucket(capture)).filter(Boolean).join('； ')}`);
  }

  await upsertKnowledge(client, {
    company: 'BOC Life Joshua Reference',
    category: 'product',
    productName: 'BOC儲蓄比較',
    title: 'BOC比較摘要｜儲蓄 / savings 可以做比較的產品',
    content: lines.join('\n'),
    sourceUrl: `local:${categoryMapPath}`,
  });

  return { filePath: 'BOC comparison summary', rows: 1, skipped: false };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  if (!fs.existsSync(INPUT_ROOT)) throw new Error(`Input folder not found: ${INPUT_ROOT}`);

  const dataFiles = walkFiles(INPUT_ROOT, (file) => {
    const rel = path.relative(INPUT_ROOT, file);
    const ext = path.extname(file).toLowerCase();
    if (!['.json', '.md', '.csv', '.txt'].includes(ext)) return false;
    if (rel.startsWith(`data${path.sep}boc${path.sep}`)) return true;
    if (rel.startsWith(`data${path.sep}medical${path.sep}`) && path.basename(file).toLowerCase().includes('boc')) return true;
    return false;
  });
  const pdfFiles = walkFiles(PDF_ROOT, (file) => file.toLowerCase().endsWith('.pdf'));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const results = [];
  let totalRows = 0;

  try {
    await client.query('BEGIN');
    for (const file of dataFiles) {
      const result = await importTextLikeFile(client, file);
      results.push(result);
      totalRows += result.rows;
    }
    for (const file of pdfFiles) {
      const result = await importPdfFile(client, file);
      results.push(result);
      totalRows += result.rows;
    }
    const summaryResult = await importBocComparisonSummary(client);
    results.push(summaryResult);
    totalRows += summaryResult.rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({
    inputRoot: INPUT_ROOT,
    pdfRoot: PDF_ROOT,
    dataFiles: dataFiles.length,
    pdfFiles: pdfFiles.length,
    totalRowsUpserted: totalRows,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

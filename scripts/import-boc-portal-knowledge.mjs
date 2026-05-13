import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pg;

const INPUT_PATH = path.resolve('knowledge-base/boc-portal-scrape.json');
const SOURCE_MAIN_URL = 'https://www.boclifeonline.com/SalesPortal/main.html';

const TARGET_CATEGORIES = [
  '推廣活動',
  '產品資訊',
  '常用表格',
  '培訓資訊',
  '業務公告',
  '代理招聘',
  '銷售品質',
  '強積金',
  '業務伙伴',
  '一脈互動',
  '其他資訊',
];

const CATEGORY_MAP = {
  推廣活動: 'process',
  產品資訊: 'product',
  常用表格: 'application',
  培訓資訊: 'process',
  業務公告: 'process',
  代理招聘: 'other',
  銷售品質: 'process',
  強積金: 'product',
  業務伙伴: 'other',
  一脈互動: 'process',
  其他資訊: 'contact',
};

function extractLines(rawContent) {
  if (!rawContent) return [];

  const lines = [];
  const push = (value) => {
    if (!value) return;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    lines.push(normalized);
  };

  const patterns = [
    /- row "([^"]+)":/g,
    /- 'row "([^"]+)"':/g,
    /- cell "([^"]+)":/g,
    /- columnheader "([^"]+)"/g,
    /- text:([^|]+)/g,
    /- paragraph:([^|]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of rawContent.matchAll(pattern)) {
      push(match[1]);
    }
  }

  const blocked = [
    /^繁\s*簡\s*EN$/i,
    /^✉$/,
    /^搜尋文件$/,
    /^現時位置:/,
    /^點擊查看相關資料$/,
    /^点击我查看相关资料$/,
    /^中銀集團人壽保險有限公司版權所有/,
    /^本系統內的所有客戶及內部資料只供授權人士閱覽/,
    /^中銀人壽明確表明不因他人違反此規定行為導致的任何後果承擔任何責任/,
    /^["|]+$/,
    /^$/,
    /^\s*Hello/,
  ];

  const seen = new Set();
  const cleaned = [];

  for (let line of lines) {
    line = line.replace(/^[:：\s]+|[:：\s]+$/g, '').trim();
    if (!line || line.length < 2) continue;
    if (/^[-\s]+$/.test(line)) continue;
    if (/[\uE000-\uF8FF]/.test(line)) continue;
    if (blocked.some((rule) => rule.test(line))) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    cleaned.push(line);
  }

  return cleaned;
}

function extractLinkTitles(item) {
  const blockedTitles = new Set([
    '設定',
    '✉',
    '首頁',
    '資料查詢',
    '業績報表',
    '推廣活動',
    '產品資訊',
    '常用表格',
    '培訓資訊',
    '業務公告',
    '代理招聘',
    '銷售品質',
    '強積金',
    '業務伙伴',
    '一脈互動',
    '其他資訊',
    '使用條款',
    '私隱政策',
  ]);

  const seen = new Set();
  const out = [];
  for (const link of item?.links || []) {
    const title = (link?.title || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    if (blockedTitles.has(title)) continue;
    if (/^\d+$/.test(title)) continue;
    if (title.startsWith('你有 ') || title.startsWith('將會有 ') || title.endsWith('已經到期')) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

function chunkLines(lines, chunkSize = 16) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    const page = lines.slice(i, i + chunkSize);
    chunks.push(page.join('； '));
  }
  return chunks.filter(Boolean);
}

function buildDeepEntries(categoryName, subtitleLines, contentLines) {
  const blockedHeaders = new Set([
    '產品類別 產品',
    '表格種類 表格名稱',
    '培訓課程 培訓資料及內容',
    '代理招募 代理招募詳情',
    '強積金項目 強積金文件',
    '保險類別 產品',
    '項目 文件',
  ]);

  const blockedExact = new Set([
    '產品',
    '文件',
    '項目',
    '其他',
    '綜合資訊',
    '培訓資料',
    '申請書樣本',
    '銷售單張',
    '銷售指南',
    '保險條款',
    '承保指引',
    '中國內地',
    '澳門',
    '星期六',
  ]);

  const entries = [];
  const seen = new Set();

  const push = (text) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    if (normalized.length < 4) return;
    if (normalized.length > 280) return;
    if (blockedHeaders.has(normalized)) return;
    if (blockedExact.has(normalized)) return;
    if (/^[-–—\d\s]+$/.test(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    entries.push(normalized);
  };

  for (const subtitle of subtitleLines) {
    push(`子分類：${subtitle}`);
  }

  for (const line of contentLines) {
    push(line);
  }

  // 針對業務公告、其他資訊等，保留包含關鍵詞的項目
  const keywords = ['公告', '表格', '課程', '保險', '計劃', '產品', '投保', '理賠', 'LIBOR', 'HIBOR', '最優惠利率', '兌換率'];
  const prioritized = entries.filter((entry) => keywords.some((word) => entry.includes(word)));
  const fallback = entries.filter((entry) => !prioritized.includes(entry));

  if (categoryName === '業務公告' || categoryName === '其他資訊') {
    return [...prioritized, ...fallback].slice(0, 240);
  }
  return [...prioritized, ...fallback].slice(0, 180);
}

function resolveSourceUrl(item) {
  const link = (item?.links || []).find((entry) => {
    const url = (entry?.url || '').trim();
    return url && url !== '"#"' && !url.startsWith('http://boc-life-cms.motherapp.cn');
  });

  if (!link) return SOURCE_MAIN_URL;
  const url = link.url.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url === 'main.html') return SOURCE_MAIN_URL;
  return `https://www.boclifeonline.com/SalesPortal/${url}`;
}

function buildRecords(payload) {
  const items = payload?.items || [];
  const records = [];
  const scrapedAt = payload?.scrapedAt || new Date().toISOString();

  for (const categoryName of TARGET_CATEGORIES) {
    const item = items.find((entry) => entry.category === categoryName);
    const dbCategory = CATEGORY_MAP[categoryName] || 'other';
    const sourceUrl = resolveSourceUrl(item);
    const contentLines = extractLines(item?.content || '');
    const subtitleLines = extractLinkTitles(item);
    const lines = [
      ...subtitleLines.map((text) => `子分類：${text}`),
      ...contentLines,
    ];

    if (lines.length === 0) {
      records.push({
        company: 'BOC LIFE Sales Portal',
        category: dbCategory,
        productName: null,
        title: `BOC內聯資料｜${categoryName}（待補充）`,
        content: `分類：${categoryName}。目前未成功擷取詳細內容，請於 Sales Portal 內重新開啟此分類後再同步。最後同步時間：${scrapedAt}`,
        sourceUrl,
      });
      continue;
    }

    const chunks = chunkLines(lines, 16);
    const total = chunks.length;
    for (let i = 0; i < chunks.length; i += 1) {
      records.push({
        company: 'BOC LIFE Sales Portal',
        category: dbCategory,
        productName: null,
        title: `BOC內聯資料｜${categoryName}（${i + 1}/${total}）`,
        content: `分類：${categoryName}。以下為內聯清單重點：${chunks[i]}`,
        sourceUrl,
      });
    }

    const deepEntries = buildDeepEntries(categoryName, subtitleLines, contentLines);
    for (let i = 0; i < deepEntries.length; i += 1) {
      records.push({
        company: 'BOC LIFE Sales Portal',
        category: dbCategory,
        productName: null,
        title: `BOC深層資料｜${categoryName}｜${String(i + 1).padStart(3, '0')}`,
        content: `分類：${categoryName}。逐子分類/逐文件條目：${deepEntries[i]}`,
        sourceUrl,
      });
    }
  }

  return records;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Please set it in .env.local');
  }

  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Missing scrape file: ${INPUT_PATH}`);
  }

  const payload = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const records = buildRecords(payload);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE company_knowledge
       SET is_active = FALSE, updated_at = NOW()
       WHERE company = 'BOC LIFE Sales Portal'`
    );
    let upserted = 0;
    for (const row of records) {
      await client.query(
        `INSERT INTO company_knowledge (company, category, product_name, title, content, source_url, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
         ON CONFLICT (company, category, title)
         DO UPDATE SET
           product_name = EXCLUDED.product_name,
           content = EXCLUDED.content,
           source_url = EXCLUDED.source_url,
           is_active = TRUE,
           updated_at = NOW()`,
        [row.company, row.category, row.productName, row.title, row.content, row.sourceUrl]
      );
      upserted += 1;
    }
    await client.query('COMMIT');

    const { rows } = await client.query(
      `SELECT category, COUNT(*)::int AS count
       FROM company_knowledge
       WHERE company = 'BOC LIFE Sales Portal'
       GROUP BY category
       ORDER BY category`
    );

    console.log(JSON.stringify({ upserted, byCategory: rows }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

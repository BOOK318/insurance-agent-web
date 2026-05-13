import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pg;

const INPUT_DIR = path.resolve('knowledge-base/raw-pdfs/boc-portal');
const COMPANY = 'BOC LIFE Sales Portal PDF';
const DEFAULT_CATEGORY = 'application';

function normalizeText(text) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text, size = 2400) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
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
  return {
    numPages: doc.numPages,
    text: normalizeText(pages.join('\n')),
  };
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function sanitizeName(fileName) {
  return fileName.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim();
}

async function upsertPdf(client, filePath) {
  const fileName = path.basename(filePath);
  const cleanName = sanitizeName(fileName);
  const digest = sha256File(filePath);
  const extracted = await extractPdfText(filePath);
  if (!extracted.text) {
    return { fileName, inserted: 0, chunks: 0, skipped: true };
  }

  const chunks = chunkText(extracted.text, 2400);
  const sourceUrl = `local:${filePath}`;

  await client.query(
    `INSERT INTO company_knowledge (company, category, product_name, title, content, source_url, is_active, updated_at)
     VALUES ($1, $2, NULL, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (company, category, title)
     DO UPDATE SET content = EXCLUDED.content, source_url = EXCLUDED.source_url, is_active = TRUE, updated_at = NOW()`,
    [
      COMPANY,
      DEFAULT_CATEGORY,
      `BOC PDF正文｜${cleanName}｜摘要`,
      `檔名：${fileName}。SHA256：${digest}。頁數：${extracted.numPages}。此檔已完成正文抽取，可用於AI檢索。`,
      sourceUrl,
    ]
  );

  for (let i = 0; i < chunks.length; i += 1) {
    await client.query(
      `INSERT INTO company_knowledge (company, category, product_name, title, content, source_url, is_active, updated_at)
       VALUES ($1, $2, NULL, $3, $4, $5, TRUE, NOW())
       ON CONFLICT (company, category, title)
       DO UPDATE SET content = EXCLUDED.content, source_url = EXCLUDED.source_url, is_active = TRUE, updated_at = NOW()`,
      [
        COMPANY,
        DEFAULT_CATEGORY,
        `BOC PDF正文｜${cleanName}｜片段 ${i + 1}/${chunks.length}`,
        chunks[i],
        sourceUrl,
      ]
    );
  }

  return { fileName, inserted: chunks.length + 1, chunks: chunks.length, skipped: false };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }
  if (!fs.existsSync(INPUT_DIR)) {
    throw new Error(`Input folder not found: ${INPUT_DIR}`);
  }

  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .map((name) => path.join(INPUT_DIR, name));

  if (files.length === 0) {
    console.log(JSON.stringify({ imported: 0, files: [] }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    let totalInserted = 0;
    for (const file of files) {
      const result = await upsertPdf(client, file);
      results.push(result);
      totalInserted += result.inserted;
    }
    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          importedFiles: files.length,
          totalRowsUpserted: totalInserted,
          results,
        },
        null,
        2
      )
    );
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

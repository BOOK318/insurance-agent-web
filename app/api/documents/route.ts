import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';
import {
  ALLOWED_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  buildStorageKey,
  isValidDocumentContentType,
  writeDocument,
  sanitizeFileName,
} from '../../../lib/document-storage';

export const runtime = 'nodejs';

type DocRow = {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: string | number;
  client_id: string | null;
  policy_id: string | null;
  claim_id: string | null;
  notes: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get('client_id');
  const policyId = req.nextUrl.searchParams.get('policy_id');
  const claimId  = req.nextUrl.searchParams.get('claim_id');

  let sql =
    `SELECT id, title, file_name, mime_type, size_bytes, client_id, policy_id, claim_id, notes, created_at
     FROM documents
     WHERE agent_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [user.id];
  if (clientId) { sql += ` AND client_id = $${params.length + 1}`; params.push(clientId); }
  if (policyId) { sql += ` AND policy_id = $${params.length + 1}`; params.push(policyId); }
  if (claimId)  { sql += ` AND claim_id  = $${params.length + 1}`; params.push(claimId); }
  sql += ' ORDER BY created_at DESC';

  const { rows } = await db.query<DocRow>(sql, params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: '請用 multipart/form-data 上傳' }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '冇收到檔案' }, { status: 400 });
  }

  const clientId = (form.get('client_id') as string | null)?.trim() || null;
  const policyId = (form.get('policy_id') as string | null)?.trim() || null;
  const claimId  = (form.get('claim_id') as string | null)?.trim() || null;
  const title    = ((form.get('title') as string | null)?.trim() || file.name).slice(0, 200);
  const notes    = ((form.get('notes') as string | null)?.trim() || null);

  if (!clientId && !policyId && !claimId) {
    return NextResponse.json({ error: '至少要綁定一個客戶 / 保單 / Claim' }, { status: 400 });
  }
  const mimeType = (file.type || '').split(';')[0].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `唔支援嘅檔案類型：${file.type || '未知'}` }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: '檔案係空' }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: `檔案太大（最多 ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB）` }, { status: 400 });
  }

  // Verify ownership of every parent ref the caller supplied
  if (clientId) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
      [clientId, user.id]
    );
    if (rowCount === 0) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  }
  if (policyId) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM policies WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
      [policyId, user.id]
    );
    if (rowCount === 0) return NextResponse.json({ error: '找不到保單' }, { status: 404 });
  }
  if (claimId) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM claims WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
      [claimId, user.id]
    );
    if (rowCount === 0) return NextResponse.json({ error: '找不到 Claim' }, { status: 404 });
  }

  // Allocate id, write file, then insert metadata. If the insert fails we
  // delete the file we wrote to keep storage tidy.
  const { rows: idRow } = await db.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
  const docId = idRow[0].id;
  const safeName = sanitizeFileName(file.name);
  const storageKey = buildStorageKey(user.id, docId, safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isValidDocumentContentType(buffer, mimeType)) {
    return NextResponse.json({ error: '檔案內容同檔案類型唔相符，請確認檔案後再上傳。' }, { status: 400 });
  }
  const { sha256, size } = await writeDocument(storageKey, buffer);

  try {
    const { rows } = await db.query<DocRow>(
      `INSERT INTO documents
         (id, agent_id, client_id, policy_id, claim_id,
          title, file_name, mime_type, size_bytes, storage_key, sha256, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, title, file_name, mime_type, size_bytes, client_id, policy_id, claim_id, notes, created_at`,
      [docId, user.id, clientId, policyId, claimId,
       title, safeName, mimeType, size, storageKey, sha256, notes]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    // Best-effort cleanup so we don't leave orphan files.
    const { deleteDocument } = await import('../../../lib/document-storage');
    await deleteDocument(storageKey).catch(() => {});
    throw err;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { INLINE_SAFE_MIME_TYPES, streamDocument } from '../../../../lib/document-storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

type DocRow = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: string | number;
  storage_key: string;
};

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { rows } = await db.query<DocRow>(
    `SELECT id, file_name, mime_type, size_bytes, storage_key
     FROM documents
     WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL`,
    [id, user.id]
  );
  const doc = rows[0];
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nodeStream = streamDocument(doc.storage_key);
  // Convert Node stream to Web stream so NextResponse can pipe it.
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  // RFC5987-encode for non-ASCII filenames (CJK names are common here)
  const utf8Name = encodeURIComponent(doc.file_name);
  const shouldPreview =
    req.nextUrl.searchParams.get('download') !== '1' &&
    INLINE_SAFE_MIME_TYPES.has(doc.mime_type);
  const disposition =
    shouldPreview
      ? `inline; filename*=UTF-8''${utf8Name}`
      : `attachment; filename*=UTF-8''${utf8Name}`;

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Length': String(doc.size_bytes),
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  // Soft-delete only. The file on disk stays for the retention window;
  // a separate cleanup job (out of scope here) can purge files for rows
  // soft-deleted >30 days ago.
  const { rowCount } = await db.query(
    `UPDATE documents SET deleted_at = NOW()
     WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL`,
    [id, user.id]
  );
  if (rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

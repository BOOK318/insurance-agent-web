import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Local filesystem storage for documents. In production, mount the directory
 * as a Docker volume so files survive container rebuilds. Swap to MinIO/S3
 * later by changing only this module — the API surface is intentionally small.
 *
 * Layout:
 *   DOCUMENT_STORAGE_DIR/
 *     <agent_id>/
 *       <document_id>__<safe_filename>
 */

const ROOT = process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'documents');

// 25 MB. Insurance docs (PDFs, photos of forms) sit comfortably under this.
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

// Whitelist of mime types we accept for upload. Insurance workflow:
// PDFs, photos of forms / IDs, occasionally docx.
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const OFFICE_ZIP_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const LEGACY_OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
]);

export const INLINE_SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
]);

function hasPrefix(data: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => data[index] === byte);
}

function isLikelyText(data: Buffer) {
  if (data.includes(0)) return false;
  return data.toString('utf8').includes('\uFFFD') === false;
}

export function isValidDocumentContentType(data: Buffer, mimeType: string) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return false;
  if (data.length === 0) return false;

  if (mimeType === 'application/pdf') return hasPrefix(data, [0x25, 0x50, 0x44, 0x46]);
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return hasPrefix(data, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/png') return hasPrefix(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === 'image/webp') {
    return data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    const brand = data.length >= 12 ? data.subarray(4, 12).toString('ascii') : '';
    return brand.startsWith('ftyp') && /heic|heix|hevc|hevx|heif|mif1|msf1/.test(brand);
  }
  if (OFFICE_ZIP_MIME_TYPES.has(mimeType)) return hasPrefix(data, [0x50, 0x4b, 0x03, 0x04]);
  if (LEGACY_OFFICE_MIME_TYPES.has(mimeType)) return hasPrefix(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (mimeType === 'text/plain') return isLikelyText(data);

  return false;
}

/** Strip path-y characters; keep extension. */
export function sanitizeFileName(name: string) {
  const trimmed = name.trim().slice(-200);
  // Replace path separators and control chars with _; keep CJK + alphanum.
  return trimmed
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';
}

export function buildStorageKey(agentId: string, documentId: string, fileName: string) {
  // <agent_id>/<document_id>__<safe_filename>
  return `${agentId}/${documentId}__${sanitizeFileName(fileName)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeDocument(
  storageKey: string,
  data: Buffer,
): Promise<{ sha256: string; size: number }> {
  const full = path.join(ROOT, storageKey);
  await ensureDir(path.dirname(full));
  await fs.writeFile(full, data);
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  return { sha256, size: data.byteLength };
}

export function streamDocument(storageKey: string) {
  // Defense-in-depth: never let a row's storage_key escape ROOT.
  const full = path.resolve(ROOT, storageKey);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error('storage key escapes root');
  }
  return createReadStream(full);
}

export async function deleteDocument(storageKey: string) {
  const full = path.resolve(ROOT, storageKey);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error('storage key escapes root');
  }
  await fs.unlink(full).catch(() => {});
}

export async function statDocument(storageKey: string) {
  const full = path.resolve(ROOT, storageKey);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error('storage key escapes root');
  }
  return fs.stat(full);
}

export async function purgeAgentDir(agentId: string) {
  // Defensive: agentId must be a canonical UUID (8-4-4-4-12 hex), and the
  // resolved path must sit under ROOT — never allow caller-controlled traversal.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) return;
  const full = path.resolve(ROOT, agentId);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) return;
  await fs.rm(full, { recursive: true, force: true });
}

export function rootDir() { return ROOT; }

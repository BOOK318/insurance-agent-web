import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

export const runtime = 'nodejs';

const DEFAULT_WHISPER_URL =
  process.env.NODE_ENV === 'production'
    ? 'http://host.docker.internal:9000/inference'
    : 'http://127.0.0.1:9000/inference';

const WHISPER_URL = process.env.WHISPER_URL ?? DEFAULT_WHISPER_URL;
const MAX_AUDIO_BYTES = Number(process.env.TRANSCRIBE_MAX_BYTES ?? 25 * 1024 * 1024);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
]);

function fileNameFor(type: string) {
  if (type.includes('wav')) return 'audio.wav';
  return 'audio.webm';
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: '未收到錄音' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: '錄音太長，請分段錄音' }, { status: 413 });
  }

  const contentType = (audio.type || 'audio/webm').split(';')[0];
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: '本地 Whisper 目前只支援 WAV 錄音，請重新整理頁面後再錄一次。' },
      { status: 400 }
    );
  }

  const upstream = new FormData();
  upstream.append('file', audio, fileNameFor(contentType));
  upstream.append('language', 'zh');
  upstream.append('temperature', '0');
  upstream.append('response_format', 'json');

  let res: Response;
  try {
    res = await fetch(WHISPER_URL, {
      method: 'POST',
      body: upstream,
    });
  } catch (err) {
    return NextResponse.json(
      { error: '本地 Whisper 未啟動，請確認 Mac mini whisper-server 已經開咗。' },
      { status: 503 }
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return NextResponse.json(
      {
        error: '本地 Whisper 轉錄失敗',
        detail: body.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({})) as { text?: string; transcription?: string };
  const text = normalizeText(data.text ?? data.transcription);
  return NextResponse.json({
    text,
    processedNote: '錄音已由 Mac mini 本地 Whisper 處理，冇送去 Google / Claude',
  });
}

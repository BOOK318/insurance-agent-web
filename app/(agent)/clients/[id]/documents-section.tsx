'use client';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Upload, FileText, Image as ImageIcon, Trash2, Loader2, X } from 'lucide-react';

type DocRow = {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt';
const MAX_BYTES = 25 * 1024 * 1024;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isImageMime(m: string) { return m.startsWith('image/'); }

export function DocumentsSection({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch('/api/documents?client_id=' + clientId);
      if (r.ok) setDocs(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  async function upload(file: File) {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('檔案太大（最多 25 MB）'); return; }
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('client_id', clientId);
    fd.append('title', file.name);
    const res = await fetch('/api/documents', { method: 'POST', body: fd });
    setUploading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? '上傳失敗');
      return;
    }
    refresh();
  }

  async function remove(id: string) {
    if (!confirm('確定要刪除呢個文件？')) return;
    const res = await fetch('/api/documents/' + id, { method: 'DELETE' });
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== id));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation(); setDrag(false);
    const f = Array.from(e.dataTransfer.files)[0];
    if (f) void upload(f);
  }
  function handleDrag(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation();
    setDrag(e.type === 'dragenter' || e.type === 'dragover');
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">文件 ({docs.length})</h2>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-2xl border border-dashed py-4 px-3 text-center transition ${
          drag ? 'border-blue-400 bg-blue-50' : uploading ? 'border-gray-200 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" /> 上傳緊…
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Upload size={14} /> 拖文件入嚟，或者撳呢度揀
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-1">PDF / 相片 / Word / Excel · 最大 25 MB</p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ''; }}
        />
      </div>

      {error && (
        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={12} /></button>
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className="mt-3 divide-y divide-gray-50">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 py-2.5">
              <span className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                {isImageMime(d.mime_type) ? <ImageIcon size={14} /> : <FileText size={14} />}
              </span>
              <a
                href={'/api/documents/' + d.id}
                target="_blank" rel="noreferrer"
                className="flex-1 min-w-0 text-sm hover:underline"
              >
                <p className="truncate">{d.title}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {fmtSize(Number(d.size_bytes))} · {new Date(d.created_at).toLocaleDateString('zh-HK')}
                </p>
              </a>
              <button
                onClick={() => remove(d.id)}
                className="w-8 h-8 rounded-full text-gray-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                aria-label="刪除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

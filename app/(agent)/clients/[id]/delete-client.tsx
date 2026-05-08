'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function doDelete() {
    setDeleting(true);
    setError('');
    const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/clients');
      router.refresh();
    } else {
      setDeleting(false);
      setError((await res.json().catch(() => ({}))).error ?? '刪除失敗');
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 flex items-center justify-center gap-2 w-full text-sm text-rose-600 py-2.5 rounded-2xl border border-rose-100 hover:bg-rose-50 transition"
      >
        <Trash2 size={14} /> 刪除客戶（連同保單、Claim 一齊隱藏）
      </button>
    );
  }

  return (
    <div className="mt-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
      <p className="text-sm font-semibold text-rose-900 mb-1">確認刪除 {clientName}？</p>
      <p className="text-xs text-rose-700 mb-3">
        相關保單同 Claim 都會一齊隱藏。記錄會保留 30 日，如需永久清除請聯絡管理員。
      </p>
      {error && <p className="text-xs text-rose-700 mb-2">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="flex-1 text-sm py-2 rounded-xl border border-rose-200 bg-white"
        >
          取消
        </button>
        <button
          onClick={doDelete}
          disabled={deleting}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-rose-600 text-white py-2 rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-60"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {deleting ? '刪除中…' : '確認刪除'}
        </button>
      </div>
    </div>
  );
}

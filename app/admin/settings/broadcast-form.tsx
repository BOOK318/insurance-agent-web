'use client';
import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

export function BroadcastForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [role, setRole] = useState<'all' | 'agent' | 'head' | 'admin'>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ type: 'ok', text: `已送出，覆蓋 ${data.sent} 部裝置` });
      setTitle(''); setBody('');
    } else {
      setMsg({ type: 'err', text: data.error ?? '送出失敗' });
    }
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 block mb-1">對象</label>
        <select
          value={role}
          onChange={e => setRole(e.target.value as typeof role)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
        >
          <option value="all">全部用戶</option>
          <option value="agent">所有 Agent</option>
          <option value="head">所有 Head</option>
          <option value="admin">所有 Admin</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">標題</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={80}
          placeholder="例如：系統明早 8:00 升級"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">內容</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={250}
          rows={3}
          placeholder="例如：明早 8:00–8:15 暫時無法登入，請預早完成手頭工作。"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !title.trim() || !body.trim()}
        className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {busy ? '送出中…' : '送出公告'}
      </button>
      {msg && (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>
      )}
    </form>
  );
}

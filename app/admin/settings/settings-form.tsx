'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SettingsForm({ hasValue }: { hasValue: boolean }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ANTHROPIC_API_KEY', value: key.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ type: 'ok', text: '已儲存。下次 AI 對話即時生效。' });
      setKey('');
      router.refresh();
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg({ type: 'err', text: error ?? '儲存失敗' });
    }
  }

  async function clear() {
    if (!confirm('確定要清除已儲存嘅 key？')) return;
    const res = await fetch('/api/admin/settings?key=ANTHROPIC_API_KEY', { method: 'DELETE' });
    if (res.ok) {
      setMsg({ type: 'ok', text: '已清除。系統會回退到 .env.local 嘅值（如有）。' });
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <input
        type="password"
        value={key}
        onChange={e => setKey(e.target.value)}
        placeholder="sk-ant-…"
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !key.trim()}
          className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            className="text-sm text-gray-600 hover:text-red-600 px-3 py-2"
          >
            清除已儲存
          </button>
        )}
      </div>
      {msg && (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

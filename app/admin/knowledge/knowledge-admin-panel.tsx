'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

export type KnowledgeRow = {
  id: string;
  company: string;
  category: string;
  product_name: string | null;
  title: string;
  content: string;
  source_url: string | null;
  is_active: boolean;
  updated_at: string;
};

const EMPTY = {
  company: 'BOC Life',
  product_name: '',
  title: '',
  content: '',
};

export function KnowledgeAdminPanel({ initialRows }: { initialRows: KnowledgeRow[] }) {
  const router = useRouter();
  const [fields, setFields] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function set(key: keyof typeof EMPTY, value: string) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error ?? '儲存知識失敗' });
      return;
    }
    setFields(EMPTY);
    setMsg({ type: 'ok', text: '已加入 AI 知識庫，AI 下一次回答會即時使用' });
    router.refresh();
  }

  async function toggle(row: KnowledgeRow) {
    setBusyId(row.id);
    setMsg(null);
    const res = await fetch('/api/admin/knowledge', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setMsg({ type: 'err', text: data.error ?? '更新失敗' });
      return;
    }
    router.refresh();
  }

  async function remove(row: KnowledgeRow) {
    setBusyId(row.id);
    setMsg(null);
    const res = await fetch(`/api/admin/knowledge?id=${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
    });
    setBusyId(null);
    setDeleteId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setMsg({ type: 'err', text: data.error ?? '刪除失敗' });
      return;
    }
    setMsg({ type: 'ok', text: '已刪除知識' });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">AI 知識庫</h1>
        <p className="text-sm text-gray-500 mt-1">
          加入銷售話術、異議處理、跟進方式。內容會存在 server database，所有 agent 問 AI 時會自動引用。
        </p>
      </div>

      <form onSubmit={save} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus size={16} className="text-blue-700" />
          <p className="text-sm font-semibold">新增銷售知識</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="公司 / 範圍" value={fields.company} onChange={v => set('company', v)} placeholder="BOC Life" />
          <Field label="產品（可留空）" value={fields.product_name} onChange={v => set('product_name', v)} placeholder="例如：儲蓄 / VHIS" />
        </div>
        <Field label="標題" value={fields.title} onChange={v => set('title', v)} placeholder="例如：客戶話其他公司回報更好" />
        <div>
          <label className="text-xs text-gray-400 block mb-1">內容 / 建議話術</label>
          <textarea
            value={fields.content}
            onChange={e => set('content', e.target.value)}
            rows={6}
            placeholder="寫低你想 AI 之後記住嘅處理方式。涉及回報、實現率、派息數字時，建議寫明「以最新核准材料為準」。"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !fields.title.trim() || !fields.content.trim()}
          className="inline-flex items-center justify-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {busy ? '儲存中…' : '加入知識庫'}
        </button>
      </form>

      {msg && (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm border ${
          msg.type === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-2">
        {initialRows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-500">
            未有銷售知識。
          </div>
        ) : initialRows.map(row => (
          <div key={row.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-gray-900">{row.title}</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    {row.company}
                  </span>
                  {!row.is_active && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      已停用
                    </span>
                  )}
                </div>
                {row.product_name && <p className="text-xs text-gray-500 mt-0.5">{row.product_name}</p>}
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">{row.content}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggle(row)}
                  disabled={busyId === row.id}
                  className="w-9 h-9 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 flex items-center justify-center disabled:opacity-50"
                  aria-label={row.is_active ? '停用知識' : '啟用知識'}
                  title={row.is_active ? '停用知識' : '啟用知識'}
                >
                  {row.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(row.id)}
                  disabled={busyId === row.id}
                  className="w-9 h-9 rounded-xl bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-700 flex items-center justify-center disabled:opacity-50"
                  aria-label="刪除知識"
                  title="刪除知識"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {deleteId === row.id && (
              <div className="mt-3 border-t border-gray-100 pt-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                <p className="text-red-700 flex-1">確定刪除呢條知識？AI 之後唔會再引用。</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={busyId === row.id}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                  >
                    {busyId === row.id ? '刪除中…' : '刪除'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(null)}
                    className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, RotateCcw, UserCheck, UserX } from 'lucide-react';

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'agent' | 'head' | 'admin';
  is_active: boolean;
  created_at: string;
};

type CreateFields = {
  name: string;
  email: string;
  role: AdminUserRow['role'];
  password: string;
};

const ROLE_LABEL: Record<AdminUserRow['role'], string> = {
  agent: 'Agent',
  head: 'Team 總監',
  admin: '管理員',
};

const ROLE_BADGE: Record<AdminUserRow['role'], string> = {
  agent: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  head: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  admin: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const EMPTY: CreateFields = {
  name: '',
  email: '',
  role: 'agent',
  password: '',
};

export function UsersAdminPanel({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<CreateFields>(EMPTY);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function set<K extends keyof CreateFields>(key: K, value: CreateFields[K]) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setMsg(null);

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });

    setCreating(false);
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error ?? '建立帳號失敗' });
      return;
    }

    setFields(EMPTY);
    setMsg({ type: 'ok', text: '已建立帳號' });
    router.refresh();
  }

  async function updateUser(id: string, body: Record<string, unknown>, okText: string) {
    setBusyId(id);
    setMsg(null);

    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });

    setBusyId(null);
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error ?? '更新帳號失敗' });
      return;
    }

    setMsg({ type: 'ok', text: okText });
    router.refresh();
  }

  async function resetPassword(user: AdminUserRow) {
    const password = prompt(`輸入 ${user.name} 嘅新密碼`);
    if (!password) return;
    await updateUser(user.id, { password }, '已重設密碼');
  }

  const activeCount = initialUsers.filter(user => user.is_active).length;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">帳號管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          建立 Agent / Team 總監帳號，停用離職帳號，或重設密碼。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <Stat label="總帳號" value={initialUsers.length} />
        <Stat label="啟用中" value={activeCount} />
        <Stat label="Agent" value={initialUsers.filter(user => user.role === 'agent').length} />
      </div>

      <form onSubmit={createUser} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus size={16} className="text-blue-700" />
          <p className="text-sm font-semibold">新增帳號</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="姓名" value={fields.name} onChange={v => set('name', v)} placeholder="Chan Tai Man" />
          <Field label="Email" value={fields.email} onChange={v => set('email', v)} type="email" placeholder="agent@team.local" />
          <div>
            <label className="text-xs text-gray-400 block mb-1">角色</label>
            <select
              value={fields.role}
              onChange={e => set('role', e.target.value as AdminUserRow['role'])}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="agent">Agent</option>
              <option value="head">Team 總監</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          <Field label="初始密碼" value={fields.password} onChange={v => set('password', v)} type="password" placeholder="至少 8 個字" />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? '建立中...' : '建立帳號'}
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
        {initialUsers.map(user => (
          <div key={user.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-gray-900 truncate">{user.name}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role]}`}>
                    {ROLE_LABEL[user.role]}
                  </span>
                  {!user.is_active && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      已停用
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{user.email}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <IconButton
                  label="重設密碼"
                  disabled={busyId === user.id}
                  onClick={() => resetPassword(user)}
                >
                  <RotateCcw size={15} />
                </IconButton>
                {user.is_active ? (
                  <IconButton
                    label="停用"
                    disabled={busyId === user.id}
                    onClick={() => updateUser(user.id, { is_active: false }, '已停用帳號')}
                  >
                    <UserX size={15} />
                  </IconButton>
                ) : (
                  <IconButton
                    label="重新啟用"
                    disabled={busyId === user.id}
                    onClick={() => updateUser(user.id, { is_active: true }, '已重新啟用帳號')}
                  >
                    <UserCheck size={15} />
                  </IconButton>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-9 h-9 rounded-xl bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 flex items-center justify-center transition"
    >
      {children}
    </button>
  );
}

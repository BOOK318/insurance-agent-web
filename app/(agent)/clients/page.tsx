import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';
import Link from 'next/link';
import { Search, Plus, ChevronRight } from 'lucide-react';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const user = await getSession();
  if (!user) return null;

  const { q, filter } = await searchParams;

  // Birthday clients (next 30 days)
  const { rows: birthdayClients } = await db.query(
    `SELECT id, name_zh, name_en
     FROM clients WHERE agent_id = $1 AND deleted_at IS NULL
     AND TO_CHAR(dob, 'MM-DD') BETWEEN TO_CHAR(NOW(), 'MM-DD')
     AND TO_CHAR(NOW() + INTERVAL '30 days', 'MM-DD')`,
    [user.id]
  );
  const birthdayIds = new Set(birthdayClients.map((c: Record<string, unknown>) => c.id));

  // Expiring policies (30 days)
  const { rows: expiringClients } = await db.query(
    `SELECT DISTINCT client_id FROM policies
     WHERE agent_id = $1 AND status = 'active' AND deleted_at IS NULL
     AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
    [user.id]
  );
  const expiringIds = new Set(expiringClients.map((r: Record<string, unknown>) => r.client_id));

  let sql = `SELECT c.*, COUNT(p.id) AS policy_count
             FROM clients c
             LEFT JOIN policies p ON p.client_id = c.id AND p.status = 'active' AND p.deleted_at IS NULL
             WHERE c.agent_id = $1 AND c.deleted_at IS NULL`;
  const params: unknown[] = [user.id];

  if (q) {
    sql += ` AND (c.name_zh ILIKE $2 OR c.name_en ILIKE $2 OR c.phone ILIKE $2 OR c.nationality ILIKE $2 OR c.preferences ILIKE $2)`;
    params.push(`%${q}%`);
  }

  sql += ' GROUP BY c.id ORDER BY c.name_zh NULLS LAST, c.name_en';

  const { rows: allClients } = await db.query(sql, params);

  let clients = allClients as Array<Record<string, unknown>>;
  if (filter === 'birthday') clients = clients.filter(c => birthdayIds.has(c.id));
  if (filter === 'expiring') clients = clients.filter(c => expiringIds.has(c.id));

  const total = allClients.length;

  const FILTERS = [
    { id: '', label: `全部 · ${total}` },
    { id: 'birthday', label: '🎂 生日' },
    { id: 'expiring', label: '到期保單' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">我的客戶</h1>
        <Link
          href="/clients/new"
          className="flex items-center gap-1 bg-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-blue-800 transition"
        >
          <Plus size={14} /> 新增
        </Link>
      </div>

      {/* Search */}
      <form className="mb-3">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            name="q"
            defaultValue={q}
            placeholder="搜尋姓名 / 電話 / 保單號碼"
            className="bg-transparent w-full outline-none text-sm"
          />
        </div>
      </form>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
        {FILTERS.map(f => (
          <Link
            key={f.id}
            href={f.id ? `/clients?filter=${f.id}${q ? `&q=${q}` : ''}` : '/clients' + (q ? `?q=${q}` : '')}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition ${
              (filter ?? '') === f.id
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Count */}
      <p className="text-xs uppercase tracking-wider text-gray-400 mb-2 px-1">
        {clients.length} 位客戶
      </p>

      {/* List */}
      <div className="space-y-2">
        {clients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">👥</p>
            <p className="text-sm">未有客戶記錄</p>
          </div>
        ) : clients.map(c => {
          const hasBirthday = birthdayIds.has(c.id);
          const hasExpiring = expiringIds.has(c.id);
          return (
            <Link
              key={c.id as string}
              href={`/clients/${c.id}`}
              className="flex items-center gap-3 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 hover:shadow-md transition"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl shrink-0">
                {c.gender === 'F' ? '👩‍💼' : '🧑‍💼'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-gray-900">
                    {(c.name_zh ?? c.name_en) as string}
                  </span>
                  {hasBirthday && <span className="text-sm">🎂</span>}
                  {hasExpiring && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                      保單到期
                    </span>
                  )}
                  {c.name_zh && c.name_en && (
                    <span className="text-xs text-gray-400">· {c.name_en as string}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {(c.occupation as string) ?? '未填職業'}
                  {c.phone ? ` · ${c.phone as string}` : ''}
                </p>
              </div>

              {/* Policy count + arrow */}
              <div className="flex items-center gap-1 text-blue-700 shrink-0">
                <span className="text-xs bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
                  {(c.policy_count as number) || 0} 份
                </span>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

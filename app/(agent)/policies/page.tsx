import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';
import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
import { formatDate } from '../../../lib/utils';

const STATUS_LABEL: Record<string, string> = {
  active: '生效', lapsed: '失效', surrendered: '退保',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  lapsed: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  surrendered: 'bg-gray-100 text-gray-600',
};

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getSession();
  if (!user) return null;

  const { filter } = await searchParams;

  const { rows: allPolicies } = await db.query(
    `SELECT p.*, c.name_zh, c.name_en
     FROM policies p JOIN clients c ON c.id = p.client_id
     WHERE p.agent_id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY p.expiry_date ASC NULLS LAST`,
    [user.id]
  );

  const now = Date.now();
  const inThirty = now + 30 * 86400000;

  type Policy = Record<string, unknown>;

  const expiringCount = allPolicies.filter((p: Policy) =>
    p.status === 'active' && p.expiry_date &&
    new Date(p.expiry_date as string).getTime() <= inThirty &&
    new Date(p.expiry_date as string).getTime() >= now
  ).length;

  let policies = allPolicies as Policy[];

  const TYPES = ['醫療', '危疾', '人壽', '年金', '意外', '儲蓄'];
  if (filter && TYPES.includes(filter)) {
    policies = policies.filter(p => (p.type as string ?? '').includes(filter));
  } else if (filter === 'expiring') {
    policies = policies.filter(p =>
      p.status === 'active' && p.expiry_date &&
      new Date(p.expiry_date as string).getTime() <= inThirty &&
      new Date(p.expiry_date as string).getTime() >= now
    );
  }

  const FILTERS = [
    { id: '', label: '全部' },
    { id: 'expiring', label: `⚠️ 到期 (${expiringCount})` },
    ...TYPES.map(t => ({ id: t, label: t })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">保單</h1>
          <p className="text-xs text-gray-400">共 {allPolicies.length} 份 · {expiringCount} 份即將到期</p>
        </div>
        <Link href="/policies/new"
          className="flex items-center gap-1 bg-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-blue-800 transition">
          <Plus size={14} /> 新增
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
        {FILTERS.map(f => (
          <Link
            key={f.id}
            href={f.id ? `/policies?filter=${f.id}` : '/policies'}
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

      {/* List */}
      <div className="space-y-2">
        {policies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-sm">未有保單記錄</p>
          </div>
        ) : policies.map(p => {
          const daysLeft = p.expiry_date
            ? Math.ceil((new Date(p.expiry_date as string).getTime() - now) / 86400000)
            : null;
          const expiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;
          const clientName = (p.name_zh ?? p.name_en) as string;
          const insightParts = [
            p.payment_period ? `供款期 ${p.payment_period as string}` : null,
            p.breakeven_year ? `預計回本 ${p.breakeven_year as number} 年` : null,
            p.breakeven_date ? `回本日 ${formatDate(p.breakeven_date as string)}` : null,
            p.death_benefit ? `身故 ${formatPolicyMoney(p.death_benefit, p.currency)}` : null,
          ].filter(Boolean);
          const scenarioParts = [
            p.scenario_20y_pessimistic ? `悲觀 ${formatPolicyMoney(p.scenario_20y_pessimistic, p.currency)}` : null,
            p.scenario_20y_optimistic ? `樂觀 ${formatPolicyMoney(p.scenario_20y_optimistic, p.currency)}` : null,
          ].filter(Boolean);

          return (
            <div
              key={p.id as string}
              className={`block bg-white rounded-2xl p-3.5 shadow-sm border transition hover:shadow-md ${
                expiringSoon ? 'border-amber-200' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/clients/${p.client_id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{(p.product_name ?? p.type) as string}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {clientName} · {p.company as string} · {p.policy_number as string}
                  </p>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/policies/${p.id as string}/edit`}
                    aria-label="編輯保單"
                    className="w-7 h-7 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center hover:bg-blue-50 hover:text-blue-700 transition"
                  >
                    <Pencil size={12} />
                  </Link>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    expiringSoon
                      ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                      : (STATUS_COLOR[p.status as string] ?? 'bg-gray-100 text-gray-600')
                  }`}>
                    {expiringSoon ? `⚠️ ${daysLeft}日到期` : (STATUS_LABEL[p.status as string] ?? p.status as string)}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>保費 <span className="text-gray-800 font-medium">
                  {p.premium ? formatPolicyMoney(p.premium, p.currency) : '-'}/{(p.premium_frequency as string) ?? '-'}
                </span></span>
                {p.expiry_date && (
                  <span>到期 <span className="text-gray-800 font-medium">{formatDate(p.expiry_date as string)}</span></span>
                )}
              </div>
              {insightParts.length > 0 && (
                <p className="mt-1 text-xs text-blue-700">
                  {insightParts.join(' · ')}
                </p>
              )}
              {scenarioParts.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  20年：{scenarioParts.join(' · ')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatPolicyMoney(amount: unknown, currency: unknown) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '-';
  const code = typeof currency === 'string' && currency.trim() ? currency.trim() : 'HKD';
  return `${code} ${num.toLocaleString('zh-HK')}`;
}

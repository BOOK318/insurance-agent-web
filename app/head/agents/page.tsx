import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';

type AgentRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  client_count: number | string;
  active_policies: number | string;
  pending_claims: number | string;
  renewals_soon: number | string;
};

function n(value: number | string) {
  return Number(value ?? 0);
}

export default async function HeadAgentsPage() {
  const { rows } = await db.query<AgentRow>(`
    SELECT u.id, u.name, u.email, u.is_active, u.created_at,
      COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL) AS client_count,
      COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active' AND p.deleted_at IS NULL) AS active_policies,
      COUNT(DISTINCT cl.id) FILTER (WHERE cl.status = 'pending' AND cl.deleted_at IS NULL) AS pending_claims,
      COUNT(DISTINCT rp.id) FILTER (
        WHERE rp.status = 'active'
          AND rp.deleted_at IS NULL
          AND rp.expiry_date <= NOW() + INTERVAL '30 days'
      ) AS renewals_soon
    FROM users u
    LEFT JOIN clients c ON c.agent_id = u.id
    LEFT JOIN policies p ON p.agent_id = u.id
    LEFT JOIN claims cl ON cl.agent_id = u.id
    LEFT JOIN policies rp ON rp.agent_id = u.id
    WHERE u.role = 'agent'
    GROUP BY u.id, u.name, u.email, u.is_active, u.created_at
    ORDER BY u.is_active DESC, client_count DESC, u.name
  `);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Agent列表</h1>
        <p className="text-sm text-gray-500 mt-1">查看每位保險 Agent 嘅客戶、保單、Claim 同續保概況。</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-3 px-4 py-3 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
          <span>Agent</span>
          <span className="text-right">客戶</span>
          <span className="text-right">有效保單</span>
          <span className="text-right">待處理 Claim</span>
          <span className="text-right">30日續保</span>
          <span className="text-right">狀態</span>
        </div>

        <div className="divide-y divide-gray-100">
          {rows.map(agent => (
            <div key={agent.id} className="grid grid-cols-2 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-3 px-4 py-3 items-center text-sm">
              <div className="col-span-2 md:col-span-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{agent.name}</p>
                <p className="text-xs text-gray-500 truncate">{agent.email}</p>
              </div>
              <Metric label="客戶" value={n(agent.client_count)} />
              <Metric label="有效保單" value={n(agent.active_policies)} />
              <Metric label="待處理 Claim" value={n(agent.pending_claims)} tone={n(agent.pending_claims) > 0 ? 'warn' : 'normal'} />
              <Metric label="30日續保" value={n(agent.renewals_soon)} tone={n(agent.renewals_soon) > 0 ? 'warn' : 'normal'} />
              <div className="text-right">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${agent.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {agent.is_active ? '啟用' : '停用'}
                </span>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              未有 Agent。請到帳號管理新增 Agent。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'warn' }) {
  return (
    <div className="flex items-center justify-between md:block md:text-right">
      <span className="md:hidden text-xs text-gray-500">{label}</span>
      <span className={tone === 'warn' ? 'font-semibold text-amber-700' : 'text-gray-800'}>{value}</span>
    </div>
  );
}

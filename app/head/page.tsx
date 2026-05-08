import { db } from '../../lib/db';
import { formatHKD } from '../../lib/utils';

export default async function HeadDashboard() {
  const [agentStats, topPolicies, pendingClaims] = await Promise.all([
    db.query(`
      SELECT u.id, u.name,
        COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL) AS client_count,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active' AND p.deleted_at IS NULL) AS active_policies,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.status = 'pending' AND cl.deleted_at IS NULL) AS pending_claims
      FROM users u
      LEFT JOIN clients c ON c.agent_id = u.id
      LEFT JOIN policies p ON p.agent_id = u.id
      LEFT JOIN claims cl ON cl.agent_id = u.id
      WHERE u.role = 'agent' AND u.is_active = TRUE
      GROUP BY u.id, u.name
      ORDER BY client_count DESC
    `),
    db.query(`
      SELECT p.product_name, p.type, p.company, p.premium, p.expiry_date,
             c.name_zh, c.name_en, u.name AS agent_name
      FROM policies p
      JOIN clients c ON c.id = p.client_id
      JOIN users u ON u.id = p.agent_id
      WHERE p.status = 'active' AND p.expiry_date <= NOW() + INTERVAL '30 days'
        AND p.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY p.expiry_date
      LIMIT 10
    `),
    db.query(`
      SELECT cl.claim_type, cl.status, cl.amount_claimed,
             c.name_zh, c.name_en, u.name AS agent_name
      FROM claims cl
      JOIN clients c ON c.id = cl.client_id
      JOIN users u ON u.id = cl.agent_id
      WHERE cl.status = 'pending'
        AND cl.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY cl.created_at DESC
      LIMIT 10
    `),
  ]);

  type AgentRow = Record<string, unknown>;
  const totalClients  = agentStats.rows.reduce((s: number, r: AgentRow) => s + Number(r.client_count),   0);
  const totalPolicies = agentStats.rows.reduce((s: number, r: AgentRow) => s + Number(r.active_policies), 0);
  const totalClaims   = agentStats.rows.reduce((s: number, r: AgentRow) => s + Number(r.pending_claims),  0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Team業績總覽</h1>
      <p className="text-gray-400 text-sm mb-5">全Team實時數據</p>

      {/* Team totals */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: '總客戶數',    value: totalClients,  color: 'text-blue-700'   },
          { label: '有效保單',    value: totalPolicies, color: 'text-green-700'  },
          { label: '待處理Claim', value: totalClaims,   color: 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-agent */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">👥 Agent業績</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {(agentStats.rows as AgentRow[]).map(a => (
            <div key={a.id as string} className="flex items-center justify-between p-4">
              <span className="font-medium text-sm">{a.name as string}</span>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>👤 {a.client_count as number}</span>
                <span>📋 {a.active_policies as number}</span>
                <span className={Number(a.pending_claims) > 0 ? 'text-orange-500 font-semibold' : ''}>
                  🏥 {a.pending_claims as number}
                </span>
              </div>
            </div>
          ))}
          {agentStats.rows.length === 0 && (
            <p className="p-4 text-sm text-gray-400">未有Agent資料</p>
          )}
        </div>
      </div>

      {/* Expiring policies */}
      {topPolicies.rows.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <h2 className="font-semibold text-amber-800 mb-3 text-sm">⚠️ 30日內到期保單</h2>
          <div className="space-y-2">
            {(topPolicies.rows as AgentRow[]).map((p, i) => (
              <div key={i} className="text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium">{(p.name_zh ?? p.name_en) as string}</span>
                  <span className="text-gray-500"> · {(p.product_name ?? p.type) as string}</span>
                </div>
                <span className="text-xs text-amber-700">{p.agent_name as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending claims */}
      {pendingClaims.rows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold mb-3 text-sm">🏥 待處理Claim</h2>
          <div className="space-y-2">
            {(pendingClaims.rows as AgentRow[]).map((c, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{(c.name_zh ?? c.name_en) as string} · {c.claim_type as string}</span>
                <span className="text-gray-400 text-xs">{c.agent_name as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

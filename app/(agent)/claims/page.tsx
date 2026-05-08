import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { formatHKD, formatDate } from '../../../lib/utils';

const STATUS_LABEL: Record<string, string> = {
  pending: '待處理', approved: '批准', rejected: '拒絕', paid: '已賠付',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  rejected: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  paid: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
};

export default async function ClaimsPage() {
  const user = await getSession();
  if (!user) return null;

  const { rows: claims } = await db.query(
    `SELECT cl.*, c.name_zh, c.name_en, p.product_name, p.policy_number
     FROM claims cl
     JOIN clients c ON c.id = cl.client_id
     LEFT JOIN policies p ON p.id = cl.policy_id AND p.deleted_at IS NULL
     WHERE cl.agent_id = $1 AND cl.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY cl.created_at DESC`,
    [user.id]
  );

  type Claim = Record<string, unknown>;
  const pending = claims.filter((c: Claim) => c.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Claim</h1>
          {pending > 0 && <p className="text-xs text-amber-700">{pending} 個待處理</p>}
        </div>
        <Link href="/claims/new"
          className="flex items-center gap-1 bg-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-blue-800 transition">
          <Plus size={14} /> 新增
        </Link>
      </div>

      <div className="space-y-2">
        {(claims as Claim[]).length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">🏥</p>
            <p className="text-sm">未有 Claim 記錄</p>
          </div>
        ) : (claims as Claim[]).map(cl => (
          <Link
            key={cl.id as string}
            href={`/clients/${cl.client_id}`}
            className="block bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{cl.claim_type as string}</p>
                <p className="text-xs text-gray-400 truncate">
                  {(cl.name_zh ?? cl.name_en) as string}
                  {cl.product_name ? ` · ${cl.product_name as string}` : ''}
                  {cl.policy_number ? ` (${cl.policy_number as string})` : ''}
                </p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[cl.status as string] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABEL[cl.status as string] ?? cl.status as string}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>
                {cl.amount_claimed ? `申請金額 ${formatHKD(cl.amount_claimed as number)}` : '金額未定'}
              </span>
              <span>{cl.submitted_date ? formatDate(cl.submitted_date as string) : '-'}</span>
            </div>
            {cl.amount_approved && cl.status !== 'pending' && (
              <p className="mt-1 text-xs text-emerald-700">
                批准金額 {formatHKD(cl.amount_approved as number)}
              </p>
            )}
            {cl.current_step && (
              <p className="mt-1 text-xs text-blue-700">
                流程：{cl.current_step as string}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

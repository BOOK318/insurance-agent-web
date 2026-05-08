import { getSession } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, Briefcase, Pencil, Plus, Sparkles } from 'lucide-react';
import { formatHKD, formatDate, calcAge } from '../../../../lib/utils';
import { notFound } from 'next/navigation';
import { DeleteClientButton } from './delete-client';
import { DocumentsSection } from './documents-section';

const STATUS_LABEL: Record<string, string> = {
  active: '生效', lapsed: '失效', surrendered: '退保',
  pending: '待處理', approved: '批准', rejected: '拒絕', paid: '已賠付',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  lapsed: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  surrendered: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  rejected: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  paid: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) return null;

  const { id } = await params;

  const { rows } = await db.query(
    'SELECT * FROM clients WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL',
    [id, user.id]
  );
  const client = rows[0];
  if (!client) notFound();

  const [{ rows: policies }, { rows: claims }] = await Promise.all([
    db.query('SELECT * FROM policies WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [id]),
    db.query('SELECT * FROM claims WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [id]),
  ]);

  const age = client.dob ? calcAge(client.dob as string) : null;
  const isExpiring = policies.some((p: Record<string, unknown>) => {
    if (p.status !== 'active' || !p.expiry_date) return false;
    const diff = (new Date(p.expiry_date as string).getTime() - Date.now()) / 86400000;
    return diff <= 30 && diff >= 0;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/clients" className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold flex-1 truncate">
          {(client.name_zh ?? client.name_en) as string}
        </h1>
        {client.phone && (
          <a href={`tel:${client.phone as string}`}
            className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center hover:bg-blue-100 transition">
            <Phone size={16} />
          </a>
        )}
      </div>

      {/* Personal Info Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">個人資料</h2>
          <Link href={`/clients/${id}/edit`} className="text-xs text-blue-700 font-medium">編輯</Link>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {client.name_en && (
            <div>
              <p className="text-xs text-gray-400">English Name</p>
              <p className="font-medium">{client.name_en as string}</p>
            </div>
          )}
          {age !== null && (
            <div>
              <p className="text-xs text-gray-400">年齡</p>
              <p className="font-medium">{age} 歲</p>
            </div>
          )}
          {client.nationality && (
            <div>
              <p className="text-xs text-gray-400">國籍</p>
              <p className="font-medium">{client.nationality as string}</p>
            </div>
          )}
          {client.phone && (
            <div className="flex items-start gap-1.5">
              <Phone size={12} className="mt-1 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">電話</p>
                <p className="font-medium">{client.phone as string}</p>
              </div>
            </div>
          )}
          {client.email && (
            <div className="flex items-start gap-1.5">
              <Mail size={12} className="mt-1 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">電郵</p>
                <p className="font-medium text-xs break-all">{client.email as string}</p>
              </div>
            </div>
          )}
          {client.occupation && (
            <div className="flex items-start gap-1.5 col-span-2">
              <Briefcase size={12} className="mt-1 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">職業</p>
                <p className="font-medium">{client.occupation as string}</p>
              </div>
            </div>
          )}
        </div>

        {client.annual_income && (
          <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2.5">
            <p className="text-xs text-gray-400">年薪</p>
            <p className="text-base font-semibold text-gray-900">{formatHKD(client.annual_income as number)}</p>
          </div>
        )}

        {client.family_notes && (
          <div className="mt-3 pt-3 border-t text-sm">
            <p className="text-xs text-gray-400 mb-1">家庭狀況</p>
            <p className="text-gray-700 leading-relaxed">{client.family_notes as string}</p>
          </div>
        )}

        {client.preferences && (
          <div className="mt-2 text-sm">
            <p className="text-xs text-gray-400 mb-1">喜好</p>
            <p className="text-gray-700 leading-relaxed">{client.preferences as string}</p>
          </div>
        )}

        {client.assets_notes && (
          <div className="mt-2 text-sm">
            <p className="text-xs text-gray-400 mb-1">資產備註</p>
            <p className="text-gray-700 leading-relaxed">{client.assets_notes as string}</p>
          </div>
        )}

        {(client.monthly_expenses || client.mortgage_balance || client.dependents_count != null ||
          client.property_notes || client.existing_coverage_notes || client.financial_goals || client.liabilities_notes) && (
          <div className="mt-3 pt-3 border-t text-sm">
            <p className="text-xs text-gray-400 mb-2">財務分析</p>
            <div className="grid grid-cols-2 gap-2">
              {client.monthly_expenses && (
                <InfoPill label="每月開支" value={formatHKD(client.monthly_expenses as number)} />
              )}
              {client.mortgage_balance && (
                <InfoPill label="按揭/負債" value={formatHKD(client.mortgage_balance as number)} />
              )}
              {client.dependents_count != null && (
                <InfoPill label="供養人數" value={`${client.dependents_count as number} 人`} />
              )}
              {client.financial_goals && (
                <InfoPill label="目標" value={client.financial_goals as string} />
              )}
            </div>
            {client.property_notes && <NoteLine label="物業" value={client.property_notes as string} />}
            {client.existing_coverage_notes && <NoteLine label="現有保障" value={client.existing_coverage_notes as string} />}
            {client.liabilities_notes && <NoteLine label="其他負債" value={client.liabilities_notes as string} />}
          </div>
        )}

        {client.notes && (
          <div className="mt-2 text-sm">
            <p className="text-xs text-gray-400 mb-1">備註</p>
            <p className="text-gray-700 leading-relaxed">{client.notes as string}</p>
          </div>
        )}
      </div>

      {/* Expiry Warning */}
      {isExpiring && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-3 flex items-center gap-2">
          <span className="text-amber-600 text-lg">⚠️</span>
          <p className="text-sm text-amber-800 font-medium">有保單將於 30 日內到期，請盡快跟進</p>
        </div>
      )}

      {/* Policies */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">保單（{policies.length} 份）</h2>
          <Link href={`/policies/new?client=${id}`}
            className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center hover:bg-blue-100 transition">
            <Plus size={14} />
          </Link>
        </div>
        {policies.length === 0 ? (
          <p className="text-sm text-gray-400">未有保單記錄</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(policies as Array<Record<string, unknown>>).map(p => {
              const daysLeft = p.expiry_date
                ? Math.ceil((new Date(p.expiry_date as string).getTime() - Date.now()) / 86400000)
                : null;
              const expiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;
              const detailParts = [
                p.policyholder_name ? `持有人：${p.policyholder_name as string}` : null,
                p.insured_name ? `受保人：${p.insured_name as string}` : null,
                p.payment_period ? `供款期：${p.payment_period as string}` : null,
                p.breakeven_year ? `回本：約 ${p.breakeven_year as number} 年` : null,
                p.breakeven_date ? `回本日：${formatDate(p.breakeven_date as string)}` : null,
                p.death_benefit ? `身故：${formatPolicyMoney(p.death_benefit, p.currency)}` : null,
              ].filter(Boolean);
              const scenarioParts = [
                p.scenario_20y_pessimistic ? `悲觀 ${formatPolicyMoney(p.scenario_20y_pessimistic, p.currency)}` : null,
                p.scenario_20y_optimistic ? `樂觀 ${formatPolicyMoney(p.scenario_20y_optimistic, p.currency)}` : null,
              ].filter(Boolean);
              return (
                <div key={p.id as string} className="py-3 first:pt-1 last:pb-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{(p.product_name ?? p.type) as string}</p>
                      <p className="text-xs text-gray-400 truncate">{p.company as string} · {p.policy_number as string}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/policies/${p.id as string}/edit`}
                        aria-label="編輯保單"
                        className="w-7 h-7 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center hover:bg-blue-50 hover:text-blue-700 transition"
                      >
                        <Pencil size={12} />
                      </Link>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status as string] ?? 'bg-gray-100 text-gray-600'}`}>
                        {expiringSoon ? `⚠️ ${daysLeft}日到期` : (STATUS_LABEL[p.status as string] ?? p.status as string)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
                    <span>保費 <span className="text-gray-800 font-medium">{p.premium ? formatPolicyMoney(p.premium, p.currency) : '-'}/{p.premium_frequency as string ?? '-'}</span></span>
                    {p.expiry_date && <span>到期 <span className="text-gray-800 font-medium">{formatDate(p.expiry_date as string)}</span></span>}
                  </div>
                  {detailParts.length > 0 && (
                    <p className="mt-1 text-[11px] text-blue-700">
                      {detailParts.join(' · ')}
                    </p>
                  )}
                  {scenarioParts.length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      20年：{scenarioParts.join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Claims */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Claim（{claims.length} 個）</h2>
          <Link href={`/claims/new?client=${id}`}
            className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center hover:bg-blue-100 transition">
            <Plus size={14} />
          </Link>
        </div>
        {claims.length === 0 ? (
          <p className="text-sm text-gray-400">未有 Claim 記錄</p>
        ) : (
          <div className="space-y-2">
            {(claims as Array<Record<string, unknown>>).map(c => (
              <div key={c.id as string} className="flex items-center justify-between text-sm border border-gray-100 rounded-xl p-3">
                <div>
                  <p className="font-medium">{c.claim_type as string}</p>
                  <p className="text-xs text-gray-400">
                    {c.submitted_date ? formatDate(c.submitted_date as string) : '-'}
                    {c.amount_claimed ? ` · ${formatHKD(c.amount_claimed as number)}` : ''}
                  </p>
                  {c.current_step && (
                    <p className="text-[11px] text-blue-700 mt-0.5">{c.current_step as string}</p>
                  )}
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status as string] ?? 'bg-gray-100'}`}>
                  {STATUS_LABEL[c.status as string] ?? c.status as string}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <DocumentsSection clientId={id} />

      {/* AI Button */}
      <Link href={`/ai?client=${id}`}
        className="flex items-center justify-center gap-2 w-full bg-blue-700 text-white py-3.5 rounded-2xl font-semibold hover:bg-blue-800 transition">
        <Sparkles size={16} /> AI 銷售建議
      </Link>

      {/* Soft delete (PDPO right-to-deletion) */}
      <DeleteClientButton
        clientId={id}
        clientName={(client.name_zh ?? client.name_en) as string}
      />
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-xs font-semibold text-gray-900 truncate">{value}</p>
    </div>
  );
}

function NoteLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-gray-600 mt-2 leading-relaxed">
      <span className="text-gray-400">{label}：</span>{value}
    </p>
  );
}

function formatPolicyMoney(amount: unknown, currency: unknown) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '-';
  const code = typeof currency === 'string' && currency.trim() ? currency.trim() : 'HKD';
  return `${code} ${num.toLocaleString('zh-HK')}`;
}

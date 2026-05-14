import { getSession } from '../../../lib/auth';
import { db } from '../../../lib/db';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { MarkAllReadButton, ReminderRow } from './inbox-actions';

export default async function RemindersPage() {
  const user = await getSession();
  if (!user) return null;

  // Birthdays next 30 days
  const { rows: birthdayClients } = await db.query(
    `SELECT id, name_zh, name_en, dob,
       CASE
         WHEN TO_CHAR(dob, 'MM-DD') >= TO_CHAR(NOW(), 'MM-DD')
         THEN DATE_PART('day', (DATE_TRUNC('year', NOW()) + (EXTRACT(MONTH FROM dob::date)-1||' months')::INTERVAL + (EXTRACT(DAY FROM dob::date)-1||' days')::INTERVAL) - NOW()::date)
         ELSE DATE_PART('day', (DATE_TRUNC('year', NOW() + INTERVAL '1 year') + (EXTRACT(MONTH FROM dob::date)-1||' months')::INTERVAL + (EXTRACT(DAY FROM dob::date)-1||' days')::INTERVAL) - NOW()::date)
       END AS days_left
     FROM clients WHERE agent_id = $1 AND deleted_at IS NULL
     AND TO_CHAR(dob, 'MM-DD') BETWEEN TO_CHAR(NOW(), 'MM-DD')
     AND TO_CHAR(NOW() + INTERVAL '30 days', 'MM-DD')
     ORDER BY days_left`,
    [user.id]
  );

  // Reminders — inbox-style. Show all rows; unread (is_sent = FALSE) gets a
  // blue dot in the UI; "Mark all as read" flips them to is_sent = TRUE.
  const { rows: reminders } = await db.query(
    `SELECT r.*, c.name_zh AS client_name_zh, c.name_en AS client_name_en, c.id AS client_id_val
     FROM reminders r LEFT JOIN clients c ON c.id = r.client_id AND c.deleted_at IS NULL
     WHERE r.agent_id = $1
     ORDER BY COALESCE(r.pushed_at, r.remind_at) DESC`,
    [user.id]
  );
  const hasUnread = (reminders as Array<{ is_sent: boolean }>).some(r => !r.is_sent);

  // Expiring policies (30 days)
  const { rows: expiringPolicies } = await db.query(
    `SELECT p.product_name, p.type, p.expiry_date, p.client_id,
            c.name_zh, c.name_en
     FROM policies p JOIN clients c ON c.id = p.client_id
     WHERE p.agent_id = $1 AND p.status = 'active'
       AND p.deleted_at IS NULL AND c.deleted_at IS NULL
       AND p.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
     ORDER BY p.expiry_date ASC`,
    [user.id]
  );

  type Row = Record<string, unknown>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">提醒</h1>
        <MarkAllReadButton hasUnread={hasUnread} />
      </div>

      {/* Birthdays */}
      {birthdayClients.length > 0 && (
        <section className="mb-5">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2 px-1">🎂 30日內生日</p>
          <div className="space-y-2">
            {(birthdayClients as Row[]).map(c => {
              const days = Number(c.days_left);
              const isToday = days === 0;
              return (
                <Link
                  key={c.id as string}
                  href={`/clients/${c.id}`}
                  className={`flex items-center gap-3 rounded-2xl p-3.5 border transition hover:shadow-sm ${
                    isToday
                      ? 'bg-gradient-to-br from-pink-100 to-rose-50 border-pink-200'
                      : 'bg-pink-50 border-pink-100'
                  }`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-white text-pink-600 flex items-center justify-center text-xl shrink-0">🎂</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{(c.name_zh ?? c.name_en) as string}</p>
                    <p className="text-xs text-gray-500">
                      {c.dob ? `${formatDate(c.dob as string)}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isToday ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-700'
                  }`}>
                    {isToday ? '今日 🎉' : `${days}日後`}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Expiring Policies */}
      {expiringPolicies.length > 0 && (
        <section className="mb-5">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2 px-1">⚠️ 保單即將到期</p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl divide-y divide-amber-200/60">
            {(expiringPolicies as Row[]).map((p, i) => {
              const daysLeft = Math.ceil(
                (new Date(p.expiry_date as string).getTime() - Date.now()) / 86400000
              );
              return (
                <Link
                  key={i}
                  href={`/clients/${p.client_id}`}
                  className="flex items-center gap-3 p-3.5 hover:bg-amber-100/50 transition"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold shrink-0">
                    {daysLeft}d
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {(p.name_zh ?? p.name_en) as string}
                    </p>
                    <p className="text-xs text-amber-800/70 truncate">
                      {(p.product_name ?? p.type) as string} · {formatDate(p.expiry_date as string)}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-amber-500 shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Pending Reminders */}
      <section>
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-2 px-1">🔔 待辦提醒</p>
        {reminders.length === 0 && birthdayClients.length === 0 && expiringPolicies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">🎉</p>
            <p className="text-sm">暫時沒有待辦提醒</p>
          </div>
        ) : reminders.length === 0 ? (
          <p className="text-sm text-gray-400 px-1">暫時沒有其他提醒</p>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {(reminders as Row[]).map(r => {
              const icon =
                r.type === 'birthday' ? '🎂'
                : r.type === 'policy_expiry' ? '📋'
                : r.type === 'follow_up' ? '📞'
                : '🔔';
              const subtitleParts: string[] = [];
              if (r.client_name_zh) subtitleParts.push(r.client_name_zh as string);
              else if (r.client_name_en) subtitleParts.push(r.client_name_en as string);
              if (r.remind_at) subtitleParts.push(formatDate(r.remind_at as string));
              return (
                <ReminderRow
                  key={r.id as string}
                  id={r.id as string}
                  href={r.client_id ? `/clients/${r.client_id}` : '/reminders'}
                  unread={!r.is_sent}
                  icon={icon}
                  title={r.title as string}
                  subtitle={subtitleParts.join(' · ')}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

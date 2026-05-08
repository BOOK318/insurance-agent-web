import React from 'react';
import { getSession } from '../../lib/auth';
import { db } from '../../lib/db';
import Link from 'next/link';
import { Users, FileText, AlertCircle, Bell } from 'lucide-react';

export default async function AgentDashboard() {
  const user = await getSession();
  if (!user) return null;

  const [clients, policies, claims, reminders] = await Promise.all([
    db.query('SELECT COUNT(*) FROM clients WHERE agent_id = $1 AND deleted_at IS NULL', [user.id]),
    db.query("SELECT COUNT(*) FROM policies WHERE agent_id = $1 AND status = 'active' AND deleted_at IS NULL", [user.id]),
    db.query("SELECT COUNT(*) FROM claims WHERE agent_id = $1 AND status = 'pending' AND deleted_at IS NULL", [user.id]),
    db.query('SELECT COUNT(*) FROM reminders WHERE agent_id = $1 AND is_sent = FALSE AND remind_at <= NOW() + INTERVAL \'7 days\'', [user.id]),
  ]);

  // 生日（7日內）
  const { rows: birthdayClients } = await db.query(
    `SELECT name_zh, name_en, dob,
     EXTRACT(DOY FROM dob::date) - EXTRACT(DOY FROM CURRENT_DATE) AS days_left
     FROM clients WHERE agent_id = $1 AND deleted_at IS NULL
     AND TO_CHAR(dob, 'MM-DD') BETWEEN TO_CHAR(NOW(), 'MM-DD')
     AND TO_CHAR(NOW() + INTERVAL '7 days', 'MM-DD')
     ORDER BY days_left`,
    [user.id]
  );

  const stats = [
    { label: '我的客戶', value: clients.rows[0].count, icon: Users, href: '/clients', color: 'bg-blue-50 text-blue-700' },
    { label: '有效保單', value: policies.rows[0].count, icon: FileText, href: '/policies', color: 'bg-green-50 text-green-700' },
    { label: '待處理Claim', value: claims.rows[0].count, icon: AlertCircle, href: '/claims', color: 'bg-orange-50 text-orange-700' },
    { label: '待辦提醒', value: reminders.rows[0].count, icon: Bell, href: '/reminders', color: 'bg-purple-50 text-purple-700' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-0.5">主頁</h1>
      <p className="text-gray-400 text-sm mb-5">你好，{user.name} 👋</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <s.icon size={18} />
            </div>
            <div className="text-2xl font-bold">{s.value as React.ReactNode}</div>
            <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      {birthdayClients.length > 0 && (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 mb-4">
          <p className="font-semibold text-pink-800 mb-2">🎂 即將生日</p>
          {birthdayClients.map((c: Record<string, unknown>, i: number) => (
            <p key={i} className="text-sm text-pink-700">
              {(c.name_zh ?? c.name_en) as string} — {Number(c.days_left) === 0 ? '今日！🎉' : `${c.days_left}日後`}
            </p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p className="font-semibold mb-3">快捷操作</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Link href="/clients/new" className="text-center bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-800 transition">
            ＋ 新增客戶
          </Link>
          <Link href="/ai" className="text-center bg-gray-100 text-gray-800 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
            💬 問AI助手
          </Link>
        </div>
        {/* Quick voice/scan record — full width shortcut */}
        <Link
          href="/clients/new"
          className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-100 text-blue-800 py-2.5 rounded-lg text-sm font-medium hover:from-blue-100 hover:to-indigo-100 transition"
        >
          🎙️ 語音 / 掃描文件 → 自動儲存客戶
        </Link>
      </div>
    </div>
  );
}

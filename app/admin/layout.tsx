import { getSession } from '../../lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const mobileLinks = [
  { href: '/', label: '主頁' },
  { href: '/clients', label: '客戶' },
  { href: '/policies', label: '保單' },
  { href: '/claims', label: 'Claim' },
  { href: '/reminders', label: '提醒' },
  { href: '/ai', label: 'AI' },
  { href: '/head', label: '業績' },
  { href: '/admin/users', label: '帳號' },
  { href: '/admin/knowledge', label: 'AI知識' },
  { href: '/admin/settings', label: '設定' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden md:flex flex-col w-56 bg-slate-900 text-white min-h-screen p-4">
        <div className="text-lg font-bold mb-1">⚙️ 管理員</div>
        <p className="text-slate-400 text-xs mb-6">{user.name}</p>
        <nav className="flex flex-col gap-1">
          <Link href="/admin/users" className="text-sm text-slate-200 hover:bg-slate-800 px-3 py-2.5 rounded-lg">👥 帳號管理</Link>
          <Link href="/admin/knowledge" className="text-sm text-slate-200 hover:bg-slate-800 px-3 py-2.5 rounded-lg">🧠 AI 知識庫</Link>
          <Link href="/admin/settings" className="text-sm text-slate-200 hover:bg-slate-800 px-3 py-2.5 rounded-lg">🔑 系統設定</Link>
          <Link href="/head" className="text-sm text-slate-400 hover:bg-slate-800 px-3 py-2.5 rounded-lg mt-4">→ Team總覽</Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6 max-w-3xl w-full mx-auto">
        {/* Mobile top bar */}
        <div className="md:hidden -mx-4 px-4 pb-3 mb-4 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max text-sm">
            {mobileLinks.map(link => (
              <Link key={link.href} href={link.href} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

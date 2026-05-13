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
  { href: '/head/agents', label: 'Agent' },
];

export default async function HeadLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user || user.role === 'agent') redirect('/');

  const isAdmin = user.role === 'admin';

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 text-white min-h-screen p-4">
        <div className="text-lg font-bold mb-1">👑 Team總覽</div>
        <p className="text-gray-400 text-xs mb-6">{user.name}</p>
        <nav className="flex flex-col gap-1">
          <Link href="/head" className="text-sm text-gray-200 hover:bg-gray-800 px-3 py-2.5 rounded-lg">📊 業績總覽</Link>
          <Link href="/head/agents" className="text-sm text-gray-200 hover:bg-gray-800 px-3 py-2.5 rounded-lg">👥 Agent列表</Link>
          {isAdmin && (
            <Link href="/admin/settings" className="text-sm text-amber-300 hover:bg-gray-800 px-3 py-2.5 rounded-lg mt-2">🔑 系統設定</Link>
          )}
          <Link href="/" className="text-sm text-gray-400 hover:bg-gray-800 px-3 py-2.5 rounded-lg mt-4">← 返回我的頁面</Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6 max-w-4xl w-full mx-auto">
        <div className="md:hidden -mx-4 px-4 pb-3 mb-4 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max text-sm">
            {mobileLinks.map(link => (
              <Link key={link.href} href={link.href} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <Link href="/admin/settings" className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full shadow-sm">
                設定
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/knowledge" className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full shadow-sm">
                AI知識
              </Link>
            )}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

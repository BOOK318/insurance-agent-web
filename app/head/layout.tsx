import { getSession } from '../../lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

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
        {/* Mobile admin shortcut */}
        {isAdmin && (
          <div className="md:hidden mb-4">
            <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full">
              🔑 系統設定
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

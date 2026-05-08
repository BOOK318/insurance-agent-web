'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, FileText, AlertCircle, Bell, MessageSquare, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import type { User } from '../lib/db';

const links = [
  { href: '/', label: '主頁', icon: LayoutDashboard },
  { href: '/clients', label: '客戶', icon: Users },
  { href: '/policies', label: '保單', icon: FileText },
  { href: '/claims', label: 'Claim', icon: AlertCircle },
  { href: '/reminders', label: '提醒', icon: Bell },
  { href: '/ai', label: 'AI助手', icon: MessageSquare },
];

export function AgentNav({ user }: { user: User }) {
  const path = usePathname();
  const router = useRouter();
  const hideMobileNav = path.startsWith('/ai');

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  function isActive(href: string) {
    if (href === '/') return path === href;
    return path === href || path.startsWith(`${href}/`);
  }

  return (
    <>
      {/* 電腦側邊欄 */}
      <aside className="hidden md:flex flex-col w-56 bg-blue-900 text-white min-h-screen p-4">
        <div className="text-lg font-bold mb-1 flex items-center gap-2">🛡️ InsuranceAI</div>
        <p className="text-blue-300 text-xs mb-6">{user.name}</p>
        <nav className="flex flex-col gap-1 flex-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                isActive(href) ? 'bg-blue-700 font-semibold text-white' : 'text-blue-200 hover:bg-blue-800')}>
              <Icon size={18} />{label}
            </Link>
          ))}
          {(user.role === 'head' || user.role === 'admin') && (
            <Link href="/head"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-yellow-300 hover:bg-blue-800 mt-2">
              👑 Team總覽
            </Link>
          )}
        </nav>
        <button onClick={logout}
          className="flex items-center gap-2 text-blue-300 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-800 transition mt-4">
          <LogOut size={16} /> 登出
        </button>
      </aside>

      {/* 手機底部導航 */}
      {!hideMobileNav && (
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 flex md:hidden z-50 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-1.5">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn('flex-1 flex flex-col items-center justify-center text-[10px] leading-none gap-1 min-h-11',
              isActive(href) ? 'text-blue-700 font-semibold' : 'text-gray-500')}>
            <Icon size={18} /><span>{label}</span>
          </Link>
        ))}
        <button
          onClick={logout}
          className="flex-1 flex flex-col items-center justify-center text-[10px] leading-none gap-1 min-h-11 text-gray-500"
        >
          <LogOut size={18} /><span>登出</span>
        </button>
      </nav>
      )}
    </>
  );
}

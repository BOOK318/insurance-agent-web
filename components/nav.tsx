'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, FileText, AlertCircle, Bell, MessageSquare, LayoutDashboard } from 'lucide-react';
import { cn } from '../lib/utils';

const links = [
  { href: '/', label: '主頁', icon: LayoutDashboard },
  { href: '/clients', label: '客戶', icon: Users },
  { href: '/policies', label: '保單', icon: FileText },
  { href: '/claims', label: 'Claim', icon: AlertCircle },
  { href: '/reminders', label: '提醒', icon: Bell },
  { href: '/ai', label: 'AI助手', icon: MessageSquare },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-50">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href}
          className={cn('flex-1 flex flex-col items-center py-2 text-xs gap-0.5',
            path === href ? 'text-blue-700 font-semibold' : 'text-gray-500')}>
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex flex-col w-56 bg-blue-900 text-white min-h-screen p-4">
      <div className="text-xl font-bold mb-8 flex items-center gap-2">
        🛡️ Inexadesk.AI
      </div>
      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
              path === href ? 'bg-blue-700 font-semibold' : 'hover:bg-blue-800 text-blue-200')}>
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

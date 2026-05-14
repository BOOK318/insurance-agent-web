'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

export function MarkAllReadButton({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy || !hasUnread) return;
    setBusy(true);
    try {
      await fetch('/api/reminders/mark-all-read', { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !hasUnread}
      className="text-xs text-blue-700 font-medium disabled:text-gray-300"
    >
      {busy ? '處理中…' : '全部標記為已讀'}
    </button>
  );
}

/**
 * Gmail-style: clicking a row navigates AND marks it read in one gesture.
 * The PATCH fires in parallel; we don't block navigation on its response so
 * the perceived UX stays snappy. router.refresh() reconciles the dot state.
 */
export function ReminderRow({
  id,
  href,
  unread,
  icon,
  title,
  subtitle,
}: {
  id: string;
  href: string;
  unread: boolean;
  icon: string;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let cmd/ctrl/middle-click open in a new tab without our side effects.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (unread) {
      void fetch(`/api/reminders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).then(() => router.refresh()).catch(() => {});
    }
    router.push(href);
  }

  return (
    <a
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition"
    >
      {unread ? (
        <span aria-label="未讀" className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
      ) : (
        <span className="w-2 h-2 shrink-0" />
      )}
      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-base shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
          {title}
        </p>
        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
      </div>
      <ChevronRight size={14} className="text-gray-300 shrink-0" />
    </a>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function DashboardSearch() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} role="search" className="mb-5">
      <label htmlFor="dashboard-search" className="sr-only">主頁快速搜尋</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id="dashboard-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜尋客戶、電話、保單、Claim..."
          autoComplete="off"
          className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-20 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
        >
          搜尋
        </button>
      </div>
    </form>
  );
}

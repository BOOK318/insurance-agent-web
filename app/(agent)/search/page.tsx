import { SearchClient } from './search-client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/"
          aria-label="返回主頁"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold mb-0.5">搜尋</h1>
          <p className="text-gray-500 text-sm">客戶、保單、Claim 一齊搜</p>
        </div>
      </div>
      <SearchClient initialQuery={q} />
    </div>
  );
}

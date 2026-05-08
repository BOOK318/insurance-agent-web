import { SearchClient } from './search-client';

export const dynamic = 'force-dynamic';

export default function SearchPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">搜尋</h1>
      <p className="text-gray-500 text-sm mb-4">客戶、保單、Claim 一齊搜</p>
      <SearchClient />
    </div>
  );
}

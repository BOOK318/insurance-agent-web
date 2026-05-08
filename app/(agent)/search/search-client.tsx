'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search as SearchIcon, Users, FileText, Stethoscope, X } from 'lucide-react';

type Hit = {
  kind: 'client' | 'policy' | 'claim';
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const KIND_META: Record<Hit['kind'], { label: string; icon: typeof Users; tone: string }> = {
  client: { label: '客戶', icon: Users,       tone: 'bg-blue-50 text-blue-700' },
  policy: { label: '保單', icon: FileText,    tone: 'bg-emerald-50 text-emerald-700' },
  claim:  { label: 'Claim', icon: Stethoscope, tone: 'bg-amber-50 text-amber-800' },
};

export function SearchClient() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      const res = await fetch('/api/search?q=' + encodeURIComponent(q));
      const data = await res.json().catch(() => ({ hits: [] }));
      setHits(data.hits ?? []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  const grouped = {
    client: hits.filter(h => h.kind === 'client'),
    policy: hits.filter(h => h.kind === 'policy'),
    claim:  hits.filter(h => h.kind === 'claim'),
  };

  return (
    <div>
      <div className="relative mb-4">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="搜尋姓名、電話、保單號碼、Claim 號碼…"
          className="w-full bg-white border border-gray-200 rounded-2xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="清除"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!q.trim() ? (
        <p className="text-sm text-gray-400 text-center py-12">輸入文字開始搜尋</p>
      ) : loading ? (
        <p className="text-sm text-gray-400 text-center py-12">搜尋中…</p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">冇結果</p>
      ) : (
        <div className="space-y-4">
          {(['client', 'policy', 'claim'] as const).map(kind => {
            const list = grouped[kind];
            if (!list.length) return null;
            const Meta = KIND_META[kind];
            const Icon = Meta.icon;
            return (
              <section key={kind}>
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-1.5 px-1">
                  {Meta.label} · {list.length}
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
                  {list.map(h => (
                    <Link key={h.kind + h.id} href={h.href} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${Meta.tone}`}>
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{h.title}</p>
                        {h.subtitle && <p className="text-xs text-gray-500 truncate">{h.subtitle}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

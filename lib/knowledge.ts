import { db } from './db';

type KnowledgeRow = {
  company: string;
  category: string;
  product_name: string | null;
  title: string;
  content: string;
  source_url: string | null;
};

function scoreKnowledge(row: KnowledgeRow, query: string) {
  const q = query.toLowerCase();
  const product = (row.product_name ?? '').toLowerCase();
  const title = row.title.toLowerCase();
  const haystack = [
    row.company,
    row.category,
    row.product_name,
    row.title,
    row.content,
  ].filter(Boolean).join(' ').toLowerCase();

  let score = 0;
  for (const term of ['boc', '中銀', '中银', '中銀人壽', 'boc life']) {
    if (q.includes(term)) score += haystack.includes(term) ? 4 : 1;
  }
  for (const term of ['claim', '索償', '理賠', '賠償', '醫療', '危疾', 'vhis', '自願醫保', '核保', '聯絡', 'hotline']) {
    if (q.includes(term) && haystack.includes(term)) score += 3;
  }
  for (const term of ['推廣活動', '產品資訊', '常用表格', '培訓資訊', '業務公告', '代理招聘', '銷售品質', '強積金', '業務伙伴', '業務夥伴', '一脈互動', '其他資訊']) {
    if (!q.includes(term)) continue;
    if (row.title.toLowerCase().includes(term)) score += 8;
    else if (haystack.includes(term)) score += 4;
  }
  for (const term of ['表格', '課程', '培訓', '佣金', '招聘', '通告', '活動', '文件']) {
    if (!q.includes(term)) continue;
    if (row.title.toLowerCase().includes(term)) score += 3;
    else if (haystack.includes(term)) score += 2;
  }
  for (const term of ['break even', 'breakeven', '回本', '收支平衡', '供款', '保費', '現金價值', '身故', 'death benefit', 'cash value']) {
    if (q.includes(term.toLowerCase()) && haystack.includes(term.toLowerCase())) score += 4;
  }

  const tokens = q
    .split(/[^\p{L}\p{N}]+/u)
    .map(term => term.trim())
    .filter(term => term.length >= 2 && !['boc', 'life', 'plan', 'the', 'and'].includes(term));

  for (const token of tokens) {
    if (product.includes(token)) score += 12;
    if (title.includes(token)) score += 8;
    if (haystack.includes(token)) score += 3;
  }

  return score;
}

export async function getRelevantKnowledgeContext(query: string) {
  try {
    const { rows } = await db.query<KnowledgeRow>(
      `SELECT company, category, product_name, title, content, source_url
       FROM company_knowledge
       WHERE is_active = TRUE
       ORDER BY company, category, product_name NULLS LAST, title`
    );

    if (rows.length === 0) return null;

    const ranked = rows
      .map(row => ({ row, score: scoreKnowledge(row, query) }))
      .filter(item => item.score > 0 || rows.length <= 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ row }) => {
        const product = row.product_name ? ` / ${row.product_name}` : '';
        const source = row.source_url ? ` 來源：${row.source_url}` : '';
        return `- ${row.company} / ${row.category}${product}｜${row.title}：${row.content}${source}`;
      });

    if (ranked.length === 0) return null;
    return ranked.join('\n');
  } catch (err) {
    console.error('[knowledge]', err);
    return null;
  }
}

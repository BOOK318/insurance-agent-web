exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE company_knowledge
      DROP CONSTRAINT IF EXISTS company_knowledge_category_check;

    ALTER TABLE company_knowledge
      ADD CONSTRAINT company_knowledge_category_check
      CHECK (category IN ('product','underwriting','application','claims','contact','process','sales','other'));

    INSERT INTO company_knowledge
      (company, category, product_name, title, content, source_url, is_active, updated_at)
    VALUES
      (
        'BOC Life',
        'sales',
        NULL,
        '異議處理：客戶話其他公司回報更好',
        '當客戶話其他公司回報較好，可以先認同客戶重視回報，再轉向穩健性、公信力同長期實現能力。建議話術：我明白你會比較回報，呢個係正常。但保險唔只睇演示數字，亦要睇公司背景、償付能力、公信力同過往實現能力。中銀人壽背靠中銀集團及中國銀行品牌，屬香港主要發鈔銀行相關金融集團，公信力同資源基礎較強。涉及實現率或過往派息數字時，只可引用公司最新核准材料；可表達「過往實現率表現穩定」，但避免講保證或其他公司一定做唔到。最後要拉返客戶需要：如果你重視穩定同長線可靠性，我哋可以一齊睇返中銀方案嘅保證/非保證部分、現金價值同風險位，再同你手上方案逐項比較。',
        'manual://seed/sales-objection-boc-trust',
        TRUE,
        NOW()
      )
    ON CONFLICT (company, category, title)
    DO UPDATE SET
      content = EXCLUDED.content,
      source_url = EXCLUDED.source_url,
      is_active = TRUE,
      updated_at = NOW();
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DELETE FROM company_knowledge
    WHERE source_url = 'manual://seed/sales-objection-boc-trust';

    ALTER TABLE company_knowledge
      DROP CONSTRAINT IF EXISTS company_knowledge_category_check;

    ALTER TABLE company_knowledge
      ADD CONSTRAINT company_knowledge_category_check
      CHECK (category IN ('product','underwriting','application','claims','contact','process','other'));
  `);
};

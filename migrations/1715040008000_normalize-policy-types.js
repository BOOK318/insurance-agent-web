// Normalize older English policy type seed values to the Chinese enum used by the UI/API.

exports.up = pgm => {
  pgm.sql(`
    UPDATE policies
    SET type = CASE type
      WHEN 'medical' THEN '醫療'
      WHEN 'critical_illness' THEN '危疾'
      WHEN 'life' THEN '人壽'
      WHEN 'accident' THEN '意外'
      WHEN 'savings' THEN '儲蓄'
      WHEN 'travel' THEN '其他'
      ELSE type
    END
    WHERE type IN ('medical', 'critical_illness', 'life', 'accident', 'savings', 'travel')
  `);
};

exports.down = pgm => {
  pgm.sql(`
    UPDATE policies
    SET type = CASE type
      WHEN '醫療' THEN 'medical'
      WHEN '危疾' THEN 'critical_illness'
      WHEN '人壽' THEN 'life'
      WHEN '意外' THEN 'accident'
      WHEN '儲蓄' THEN 'savings'
      ELSE type
    END
    WHERE type IN ('醫療', '危疾', '人壽', '意外', '儲蓄')
  `);
};

-- Sample data for local testing
-- Run with: psql -U postgres -h localhost -d insurance -f seed.sql
-- Idempotent: clears prior sample rows by email/agent before re-inserting.

DO $$
DECLARE
  agent_uuid UUID;
  c1 UUID; c2 UUID; c3 UUID; c4 UUID;
BEGIN
  -- Wipe prior sample data (cascades to clients/policies/etc.)
  DELETE FROM users WHERE email IN ('agent@team.local', 'head@team.local');

  -- Sample agent (password: Agent@1234)
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('陳大文', 'agent@team.local',
          '$2a$10$V9ihqlPHeP0TfzFgs2xjVO2ERWMcluibG2vrjZ4tMJ5bIirVnA5vy',
          'agent')
  RETURNING id INTO agent_uuid;

  -- Sample head (password: Head@1234)
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('Vivian Cheng', 'head@team.local',
          '$2a$10$WGkM0MWs72w6qqhp3O3AwutKLMq4AaUYT93LS/84ZkCP/TotwRfvG',
          'head');

  -- Clients (assigned to the sample agent)
  INSERT INTO clients (id, agent_id, name_zh, name_en, dob, gender, phone, email,
                       occupation, annual_income, family_notes, assets_notes)
  VALUES (gen_random_uuid(), agent_uuid, '李小明', 'Siu Ming Lee',
          '1991-05-12', 'F', '+852 9876 5432', 'siuming.lee@example.com',
          '中學教師', 520000,
          '單身，與父母同住，需照顧母親（68歲，糖尿病）。',
          '公屋租戶、儲蓄約 HK$180,000、強積金結餘約 HK$320,000。')
  RETURNING id INTO c2;

  INSERT INTO clients (id, agent_id, name_zh, name_en, dob, gender, phone, email,
                       occupation, annual_income, family_notes, assets_notes)
  VALUES (gen_random_uuid(), agent_uuid, '王美麗', 'Mei Lai Wong',
          '1983-11-30', 'F', '+852 9234 1180', 'meilai.wong@example.com',
          '市場主管', 1100000,
          '已婚，無子女。先生任職律師，家庭年收入約 HK$2.5M。',
          '持有兩個自置物業（出租其一），股票及基金組合約 HK$3M。')
  RETURNING id INTO c3;

  INSERT INTO clients (id, agent_id, name_zh, name_en, dob, gender, phone, email,
                       occupation, annual_income, family_notes, assets_notes)
  VALUES (gen_random_uuid(), agent_uuid, '張偉明', 'Wai Ming Cheung',
          '1996-08-15', 'M', '+852 6088 4421', 'waiming@example.com',
          '工程師', 640000,
          '未婚，與女友同居。父母身體健康。',
          '租屋、儲蓄約 HK$220,000、加密貨幣組合約 HK$80,000。')
  RETURNING id INTO c4;

  INSERT INTO clients (id, agent_id, name_zh, name_en, dob, gender, phone, email,
                       occupation, annual_income, family_notes, assets_notes)
  VALUES (gen_random_uuid(), agent_uuid, '陳家俊', 'Ka Chun Chan',
          '1987-03-22', 'M', '+852 9123 4567', 'kachun.chan@example.com',
          '金融分析師', 850000,
          '已婚，育有兩名子女（8歲、5歲），太太為全職主婦。',
          '自置物業（九龍塘）、定期存款約 HK$300,000、股票組合約 HK$1.2M。')
  RETURNING id INTO c1;

  -- Policies
  INSERT INTO policies (client_id, agent_id, policy_number, company, type, product_name,
                        premium, premium_frequency, sum_assured, start_date, expiry_date, status)
  VALUES
    (c1, agent_uuid, 'BS-2019-08821', '藍天人壽', 'life', '終身人壽保險',
     28800, 'annual', 3000000, '2019-03-15', '2049-03-15', 'active'),
    (c1, agent_uuid, 'HA-2020-11234', '恒安保險', 'critical_illness', '危疾保障',
     12400, 'annual', 1500000, '2020-06-04', NOW() + INTERVAL '25 days', 'active'),
    (c1, agent_uuid, 'BS-2022-44109', '藍天人壽', 'medical', '醫療住院',
     8600, 'annual', NULL, '2022-09-01', '2027-09-01', 'active'),
    (c2, agent_uuid, 'HA-2021-77234', '恒安保險', 'medical', '醫療保障計劃',
     5400, 'annual', NULL, '2021-04-22', '2031-04-22', 'active'),
    (c2, agent_uuid, 'AT-2023-22810', '亞太通保', 'accident', '意外保障',
     1800, 'annual', 500000, '2023-11-30', '2028-11-30', 'active'),
    (c3, agent_uuid, 'BS-2018-66120', '藍天人壽', 'medical', '高端醫療保障',
     32000, 'annual', NULL, '2018-08-19', '2048-08-19', 'active'),
    (c3, agent_uuid, 'GW-2017-91002', '環球互助', 'savings', '儲蓄人壽',
     60000, 'annual', 5000000, '2017-02-10', '2042-02-10', 'active'),
    (c3, agent_uuid, 'AT-2024-71203', '亞太通保', 'travel', '旅遊年保',
     1200, 'annual', NULL, '2024-01-01', NOW() + INTERVAL '15 days', 'active'),
    (c4, agent_uuid, 'HA-2024-50932', '恒安保險', 'life', '定期人壽',
     3200, 'annual', 1000000, '2024-05-08', '2034-05-08', 'active'),
    (c1, agent_uuid, 'BOC-VHIS-2025-001', 'BOC Life 中銀人壽', '醫療', 'SmartViva Flexi VHIS',
     15600, 'annual', NULL, '2025-05-01', '2035-05-01', 'active'),
    (c3, agent_uuid, 'BOC-CI188-2024-002', 'BOC Life 中銀人壽', '危疾', 'Critical Illness 188 Whole Life Insurance Plan',
     42000, 'annual', 3000000, '2024-09-01', '2054-09-01', 'active');

  -- Reminders
  INSERT INTO reminders (agent_id, client_id, type, title, message, remind_at)
  VALUES
    (agent_uuid, c1, 'renewal', '危疾保障即將到期', '陳家俊嘅危疾保障將於 25 日後到期，請聯絡客戶安排續保',
     NOW() + INTERVAL '2 days'),
    (agent_uuid, c2, 'birthday', '李小明生日', '今個月生日，可以送個祝福',
     NOW() + INTERVAL '5 days'),
    (agent_uuid, c3, 'renewal', '旅遊年保續保提醒', '王美麗嘅旅遊年保將於 15 日後到期',
     NOW() + INTERVAL '7 days');

END $$;

INSERT INTO company_knowledge (company, category, product_name, title, content, source_url)
VALUES
  ('BOC Life 中銀人壽', 'product', 'SmartViva Flexi VHIS', '自願醫保靈活計劃重點',
   '官方資料列明此 VHIS Flexi Plan 提供全球保障（美國除外）、終身保證續保、無終身保障限額、可選免賠額，並屬認可自願醫保計劃，可供合資格人士申請稅務扣減。銷售時需提醒客戶細閱正式保單文件、保障表及不保事項。',
   'https://www.boclife.com.hk/en/product/smartviva-flexi-vhis.html'),
  ('BOC Life 中銀人壽', 'product', 'BOC Life Standard VHIS', '標準自願醫保重點',
   '官方產品列表描述標準自願醫保為認可 VHIS 計劃，可享稅務扣減；保證續保至 100 歲、無終身保障限額，並涵蓋投保時未知的已有疾病及先天性疾病（以條款為準）。',
   'https://www.boclife.com.hk/en/product-information.html'),
  ('BOC Life 中銀人壽', 'product', 'Critical Illness 188 Whole Life Insurance Plan', '危疾 188 終身保障重點',
   '官方產品分類頁列明此計劃保障 188 種疾病，總賠償最高可達投保額 550%，並包括多重危疾保障、持續支援保障及保費豁免相關賣點。實際定義及冷靜期須以保單條款為準。',
   'https://www.boclife.com.hk/en/category/medical-critical-illness-protection.html'),
  ('BOC Life 中銀人壽', 'product', 'iProtect 10 Years Insurance Plan', '10 年保障計劃重點',
   '官方產品資料描述此計劃可選單純人壽保障或加入危疾保障，保費 10 年不變，並有保費退回選項（最高 100% 保證保費退回，以條款為準），可透過手機銀行申請。',
   'https://www.boclife.com.hk/en/product-information.html'),
  ('BOC Life 中銀人壽', 'claims', 'Hospital Claim', '住院索償文件清單',
   '官方 claims 頁列出住院索償一般需準備：Hospital Claim Form Part II（由主診醫生/外科醫生填妥、簽署及蓋章）、保單持有人及受保人身份證明、醫療收據及收費明細、出院總結/出院紙、內窺鏡/組織病理/診斷/化驗報告，以及其他保險公司的賠償結算通知（如有）。',
   'https://www.boclife.com.hk/en/claims.html'),
  ('BOC Life 中銀人壽', 'claims', 'Easy Claim', 'Easy Claim 快速索償',
   '官方 Easy Claim 介紹指出，合資格 hospital cash 個案可透過簡化網上聲明處理；香港住院不超過 2 日、診斷屬指定疾病等條件適用，並可能豁免遞交紙本 claim form、醫療報告及醫院收據。條件及指定疾病會變更，必須以官方最新條款為準。',
   'https://boclife.com.hk/en/support/claims/easyclaim.html'),
  ('BOC Life 中銀人壽', 'contact', NULL, '客服及遞交文件方式',
   '官方聯絡頁列出客戶服務熱線 +852 2860 0688；郵寄地址為香港太古城英皇道 1111 號 13 樓。客戶亦可使用客戶服務中心，包括中環中銀大廈及尖沙咀港威大廈服務中心（服務時間以官方頁面為準）。',
   'https://www.boclife.com.hk/en/support/contact-us.html')
ON CONFLICT (company, category, title) DO UPDATE
SET product_name = EXCLUDED.product_name,
    content = EXCLUDED.content,
    source_url = EXCLUDED.source_url,
    is_active = TRUE,
    updated_at = NOW();

SELECT 'Seed complete: ' || (SELECT COUNT(*) FROM users WHERE email LIKE '%@team.local') || ' users, '
                          || (SELECT COUNT(*) FROM clients) || ' clients, '
                          || (SELECT COUNT(*) FROM policies) || ' policies, '
                          || (SELECT COUNT(*) FROM reminders) || ' reminders' AS result;

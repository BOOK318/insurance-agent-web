-- =============================================
-- InsuranceAI — Local PostgreSQL Schema
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 用戶（Agent + Head + Admin）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'head', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 客戶（每個agent自己嘅）
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name_zh TEXT,
  name_en TEXT,
  hkid TEXT,
  hkid_encrypted BYTEA,
  dob DATE,
  gender TEXT CHECK (gender IN ('M','F','Other')),
  nationality TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  occupation TEXT,
  employer TEXT,
  annual_income NUMERIC,
  monthly_expenses NUMERIC,
  mortgage_balance NUMERIC,
  liabilities_notes TEXT,
  dependents_count INTEGER,
  existing_coverage_notes TEXT,
  financial_goals TEXT,
  family_notes TEXT,
  assets_notes TEXT,
  property_notes TEXT,
  preferences TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 保單
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  policy_number TEXT NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL,
  product_name TEXT,
  currency TEXT DEFAULT 'HKD',
  premium NUMERIC,
  premium_frequency TEXT,
  sum_assured NUMERIC,
  death_benefit NUMERIC,
  policyholder_name TEXT,
  insured_name TEXT,
  payment_period TEXT,
  breakeven_year NUMERIC,
  breakeven_date DATE,
  maturity_date DATE,
  scenario_20y_pessimistic NUMERIC,
  scenario_20y_optimistic NUMERIC,
  cash_value_notes TEXT,
  start_date DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'active',
  beneficiaries TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claims
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  claim_number TEXT,
  claim_type TEXT NOT NULL,
  incident_date DATE,
  submitted_date DATE,
  amount_claimed NUMERIC,
  amount_approved NUMERIC,
  status TEXT DEFAULT 'pending',
  current_step TEXT,
  documents_required TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 提醒
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 系統設定（admin 可改 API key 等）
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 公司知識庫（產品、核保/投保流程、claim、聯絡方式）
CREATE TABLE company_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('product','underwriting','application','claims','contact','process','other')),
  product_name TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company, category, title)
);

-- 對話歷史（AI chat）
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 審計日誌
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文件附件
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT documents_at_least_one_parent CHECK (
    client_id IS NOT NULL OR policy_id IS NOT NULL OR claim_id IS NOT NULL
  )
);

-- Web Push 訂閱
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

-- Durable login throttling (key is sha256(ip + email), not plaintext PII)
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  first_failure_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_clients_agent ON clients(agent_id);
CREATE INDEX idx_clients_agent_active ON clients(agent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_dob ON clients(dob);
CREATE INDEX idx_policies_agent ON policies(agent_id);
CREATE INDEX idx_policies_agent_active ON policies(agent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_policies_expiry ON policies(expiry_date);
CREATE INDEX idx_claims_agent ON claims(agent_id);
CREATE INDEX idx_claims_agent_active ON claims(agent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_agent ON reminders(agent_id, remind_at, is_sent);
CREATE INDEX idx_audit_logs_actor_created_at ON audit_logs(actor_user_id, created_at);
CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at);
CREATE INDEX idx_documents_agent_active ON documents(agent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_client_active ON documents(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_policy_active ON documents(policy_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_claim_active ON documents(claim_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_login_attempts_locked ON login_attempts(locked_until);
CREATE INDEX idx_login_attempts_first_failure ON login_attempts(first_failure_at);

-- 預設Admin帳號（密碼: Admin@1234，第一次login後要改）
-- 密碼hash係用bcryptjs生成（cost=10）
INSERT INTO users (name, email, password_hash, role) VALUES
('Admin', 'admin@team.local', '$2a$10$F7m6Ov.djBa7iSfCxUEytOs4kSkWE/823qrg9d3kDMLRQ4TLK8LXG', 'admin');

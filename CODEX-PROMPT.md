# New Project: Hong Kong Insurance Comparison Platform (Customer-Facing)

This is a **brand new standalone project** — a public-facing insurance comparison website for Hong Kong consumers. It is NOT an extension of the existing agent CRM.

## What to build

A Next.js web app where Hong Kong consumers can compare insurance plans across all major insurers with full transparency. Think "10Life but we show the math."

**Tech stack**: Next.js 15 (App Router), React 18, Tailwind CSS, PostgreSQL, Claude API (Anthropic SDK)
**Language**: TypeScript
**Target**: Mobile-first (85%+ HK traffic is mobile), bilingual 中文/English

## Core features (in build order)

### 1. Savings Plan Comparison (`/compare/savings`)
- Side-by-side comparison of 儲蓄保 plans from different insurers
- **Adjustable-weight ranking**: 4 sliders (early surrender loss, guaranteed return, projected return, long-term growth) — user drags sliders, ranking re-sorts instantly. Show the formula, not a black-box star rating.
- **Hidden Fee X-Ray section**:
  - Year-by-year surrender value table (selectable years)
  - Early surrender loss bars (red, showing "第3年退保蝕90%")
  - Guaranteed vs non-guaranteed stacked bar (green vs yellow)
  - Total fees over 20 years in HK$ (not %)
  - "If you cancel in year 3, you lose $X" — big red number
  - Guaranteed IRR vs projected IRR side-by-side
  - Interactive line chart: surrender value over time with draggable year marker
- Filter by: currency (HKD/USD), payment term (5Y/10Y/lump sum), age group

### 2. VHIS Medical Comparison (`/compare/medical`)
- Compare 自願醫保 (VHIS) plans across insurers
- Key fields: annual premium by age band, lifetime limit, annual limit, deductible (墊底費), room class, outpatient coverage, guaranteed renewal age, overseas coverage, day surgery
- X-Ray: total premium paid over 20 years vs typical claim amounts by age
- VHIS tax deduction calculator (up to HKD $8,000/year)
- Family bundle view (parent + spouse + children)

### 3. Critical Illness Comparison (`/compare/ci`)
- Number of conditions covered, early/mid/late stage payout %, multi-claim support, children add-on
- Premium comparison by age/gender/smoker status

### 4. AI Advisor Chat (`/advisor`)
- Claude-powered conversational assistant in 廣東話
- User describes their situation: "我35歲，月入5萬，有老婆同一個BB，budget $3000/月"
- AI analyzes needs, presents relevant plan categories, shows data comparisons
- **CRITICAL**: AI must NEVER recommend or suggest buying any specific plan. Only analyze and present data.
- Every response must end with: "以上資料僅供參考，不構成任何投保建議。"
- All AI responses must be logged for audit trail

### 5. Existing Policy Review (`/review`)
- User uploads policy PDF → Claude extracts key data (insurer, product, premium, coverage, surrender values)
- Shows: "Your current coverage summary" + "Potential gaps" (e.g., no CI cover, medical cap too low)
- Compare existing policy against current market alternatives
- **NEVER say "you should switch"** — only show data side-by-side

### 6. Claim Experience Database (`/claims`)
- Users submit anonymized claim experiences (insurer, claim type, days to payout, approved/rejected, notes)
- Moderated before publishing
- Aggregate stats: average payout time per insurer, rejection rate
- Combined with IA complaint data (public from ia.org.hk)

## Data architecture

### Plan data schema (PostgreSQL)

```sql
CREATE TABLE insurers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  logo_url TEXT,
  website TEXT,
  ia_complaint_rate NUMERIC,
  ia_complaint_year INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id UUID REFERENCES insurers(id),
  category TEXT NOT NULL CHECK (category IN ('savings','medical','critical-illness','life','annuity')),
  product_name_en TEXT NOT NULL,
  product_name_zh TEXT NOT NULL,
  currency TEXT DEFAULT 'HKD',
  payment_term_years INTEGER,
  policy_term TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  source_pdf_url TEXT,
  data_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE plan_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plans(id),
  profile_age INTEGER NOT NULL,
  profile_gender TEXT NOT NULL CHECK (profile_gender IN ('M','F')),
  profile_smoker BOOLEAN DEFAULT FALSE,
  monthly_premium NUMERIC,
  annual_premium NUMERIC,
  total_premium_paid NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE surrender_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES plan_quotes(id),
  policy_year INTEGER NOT NULL,
  total_paid NUMERIC NOT NULL,
  guaranteed_value NUMERIC NOT NULL,
  non_guaranteed_value NUMERIC,
  total_surrender_value NUMERIC NOT NULL
);

CREATE TABLE medical_plan_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plans(id),
  lifetime_limit NUMERIC,
  annual_limit NUMERIC,
  deductible NUMERIC,
  room_class TEXT,
  outpatient_coverage BOOLEAN DEFAULT FALSE,
  guaranteed_renewal_age INTEGER,
  overseas_coverage BOOLEAN DEFAULT FALSE,
  day_surgery BOOLEAN DEFAULT TRUE
);

CREATE TABLE claim_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id UUID REFERENCES insurers(id),
  claim_type TEXT NOT NULL,
  days_to_payout INTEGER,
  amount_claimed NUMERIC,
  amount_approved NUMERIC,
  status TEXT CHECK (status IN ('approved','rejected','partial','pending')),
  user_notes TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Seed data available

We have 3 complete savings plan illustrations (30M non-smoker, USD $1,300/month, 5Y payment) with full surrender value tables extracted. JSON files are in the `knowledge-base/plans/savings/` folder of the existing repo — copy the data structure from there.

| Plan | Company | Year 5 Loss | 20Y Projected | 30Y Projected |
|------|---------|-------------|---------------|---------------|
| Swiss Prime (瑞盈) | Zurich | 85% | $210,411 | $381,988 |
| Max Focus II (盈聚天下II) | FWD | 45% | $206,833 | $381,076 |
| My Wealth Beyond (匠心飛越) | CTF Life | 74% | $207,072 | $422,843 |

Key finding: **none of the 3 plans guarantee breakeven within 30 years**. All depend 60-70% on non-guaranteed bonuses.

## Business model

- **Free for consumers** — no login required for comparison and X-Ray
- **Revenue**: advertising from insurance agents/brokers (clearly marked "推廣 · Sponsored") + lead-gen commission
- **NOT a licensed broker** initially — cannot recommend, cannot arrange contracts
- Advertising slots must be **visually and structurally separated** from rankings. Rankings are formula-driven and never influenced by ad spend.

## Competitive positioning

**Tagline: 「保險公司唔會話你知嘅嘢，我哋話你知。」**

vs 10Life: they say "trust our expert ratings" → we say "trust the math, adjust it yourself"
vs MoneyHero: they do promo-driven lead-gen → we do data-driven transparency
vs Bowtie: they only sell their own products → we compare everyone neutrally

## IA regulatory constraints (MUST follow)

- **NEVER** use: 推薦, 最佳, 應該買, best buy, recommended, suggest — these constitute "inviting or inducing" under Insurance Ordinance and require IA broker license
- **USE instead**: 排名工具, 資料比較, 數據分析, 僅供參考
- **Every page** must include: "以上資料僅供參考，不構成任何投保建議。本平台不安排任何保險合約。"
- **AI chat** must never say "you should buy X" — only analyze, compare, present data
- **Ads** must be marked "推廣 · Sponsored" — never inside ranking tables
- Reference: Insurance Ordinance Cap 41, Mayer Brown article on "regulated activity" definition

## Critical weaknesses to address (be honest about these)

1. **Data is the bottleneck, not code.** Insurance illustrations are per-profile, not public datasets. Without 20-30+ plans the site looks empty. Plan for manual data entry pipeline + PDF extraction via Claude.
2. **Same conflict of interest as 10Life.** Ad revenue from agents = you profit when users engage with insurance. "Open formula" helps but doesn't eliminate the tension. Be louder about disclosures than competitors.
3. **IA can reinterpret the rules.** The line between "information" and "inducement" is grey. If AI output patterns consistently favor certain products, IA could investigate. Log everything, get legal review early.
4. **Can't beat 10Life on breadth.** They have 50+ staff, 1500+ plans, years of SEO. Only viable strategy: own one niche deeply (savings plan fee transparency + policy review) and build a data moat via crowdsourced claim experiences.
5. **AI advisor is a liability.** Users making financial decisions based on AI output could complain to IA. Disclaimers help but aren't bulletproof. Every AI response must be logged and auditable.
6. **HK market is small.** ~1-2M addressable adults. Realistic MAU ceiling: 50-100K after 1-2 years. Unit economics must work at that scale.
7. **Mobile-first is mandatory.** 85%+ HK web traffic is mobile. Every component must work at 375px width. Comparison tables must collapse to card layout on mobile — horizontal scroll tables will kill conversion.

## Design principles

- Mobile-first, always
- 廣東話 tone of voice (casual, direct, like talking to a friend)
- Show numbers, not opinions
- Red = loss/danger, Green = gain/safe, Yellow = non-guaranteed/caution
- Every ranking has visible formula + "排名由用戶自訂權重產生" disclaimer
- No login wall — all comparison data is freely accessible
- Ads clearly separated, never in ranking tables

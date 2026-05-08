'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

export interface ClientFormFields {
  name_zh: string;
  name_en: string;
  phone: string;
  email: string;
  occupation: string;
  annual_income: string;
  monthly_expenses: string;
  mortgage_balance: string;
  liabilities_notes: string;
  dependents_count: string;
  existing_coverage_notes: string;
  financial_goals: string;
  dob: string;
  gender: string;
  nationality: string;
  family_notes: string;
  assets_notes: string;
  property_notes: string;
  preferences: string;
  notes: string;
}

export function EditClientForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: ClientFormFields;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ClientFormFields>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: keyof ClientFormFields, v: string) {
    setFields(f => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!fields.name_zh && !fields.name_en) {
      setError('請輸入客戶姓名');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          annual_income: fields.annual_income ? Number(fields.annual_income) : null,
          monthly_expenses: fields.monthly_expenses ? Number(fields.monthly_expenses) : null,
          mortgage_balance: fields.mortgage_balance ? Number(fields.mortgage_balance) : null,
          dependents_count: fields.dependents_count ? Number(fields.dependents_count) : null,
        }),
      });
      if (!res.ok) throw new Error();
      router.push(`/clients/${clientId}`);
      router.refresh();
    } catch {
      setError('儲存失敗，請重試');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Link
          href={`/clients/${clientId}`}
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">編輯客戶</h1>
      </div>

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-900">客戶資料</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="中文姓名" value={fields.name_zh} onChange={v => set('name_zh', v)} placeholder="陳大文" />
          <Field label="英文姓名" value={fields.name_en} onChange={v => set('name_en', v)} placeholder="Tai Man Chan" />
          <Field label="電話" value={fields.phone} onChange={v => set('phone', v)} type="tel" placeholder="+852 9123 4567" />
          <Field label="電郵" value={fields.email} onChange={v => set('email', v)} type="email" placeholder="abc@email.com" />
          <Field label="職業" value={fields.occupation} onChange={v => set('occupation', v)} placeholder="金融分析師" />
          <Field label="年薪 (HKD)" value={fields.annual_income} onChange={v => set('annual_income', v)} type="number" placeholder="850000" />
          <Field label="出生日期" value={fields.dob} onChange={v => set('dob', v)} type="date" />
          <Field label="國籍" value={fields.nationality} onChange={v => set('nationality', v)} placeholder="香港 / 中國 / 加拿大" />
          <div>
            <label className="text-xs text-gray-400 block mb-1">性別</label>
            <select
              value={fields.gender}
              onChange={e => set('gender', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">未選</option>
              <option value="M">男</option>
              <option value="F">女</option>
              <option value="Other">其他</option>
            </select>
          </div>
        </div>

        <TextArea label="家庭狀況" value={fields.family_notes} onChange={v => set('family_notes', v)}
          placeholder="已婚，育有兩名子女…" />
        <TextArea label="喜好" value={fields.preferences} onChange={v => set('preferences', v)}
          placeholder="偏好 WhatsApp 聯絡、鍾意簡短重點、關心子女教育…" />
        <TextArea label="資產備註" value={fields.assets_notes} onChange={v => set('assets_notes', v)}
          placeholder="自置物業，股票組合…" />

        <div className="pt-2 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-900 mb-3">財務分析（可選）</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="每月開支 (HKD)" value={fields.monthly_expenses} onChange={v => set('monthly_expenses', v)} type="number" placeholder="30000" />
            <Field label="按揭 / 物業負債 (HKD)" value={fields.mortgage_balance} onChange={v => set('mortgage_balance', v)} type="number" placeholder="2500000" />
            <Field label="供養人數" value={fields.dependents_count} onChange={v => set('dependents_count', v)} type="number" placeholder="2" />
            <Field label="財務目標" value={fields.financial_goals} onChange={v => set('financial_goals', v)} placeholder="退休 / 子女教育 / 買樓" />
          </div>
          <div className="mt-3 space-y-3">
            <TextArea label="物業資料" value={fields.property_notes} onChange={v => set('property_notes', v)}
              placeholder="自住樓 / 收租樓 / 未供滿…" />
            <TextArea label="現有保障" value={fields.existing_coverage_notes} onChange={v => set('existing_coverage_notes', v)}
              placeholder="公司醫療、個人危疾、人壽保額…" />
            <TextArea label="其他負債" value={fields.liabilities_notes} onChange={v => set('liabilities_notes', v)}
              placeholder="私人貸款、稅貸、信用卡結欠…" />
          </div>
        </div>

        <TextArea label="其他備註" value={fields.notes} onChange={v => set('notes', v)}
          placeholder="附加資訊…" />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-3.5 rounded-2xl font-semibold hover:bg-blue-800 disabled:opacity-60 transition"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        {saving ? '儲存中…' : '儲存更改'}
      </button>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function TextArea({
  label, value, onChange, placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}

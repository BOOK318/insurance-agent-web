'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, Save, X } from 'lucide-react';

export type ClaimClientOption = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
  phone: string | null;
};

export type ClaimPolicyOption = {
  id: string;
  client_id: string;
  policy_number: string;
  company: string;
  type: string;
  product_name: string | null;
};

type ClaimFields = {
  client_id: string;
  policy_id: string;
  claim_number: string;
  claim_type: string;
  incident_date: string;
  submitted_date: string;
  amount_claimed: string;
  amount_approved: string;
  status: string;
  current_step: string;
  documents_required: string;
  notes: string;
};

const CLAIM_TYPES = ['住院', '門診', '危疾', '意外', '人壽', '傷殘', '其他'];
const CLAIM_STAGES = [
  '初步查詢',
  '收集文件',
  '已交保險公司',
  '等候補件',
  '審批中',
  '已批准',
  '安排賠款',
  '已完成',
  '拒賠 / 上訴',
];
const STATUS_OPTIONS = [
  { value: 'pending', label: '待處理' },
  { value: 'approved', label: '批準' },
  { value: 'rejected', label: '拒絕' },
  { value: 'paid', label: '已賠付' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clientName(client: ClaimClientOption) {
  return client.name_zh || client.name_en || '未命名客戶';
}

function policyName(policy: ClaimPolicyOption) {
  const product = policy.product_name || policy.type;
  return `${product} · ${policy.company} · ${policy.policy_number}`;
}

function cleanText(value: string) {
  const text = value.trim();
  return text || null;
}

function cleanNumber(value: string) {
  const text = value.trim();
  return text ? Number(text) : null;
}

function cleanDate(value: string) {
  return value || null;
}

export function NewClaimForm({
  clients,
  policies,
  selectedClientId,
}: {
  clients: ClaimClientOption[];
  policies: ClaimPolicyOption[];
  selectedClientId: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ClaimFields>({
    client_id: selectedClientId,
    policy_id: '',
    claim_number: '',
    claim_type: '',
    incident_date: '',
    submitted_date: today(),
    amount_claimed: '',
    amount_approved: '',
    status: 'pending',
    current_step: '',
    documents_required: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredPolicies = useMemo(
    () => policies.filter(policy => policy.client_id === fields.client_id),
    [fields.client_id, policies]
  );
  const backHref = fields.client_id ? `/clients/${fields.client_id}` : '/claims';

  useEffect(() => {
    if (fields.policy_id && !filteredPolicies.some(policy => policy.id === fields.policy_id)) {
      setFields(prev => ({ ...prev, policy_id: '' }));
    }
  }, [fields.policy_id, filteredPolicies]);

  function set<K extends keyof ClaimFields>(key: K, value: ClaimFields[K]) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fields.client_id || !fields.claim_type) {
      setError('請選擇客戶同 Claim 類型');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: fields.client_id,
          policy_id: fields.policy_id || null,
          claim_number: cleanText(fields.claim_number),
          claim_type: fields.claim_type,
          incident_date: cleanDate(fields.incident_date),
          submitted_date: cleanDate(fields.submitted_date),
          amount_claimed: cleanNumber(fields.amount_claimed),
          amount_approved: cleanNumber(fields.amount_approved),
          status: fields.status,
          current_step: cleanText(fields.current_step),
          documents_required: cleanText(fields.documents_required),
          notes: cleanText(fields.notes),
        }),
      });

      const data = await res.json().catch(() => ({})) as { client_id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || '儲存 Claim 失敗');

      router.push(`/clients/${data.client_id ?? fields.client_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存 Claim 失敗，請再試一次');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Link
          href={backHref}
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">新增 Claim</h1>
          <p className="text-xs text-gray-400 mt-0.5">記低申索進度、金額同所需文件</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-blue-700" />
            <p className="text-sm font-semibold text-gray-900">Claim 資料</p>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">客戶</label>
            <select
              value={fields.client_id}
              onChange={e => set('client_id', e.target.value)}
              disabled={clients.length === 0}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
            >
              <option value="">{clients.length === 0 ? '未有客戶' : '選擇客戶'}</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {clientName(client)}{client.phone ? ` · ${client.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">相關保單</label>
            <select
              value={fields.policy_id}
              onChange={e => set('policy_id', e.target.value)}
              disabled={!fields.client_id || filteredPolicies.length === 0}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
            >
              <option value="">
                {!fields.client_id
                  ? '請先選擇客戶'
                  : filteredPolicies.length === 0
                    ? '未有相關保單'
                    : '不連結保單'}
              </option>
              {filteredPolicies.map(policy => (
                <option key={policy.id} value={policy.id}>{policyName(policy)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Claim 編號" value={fields.claim_number} onChange={v => set('claim_number', v)} />
            <div>
              <label className="text-xs text-gray-400 block mb-1">Claim 類型 *</label>
              <select
                value={fields.claim_type}
                onChange={e => set('claim_type', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">選擇類型</option>
                {CLAIM_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <Field label="事故日期" value={fields.incident_date} onChange={v => set('incident_date', v)} type="date" />
            <Field label="提交日期" value={fields.submitted_date} onChange={v => set('submitted_date', v)} type="date" />
            <Field label="申索金額 (HKD)" value={fields.amount_claimed} onChange={v => set('amount_claimed', v)} type="number" inputMode="decimal" />
            <Field label="批核金額 (HKD)" value={fields.amount_approved} onChange={v => set('amount_approved', v)} type="number" inputMode="decimal" />
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">狀態</label>
              <select
                value={fields.status}
                onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map(status => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">流程階段</label>
            <select
              value={fields.current_step}
              onChange={e => set('current_step', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">未設定</option>
              {CLAIM_STAGES.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </div>
          <TextArea label="所需文件" value={fields.documents_required} onChange={v => set('documents_required', v)} />
          <TextArea label="備註" value={fields.notes} onChange={v => set('notes', v)} />
        </div>

        <button
          type="submit"
          disabled={saving || clients.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-3.5 rounded-2xl font-semibold hover:bg-blue-800 disabled:opacity-60 transition"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? '儲存中...' : '儲存 Claim'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        inputMode={inputMode}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}

'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mic, MicOff, Camera, Loader2, Save, X } from 'lucide-react';
import Link from 'next/link';
import { startWavRecording, type WavRecorder } from '../../../../lib/wav-recorder';

interface ClientFields {
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

const EMPTY: ClientFields = {
  name_zh: '', name_en: '', phone: '', email: '',
  occupation: '', annual_income: '', dob: '', gender: '', nationality: '',
  monthly_expenses: '', mortgage_balance: '', liabilities_notes: '',
  dependents_count: '', existing_coverage_notes: '', financial_goals: '',
  family_notes: '', assets_notes: '', property_notes: '', preferences: '', notes: '',
};

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

export default function NewClientPage() {
  const router = useRouter();
  const [fields, setFields] = useState<ClientFields>(EMPTY);
  const [recording, setRecording] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [quickSaveReady, setQuickSaveReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);

  function set(k: keyof ClientFields, v: string) {
    setFields(f => ({ ...f, [k]: v }));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
    }
  }, []);

  // ── Voice Input ──────────────────────────────────────────
  async function toggleRecording() {
    if (recording) {
      const recorder = recorderRef.current;
      if (recorder) {
        recorderRef.current = null;
        setRecording(false);
        await transcribeStoppedRecording(recorder.stop());
        return;
      }
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const recorder = await startWavRecording();
        recorderRef.current = recorder;
        setRecording(true);
        setVoiceText('本地錄音中…');
        setError('');
        return;
      } catch {
        // If the browser blocks local recording, use Web Speech as a fallback.
      }
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('你的瀏覽器不支援語音輸入，請使用 Chrome 或開啟本地 Whisper');
      return;
    }

    const rec = new SR();
    rec.lang = 'zh-HK';
    rec.continuous = true;
    rec.interimResults = false;
    recognitionRef.current = rec;

    let transcript = '';
    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript + ' ';
      }
      setVoiceText(transcript.trim());
    };
    rec.onerror = () => { setRecording(false); };
    rec.onend = () => {
      setRecording(false);
      if (transcript.trim()) parseText(transcript.trim());
    };

    rec.start();
    setRecording(true);
    setVoiceText('');
    setError('');
  }

  async function transcribeStoppedRecording(audioPromise: Promise<Blob>) {
    setParsing(true);
    setVoiceText('本地 Whisper 轉錄中…');
    try {
      const audio = await audioPromise;
      if (audio.size <= 44) {
        setVoiceText('');
        return;
      }
      const transcript = await transcribeAudio(audio);
      setVoiceText(transcript);
      if (transcript.trim()) await parseText(transcript.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : '本地 Whisper 轉錄失敗');
    } finally {
      setParsing(false);
    }
  }

  // ── Document Scan ────────────────────────────────────────
  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError('');

    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
      await parseImage(base64, mediaType);
    } catch {
      setError('文件讀取失敗，請重試');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function parseText(text: string) {
    setParsing(true);
    setError('');
    try {
      const res = await fetch('/api/parse-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as Partial<ClientFields> & { error?: string; ollamaDown?: boolean };
      if (data.ollamaDown) {
        setError('⚠️ Ollama 未啟動 — 請在 Mac mini 執行：ollama serve');
      } else if (data.error) {
        setError(`解析失敗：${data.error}`);
      } else {
        applyParsed(data);
        showToast('✅ AI 已自動填入資料');
      }
    } catch {
      setError('AI 解析失敗，請手動填寫');
    } finally {
      setParsing(false);
    }
  }

  async function parseImage(base64: string, mediaType: string) {
    const res = await fetch('/api/parse-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType }),
    });
    const data = await res.json() as Partial<ClientFields>;
    applyParsed(data);
    showToast('✅ 文件掃描完成');
  }

  function applyParsed(data: Partial<ClientFields>) {
    setFields(prev => ({
      ...prev,
      name_zh: data.name_zh ?? prev.name_zh,
      name_en: data.name_en ?? prev.name_en,
      phone: data.phone ?? prev.phone,
      email: data.email ?? prev.email,
      occupation: data.occupation ?? prev.occupation,
      annual_income: data.annual_income ? String(data.annual_income) : prev.annual_income,
      monthly_expenses: data.monthly_expenses ? String(data.monthly_expenses) : prev.monthly_expenses,
      mortgage_balance: data.mortgage_balance ? String(data.mortgage_balance) : prev.mortgage_balance,
      liabilities_notes: data.liabilities_notes ?? prev.liabilities_notes,
      dependents_count: data.dependents_count ? String(data.dependents_count) : prev.dependents_count,
      existing_coverage_notes: data.existing_coverage_notes ?? prev.existing_coverage_notes,
      financial_goals: data.financial_goals ?? prev.financial_goals,
      dob: data.dob ?? prev.dob,
      gender: data.gender ?? prev.gender,
      nationality: data.nationality ?? prev.nationality,
      family_notes: data.family_notes ?? prev.family_notes,
      assets_notes: data.assets_notes ?? prev.assets_notes,
      property_notes: data.property_notes ?? prev.property_notes,
      preferences: data.preferences ?? prev.preferences,
      notes: data.notes ?? prev.notes,
    }));
    // Show quick-save option if name was extracted
    if (data.name_zh || data.name_en) setQuickSaveReady(true);
  }

  // ── Save ─────────────────────────────────────────────────
  async function save() {
    if (!fields.name_zh && !fields.name_en) {
      setError('請輸入客戶姓名');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
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
      const client = await res.json() as { id: string };
      router.push(`/clients/${client.id}`);
    } catch {
      setError('儲存失敗，請重試');
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Link href="/clients"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">新增客戶</h1>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl px-4 py-3">
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* Quick Save Banner */}
      {quickSaveReady && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900">✅ AI 已提取資料</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {fields.name_zh || fields.name_en}
              {fields.phone ? ` · ${fields.phone}` : ''}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setQuickSaveReady(false)}
              className="text-xs text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition"
            >
              核對表格
            </button>
            <button
              onClick={async () => {
                setQuickSaveReady(false);
                await save();
              }}
              disabled={saving}
              className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-700 transition disabled:opacity-60 font-semibold"
            >
              {saving ? '儲存中…' : '直接儲存 →'}
            </button>
          </div>
        </div>
      )}

      {/* AI Input Tools */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 mb-5">
        <p className="text-sm font-semibold text-blue-900 mb-1">✨ AI 快速輸入</p>
        <p className="text-xs text-blue-700 mb-3">語音講出客戶資料，或上傳文件，AI 自動填表</p>

        <div className="flex gap-2">
          {/* Voice */}
          <button
            onClick={toggleRecording}
            disabled={parsing}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition ${
              recording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'
            }`}
          >
            {recording ? <MicOff size={16} /> : <Mic size={16} />}
            {recording ? '停止錄音' : '語音輸入'}
          </button>

          {/* Doc scan */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing || recording}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 transition disabled:opacity-50"
          >
            {parsing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {parsing ? '分析中…' : '掃描文件'}
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleDocUpload}
        />

        {/* Voice transcript preview */}
        {(recording || voiceText) && (
          <div className="mt-3 bg-white rounded-xl px-3 py-2.5 text-sm text-gray-700 border border-blue-100 min-h-[40px]">
            {recording && <span className="text-red-500 text-xs">🔴 錄音中…</span>}
            {voiceText && <p className="mt-1">{voiceText}</p>}
          </div>
        )}
      </div>

      {/* Form */}
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

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-3.5 rounded-2xl font-semibold hover:bg-blue-800 disabled:opacity-60 transition"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        {saving ? '儲存中…' : '儲存客戶'}
      </button>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function transcribeAudio(audio: Blob) {
  const form = new FormData();
  form.append('audio', audio, 'recording.wav');
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({})) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? '本地 Whisper 轉錄失敗');
  return (data.text ?? '').trim();
}

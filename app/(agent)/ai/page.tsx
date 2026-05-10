'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { Send, Loader2, ArrowLeft, Sparkles, Mic, MicOff, Camera, X } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { startWavRecording, type WavRecorder } from '../../../lib/wav-recorder';

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
interface SpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number; [i: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  [i: number]: { transcript: string }; isFinal: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  processedNote?: string;
}

const SUGGESTIONS = [
  '分析呢個客戶嘅保障缺口',
  '幫我 draft WhatsApp 跟進訊息',
  '住院 Claim 要咩文件？',
  '比較三大醫療計劃',
];

const MAX_FILE_TEXT_CHARS = 12000;

function AIChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client');
  const clientNameParam = searchParams.get('name');

  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: '你好！我係你嘅保險AI助手。\n\n我可以幫你：\n• 分析客戶保障缺口\n• 草擬 WhatsApp 跟進訊息\n• 解釋條款 / Claim 流程\n• 計算保費及產品比較\n• 掃描及解讀文件、保單、表格\n\n試吓問我啦，或者上傳文件 👇',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Store full client object — tokenization happens server-side in /api/ai
  const [clientContext, setClientContext] = useState<Record<string, unknown> | null>(null);
  const [clientDisplayName, setClientDisplayName] = useState(clientNameParam);
  const [recording, setRecording] = useState(false);
  const [voicePreview, setVoicePreview] = useState('');
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    preview: string;
  } | null>(null);
  const [pendingDocument, setPendingDocument] = useState<{
    name: string;
    text: string;
    kind: 'pdf' | 'text';
  } | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [fileError, setFileError] = useState('');

  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);

  useEffect(() => {
    fetch('/api/ai')
      .then(r => r.ok ? r.json() : null)
      .then((data: { messages?: Message[] } | null) => {
        if (data?.messages?.length) {
          setMessages(data.messages.map(m => ({
            role: m.role,
            content: m.content,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Load full client row — PII tokenization happens server-side in /api/ai
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then((c: Record<string, unknown>) => {
        setClientContext(c);   // full object, tokenized by server before Claude
        const displayName = (c.name_zh ?? c.name_en) as string;
        setClientDisplayName(displayName);
        setMessages(m => [...m, {
          role: 'assistant',
          content: `已載入 ${displayName} 嘅資料。請問有咩需要我幫手分析？`,
        }]);
      })
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

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
        setVoicePreview('本地錄音中…');
        return;
      } catch {
        // Fall back to Web Speech below if microphone permission / MediaRecorder fails.
      }
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('你的瀏覽器不支援語音輸入，請使用 Chrome 或開啟本地 Whisper');
      return;
    }
    const rec = new SR();
    rec.lang = 'zh-HK';
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;

    let transcript = '';
    rec.onresult = (e: SpeechRecognitionEvent) => {
      transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setVoicePreview(transcript);
    };
    rec.onerror = () => { setRecording(false); setVoicePreview(''); };
    rec.onend = () => {
      setRecording(false);
      if (transcript.trim()) {
        setInput(prev => prev ? prev + ' ' + transcript.trim() : transcript.trim());
        setVoicePreview('');
      }
    };
    rec.start();
    setRecording(true);
    setVoicePreview('');
  }

  async function transcribeStoppedRecording(audioPromise: Promise<Blob>) {
    setVoicePreview('本地 Whisper 轉錄中…');
    try {
      const audio = await audioPromise;
      if (audio.size <= 44) {
        setVoicePreview('');
        return;
      }
      const transcript = await transcribeAudio(audio);
      if (transcript) setInput(prev => prev ? `${prev} ${transcript}` : transcript);
    } catch (err) {
      alert(err instanceof Error ? err.message : '本地 Whisper 轉錄失敗');
    } finally {
      setVoicePreview('');
    }
  }

  // ── Document Scan ────────────────────────────────────────
  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(file: File) {
    setFileError('');
    try {
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file);
        const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        const preview = URL.createObjectURL(file);
        setPendingImage({ base64, mediaType, preview });
        setPendingDocument(null);
        setInput(input || '請分析這份文件，提取重要資料。');
        return;
      }

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const text = await extractPdfText(file);
        setPendingDocument({ name: file.name, text: limitFileText(text), kind: 'pdf' });
        setPendingImage(null);
        setInput(input || '請分析這份文件，提取重要資料。');
        return;
      }

      if (
        file.type.startsWith('text/') ||
        /\.(txt|md|csv|json|log)$/i.test(file.name)
      ) {
        const text = await file.text();
        setPendingDocument({ name: file.name, text: limitFileText(text), kind: 'text' });
        setPendingImage(null);
        setInput(input || '請分析這份文件，提取重要資料。');
        return;
      }

      setFileError('暫時支援圖片、PDF、TXT、CSV、Markdown、JSON。Word / Excel 可以先另存 PDF 或截圖再上傳。');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '讀取文件失敗，請再試一次');
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  }

  // ── Send ─────────────────────────────────────────────────
  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if ((!msg && !pendingImage && !pendingDocument) || loading) return;

    const content = pendingDocument
      ? `${msg || '請分析這份文件。'}\n\n[本機讀取文件：${pendingDocument.name}]\n${pendingDocument.text}`
      : msg || '請分析這份文件。';

    const userMsg: Message = {
      role: 'user',
      content,
      ...(pendingImage ? {
        imageBase64: pendingImage.base64,
        mediaType: pendingImage.mediaType,
      } : {}),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setPendingImage(null);
    setPendingDocument(null);
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          clientContext: clientContext ?? undefined,
        }),
      });
      const data = await res.json() as {
        reply?: string;
        error?: string;
        processedNote?: string;
        action?: string;
        client?: Record<string, unknown>;
        clientLoaded?: string;
      };
      if (!res.ok) {
        setMessages(m => [...m, { role: 'assistant', content: data.error ?? '錯誤' }]);
      } else {
        // If server auto-loaded a client by name, surface it locally too
        if (data.clientLoaded && !clientDisplayName) {
          setClientDisplayName(data.clientLoaded);
        }
        // If a new client was just saved, refresh local context with it
        if (data.action === 'saved_client' && data.client) {
          setClientContext(data.client);
          setClientDisplayName(((data.client.name_zh ?? data.client.name_en) as string) ?? null);
        }
        setMessages(m => [...m, {
          role: 'assistant',
          content: data.reply ?? '',
          processedNote: data.processedNote,
        }]);
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: '唔好意思，出現錯誤，請重試。' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex flex-col h-[calc(100dvh-1.75rem)] md:h-[calc(100vh-3rem)] -m-3.5 md:-m-6"
      onDragOver={e => {
        e.preventDefault();
        setDraggingFile(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDraggingFile(false);
      }}
      onDrop={handleDrop}
    >
      {draggingFile && (
        <div className="absolute inset-0 z-50 bg-blue-900/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl px-5 py-4 text-center shadow-lg border border-blue-100">
            <p className="text-sm font-semibold text-gray-900">放開以上傳文件</p>
            <p className="text-xs text-gray-500 mt-1">支援圖片、PDF、TXT、CSV、Markdown、JSON</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.back()}
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-gray-900">AI助手</p>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-xs text-gray-400 truncate">
            本地 Ollama + Claude（PII 匿名化）
            {clientDisplayName ? ` · 對話中：${clientDisplayName}` : ' · 一般助理'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'user' && m.imageBase64 ? (
              <div className="max-w-[82%] space-y-1.5">
                <div className="rounded-2xl rounded-tr-sm overflow-hidden shadow-sm border border-gray-200">
                  <img
                    src={`data:${m.mediaType};base64,${m.imageBase64}`}
                    alt="上傳文件"
                    className="max-w-full max-h-48 object-contain bg-gray-100 w-full"
                  />
                </div>
                {m.content && m.content !== '請分析這份文件。' && (
                  <div className="bg-blue-700 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
                    {m.content}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[82%] space-y-1">
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                  m.role === 'user'
                    ? 'bg-blue-700 text-white rounded-tr-sm'
                    : 'bg-white text-gray-800 rounded-tl-sm'
                }`}>
                  {m.content}
                </div>
                {m.processedNote && (
                  <p className="text-[10px] text-gray-400 px-1 leading-tight">{m.processedNote}</p>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Quick suggestions */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto no-scrollbar bg-white border-t border-gray-100 shrink-0">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => send(s)}
            disabled={loading}
            className="shrink-0 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-100 transition disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2 shrink-0">
          <div className="relative shrink-0">
            <img src={pendingImage.preview} alt="待發送" className="h-12 w-12 object-cover rounded-xl border border-blue-200" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center"
            >
              <X size={10} />
            </button>
          </div>
          <p className="text-xs text-blue-700 flex-1">圖片已準備，可修改問題後發送 →</p>
        </div>
      )}

      {pendingDocument && (
        <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2 shrink-0">
          <div className="w-12 h-12 rounded-xl bg-white border border-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700 uppercase shrink-0">
            {pendingDocument.kind}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-900 truncate">{pendingDocument.name}</p>
            <p className="text-[11px] text-blue-700">
              已讀取約 {pendingDocument.text.length.toLocaleString()} 字，可修改問題後發送
            </p>
          </div>
          <button
            onClick={() => setPendingDocument(null)}
            className="w-8 h-8 rounded-full bg-white text-gray-500 flex items-center justify-center border border-blue-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {fileError && (
        <div className="px-4 py-2 bg-rose-50 border-t border-rose-100 text-xs text-rose-700 flex items-center justify-between gap-3 shrink-0">
          <span>{fileError}</span>
          <button onClick={() => setFileError('')} className="shrink-0"><X size={12} /></button>
        </div>
      )}

      {/* Voice preview */}
      {(recording || voicePreview) && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 shrink-0">
          <p className="text-xs text-red-600">
            🔴 錄音中{voicePreview ? `：${voicePreview}` : '…'}
          </p>
        </div>
      )}

      {/* Input row */}
      <div className="px-3 pb-3 pt-1.5 bg-white border-t border-gray-100 shrink-0">
        <div className="flex items-end gap-2">
          {/* Voice button */}
          <button
            onClick={toggleRecording}
            disabled={loading}
            title={recording ? '停止錄音' : '語音輸入'}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition ${
              recording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } disabled:opacity-50`}
          >
            {recording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          {/* Scan document */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading || recording}
            title="上傳文件 / 掃描"
            className="w-10 h-10 rounded-2xl bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center shrink-0 transition disabled:opacity-50"
          >
            <Camera size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,text/*,.txt,.md,.csv,.json,.log"
            className="hidden"
            onChange={handleDocUpload}
          />

          {/* Text area */}
          <div className="flex-1 bg-gray-100 rounded-2xl px-3 py-2.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="問 AI 任何嘢…"
              className="w-full bg-transparent outline-none text-sm resize-none"
            />
          </div>

          {/* Send */}
          <button
            onClick={() => send()}
            disabled={loading || (!input.trim() && !pendingImage && !pendingDocument)}
            className="w-10 h-10 rounded-2xl bg-blue-700 text-white flex items-center justify-center hover:bg-blue-800 disabled:opacity-50 transition shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-600" />
      </div>
    }>
      <AIChat />
    </Suspense>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
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

function limitFileText(text: string) {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) throw new Error('文件入面未讀到文字；如果係掃描 PDF，請用截圖/相片上傳。');
  if (cleaned.length <= MAX_FILE_TEXT_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_FILE_TEXT_CHARS)}\n\n[文件較長，已先讀取前 ${MAX_FILE_TEXT_CHARS.toLocaleString()} 字。]`;
}

async function extractPdfText(file: File) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(`第 ${pageNumber} 頁：${text}`);
    if (pages.join('\n\n').length > MAX_FILE_TEXT_CHARS) break;
  }

  return pages.join('\n\n');
}

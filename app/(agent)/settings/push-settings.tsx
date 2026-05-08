'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, Send, Loader2 } from 'lucide-react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(b64: string) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSettings() {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    navigator.serviceWorker.getRegistration('/sw.js').then(reg => {
      reg?.pushManager.getSubscription().then(s => setSubscribed(!!s));
    });
  }, []);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      if (!VAPID_PUBLIC_KEY) throw new Error('VAPID public key 未設定');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMsg({ type: 'err', text: '瀏覽器拒絕通知。請喺 settings 度允許再試。' });
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('伺服器拒絕訂閱');
      setSubscribed(true);
      setMsg({ type: 'ok', text: '已開啟通知' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '開啟失敗' });
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg({ type: 'info', text: '已關閉通知' });
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/push/test', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok
      ? { type: 'ok', text: `已送出測試 (${data.sent} 部裝置)` }
      : { type: 'err', text: data.error ?? '送出失敗' });
  }

  if (!supported) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl p-4">
        你呢個瀏覽器唔支援 Web Push。試吓用最新版 Chrome / Edge / Safari。
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
          subscribed ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {subscribed ? <Bell size={18} /> : <BellOff size={18} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{subscribed ? '通知已開啟' : '通知未開啟'}</p>
          <p className="text-xs text-gray-500">
            {permission === 'denied'
              ? '瀏覽器已拒絕，請去瀏覽器設定再開'
              : subscribed
                ? '保單到期同重要事項會 push 到呢部裝置'
                : '撳「開啟通知」就可以收到提醒'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {!subscribed ? (
          <button
            onClick={enable} disabled={busy || permission === 'denied'}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-60 transition"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            開啟通知
          </button>
        ) : (
          <>
            <button
              onClick={sendTest} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-60 transition"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              送個測試 push
            </button>
            <button
              onClick={disable} disabled={busy}
              className="text-sm text-gray-600 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              關閉
            </button>
          </>
        )}
      </div>

      {msg && (
        <p className={`text-sm ${
          msg.type === 'ok' ? 'text-emerald-600' : msg.type === 'err' ? 'text-rose-600' : 'text-gray-500'
        }`}>{msg.text}</p>
      )}
    </div>
  );
}

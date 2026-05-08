import { getSetting, maskSecret } from '../../../lib/settings';
import { SettingsForm } from './settings-form';
import { BroadcastForm } from './broadcast-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const stored = await getSetting('ANTHROPIC_API_KEY');
  const fromEnv = process.env.ANTHROPIC_API_KEY ?? '';
  const effective = stored ?? (fromEnv && !fromEnv.startsWith('sk-ant-replace') ? fromEnv : '');
  const source = stored ? 'database' : effective ? 'env (.env.local)' : 'not set';

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">系統設定</h1>
      <p className="text-gray-500 text-sm mb-6">設定 API key 同其他系統參數</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-semibold mb-1">Anthropic API Key</h2>
        <p className="text-sm text-gray-500 mb-4">
          AI 助手呼叫 Claude 用嘅 key。喺
          <a href="https://console.anthropic.com/" target="_blank" className="text-blue-600 underline mx-1">console.anthropic.com</a>
          攞。
        </p>

        <div className="flex items-center gap-2 mb-5 text-sm">
          <span className="text-gray-500">目前：</span>
          {effective ? (
            <>
              <code className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">{maskSecret(effective)}</code>
              <span className="text-xs text-gray-400">來源：{source}</span>
            </>
          ) : (
            <span className="text-amber-600 text-xs">⚠️ 未設定 — AI 助手未能運作</span>
          )}
        </div>

        <SettingsForm hasValue={!!effective} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mt-4">
        <h2 className="font-semibold mb-1">📣 系統公告 push</h2>
        <p className="text-sm text-gray-500 mb-4">
          全 team 即時通知（agent / head / admin / 全部）。只會送到開咗通知嘅裝置。
        </p>
        <BroadcastForm />
      </div>
    </div>
  );
}

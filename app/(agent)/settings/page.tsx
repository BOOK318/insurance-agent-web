import { PushSettings } from './push-settings';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">通知設定</h1>
      <p className="text-gray-500 text-sm mb-5">收到保單到期、客戶生日、行政公告嘅 push</p>
      <PushSettings />
    </div>
  );
}

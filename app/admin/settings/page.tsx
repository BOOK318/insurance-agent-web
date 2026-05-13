import { BroadcastForm } from './broadcast-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">系統設定</h1>
      <p className="text-gray-500 text-sm mb-6">管理系統公告同 team 通知</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-semibold mb-1">📣 系統公告 push</h2>
        <p className="text-sm text-gray-500 mb-4">
          全 team 即時通知（agent / head / admin / 全部）。只會送到開咗通知嘅裝置。
        </p>
        <BroadcastForm />
      </div>
    </div>
  );
}

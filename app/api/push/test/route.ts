import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { sendPushToUser } from '../../../../lib/push';

export const runtime = 'nodejs';

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sent = await sendPushToUser(user.id, {
    title: 'Inexadesk.AI 測試通知',
    body: '如果你睇到呢個訊息，push 已經正常運作。',
    url: '/reminders',
    tag: 'test',
  });
  return NextResponse.json({ ok: true, sent });
}

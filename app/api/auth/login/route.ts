import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { setSession } from '../../../../lib/auth';
import { getUserByEmail } from '../../../../lib/db';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json() as { email: string; password: string };

  const user = await getUserByEmail(email);
  if (!user) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });

  await setSession(user);

  // 根據角色決定redirect
  const redirectTo = user.role === 'agent' ? '/' : '/head';
  return NextResponse.json({ role: user.role, redirectTo });
}

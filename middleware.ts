import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './lib/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);

  if (!isLocalHost && forwardedProto === 'http') {
    const publicHost = host.replace(/:\d+$/, '');
    return NextResponse.redirect(
      `https://${publicHost}${req.nextUrl.pathname}${req.nextUrl.search}`,
      308
    );
  }

  // 公開路由
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = req.cookies.get('insurance_token')?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    // Return 401 for API routes instead of redirecting
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Head專屬路由
  if (pathname.startsWith('/head') && user.role === 'agent') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icon).*)'],
};

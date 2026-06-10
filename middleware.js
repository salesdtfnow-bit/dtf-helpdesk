import { NextResponse } from 'next/server';

// Protect the agent area with HTTP Basic Auth.
// Public: /support (customer form), /thanks, /api/* (intake endpoints).
export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/support') ||
    pathname.startsWith('/thanks') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next(); // no password configured yet

  const user = process.env.ADMIN_USER || 'admin';
  const expected = 'Basic ' + btoa(`${user}:${password}`);
  const auth = req.headers.get('authorization');
  if (auth !== expected) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="DTF Helpdesk"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

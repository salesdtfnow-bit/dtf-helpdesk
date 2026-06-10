import { NextResponse } from 'next/server';
import { EMBED_COOKIE, verifyEmbedCookieValue } from './lib/embed';

// Protect the agent area with HTTP Basic Auth.
// Public: /support (customer form), /thanks, /api/* (intake endpoints), /shopify (embed entry).
// Requests carrying a valid Shopify-embed session cookie bypass basic auth
// (the browser cannot show a basic-auth prompt inside the Shopify admin iframe).
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/support') ||
    pathname.startsWith('/thanks') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/shopify') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next(); // no password configured yet

  const embedCookie = req.cookies.get(EMBED_COOKIE)?.value;
  if (embedCookie && (await verifyEmbedCookieValue(embedCookie))) {
    return NextResponse.next();
  }

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

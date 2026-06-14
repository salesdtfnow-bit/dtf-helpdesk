import { NextResponse } from 'next/server';
import { EMBED_COOKIE, verifyEmbedCookieValue } from './lib/embed';
import { STAFF_COOKIE, verifyStaffSession } from './lib/session';

const PUBLIC = ['/login', '/support', '/thanks', '/shopify'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return pass();
  }

  const embed = req.cookies.get(EMBED_COOKIE)?.value;
  const isEmbed = embed ? await verifyEmbedCookieValue(embed) : false;
  const staffCookie = req.cookies.get(STAFF_COOKIE)?.value;
  const staff = staffCookie ? await verifyStaffSession(staffCookie) : null;

  if (!isEmbed && !staff) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin')) {
    const isAdmin = isEmbed || (staff && staff.role === 'admin');
    if (!isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = '/tickets';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return pass();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

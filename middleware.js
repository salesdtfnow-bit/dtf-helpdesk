import { NextResponse } from 'next/server';
import { EMBED_COOKIE, verifyEmbedCookieValue } from './lib/embed';
import { STAFF_COOKIE, verifyStaffSession } from './lib/session';

// Auth gate for the agent area. Public: the customer form, login, intake APIs,
// and the Shopify embed entry. Everything else needs a staff session OR a valid
// Shopify-embed session (the store owner opening the app inside Shopify admin).
// /admin additionally requires admin role (embed = owner = admin).
const PUBLIC = ['/login', '/support', '/thanks', '/shopify'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

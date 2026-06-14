import { NextResponse } from 'next/server';
import { STAFF_COOKIE } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(`${origin}/login`);
  res.cookies.set(STAFF_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

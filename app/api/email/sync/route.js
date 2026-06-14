import { NextResponse } from 'next/server';
import { syncInboundEmail } from '../../../../lib/imap';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  const result = await syncInboundEmail({ force });
  return NextResponse.json(result);
}

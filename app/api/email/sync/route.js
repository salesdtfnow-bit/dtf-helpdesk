import { NextResponse } from 'next/server';
import { syncInboundEmail } from '../../../../lib/imap';

export const dynamic = 'force-dynamic';
// The sync stops itself after ~40s and resumes on the next poll; never let a run hang
// for minutes (that is what caused the 17 Nov 2026 re-import loop).
export const maxDuration = 60;

export async function GET(req) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  const result = await syncInboundEmail({ force });
  return NextResponse.json(result);
}

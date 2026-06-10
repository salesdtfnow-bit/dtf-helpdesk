import { NextResponse } from 'next/server';
import { createTicket } from '../../../lib/tickets';
import { ticketRef } from '../../../lib/db';

// Generic JSON intake. Optionally protect with INTAKE_SECRET:
//   POST /api/tickets  with header  x-intake-secret: <secret>
export async function POST(req) {
  const secret = process.env.INTAKE_SECRET;
  if (secret && req.headers.get('x-intake-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.subject) {
    return NextResponse.json({ error: 'subject required' }, { status: 400 });
  }
  const t = await createTicket({ ...body, channel: body.channel || 'manual' });
  return NextResponse.json({ id: t.id, ref: ticketRef(t.id) }, { status: 201 });
}

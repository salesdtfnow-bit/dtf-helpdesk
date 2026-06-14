import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../../../lib/db';
import { currentUser } from '../../../../../lib/auth';

export const dynamic = 'force-dynamic';

// Serves a stored email attachment to signed-in staff.
export async function GET(req, { params }) {
  const u = await currentUser();
  if (!u) return new NextResponse('unauthorized', { status: 401 });
  await ensureSchema();
  const sql = getSql();
  const id = Number(params.id);
  const [a] = await sql`SELECT filename, content_type, data FROM email_attachments WHERE id = ${id}`;
  if (!a || !a.data) return new NextResponse('not found', { status: 404 });
  const buf = Buffer.isBuffer(a.data) ? a.data : Buffer.from(a.data);
  const name = (a.filename || 'file').replace(/"/g, '');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': a.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}

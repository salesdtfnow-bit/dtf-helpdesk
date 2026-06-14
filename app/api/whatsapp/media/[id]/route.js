import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../../../lib/db';
import { currentUser } from '../../../../../lib/auth';

const GRAPH = `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;
export const dynamic = 'force-dynamic';

// Proxies a WhatsApp media download (the customer's file) to signed-in staff.
export async function GET(req, { params }) {
  const u = await currentUser();
  if (!u) return new NextResponse('unauthorized', { status: 401 });
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return new NextResponse('WhatsApp not configured', { status: 400 });
  await ensureSchema();
  const sql = getSql();
  const id = Number(params.id);
  const [m] = await sql`SELECT media_id, filename FROM wa_messages WHERE id = ${id}`;
  if (!m || !m.media_id) return new NextResponse('not found', { status: 404 });

  const metaRes = await fetch(`${GRAPH}/${m.media_id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) return new NextResponse('media lookup failed', { status: 502 });
  const meta = await metaRes.json();
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) return new NextResponse('download failed', { status: 502 });
  const buf = Buffer.from(await fileRes.arrayBuffer());
  const ct = meta.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream';
  const name = (m.filename || `whatsapp-${id}`).replace(/"/g, '');
  return new NextResponse(buf, {
    headers: { 'Content-Type': ct, 'Content-Disposition': `attachment; filename="${name}"` },
  });
}

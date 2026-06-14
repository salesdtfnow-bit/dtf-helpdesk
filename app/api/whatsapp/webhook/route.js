import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../../lib/db';
import { verifyWhatsAppSignature } from '../../../../lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge || '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

function extractText(m) {
  if (!m) return '';
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || '';
  if (m.type === 'interactive')
    return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[interactive]';
  if (m.type === 'image') return '[image] ' + (m.image?.caption || '');
  if (m.type === 'document') return '[document] ' + (m.document?.filename || '');
  if (m.type === 'audio') return '[audio message]';
  if (m.type === 'video') return '[video] ' + (m.video?.caption || '');
  if (m.type === 'location') return '[location]';
  if (m.type === 'sticker') return '[sticker]';
  return `[${m.type || 'message'}]`;
}

function extractMedia(m) {
  const t = m.type;
  if (t === 'image') return { media_id: m.image?.id || '', media_type: 'image', filename: '' };
  if (t === 'document') return { media_id: m.document?.id || '', media_type: 'document', filename: m.document?.filename || '' };
  if (t === 'audio') return { media_id: m.audio?.id || '', media_type: 'audio', filename: '' };
  if (t === 'video') return { media_id: m.video?.id || '', media_type: 'video', filename: '' };
  if (t === 'sticker') return { media_id: m.sticker?.id || '', media_type: 'sticker', filename: '' };
  return { media_id: '', media_type: '', filename: '' };
}

export async function POST(req) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  if (!verifyWhatsAppSignature(raw, sig)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  await ensureSchema();
  const sql = getSql();

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const nameByWaId = {};
        for (const c of value.contacts || []) nameByWaId[c.wa_id] = c.profile?.name || '';

        for (const m of value.messages || []) {
          const waId = m.from;
          if (!waId) continue;
          const name = nameByWaId[waId] || '';
          const text = extractText(m);
          const media = extractMedia(m);
          const [conv] = await sql`
            INSERT INTO wa_conversations (wa_id, name, last_message_at, last_inbound_at, unread, status)
            VALUES (${waId}, ${name}, now(), now(), 1, 'open')
            ON CONFLICT (wa_id) DO UPDATE SET
              last_message_at = now(),
              last_inbound_at = now(),
              unread = wa_conversations.unread + 1,
              status = 'open',
              name = CASE WHEN wa_conversations.name = '' THEN EXCLUDED.name ELSE wa_conversations.name END
            RETURNING *`;
          await sql`INSERT INTO wa_messages (conversation_id, wa_message_id, direction, body, status, media_id, media_type, filename)
            VALUES (${conv.id}, ${m.id || ''}, 'in', ${text.slice(0, 4096)}, 'received', ${media.media_id}, ${media.media_type}, ${media.filename})`;
        }

        for (const st of value.statuses || []) {
          if (st.id) {
            await sql`UPDATE wa_messages SET status = ${st.status || ''} WHERE wa_message_id = ${st.id}`;
          }
        }
      }
    }
  } catch (e) {
    console.error('WhatsApp webhook error:', e.message);
  }
  return NextResponse.json({ ok: true });
}

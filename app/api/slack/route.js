import { NextResponse } from 'next/server';
import { createTicket } from '../../../lib/tickets';
import { ticketRef } from '../../../lib/db';
import { appUrl } from '../../../lib/slack';

// Slack slash command endpoint, e.g. /newticket Customer jane@x.com order #1234 prints peeling
// Create a slash command in your Slack app pointing at:  POST /api/slack
// Set SLACK_SLASH_TOKEN to the command's verification token (optional but recommended).
export async function POST(req) {
  const form = await req.formData();
  const token = String(form.get('token') || '');
  if (process.env.SLACK_SLASH_TOKEN && token !== process.env.SLACK_SLASH_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const text = String(form.get('text') || '').trim();
  const userName = String(form.get('user_name') || 'Slack user');
  if (!text) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Usage: /newticket <short description of the issue> (include customer email and order # if known)',
    });
  }

  const emailMatch = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(text);
  const orderMatch = /#\s?(\d{3,6})/.exec(text);

  const t = await createTicket({
    subject: text.slice(0, 120),
    description: `Created from Slack by ${userName}:\n\n${text}`,
    channel: 'slack',
    customer_email: emailMatch ? emailMatch[0] : '',
    order_number: orderMatch ? `#${orderMatch[1]}` : '',
  });

  const link = appUrl(`/tickets/${t.id}`);
  return NextResponse.json({
    response_type: 'in_channel',
    text: `:ticket: Ticket *${ticketRef(t.id)}* created${link ? ` — <${link}|open it>` : ''}`,
  });
}

// Outbound customer email via Resend (same account the reprint tracker uses).
export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendCustomerEmail({ to, subject, text }) {
  if (!emailConfigured() || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'DTF Now <support@dtfnow.co.uk>',
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) console.error('Resend send failed:', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

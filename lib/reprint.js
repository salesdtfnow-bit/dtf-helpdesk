// Bridge to the DTF Now Reprint Tracker app (Remix, reprint.dtfnow.co.uk).
// Needs REPRINT_APP_URL + REPRINT_API_KEY (same key set in the tracker).
const base = () => (process.env.REPRINT_APP_URL || '').replace(/\/$/, '');

export function reprintConfigured() {
  return !!(base() && process.env.REPRINT_API_KEY);
}

export function reprintTrackUrl(token) {
  return `${base()}/track/${token}`;
}

export async function createReprint(payload) {
  try {
    const res = await fetch(`${base()}/api/reprints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REPRINT_API_KEY,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.id) {
      console.error('Reprint create failed:', res.status, JSON.stringify(json));
      return null;
    }
    return json;
  } catch (e) {
    console.error('Reprint create failed:', e.message);
    return null;
  }
}

export async function getReprint(id) {
  if (!reprintConfigured() || !id) return null;
  try {
    const res = await fetch(`${base()}/api/reprints/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': process.env.REPRINT_API_KEY },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Reprint status failed:', e.message);
    return null;
  }
}

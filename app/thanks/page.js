import { uploadPageUrl } from '../../lib/uploads';

export const dynamic = 'force-dynamic';

export default function ThanksPage({ searchParams }) {
  const uploadUrl = uploadPageUrl();
  const wantsUpload = searchParams?.upload === '1' && uploadUrl;

  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
      <h1>Thanks &mdash; we&apos;ve got it ✅</h1>
      <p className="muted">
        Your request has been logged with our support team. We&apos;ll reply to your email as soon
        as possible (usually within 1 business day).
      </p>
      {wantsUpload && (
        <>
          <p>Now send us your artwork:</p>
          <p>
            <a
              href={uploadUrl}
              style={{
                display: 'inline-block',
                background: '#0b5fff',
                color: '#fff',
                padding: '11px 20px',
                borderRadius: 8,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Upload my files →
            </a>
          </p>
          <p className="muted">
            You&apos;ll need your order number and the email you ordered with. Files up to
            50&nbsp;MB, several at a time.
          </p>
        </>
      )}
    </div>
  );
}

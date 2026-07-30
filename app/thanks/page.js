import { uploadPageUrl } from '../../lib/uploads';

export default function ThanksPage({ searchParams }) {
  const uploadUrl = searchParams?.upload === '1' ? uploadPageUrl() : '';
  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
      <h1>Thanks — we&apos;ve got it ✅</h1>
      <p className="muted">
        Your request has been logged with our support team. We&apos;ll reply to your email as soon
        as possible (usually within 1 business day).
      </p>
      {uploadUrl ? (
        <>
          <p style={{ marginTop: 24 }}>
            <a
              className="row-link"
              href={uploadUrl}
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              Upload my files →
            </a>
          </p>
          <p className="muted">
            Have your DTFN order number and the email address you ordered with ready. Up to 50 MB
            per file.
          </p>
        </>
      ) : null}
    </div>
  );
}

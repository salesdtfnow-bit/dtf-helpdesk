'use client';

import { useFormStatus } from 'react-dom';

export default function SubmitButton({ children, pendingText, className }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <span className="btn-spinner-wrap">
          <span className="btn-spinner" aria-hidden="true" />
          {pendingText || 'Submitting…'}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

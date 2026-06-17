'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function TicketNav({ prevId, nextId, status }) {
  const router = useRouter();
  const q = status ? `?status=${status}` : '';
  const goPrev = () => {
    if (prevId) router.push(`/tickets/${prevId}${q}`);
  };
  const goNext = () => {
    if (nextId) router.push(`/tickets/${nextId}${q}`);
  };

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const tag = el && el.tagName;
      if (
        (el && el.isContentEditable) ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT'
      ) {
        return; // don't hijack arrow keys while editing a field
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, nextId, status]);

  return (
    <div className="ticket-nav" role="group" aria-label="Ticket navigation">
      <button
        type="button"
        className="secondary"
        onClick={goPrev}
        disabled={!prevId}
        title="Previous ticket (↑)"
        aria-label="Previous ticket"
      >
        ↑
      </button>
      <button
        type="button"
        className="secondary"
        onClick={goNext}
        disabled={!nextId}
        title="Next ticket (↓)"
        aria-label="Next ticket"
      >
        ↓
      </button>
    </div>
  );
}

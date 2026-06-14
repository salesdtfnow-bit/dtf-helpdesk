'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Pulls new mail from IONOS (throttled server-side) then refreshes the view.
export default function EmailSync({ seconds = 20 }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await fetch('/api/email/sync');
      } catch {}
      if (active) router.refresh();
    };
    run();
    const i = setInterval(run, seconds * 1000);
    return () => {
      active = false;
      clearInterval(i);
    };
  }, [router, seconds]);
  return null;
}

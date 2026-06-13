'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Lightweight live updates: re-fetches the server component on an interval.
export default function AutoRefresh({ seconds = 8 }) {
  const router = useRouter();
  useEffect(() => {
    const i = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(i);
  }, [router, seconds]);
  return null;
}

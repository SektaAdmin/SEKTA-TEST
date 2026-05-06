'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body style={{ padding: '2rem', textAlign: 'center', background: '#0e0e0e', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <h2 style={{ color: '#f0ede8', marginBottom: '1rem' }}>Критична помилка</h2>
        <button
          onClick={reset}
          style={{ background: '#c8f060', color: '#1a2800', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
        >Спробувати знову</button>
      </body>
    </html>
  );
}

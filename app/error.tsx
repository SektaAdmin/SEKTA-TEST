'use client';

import { useEffect } from 'react';

export default function Error({
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: 'var(--text)',
      fontFamily: 'var(--font)',
      textAlign: 'center',
      gap: '12px',
    }}>
      <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>Помилка</span>
      <h2 style={{ fontSize: '16px', fontWeight: 500 }}>Щось пішло не так</h2>
      <button
        onClick={reset}
        style={{
          background: 'var(--bg-3)',
          color: 'var(--text)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 14px',
          fontSize: '13px',
          cursor: 'pointer',
          fontFamily: 'var(--font)',
        }}
      >
        Спробувати знову
      </button>
    </div>
  );
}

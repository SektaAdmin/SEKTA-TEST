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
      <body style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Критическая ошибка</h2>
        <button onClick={reset}>Попробовать снова</button>
      </body>
    </html>
  );
}

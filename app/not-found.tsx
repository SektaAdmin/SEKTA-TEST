export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)',
      textAlign: 'center',
      gap: '12px',
    }}>
      <span style={{ fontSize: '13px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>404</span>
      <h2 style={{ fontSize: '16px', fontWeight: 500 }}>Сторінку не знайдено</h2>
      <a href="/" style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>← На головну</a>
    </div>
  )
}

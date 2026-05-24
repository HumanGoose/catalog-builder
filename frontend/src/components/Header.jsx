export function Header({ connected, jobCount }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: '56px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '18px',
            fontFamily: '"Playfair Display", serif',
            fontWeight: 600,
            letterSpacing: '0.01em',
            color: 'var(--text)',
          }}
        >
          Catalog Builder
        </h1>
        <span
          style={{
            fontSize: '10px',
            fontFamily: '"DM Mono", monospace',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
          }}
        >
          Alaiy
        </span>
      </div>

    </header>
  )
}

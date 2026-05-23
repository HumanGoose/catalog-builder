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

      {/* Right side: pipeline status + WS indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {jobCount > 0 && (
          <span
            style={{
              fontSize: '10px', fontFamily: '"DM Mono", monospace',
              color: 'var(--text-faint)', letterSpacing: '0.06em',
            }}
          >
            {jobCount} job{jobCount !== 1 ? 's' : ''}
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
              background: connected ? '#3A8C5A' : '#3A3A3A',
              boxShadow: connected ? '0 0 0 2px rgba(58,140,90,0.2)' : 'none',
              transition: 'background 0.4s, box-shadow 0.4s',
            }}
          />
          <span
            style={{
              fontSize: '10px', fontFamily: '"DM Mono", monospace',
              letterSpacing: '0.08em', color: 'var(--text-faint)',
            }}
          >
            {connected ? 'live' : 'offline'}
          </span>
        </div>
      </div>
    </header>
  )
}

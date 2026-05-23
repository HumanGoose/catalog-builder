import { StatusBadge } from './StatusBadge.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function imgUrl(path) {
  if (!path) return null
  return `${API}/${path.replace(/^storage\//, '')}`
}

const TYPE_COLOR = {
  front:  '#4DA0EF',
  back:   '#3DD6CC',
  detail: '#A882F5',
  spec:   '#FDB347',
}

export function JobCard({ job }) {
  const thumb = imgUrl(job.processed_path ?? job.original_path)
  const shortId = job.id?.slice(0, 8) ?? '—'
  const typeColor = TYPE_COLOR[job.image_type] ?? '#6B6052'

  return (
    <div
      className="job-card rounded-sm overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Image area */}
      <div style={{ position: 'relative', aspectRatio: '4/5', background: '#0C0C0C' }}>
        {thumb ? (
          <img
            src={thumb}
            alt={job.filename}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2A2A2A" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
          </div>
        )}

        {/* Top overlay bar */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: '6px 7px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}
        >
          {job.image_type && (
            <span
              style={{
                fontSize: '9px', fontFamily: '"DM Mono", monospace', fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: typeColor, opacity: 0.9,
              }}
            >
              {job.image_type}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <StatusBadge status={job.status} size="xs" />
        </div>

        {/* Style group badge bottom */}
        {job.style_group && (
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '16px 7px 6px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
            }}
          >
            <span
              style={{
                fontSize: '9px', fontFamily: '"DM Mono", monospace',
                color: 'rgba(226,213,190,0.5)', letterSpacing: '0.05em',
              }}
            >
              {job.style_group}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
        <p
          style={{
            margin: 0, fontSize: '10px', fontFamily: '"DM Mono", monospace',
            color: 'var(--text-muted)', letterSpacing: '0.04em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={job.filename}
        >
          {job.filename ?? shortId}
        </p>
      </div>
    </div>
  )
}

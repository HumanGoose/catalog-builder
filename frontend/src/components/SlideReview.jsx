import { useMemo } from 'react'
import { StatusBadge } from './StatusBadge.jsx'

const API = '/api'

function imgUrl(path) {
  if (!path) return null
  return `${API}/${path.replace(/^storage\//, '')}`
}

function SlideGroup({ groupName, jobs }) {
  const front  = jobs.find(j => j.image_type === 'front')
  const back   = jobs.find(j => j.image_type === 'back')
  const detail = jobs.find(j => j.image_type === 'detail')
  const spec   = jobs.find(j => j.image_type === 'spec')

  const thumb = imgUrl(front?.processed_path ?? front?.original_path)

  const specData = spec?.spec_data ?? {}

  return (
    <div
      style={{
        borderRadius: '4px', overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        marginBottom: '12px',
      }}
    >
      {/* Image strip */}
      <div style={{ display: 'flex', height: '72px', background: '#0C0C0C' }}>
        {[front, back, detail].map((j, i) => {
          const url = imgUrl(j?.processed_path ?? j?.original_path)
          return (
            <div
              key={i}
              style={{ flex: 1, borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '8px', color: 'var(--text-faint)', fontFamily: '"DM Mono", monospace' }}>
                    {['F','B','D'][i]}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <p style={{
            margin: 0, fontSize: '11px', fontFamily: '"DM Mono", monospace',
            color: 'var(--gold)', letterSpacing: '0.04em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%',
          }}>
            {specData.reference_no ?? groupName}
          </p>
          <StatusBadge status="ASSIGNED" size="xs" />
        </div>

        {/* Spec data */}
        {(specData.fabric || specData.gsm) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {specData.fabric && (
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: '"DM Mono", monospace' }}>
                {specData.fabric}
              </span>
            )}
            {specData.gsm && (
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: '"DM Mono", monospace' }}>
                {specData.gsm} gsm
              </span>
            )}
          </div>
        )}

        {/* Images present */}
        <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
          {['front','back','detail','spec'].map(type => {
            const has = jobs.some(j => j.image_type === type)
            return (
              <span
                key={type}
                style={{
                  fontSize: '8px', fontFamily: '"DM Mono", monospace',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '2px 5px', borderRadius: '2px',
                  background: has ? 'rgba(196,150,106,0.1)' : '#111111',
                  color: has ? 'var(--gold)' : 'var(--text-faint)',
                  border: `1px solid ${has ? 'rgba(196,150,106,0.25)' : 'var(--border)'}`,
                }}
              >
                {type[0]}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function SlideReview({ jobs }) {
  const assignedByGroup = useMemo(() => {
    const groups = {}
    Object.values(jobs).forEach(j => {
      if (j.status !== 'ASSIGNED' || !j.style_group) return
      if (!groups[j.style_group]) groups[j.style_group] = []
      groups[j.style_group].push(j)
    })
    return groups
  }, [jobs])

  const groupNames = Object.keys(assignedByGroup)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10,
        }}
      >
        <h2 style={{
          margin: 0, fontSize: '11px', fontFamily: '"DM Mono", monospace',
          letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>
          Catalog
        </h2>
        {groupNames.length > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-faint)', fontFamily: '"DM Mono", monospace' }}>
            {groupNames.length} style{groupNames.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {groupNames.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-faint)', fontFamily: '"Playfair Display", serif', fontStyle: 'italic' }}>
              Awaiting pipeline
            </p>
            <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '0.04em', lineHeight: 1.8 }}>
              Assigned garment groups<br />will appear here.
            </p>
          </div>
        ) : (
          groupNames.map(g => (
            <SlideGroup key={g} groupName={g} jobs={assignedByGroup[g]} />
          ))
        )}

      </div>
    </div>
  )
}

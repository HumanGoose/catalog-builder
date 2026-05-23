import { useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STATUS_COLOR = {
  ASSIGNED: '#16a34a', PROCESSED: '#15803d', SPEC_EXTRACTED: '#15803d',
  GROUPED: '#3b82f6', PROCESSING: '#8b5cf6', EXTRACTING: '#8b5cf6',
  CLASSIFIED: '#22c55e', CLASSIFYING: '#f59e0b',
  UPLOADED: '#6b7280', DUPLICATE: '#4b5563', NEEDS_REVIEW: '#f59e0b', FAILED: '#ef4444',
}

const ROLE_LABEL = { front: 'Front', back: 'Back', detail: 'Detail', spec: 'Spec', garment: 'Garment', duplicate: 'Dup' }
const ROLE_COLOR = { front: '#7c3aed', back: '#2563eb', detail: '#059669', spec: '#d97706', garment: '#555', duplicate: '#4b5563' }

function imgUrl(path) {
  if (!path) return null
  return `${API}/${path.replace(/^storage\//, '')}`
}

export function GroupModal({ group, liveJobs, onClose, onImageClick }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const jobs = group.jobs.map(j => liveJobs[j.id] || j)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#141414',
          border: '1.5px solid #2a2a2a',
          borderRadius: 12,
          padding: 24,
          width: 560,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb' }}>
              {group.style_name || 'Unnamed Group'}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
              {group.style_number && (
                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>
                  {group.style_number}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#555' }}>
                {jobs.length} image{jobs.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#444', fontStyle: 'italic', flexShrink: 0 }}>
          Click an image to view or change its role
        </div>

        {/* Image grid */}
        <div style={{
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 10,
        }}>
          {jobs.map(job => {
            const src = imgUrl(job.processed_path ?? job.original_path)
            const role = job.image_type
            return (
              <div
                key={job.id}
                onClick={() => { onClose(); onImageClick?.(job) }}
                style={{
                  borderRadius: 8, overflow: 'hidden',
                  border: `2px solid ${STATUS_COLOR[job.status] || '#2a2a2a'}`,
                  cursor: 'pointer',
                  position: 'relative',
                  aspectRatio: '1',
                  background: '#0a0a0a',
                  transition: 'border-color 0.12s, transform 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                {src && (
                  <img
                    src={src}
                    alt={job.filename}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
                {role && ROLE_LABEL[role] && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4,
                    background: ROLE_COLOR[role] ? `${ROLE_COLOR[role]}dd` : 'rgba(0,0,0,0.8)',
                    color: '#fff',
                    fontSize: 10, fontWeight: 700, padding: '2px 6px',
                    borderRadius: 4, letterSpacing: 0.5,
                  }}>
                    {ROLE_LABEL[role]}
                  </div>
                )}
              </div>
            )
          })}

          {jobs.length === 0 && (
            <div style={{ color: '#444', fontSize: 12, padding: 16, gridColumn: '1/-1', textAlign: 'center' }}>
              No images in this group
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const ROLES = ['front', 'back', 'detail', 'spec', 'garment']
const ROLE_LABELS = { front: 'Front', back: 'Back', detail: 'Detail', spec: 'Spec', garment: 'Garment' }
const ROLE_COLORS = { front: '#7c3aed', back: '#2563eb', detail: '#059669', spec: '#d97706', garment: '#555' }

const STATUS_COLOR = {
  ASSIGNED: '#16a34a', PROCESSED: '#15803d', SPEC_EXTRACTED: '#15803d',
  GROUPED: '#3b82f6', PROCESSING: '#8b5cf6', EXTRACTING: '#8b5cf6',
  CLASSIFIED: '#22c55e', CLASSIFYING: '#f59e0b',
  UPLOADED: '#6b7280', DUPLICATE: '#4b5563', NEEDS_REVIEW: '#f59e0b', FAILED: '#ef4444',
}

function imgUrl(path) {
  if (!path) return null
  return `${API}/${path.replace(/^storage\//, '')}`
}

export function ImageModal({ job, onClose, onSaved }) {
  const [selectedRole, setSelectedRole] = useState(job.image_type || 'garment')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const imgSrc = imgUrl(job.processed_path ?? job.original_path)
  const changed = selectedRole !== job.image_type

  async function handleSave() {
    if (!changed) { onClose(); return }
    setSaving(true)
    try {
      await fetch(`${API}/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_type: selectedRole }),
      })
      onSaved?.({ ...job, image_type: selectedRole })
    } finally {
      setSaving(false)
      onClose()
    }
  }

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
          width: 440,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            flex: 1, fontSize: 12, fontWeight: 700, color: '#e5e7eb',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {job.filename || 'Image'}
          </span>
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
            background: `${STATUS_COLOR[job.status] || '#3f3f46'}22`,
            color: STATUS_COLOR[job.status] || '#6b7280',
            border: `1px solid ${STATUS_COLOR[job.status] || '#3f3f46'}44`,
          }}>
            {job.status}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Image */}
        <div style={{
          width: '100%', aspectRatio: '4/3', background: '#0a0a0a',
          borderRadius: 8, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid #1e1e1e',
        }}>
          {imgSrc
            ? <img src={imgSrc} alt={job.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ color: '#333', fontSize: 12 }}>No image</span>}
        </div>

        {/* Role selector */}
        <div>
          <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
            Role
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROLES.map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                style={{
                  padding: '5px 13px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${selectedRole === role ? ROLE_COLORS[role] : '#2a2a2a'}`,
                  background: selectedRole === role ? `${ROLE_COLORS[role]}22` : 'transparent',
                  color: selectedRole === role ? ROLE_COLORS[role] : '#555',
                  transition: 'all 0.12s',
                }}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </div>

        {/* Meta row */}
        {(job.style_group || job.confidence != null) && (
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#555' }}>
            {job.style_group && (
              <span>Group: <span style={{ color: '#888' }}>{job.style_group}</span></span>
            )}
            {job.confidence != null && (
              <span>Confidence: <span style={{ color: '#888' }}>{(job.confidence * 100).toFixed(0)}%</span></span>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 7, border: '1px solid #2a2a2a',
              background: 'transparent', color: '#666', fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '7px 18px', borderRadius: 7, border: 'none',
              background: saving ? '#5b21b6' : '#7c3aed',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: !changed && !saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

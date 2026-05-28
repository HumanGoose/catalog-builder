import { useEffect, useRef, useState } from 'react'

const API = '/api'

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

export function GroupModal({ group, liveJobs, onClose, onImageClick, onRename, onDelete }) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(group.style_name || '')
  const [confirming, setConfirming] = useState(false)
  const nameInputRef = useRef(null)

  useEffect(() => {
    setNameValue(group.style_name || '')
  }, [group.style_name])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (editingName) { setEditingName(false); setNameValue(group.style_name || '') }
        else if (confirming) setConfirming(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingName, confirming, group.style_name])

  function startEdit() {
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  async function commitRename() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === group.style_name) {
      setEditingName(false)
      setNameValue(group.style_name || '')
      return
    }
    try {
      await onRename(group.id, trimmed)
    } catch {}
    setEditingName(false)
  }

  function handleNameKey(e) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') { setEditingName(false); setNameValue(group.style_name || '') }
  }

  async function handleDelete() {
    try { await onDelete(group.id) } catch {}
    onClose()
  }

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
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={handleNameKey}
                onBlur={commitRename}
                style={{
                  background: '#1c1c1c', border: '1.5px solid #7c3aed', borderRadius: 6,
                  color: '#e5e7eb', fontSize: 15, fontWeight: 700, padding: '3px 8px',
                  outline: 'none', width: '100%', maxWidth: 300,
                }}
              />
            ) : (
              <div
                onClick={startEdit}
                title="Click to rename"
                style={{
                  fontSize: 15, fontWeight: 700, color: '#e5e7eb',
                  cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderRadius: 4, padding: '2px 4px', marginLeft: -4,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1c1c1c' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {group.style_name || 'Unnamed Group'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
            )}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Delete / confirm */}
            {confirming ? (
              <>
                <span style={{ fontSize: 11, color: '#888' }}>Move {jobs.length} image{jobs.length !== 1 ? 's' : ''} to tray?</span>
                <button
                  onClick={handleDelete}
                  style={{
                    background: '#7f1d1d', border: 'none', borderRadius: 5, color: '#fca5a5',
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  style={{
                    background: 'none', border: '1px solid #333', borderRadius: 5, color: '#666',
                    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                title="Delete group"
                style={{
                  background: 'none', border: '1px solid #2a2a2a', borderRadius: 5, color: '#555',
                  padding: '4px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7f1d1d'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#555' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                </svg>
              </button>
            )}

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ fontSize: 10, color: '#444', fontStyle: 'italic', flexShrink: 0 }}>
          Click an image to view or change its role · Click the name to rename
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
                title={job.filename}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  cursor: 'pointer',
                  transition: 'transform 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <div style={{
                  borderRadius: 8, overflow: 'hidden',
                  border: `2px solid ${STATUS_COLOR[job.status] || '#2a2a2a'}`,
                  position: 'relative',
                  aspectRatio: '1',
                  background: '#0a0a0a',
                }}>
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
                <div style={{
                  fontSize: 9, fontFamily: '"DM Mono", monospace',
                  color: '#555', letterSpacing: '0.03em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}>
                  {job.filename || job.id.slice(0, 8)}
                </div>
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

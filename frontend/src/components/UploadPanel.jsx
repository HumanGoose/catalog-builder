import { useState, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const ACTIVE  = new Set(['CLASSIFYING','CLASSIFIED','GROUPED','PROCESSING','PROCESSED','EXTRACTING','SPEC_EXTRACTED'])
const DONE    = new Set(['ASSIGNED'])
const PROBLEM = new Set(['NEEDS_REVIEW','DUPLICATE','FAILED'])

function StatPill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: '"DM Mono", monospace', color }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

export function UploadPanel({ jobs, onUploaded }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lastCount, setLastCount] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const dragCounter = useRef(0)

  const jobList = Object.values(jobs)
  const total   = jobList.length
  const active  = jobList.filter(j => ACTIVE.has(j.status)).length
  const done    = jobList.filter(j => DONE.has(j.status)).length
  const flagged = jobList.filter(j => PROBLEM.has(j.status)).length

  const upload = useCallback(async (files) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    setLastCount(null)

    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))

    try {
      const r = await fetch(`${API}/upload`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`)
      const data = await r.json()
      setLastCount(data.uploaded)
      if (data.jobs) onUploaded(data.jobs)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [onUploaded])

  const onDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setDragging(true) }
  const onDragLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false) }
  const onDragOver  = (e) => e.preventDefault()
  const onDrop      = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    upload(e.dataTransfer.files)
  }
  const onInputChange = (e) => { upload(e.target.files); e.target.value = '' }

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Title */}
      <div>
        <h2
          style={{
            margin: 0, fontSize: '11px', fontFamily: '"DM Mono", monospace',
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)',
          }}
        >
          Upload
        </h2>
      </div>

      {/* Drop zone */}
      <div
        className={`upload-zone${dragging ? ' dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          borderRadius: '4px',
          padding: '36px 20px',
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={onInputChange}
          style={{ display: 'none' }}
        />

        {uploading ? (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', margin: '0 3px', display: 'inline-block' }}>·</span>
              <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', margin: '0 3px', display: 'inline-block' }}>·</span>
              <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', margin: '0 3px', display: 'inline-block' }}>·</span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--gold)', fontFamily: '"DM Mono", monospace' }}>
              uploading
            </p>
          </div>
        ) : (
          <>
            <svg
              width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke={dragging ? 'var(--gold)' : '#3A3530'}
              strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block', transition: 'stroke 0.25s' }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: dragging ? 'var(--gold)' : 'var(--text-muted)', transition: 'color 0.25s', fontWeight: 400 }}>
              {dragging ? 'Release to upload' : 'Drop garment photos here'}
            </p>
            <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '0.05em' }}>
              or click to browse
            </p>
          </>
        )}
      </div>

      {/* Feedback */}
      {lastCount !== null && !uploading && (
        <div style={{
          padding: '10px 12px', borderRadius: '3px',
          background: 'rgba(196,150,106,0.08)', border: '1px solid rgba(196,150,106,0.2)',
          fontSize: '11px', color: 'var(--gold)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em',
        }}>
          ↑ {lastCount} image{lastCount !== 1 ? 's' : ''} queued for processing
        </div>
      )}
      {error && (
        <div style={{
          padding: '10px 12px', borderRadius: '3px',
          background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.2)',
          fontSize: '11px', color: '#FF6B6B', fontFamily: '"DM Mono", monospace',
        }}>
          {error}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)' }} />

      {/* Stats */}
      <div>
        <p style={{
          margin: '0 0 16px', fontSize: '11px', fontFamily: '"DM Mono", monospace',
          letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>
          Pipeline
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 8px' }}>
          <StatPill label="Total"   value={total}   color="var(--text)" />
          <StatPill label="Active"  value={active}  color="#6BB8FF" />
          <StatPill label="Catalog" value={done}    color="var(--gold)" />
          <StatPill label="Flagged" value={flagged} color="#FF8C42" />
        </div>
      </div>
    </div>
  )
}

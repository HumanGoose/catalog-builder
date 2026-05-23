import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ImageThumbnail } from './ImageThumbnail'

const MIN_W = 152
const MAX_W = 420
const DEFAULT_W = 168

export function Tray({ trayJobs, onImageClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' })
  const [width, setWidth] = useState(DEFAULT_W)

  const onResizeDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width

    function onMove(ev) {
      const delta = startX - ev.clientX
      setWidth(Math.max(MIN_W, Math.min(MAX_W, startW + delta)))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  return (
    <div style={{ display: 'flex', flexShrink: 0 }}>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeDown}
        title="Drag to resize"
        style={{
          width: 5, flexShrink: 0, cursor: 'col-resize',
          background: 'transparent', transition: 'background 0.15s',
          borderLeft: '1px solid #1a1a1a',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed55' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      />

      {/* Tray body */}
      <div
        style={{
          width,
          borderLeft: `1px solid ${isOver ? '#7c3aed' : '#222'}`,
          background: isOver ? '#140d21' : '#0e0e0e',
          display: 'flex',
          flexDirection: 'column',
          transition: 'background 0.15s, border-color 0.15s',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '10px 10px 6px',
          fontSize: 10,
          color: '#555',
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          borderBottom: '1px solid #1a1a1a',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>Unassigned</span>
          {trayJobs.length > 0 && (
            <span style={{ color: '#7c3aed' }}>{trayJobs.length}</span>
          )}
        </div>

        <div
          ref={setNodeRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
            gap: 6,
            alignContent: 'start',
          }}
        >
          {trayJobs.map(job => (
            <ImageThumbnail
              key={job.id}
              job={job}
              groupId="tray"
              onImageClick={onImageClick}
            />
          ))}

          {trayJobs.length === 0 && (
            <div style={{ color: '#333', fontSize: 11, padding: '12px 0', textAlign: 'center', gridColumn: '1/-1' }}>
              All assigned
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

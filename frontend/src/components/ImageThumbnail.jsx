import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

const STATUS_BORDER = {
  UPLOADED: '#3f3f46', CLASSIFYING: '#92400e', CLASSIFIED: '#14532d',
  GROUPED: '#1e3a5f', PROCESSING: '#4c1d95', EXTRACTING: '#4c1d95',
  PROCESSED: '#15803d', SPEC_EXTRACTED: '#15803d',
  ASSIGNED: '#16a34a', DUPLICATE: '#52525b', NEEDS_REVIEW: '#92400e',
  FAILED: '#991b1b',
}

const ROLE_LABEL = { front: 'F', back: 'B', detail: 'D', spec: 'S' }

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function imgUrl(path) {
  if (!path) return null
  return `${API}/${path.replace(/^storage\//, '')}`
}

export function ImageThumbnail({ job, groupId, isOverlay, onImageClick }) {
  const [hovered, setHovered] = useState(false)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job, groupId },
  })

  const imgSrc = imgUrl(job.processed_path ?? job.original_path)
  const displayName = job.filename || job.id.slice(0, 8)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onImageClick ? () => onImageClick(job) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={job.filename}
      style={{
        width: 68,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        cursor: isDragging ? 'grabbing' : (onImageClick ? 'pointer' : 'grab'),
        opacity: isDragging && !isOverlay ? 0.35 : 1,
        flexShrink: 0,
        touchAction: 'none',
        transform: isOverlay && transform ? CSS.Transform.toString(transform) : undefined,
      }}
    >
      {/* Image area */}
      <div style={{
        width: 68,
        height: 68,
        borderRadius: 6,
        overflow: 'hidden',
        position: 'relative',
        border: `2px solid ${STATUS_BORDER[job.status] || '#3f3f46'}`,
        boxShadow: isOverlay ? '0 8px 24px rgba(0,0,0,0.5)' : 'none',
        flexShrink: 0,
      }}>
        <img
          src={imgSrc}
          alt={job.filename}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
        />

        {/* Role badge */}
        {job.image_type && ROLE_LABEL[job.image_type] && (
          <div style={{
            position: 'absolute', bottom: 2, left: 2,
            background: 'rgba(0,0,0,0.75)', color: '#fff',
            fontSize: 9, fontWeight: 700, padding: '1px 4px',
            borderRadius: 3, letterSpacing: 0.5,
            pointerEvents: 'none',
          }}>
            {ROLE_LABEL[job.image_type]}
          </div>
        )}

        {/* Hover overlay — edit hint */}
        {onImageClick && hovered && !isDragging && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(124,58,237,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
        )}
      </div>

      {/* Filename label */}
      <div style={{
        fontSize: 8,
        fontFamily: '"DM Mono", monospace',
        color: '#555',
        letterSpacing: '0.03em',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 68,
        pointerEvents: 'none',
      }}>
        {displayName}
      </div>
    </div>
  )
}

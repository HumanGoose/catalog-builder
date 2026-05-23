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

export function ImageThumbnail({ job, groupId, isOverlay }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job, groupId },
  })

  const imgSrc = imgUrl(job.processed_path ?? job.original_path)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        width: 68,
        height: 68,
        borderRadius: 6,
        overflow: 'hidden',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
        border: `2px solid ${STATUS_BORDER[job.status] || '#3f3f46'}`,
        opacity: isDragging && !isOverlay ? 0.35 : 1,
        flexShrink: 0,
        touchAction: 'none',
        transform: isOverlay && transform
          ? CSS.Transform.toString(transform)
          : undefined,
        boxShadow: isOverlay ? '0 8px 24px rgba(0,0,0,0.5)' : 'none',
      }}
    >
      <img
        src={imgSrc}
        alt={job.filename}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
      />
      {job.image_type && ROLE_LABEL[job.image_type] && (
        <div style={{
          position: 'absolute', bottom: 2, left: 2,
          background: 'rgba(0,0,0,0.75)', color: '#fff',
          fontSize: 9, fontWeight: 700, padding: '1px 4px',
          borderRadius: 3, letterSpacing: 0.5,
        }}>
          {ROLE_LABEL[job.image_type]}
        </div>
      )}
    </div>
  )
}

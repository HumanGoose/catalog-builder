import { useDroppable } from '@dnd-kit/core'
import { ImageThumbnail } from './ImageThumbnail'

export function Tray({ trayJobs }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' })

  return (
    <div
      style={{
        width: 108,
        flexShrink: 0,
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
      }}>
        Unassigned
        {trayJobs.length > 0 && (
          <span style={{ marginLeft: 6, color: '#7c3aed' }}>{trayJobs.length}</span>
        )}
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {trayJobs.map(job => (
          <ImageThumbnail key={job.id} job={job} groupId="tray" />
        ))}

        {trayJobs.length === 0 && (
          <div style={{ color: '#333', fontSize: 11, padding: '12px 0', textAlign: 'center' }}>
            All assigned
          </div>
        )}
      </div>
    </div>
  )
}

import { useRef, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ImageThumbnail } from './ImageThumbnail'

export function GroupCard({ group, liveJobs, position, scale, onMoveCard }) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id })

  const headerRef = useRef(null)
  const dragState = useRef({ active: false, lastX: 0, lastY: 0 })

  const onHeaderPointerDown = useCallback((e) => {
    e.stopPropagation()
    dragState.current = { active: true, lastX: e.clientX, lastY: e.clientY }
    headerRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const onHeaderPointerMove = useCallback((e) => {
    if (!dragState.current.active) return
    const dx = e.clientX - dragState.current.lastX
    const dy = e.clientY - dragState.current.lastY
    dragState.current.lastX = e.clientX
    dragState.current.lastY = e.clientY
    onMoveCard(dx, dy)
  }, [onMoveCard])

  const onHeaderPointerUp = useCallback(() => {
    dragState.current.active = false
  }, [])

  // Merge live job statuses from useJobs into the group's job list
  const jobs = group.jobs.map(j => liveJobs[j.id] || j)

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: 220,
        background: '#141414',
        border: `1.5px solid ${isOver ? '#7c3aed' : '#2a2a2a'}`,
        borderRadius: 10,
        boxShadow: isOver
          ? '0 0 0 2px #7c3aed40, 0 4px 20px rgba(0,0,0,0.6)'
          : '0 4px 20px rgba(0,0,0,0.4)',
        userSelect: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Drag handle / header */}
      <div
        ref={headerRef}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          padding: '9px 12px',
          borderRadius: '8px 8px 0 0',
          cursor: dragState.current.active ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderBottom: '1px solid #222',
          background: '#1c1c1c',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e5e7eb', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.style_name || 'Unnamed'}
        </span>
        {group.style_number && (
          <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>
            {group.style_number}
          </span>
        )}
        <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>
          {jobs.length}
        </span>
      </div>

      {/* Drop zone + image grid */}
      <div
        ref={setNodeRef}
        style={{
          padding: 8,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          minHeight: 52,
          borderRadius: '0 0 8px 8px',
          background: isOver ? 'rgba(124,58,237,0.06)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {jobs.map(job => (
          <ImageThumbnail key={job.id} job={job} groupId={group.id} />
        ))}
        {jobs.length === 0 && (
          <span style={{ color: '#444', fontSize: 11, padding: '6px 2px', width: '100%', textAlign: 'center' }}>
            drop here
          </span>
        )}
      </div>
    </div>
  )
}

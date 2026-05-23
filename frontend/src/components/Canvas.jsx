import { useState, useRef, useCallback, useEffect } from 'react'
import { GroupCard } from './GroupCard'

function NewGroupButton({ onCreate }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  function handleOpen() {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    try { await onCreate(trimmed) } catch {}
    setName('')
    setOpen(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') { setOpen(false); setName('') }
  }

  return (
    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
      {open ? (
        <>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => { if (!name.trim()) { setOpen(false) } }}
            placeholder="Group name…"
            style={{
              background: '#1c1c1c', border: '1.5px solid #7c3aed', borderRadius: 6,
              color: '#e5e7eb', fontSize: 12, padding: '5px 10px', outline: 'none', width: 160,
            }}
          />
          <button
            onMouseDown={e => { e.preventDefault(); handleSubmit() }}
            style={{
              background: '#7c3aed', border: 'none', borderRadius: 6, color: '#fff',
              fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            Create
          </button>
          <button
            onMouseDown={() => { setOpen(false); setName('') }}
            style={{
              background: 'none', border: '1px solid #333', borderRadius: 6, color: '#888',
              fontSize: 11, padding: '5px 8px', cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={handleOpen}
          style={{
            background: '#1c1c1c', border: '1.5px solid #2a2a2a', borderRadius: 6,
            color: '#888', fontSize: 11, fontWeight: 600, padding: '5px 10px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#e5e7eb' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Group
        </button>
      )}
    </div>
  )
}

const MIN_SCALE = 0.2
const MAX_SCALE = 2.5
const CARD_W = 240
const CARD_GAP = 28
const COLS = 4

// Initial auto-position for cards that haven't been manually placed
function autoPos(idx) {
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  return { x: 40 + col * (CARD_W + CARD_GAP), y: 40 + row * 310 }
}

export function Canvas({ groups, liveJobs, onImageClick, onGroupClick, onCreateGroup }) {
  const [offset, setOffset] = useState({ x: 40, y: 40 })
  const [scale, setScale] = useState(1)
  const [cardPositions, setCardPositions] = useState({})

  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const canvasRef = useRef(null)

  const groupList = Object.values(groups)

  // When new groups appear, initialise their positions
  useEffect(() => {
    setCardPositions(prev => {
      const next = { ...prev }
      let changed = false
      groupList.forEach((g, idx) => {
        if (!next[g.id]) {
          next[g.id] = autoPos(idx)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [groupList.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Pan (mouse events — avoids conflict with @dnd-kit pointer events) ---
  const onMouseDown = useCallback((e) => {
    if (e.target !== canvasRef.current) return
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }, [offset])

  const onMouseMove = useCallback((e) => {
    if (!isPanning.current) return
    setOffset({
      x: panStart.current.ox + (e.clientX - panStart.current.x),
      y: panStart.current.oy + (e.clientY - panStart.current.y),
    })
  }, [])

  const stopPan = useCallback(() => { isPanning.current = false }, [])

  // --- Zoom ---
  const onWheel = useCallback((e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.93
    setScale(s => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor)))
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // --- Card repositioning (called by GroupCard header drag) ---
  const onMoveCard = useCallback((groupId, screenDx, screenDy) => {
    setCardPositions(prev => {
      const cur = prev[groupId] || { x: 0, y: 0 }
      return { ...prev, [groupId]: { x: cur.x + screenDx / scale, y: cur.y + screenDy / scale } }
    })
  }, [scale])

  return (
    <div
      ref={canvasRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        background: '#080808',
        backgroundImage: 'radial-gradient(circle, #222 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        cursor: isPanning.current ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      <NewGroupButton onCreate={onCreateGroup} />

      {/* Zoom hint */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, zIndex: 10,
        fontSize: 11, color: '#333', pointerEvents: 'none',
      }}>
        {Math.round(scale * 100)}%
      </div>

      {/* World — everything inside gets transformed together */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0,
          transformOrigin: '0 0',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        {groupList.map((group, idx) => {
          const pos = cardPositions[group.id] || autoPos(idx)
          return (
            <GroupCard
              key={group.id}
              group={group}
              liveJobs={liveJobs}
              position={pos}
              scale={scale}
              onMoveCard={(dx, dy) => onMoveCard(group.id, dx, dy)}
              onGroupClick={onGroupClick}
              onImageClick={onImageClick}
            />
          )
        })}

        {groupList.length === 0 && (
          <div style={{
            position: 'absolute', left: 40, top: 40,
            color: '#2a2a2a', fontSize: 15, fontWeight: 500, pointerEvents: 'none',
          }}>
            Groups will appear here as the pipeline runs
          </div>
        )}
      </div>
    </div>
  )
}

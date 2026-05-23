import { useState, useCallback } from 'react'
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core'
import { Header } from './components/Header.jsx'
import { UploadPanel } from './components/UploadPanel.jsx'
import { PipelineGrid } from './components/PipelineGrid.jsx'
import { SlideReview } from './components/SlideReview.jsx'
import { Canvas } from './components/Canvas.jsx'
import { Tray } from './components/Tray.jsx'
import { ImageThumbnail } from './components/ImageThumbnail.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useJobs } from './hooks/useJobs.js'
import { useGroups } from './hooks/useGroups.js'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App() {
  const [view, setView] = useState('canvas')
  const [filter, setFilter] = useState('ALL')
  const [activeJob, setActiveJob] = useState(null)

  const { jobs, handleEvent: handleJobEvent, addJobs, fetchAll: fetchJobs } = useJobs()
  const { groups, handleEvent: handleGroupEvent, fetchAll: fetchGroups, moveJob } = useGroups()

  // Both hooks share the same WebSocket connection via a combined handler
  const handleEvent = useCallback((event) => {
    handleJobEvent(event)
    handleGroupEvent(event)
  }, [handleJobEvent, handleGroupEvent])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchJobs(), fetchGroups()])
  }, [fetchJobs, fetchGroups])

  const connected = useWebSocket(handleEvent, fetchAll)
  const jobCount = Object.keys(jobs).length

  // Jobs not yet assigned to any group card (shown in the tray)
  const groupedJobIds = new Set(
    Object.values(groups).flatMap(g => g.jobs.map(j => j.id))
  )
  const trayJobs = Object.values(jobs).filter(j => !groupedJobIds.has(j.id))

  // --- DnD drag handlers ---
  function onDragStart({ active }) {
    setActiveJob(active.data.current?.job || null)
  }

  async function onDragEnd({ active, over }) {
    setActiveJob(null)
    if (!over) return

    const job = active.data.current?.job
    const fromGroupId = active.data.current?.groupId
    const toGroupId = over.id

    if (!job || fromGroupId === toGroupId) return

    // Optimistic update — canvas updates instantly
    moveJob(job, fromGroupId, toGroupId)

    // Persist + broadcast via WebSocket (job.reassigned → all tabs update)
    const targetStyleGroup = toGroupId === 'tray'
      ? null
      : groups[toGroupId]?.style_name ?? null

    try {
      await fetch(`${API}/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style_group: targetStyleGroup }),
      })
    } catch {
      // Backend call failed — resync from server
      fetchGroups()
    }
  }

  function onDragCancel() {
    setActiveJob(null)
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden', background: 'var(--bg)',
      }}>
        <Header connected={connected} jobCount={jobCount} />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left sidebar: Upload */}
          <aside style={{
            width: 272, flexShrink: 0,
            borderRight: '1px solid var(--border)', overflowY: 'auto',
          }}>
            <UploadPanel jobs={jobs} onUploaded={addJobs} />
          </aside>

          {/* Center: Canvas or Pipeline */}
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Tab bar */}
            <div style={{
              display: 'flex', borderBottom: '1px solid var(--border)',
              padding: '0 16px', flexShrink: 0,
            }}>
              {['canvas', 'pipeline'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '8px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    textTransform: 'capitalize', letterSpacing: 0.3,
                    color: view === v ? '#e5e7eb' : '#555',
                    borderBottom: view === v ? '2px solid #7c3aed' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              {view === 'canvas' ? (
                <>
                  <Canvas groups={groups} liveJobs={jobs} />
                  <Tray trayJobs={trayJobs} />
                </>
              ) : (
                <PipelineGrid jobs={jobs} filter={filter} onFilterChange={setFilter} />
              )}
            </div>
          </main>

          {/* Right sidebar: Slide review */}
          <aside style={{
            width: 288, flexShrink: 0,
            borderLeft: '1px solid var(--border)', overflowY: 'auto',
          }}>
            <SlideReview jobs={jobs} />
          </aside>
        </div>
      </div>

      {/* Drag overlay — renders outside the canvas transform, in screen space */}
      <DragOverlay dropAnimation={null}>
        {activeJob ? <ImageThumbnail job={activeJob} groupId={null} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

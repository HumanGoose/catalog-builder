import { useState, useCallback } from 'react'
import { DndContext, DragOverlay, pointerWithin, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Header } from './components/Header.jsx'
import { UploadPanel } from './components/UploadPanel.jsx'
import { PipelineGrid } from './components/PipelineGrid.jsx'
import { SlideReview } from './components/SlideReview.jsx'
import { CatalogView } from './components/CatalogView.jsx'
import { Canvas } from './components/Canvas.jsx'
import { Tray } from './components/Tray.jsx'
import { ImageThumbnail } from './components/ImageThumbnail.jsx'
import { ImageModal } from './components/ImageModal.jsx'
import { GroupModal } from './components/GroupModal.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useJobs } from './hooks/useJobs.js'
import { useGroups } from './hooks/useGroups.js'
import { useSlides } from './hooks/useSlides.js'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App() {
  const [view, setView] = useState('canvas')
  const [filter, setFilter] = useState('ALL')
  const [activeJob, setActiveJob] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [catalogOpen, setCatalogOpen] = useState(false)

  const { jobs, handleEvent: handleJobEvent, addJobs, fetchAll: fetchJobs } = useJobs()
  const { groups, handleEvent: handleGroupEvent, fetchAll: fetchGroups, moveJob, createGroup, renameGroup, deleteGroup } = useGroups()
  const { slides, handleEvent: handleSlideEvent, fetchAll: fetchSlides, updateSlide } = useSlides()

  // Allow drag only after 8px of movement — short taps fire onClick on ImageThumbnail
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleEvent = useCallback((event) => {
    handleJobEvent(event)
    handleGroupEvent(event)
    handleSlideEvent(event)
  }, [handleJobEvent, handleGroupEvent, handleSlideEvent])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchJobs(), fetchGroups(), fetchSlides()])
  }, [fetchJobs, fetchGroups, fetchSlides])

  const connected = useWebSocket(handleEvent, fetchAll)
  const jobCount = Object.keys(jobs).length
  const slideCount = Object.keys(slides).length

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

    moveJob(job, fromGroupId, toGroupId)

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
      fetchGroups()
    }
  }

  function onDragCancel() {
    setActiveJob(null)
  }

  return (
    <DndContext
      sensors={sensors}
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
                  <Canvas
                    groups={groups}
                    liveJobs={jobs}
                    onImageClick={setSelectedJob}
                    onGroupClick={setSelectedGroup}
                    onCreateGroup={createGroup}
                    slideCount={slideCount}
                    onOpenCatalog={() => setCatalogOpen(true)}
                  />
                  <Tray trayJobs={trayJobs} onImageClick={setSelectedJob} />
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

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeJob ? <ImageThumbnail job={activeJob} groupId={null} isOverlay /> : null}
      </DragOverlay>

      {/* Image detail + role edit modal */}
      {selectedJob && (
        <ImageModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onSaved={() => {}}
        />
      )}

      {/* Group expand modal */}
      {selectedGroup && (
        <GroupModal
          group={selectedGroup}
          liveJobs={jobs}
          onClose={() => setSelectedGroup(null)}
          onImageClick={setSelectedJob}
          onRename={async (groupId, newName) => {
            const updated = await renameGroup(groupId, newName)
            setSelectedGroup(updated)
          }}
          onDelete={async (groupId) => {
            await deleteGroup(groupId)
            setSelectedGroup(null)
          }}
        />
      )}

      {/* Catalog preview modal */}
      {catalogOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column',
          }}
          onKeyDown={e => { if (e.key === 'Escape') setCatalogOpen(false) }}
          tabIndex={-1}
        >
          {/* Modal header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg)', flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontFamily: '"DM Mono", monospace',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              Catalog Preview — {slideCount} slide{slideCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setCatalogOpen(false)}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text-muted)',
                fontSize: 13, padding: '4px 10px', cursor: 'pointer',
                fontFamily: '"DM Mono", monospace',
              }}
            >
              Esc ✕
            </button>
          </div>
          {/* Modal body */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CatalogView slides={slides} onSave={updateSlide} />
          </div>
        </div>
      )}
    </DndContext>
  )
}

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
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
  const [filter, setFilter] = useState('ALL')
  const [activeJob, setActiveJob] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [hasUploaded, setHasUploaded] = useState(false)
  const [pipelineHeight, setPipelineHeight] = useState(220)
  const isDraggingDivider = useRef(false)
  const dividerDragStart = useRef({ y: 0, height: 0 })

  useEffect(() => {
    function onMouseMove(e) {
      if (!isDraggingDivider.current) return
      const delta = dividerDragStart.current.y - e.clientY
      setPipelineHeight(h => Math.max(60, Math.min(600, dividerDragStart.current.height + delta)))
    }
    function onMouseUp() { isDraggingDivider.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const { jobs, handleEvent: handleJobEvent, addJobs, fetchAll: fetchJobs, patchJob } = useJobs()
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

  // Merge DB slide metadata with live job state so CatalogView reflects canvas moves
  const liveSlides = useMemo(() => {
    const result = {}
    Object.entries(slides).forEach(([id, slide]) => {
      const groupJobs = Object.values(jobs).filter(
        j => j.style_group === slide.style_number && j.status === 'ASSIGNED'
      )
      const front  = groupJobs.find(j => j.image_type === 'front')
      const back   = groupJobs.find(j => j.image_type === 'back')
      const detail = groupJobs.find(j => j.image_type === 'detail')
      result[id] = {
        ...slide,
        front_image_path:  front?.processed_path  ?? front?.original_path  ?? null,
        back_image_path:   back?.processed_path   ?? back?.original_path   ?? null,
        detail_image_path: detail?.processed_path ?? detail?.original_path ?? null,
      }
    })
    return result
  }, [slides, jobs])

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

    // Optimistic update so SlideReview reflects the move immediately
    const optimisticStatus = targetStyleGroup
      ? (job.status === 'NEEDS_REVIEW' ? 'ASSIGNED' : job.status)
      : 'NEEDS_REVIEW'
    patchJob(job.id, { style_group: targetStyleGroup, status: optimisticStatus })

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

  function handleUploaded(uploadedJobs) {
    addJobs(uploadedJobs)
    setHasUploaded(true)
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

        {!hasUploaded ? (
          /* ── Upload landing ── */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 24,
          }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <p style={{
                margin: 0, fontSize: 11, fontFamily: '"DM Mono", monospace',
                letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                Upload garment photos to begin
              </p>
            </div>
            <div style={{ width: 420 }}>
              <UploadPanel onUploaded={handleUploaded} />
            </div>
          </div>
        ) : (
          /* ── Main workspace ── */
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Center: Canvas (top) + Pipeline (bottom), resizable */}
            <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Canvas row */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
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
              </div>

              {/* Draggable divider */}
              <div
                onMouseDown={e => {
                  e.preventDefault()
                  isDraggingDivider.current = true
                  dividerDragStart.current = { y: e.clientY, height: pipelineHeight }
                }}
                style={{
                  height: 6, flexShrink: 0, cursor: 'row-resize',
                  background: 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{
                  width: 32, height: 2, borderRadius: 1,
                  background: '#3a3a3a',
                  pointerEvents: 'none',
                }} />
              </div>

              {/* Pipeline panel */}
              <div style={{ height: pipelineHeight, flexShrink: 0, overflow: 'hidden' }}>
                <PipelineGrid jobs={jobs} filter={filter} onFilterChange={setFilter} />
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
        )}
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
            <CatalogView slides={liveSlides} onSave={updateSlide} />
          </div>
        </div>
      )}
    </DndContext>
  )
}

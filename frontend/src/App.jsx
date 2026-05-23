import { useState } from 'react'
import { Header } from './components/Header.jsx'
import { UploadPanel } from './components/UploadPanel.jsx'
import { PipelineGrid } from './components/PipelineGrid.jsx'
import { SlideReview } from './components/SlideReview.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useJobs } from './hooks/useJobs.js'

export default function App() {
  const [filter, setFilter] = useState('ALL')
  const { jobs, handleEvent, addJobs, fetchAll } = useJobs()
  const connected = useWebSocket(handleEvent, fetchAll)
  const jobCount = Object.keys(jobs).length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <Header connected={connected} jobCount={jobCount} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Upload + Stats */}
        <aside
          style={{
            width: '272px',
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
          }}
        >
          <UploadPanel jobs={jobs} onUploaded={addJobs} />
        </aside>

        {/* Center: Pipeline grid */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <PipelineGrid
            jobs={jobs}
            filter={filter}
            onFilterChange={setFilter}
          />
        </main>

        {/* Right: Catalog / Slide Review */}
        <aside
          style={{
            width: '288px',
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            overflowY: 'auto',
          }}
        >
          <SlideReview jobs={jobs} />
        </aside>
      </div>
    </div>
  )
}

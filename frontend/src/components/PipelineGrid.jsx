import React, { useMemo } from 'react'
import { JobCard } from './JobCard.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const STATUS_ORDER = [
  'CLASSIFYING','GROUPING','EXTRACTING','PROCESSING',
  'CLASSIFIED','SPEC_EXTRACTED','PROCESSED','GROUPED',
  'ASSIGNED','UPLOADED','NEEDS_REVIEW','DUPLICATE','FAILED',
]

// ── Pipeline flow visualization ───────────────────────────────────────────────
const FLOW_STAGES = [
  {
    id: 'classify', label: 'Classify',
    buckets: ['UPLOADED', 'CLASSIFYING', 'CLASSIFIED'],
    active: ['CLASSIFYING'],
    color: '#FDB347', pulse: 'pulse-amber',
  },
  {
    id: 'group', label: 'Group',
    buckets: ['GROUPING'],
    active: ['GROUPING'],
    color: '#3DD6CC', pulse: 'pulse-teal',
  },
  {
    id: 'process', label: 'Process',
    buckets: ['GROUPED', 'PROCESSING', 'EXTRACTING', 'PROCESSED', 'SPEC_EXTRACTED'],
    active: ['PROCESSING', 'EXTRACTING'],
    color: '#6BB8FF', pulse: 'pulse-blue',
  },
  {
    id: 'done', label: 'Assigned',
    buckets: ['ASSIGNED'],
    active: [],
    color: '#C4966A', pulse: null,
  },
]

const EXCEPTION_STAGES = [
  { id: 'review',    label: 'Review',    statuses: ['NEEDS_REVIEW'], color: '#FF8C42' },
  { id: 'duplicate', label: 'Dup',       statuses: ['DUPLICATE'],    color: '#5A4A40' },
  { id: 'failed',    label: 'Failed',    statuses: ['FAILED'],       color: '#FF6B6B' },
]

function PipelineFlow({ jobs }) {
  const jobList = Object.values(jobs)
  if (jobList.length === 0) return null

  const cnt = (statuses) => jobList.filter(j => statuses.includes(j.status)).length

  const stages = FLOW_STAGES.map(s => ({
    ...s,
    count: cnt(s.buckets),
    isActive: cnt(s.active) > 0,
  }))

  const exceptions = EXCEPTION_STAGES
    .map(e => ({ ...e, count: cnt(e.statuses) }))
    .filter(e => e.count > 0)

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '8px 20px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      flexShrink: 0,
      minHeight: 52,
    }}>
      {stages.map((stage, i) => (
        <React.Fragment key={stage.id}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 68 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontSize: 9, fontFamily: '"DM Mono", monospace',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: stage.isActive ? stage.color : stage.count > 0 ? 'var(--text-muted)' : 'var(--text-faint)',
              }}>
                {stage.label}
              </span>
              {stage.isActive && stage.pulse && (
                <span
                  className={stage.pulse}
                  style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: stage.color, display: 'inline-block', flexShrink: 0,
                  }}
                />
              )}
            </div>
            <span style={{
              fontSize: 17, fontFamily: '"DM Mono", monospace',
              fontWeight: stage.isActive ? 600 : 400,
              color: stage.isActive ? stage.color : stage.count > 0 ? stage.color : 'var(--text-faint)',
              opacity: stage.count === 0 ? 0.25 : 1,
              lineHeight: 1,
            }}>
              {stage.count}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 16 }}>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                <path d="M0 5h11M8 2l3 3-3 3" stroke="var(--border-soft)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </React.Fragment>
      ))}

      {exceptions.length > 0 && (
        <>
          <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 14px', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
            {exceptions.map(e => (
              <div key={e.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, fontFamily: '"DM Mono", monospace', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                  {e.label}
                </span>
                <span style={{ fontSize: 15, fontFamily: '"DM Mono", monospace', color: e.color, fontWeight: 500, lineHeight: 1 }}>
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', padding: '60px 40px', textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64, height: 64, borderRadius: '50%',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2A2A2A" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: '15px', color: 'var(--text-muted)', fontFamily: '"Playfair Display", serif', fontStyle: 'italic' }}>
        No images yet
      </p>
      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-faint)', letterSpacing: '0.04em', lineHeight: 1.6 }}>
        Upload garment photos to begin<br />the AI classification pipeline.
      </p>
    </div>
  )
}

function FilterChip({ status, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: '3px', cursor: 'pointer',
        border: active ? '1px solid var(--border-soft)' : '1px solid transparent',
        background: active ? 'var(--surface-hi)' : 'transparent',
        fontSize: '10px', fontFamily: '"DM Mono", monospace',
        color: 'var(--text-muted)', letterSpacing: '0.05em',
        transition: 'all 0.15s',
      }}
    >
      {status === 'ALL' ? 'All' : <StatusBadge status={status} size="xs" />}
      {count !== undefined && (
        <span style={{ color: 'var(--text-faint)' }}>{count}</span>
      )}
    </button>
  )
}

export function PipelineGrid({ jobs, filter, onFilterChange }) {
  const jobList = Object.values(jobs)

  const sorted = useMemo(() => {

    return [...jobList].sort((a, b) => {
      const oa = STATUS_ORDER.indexOf(a.status)
      const ob = STATUS_ORDER.indexOf(b.status)
      if (oa !== ob) return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob)
      return 0
    })
  }, [jobList])

  const visible = filter && filter !== 'ALL'
    ? sorted.filter(j => j.status === filter)
    : sorted

  const statusCounts = useMemo(() => {
    const counts = {}
    jobList.forEach(j => { counts[j.status] = (counts[j.status] ?? 0) + 1 })
    return counts
  }, [jobList])

  const activeStatuses = Object.entries(statusCounts)
    .filter(([, c]) => c > 0)
    .map(([s]) => s)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Pipeline flow bar */}
      <PipelineFlow jobs={jobs} />

      {/* Filter bar */}
      {jobList.length > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            position: 'sticky', top: 0, zIndex: 10,
          }}
        >
          <FilterChip
            status="ALL"
            count={jobList.length}
            active={!filter || filter === 'ALL'}
            onClick={() => onFilterChange('ALL')}
          />
          {activeStatuses.map(s => (
            <FilterChip
              key={s}
              status={s}
              count={statusCounts[s]}
              active={filter === s}
              onClick={() => onFilterChange(s)}
            />
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            {visible.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

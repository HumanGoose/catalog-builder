import { useState, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TERMINAL = new Set(['ASSIGNED', 'DUPLICATE', 'NEEDS_REVIEW', 'FAILED'])

// Pipeline statuses in rough advancement order — used to avoid
// downgrading a job that WS already advanced past "UPLOADED".
const STATUS_RANK = {
  UPLOADED: 0, CLASSIFYING: 1, CLASSIFIED: 2,
  GROUPED: 3, PROCESSING: 4, EXTRACTING: 4,
  PROCESSED: 5, SPEC_EXTRACTED: 5,
  ASSIGNED: 6, DUPLICATE: 6, NEEDS_REVIEW: 6, FAILED: 6,
}

export function useJobs() {
  const [jobs, setJobs] = useState({})

  const addJobs = useCallback((newJobs) => {
    setJobs(prev => {
      const updated = { ...prev }
      newJobs.forEach(j => {
        const existing = updated[j.id]
        if (existing) {
          // Merge: keep whichever status is further along the pipeline.
          // This prevents the upload response (status=UPLOADED) from
          // clobbering a status that arrived via WebSocket first.
          const keep = (STATUS_RANK[existing.status] ?? 0) > (STATUS_RANK[j.status] ?? 0)
            ? existing.status : j.status
          updated[j.id] = { ...existing, ...j, status: keep }
        } else {
          updated[j.id] = { ...j }
        }
      })
      return updated
    })
  }, [])

  const handleEvent = useCallback((event) => {
    if (event.event !== 'job.status') return
    setJobs(prev => {
      // Accept events even if the job isn't in state yet — Celery can
      // emit status changes before the upload response resolves.
      const existing = prev[event.job_id] ?? {}
      return {
        ...prev,
        [event.job_id]: {
          ...existing,
          id:             event.job_id,
          status:         event.status,
          image_type:     event.image_type     ?? existing.image_type,
          style_group:    event.style_group    ?? existing.style_group,
          original_path:  event.original_path  ?? existing.original_path,
          processed_path: event.processed_path ?? existing.processed_path,
          filename:       event.filename       ?? existing.filename,
          confidence:     event.confidence     ?? existing.confidence,
          spec_data:      event.spec_data      ?? existing.spec_data,
        },
      }
    })
  }, [])

  // Sync current job states from the server — called on WS connect/reconnect
  // to catch up on any events missed while the socket was down.
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const fetchAll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/jobs`)
      if (!r.ok) return
      const data = await r.json()
      const knownIds = new Set(Object.keys(jobsRef.current))
      const relevant = knownIds.size > 0 ? data.filter(j => knownIds.has(j.id)) : []
      if (relevant.length > 0) addJobs(relevant)
    } catch {}
  }, [addJobs])

  return { jobs, handleEvent, addJobs, fetchAll }
}

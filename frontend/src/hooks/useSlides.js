import { useState, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useSlides() {
  const [slides, setSlides] = useState({})  // id → slide
  const knownIds = useRef(new Set())

  const _upsert = useCallback((slide) => {
    knownIds.current.add(slide.id)
    setSlides(prev => ({ ...prev, [slide.id]: slide }))
  }, [])

  const fetchAll = useCallback(async () => {
    // Session-scoped: never load DB history on fresh connect.
    // On reconnect mid-session, refresh only the IDs we already know.
    if (knownIds.current.size === 0) return
    try {
      const res = await fetch(`${API}/slides`)
      if (!res.ok) return
      const data = await res.json()
      const known = knownIds.current
      data.forEach(s => { if (known.has(s.id)) _upsert(s) })
    } catch {}
  }, [_upsert])

  const handleEvent = useCallback((event) => {
    if (event.event === 'group.complete' && event.slide_id) {
      fetch(`${API}/slides/${event.slide_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(slide => { if (slide) _upsert(slide) })
        .catch(() => {})
    } else if (event.event === 'group.deleted') {
      setSlides(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(id => {
          if (next[id].group_id === event.group_id) {
            knownIds.current.delete(id)
            delete next[id]
          }
        })
        return next
      })
    }
  }, [_upsert])

  const updateSlide = useCallback(async (id, fields) => {
    const res = await fetch(`${API}/slides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error('Failed to update slide')
    const updated = await res.json()
    _upsert(updated)
    return updated
  }, [_upsert])

  return { slides, handleEvent, fetchAll, updateSlide }
}

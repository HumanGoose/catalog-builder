import { useState, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useGroups() {
  // { [groupId]: { id, style_name, style_number, jobs: [...] } }
  const [groups, setGroups] = useState({})

  const fetchGroup = useCallback(async (groupId) => {
    try {
      const r = await fetch(`${API}/groups/${groupId}`)
      if (!r.ok) return
      const g = await r.json()
      setGroups(prev => ({ ...prev, [g.id]: g }))
    } catch {}
  }, [])

  // Ref so fetchAll can read current group IDs without a stale closure
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // On WS reconnect, only re-fetch groups already known in this session.
  // Starting empty is intentional — groups appear via group.complete events,
  // not by loading all historical groups from the DB.
  const fetchAll = useCallback(async () => {
    const knownIds = Object.keys(groupsRef.current)
    if (knownIds.length === 0) return
    await Promise.all(knownIds.map(id => fetchGroup(id)))
  }, [fetchGroup])

  // Called from App's combined WS event handler
  const handleEvent = useCallback((event) => {
    if (event.event === 'group.complete') {
      // Pipeline just finished a group — fetch it and add a card to the canvas
      fetchGroup(event.group_id)
    } else if (event.event === 'job.reassigned') {
      // A job moved between groups (from another tab or echoed back) — resync
      // only the groups this session already knows about
      const knownIds = Object.keys(groupsRef.current)
      knownIds.forEach(id => fetchGroup(id))
    }
  }, [fetchGroup])

  // Optimistic local update when the current user drags an image
  const moveJob = useCallback((job, fromGroupId, toGroupId) => {
    setGroups(prev => {
      const next = { ...prev }
      if (fromGroupId && fromGroupId !== 'tray' && next[fromGroupId]) {
        next[fromGroupId] = {
          ...next[fromGroupId],
          jobs: next[fromGroupId].jobs.filter(j => j.id !== job.id),
        }
      }
      if (toGroupId && toGroupId !== 'tray' && next[toGroupId]) {
        next[toGroupId] = {
          ...next[toGroupId],
          jobs: [...next[toGroupId].jobs, { ...job }],
        }
      }
      return next
    })
  }, [])

  return { groups, handleEvent, fetchAll, moveJob }
}

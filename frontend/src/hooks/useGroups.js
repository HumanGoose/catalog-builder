import { useState, useCallback, useRef } from 'react'

const API = '/api'

export function useGroups() {
  // { [groupId]: { id, style_name, style_number, jobs: [...] } }
  const [groups, setGroups] = useState({})

  const fetchGroup = useCallback(async (groupId) => {
    try {
      const r = await fetch(`${API}/groups/${groupId}`)
      if (!r.ok) return null
      const g = await r.json()
      setGroups(prev => ({ ...prev, [g.id]: g }))
      return g
    } catch { return null }
  }, [])

  // Ref so fetchAll can read current group IDs without a stale closure
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  const fetchAll = useCallback(async () => {
    const knownIds = Object.keys(groupsRef.current)
    if (knownIds.length === 0) return
    await Promise.all(knownIds.map(id => fetchGroup(id)))
  }, [fetchGroup])

  const handleEvent = useCallback((event) => {
    if (event.event === 'group.complete' || event.event === 'group.created') {
      fetchGroup(event.group_id)
    } else if (event.event === 'group.updated') {
      if (groupsRef.current[event.group_id]) fetchGroup(event.group_id)
    } else if (event.event === 'group.deleted') {
      setGroups(prev => {
        const next = { ...prev }
        delete next[event.group_id]
        return next
      })
    } else if (event.event === 'job.reassigned') {
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

  const createGroup = useCallback(async (name) => {
    const r = await fetch(`${API}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_name: name }),
    })
    if (!r.ok) throw new Error('Failed to create group')
    const g = await r.json()
    setGroups(prev => ({ ...prev, [g.id]: g }))
    return g
  }, [])

  const renameGroup = useCallback(async (groupId, newName) => {
    const r = await fetch(`${API}/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_name: newName }),
    })
    if (!r.ok) throw new Error('Failed to rename group')
    const g = await r.json()
    setGroups(prev => ({ ...prev, [g.id]: g }))
    return g
  }, [])

  const deleteGroup = useCallback(async (groupId) => {
    const r = await fetch(`${API}/groups/${groupId}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Failed to delete group')
    setGroups(prev => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })
  }, [])

  return { groups, handleEvent, fetchAll, moveJob, createGroup, renameGroup, deleteGroup }
}

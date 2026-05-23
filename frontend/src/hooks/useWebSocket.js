import { useEffect, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

export function useWebSocket(onMessage, onReconnect) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const timerRef = useRef(null)
  const cbRef = useRef(onMessage)
  const reconnectRef = useRef(onReconnect)
  cbRef.current = onMessage
  reconnectRef.current = onReconnect

  useEffect(() => {
    let dead = false

    function connect() {
      if (dead) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!dead) {
          setConnected(true)
          reconnectRef.current?.()
        }
      }
      ws.onclose = () => {
        if (!dead) {
          setConnected(false)
          timerRef.current = setTimeout(connect, 3500)
        }
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data)) } catch {}
      }
    }

    connect()
    return () => {
      dead = true
      clearTimeout(timerRef.current)
      const ws = wsRef.current
      if (!ws) return
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close()
      } else {
        ws.close()
      }
    }
  }, [])

  return connected
}

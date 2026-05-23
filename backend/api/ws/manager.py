"""
api/ws/manager.py
-----------------
ConnectionManager: tracks active WebSocket clients and broadcasts to them.
The Redis subscriber loop runs as a FastAPI background task on startup.
"""

import asyncio
import json
import os
import redis.asyncio as aioredis
from fastapi import WebSocket

CHANNEL = "catalog:events"


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        print(f"[WS] client connected, total={len(self.active)}")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        print(f"[WS] client disconnected, total={len(self.active)}")

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def redis_subscriber():
    """
    Background task: subscribe to the Redis channel and forward every
    message to all connected WebSocket clients.
    Reconnects automatically if the connection drops.
    """
    url = os.getenv("REDIS_URL", "redis://redis:6379")
    while True:
        try:
            r = aioredis.from_url(url)
            pubsub = r.pubsub()
            await pubsub.subscribe(CHANNEL)
            print(f"[WS] subscribed to Redis channel: {CHANNEL}")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    print(f"[WS] received event: {data.get('event')} job={data.get('job_id')} clients={len(manager.active)}", flush=True)
                    await manager.broadcast(data)
                except Exception as e:
                    print(f"[WS] broadcast error: {e}")

        except asyncio.CancelledError:
            print("[WS] subscriber shutting down")
            raise
        except Exception as e:
            print(f"[WS] subscriber lost connection ({e}), reconnecting in 2s")
            await asyncio.sleep(2)
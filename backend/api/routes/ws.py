"""
api/routes/ws.py
----------------
WebSocket endpoint. Clients connect here to receive real-time pipeline events.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.ws.manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Keep the connection alive — we only push, but we need to
        # receive to detect disconnects (e.g. browser tab closed)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
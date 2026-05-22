"""
pipeline/events.py
------------------
Called by Celery workers to publish job status events to Redis.
Workers are separate processes from FastAPI, so they can't touch
the WebSocket connection list directly — Redis pub/sub bridges the gap.
"""

import os
import json
import redis

_redis = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
CHANNEL = "catalog:events"


def emit(event: str, payload: dict):
    """
    Publish an event to the catalog:events Redis channel.

    Args:
        event:   event name, e.g. "job.status"
        payload: dict merged into the published message
    """
    message = json.dumps({"event": event, **payload})
    try:
        _redis.publish(CHANNEL, message)
    except Exception as e:
        # Never let an emit failure crash the worker task
        print(f"[EVENTS] publish failed: {e}")
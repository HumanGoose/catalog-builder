import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "catalog_builder",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "pipeline.tasks.classify",
        "pipeline.tasks.group",
        "pipeline.tasks.extract",
        "pipeline.tasks.process",
        "pipeline.tasks.assign_to_slide",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    task_routes={
        "process_image": {"queue": "processing"},
    },
)
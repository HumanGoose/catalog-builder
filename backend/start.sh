#!/bin/sh
set -e

# Start gevent worker (I/O-bound: classify, group, extract)
celery -A celery_app worker --loglevel=info --pool=gevent --concurrency=20 --queues=celery &

# Start prefork worker (CPU-bound: image processing)
celery -A celery_app worker --loglevel=info --pool=prefork --concurrency=2 --queues=processing &

# Start API (foreground so container stays alive and receives signals)
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"

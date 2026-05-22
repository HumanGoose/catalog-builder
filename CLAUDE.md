# alaiy-catalog-builder

A full-stack automated garment catalog builder built as a job application project for Alaiy. Accepts raw garment photos, runs them through an AI classification + processing pipeline, and generates a PowerPoint catalog matching the reference template.

## Tech Stack

- **Backend:** Python 3.11 + FastAPI
- **Queue:** Celery + Redis (message broker)
- **Database:** SQLite via SQLAlchemy
- **Image processing:** rembg + Pillow
- **AI:** OpenRouter API (`google/gemini-flash-1.5`)
- **PPT generation:** python-pptx
- **Frontend:** React 18 + Tailwind CSS
- **Infra:** Docker Compose (5 services: redis, api, worker, flower, frontend)

## Pipeline Stages (per image)

```
UPLOADED → CLASSIFIED → SPEC_EXTRACTED → PROCESSED → ASSIGNED → DONE
```

Each stage is a separate Celery task chained together:
`classify_image → extract_specs → process_image → assign_to_slide`

## Database Models

| Model | Purpose |
|-------|---------|
| `Job` | One record per uploaded image — tracks status and extracted data |
| `GarmentGroup` | Groups front/back/detail/spec images of the same style |
| `Slide` | One per complete garment group — holds all editable PPT fields |

## API Routes

```
POST   /upload          — accept image uploads, create Job records
GET    /jobs            — list all jobs
GET    /jobs/{id}       — single job status
GET    /groups          — list garment groups
PATCH  /groups/{id}     — update group (manual reclassification)
GET    /slides          — list slides
PATCH  /slides/{id}     — edit slide fields before export
GET    /export/pptx     — trigger PPT generation, return file
WS     /ws              — WebSocket for real-time events
```

## WebSocket Events

| Event | When |
|-------|------|
| `job_update` | Every pipeline status change |
| `group_complete` | A garment group has all image types |
| `slide_ready` | A Slide record is created (includes image URLs) |
| `pipeline_complete` | All uploaded images are done |

## Folder Structure

```
catalog-builder/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py            ← FastAPI app entrypoint
│   ├── celery_app.py      ← Celery app instance
│   ├── api/
│   │   ├── routes/        ← upload.py, jobs.py, groups.py, slides.py, export.py
│   │   └── websocket.py
│   ├── pipeline/
│   │   └── tasks/         ← classify.py, extract.py, process.py, build_ppt.py
│   ├── models/
│   │   ├── database.py    ← SQLAlchemy engine + session
│   │   └── job.py         ← ORM models
│   └── storage/
│       ├── uploads/       ← raw incoming images
│       ├── processed/     ← background-removed + cleaned images
│       └── output/        ← final Catalog.pptx
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── App.jsx
        ├── components/    ← UploadZone, LiveCanvas, PipelineStatus, SlideEditor
        └── hooks/
            └── useWebSocket.js
```

## Dev Commands

```bash
# Start everything
docker compose up --build

# Start only backend services (no frontend)
docker compose up redis api worker flower

# View worker logs
docker compose logs -f worker

# Access Flower (Celery monitoring)
http://localhost:5555

# Access API docs
http://localhost:8000/docs

# Access frontend
http://localhost:3000

# Rebuild a single service
docker compose build api
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

Key variables: `OPENROUTER_API_KEY`, `REDIS_URL`, `DATABASE_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

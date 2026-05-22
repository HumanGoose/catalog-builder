# alaiy-catalog-builder

A full-stack automated garment catalog builder built as a job application project for Alaiy. Accepts raw garment photos, runs them through an AI classification + grouping pipeline, and generates a PowerPoint catalog matching the reference template.

## Tech Stack

- **Backend:** Python 3.11 + FastAPI
- **Queue:** Celery + Redis (message broker)
- **Database:** SQLite via SQLAlchemy
- **Image processing:** Pillow (EXIF correction, brightness/contrast enhancement, resize by type)
- **AI:** OpenRouter API — two models:
  - `google/gemini-2.0-flash-lite-001` for per-image classification
  - `google/gemini-2.5-flash` for visual batch grouping and spec extraction
- **PPT generation:** python-pptx (planned)
- **Frontend:** React 18 + Tailwind CSS (planned)
- **Infra:** Docker Compose (5 services: redis, api, worker, flower, frontend)

## Pipeline — Current Architecture

Upload triggers a Celery **chord**. After grouping, one chord is fired **per canonical group**:

```
For each image:
    UPLOADED → CLASSIFYING → CLASSIFIED
                                        ↘
                                         visual_group_images (runs once all done)
                                        ↗
All images classified (parallel)

After grouping — one chord per canonical group (triggered by group.py):
    spec jobs    → extract_specs  → SPEC_EXTRACTED ↘
                                                    assign_to_slide → ASSIGNED
    garment jobs → process_image → PROCESSED       ↗
    (all run in parallel within the group)
```

After grouping, each job gets one of:
- `GROUPED` — assigned to a style group with a role (front/back/detail/spec)
- `DUPLICATE` — near-identical to another image, skipped
- `NEEDS_REVIEW` — not assigned to any group by the AI

### Task details

| Task | File | What it does |
|------|------|-------------|
| `classify_image` | `pipeline/tasks/classify.py` | Calls Gemini Flash Lite to classify each image as `garment` or `spec`, sets `image_type` and `confidence` |
| `visual_group_images` | `pipeline/tasks/group.py` | Sends all thumbnails (300px) in one multi-image call to Gemini 2.5 Flash; returns groups with `best_front`, `best_back`, `details`, `spec`, `duplicates`; writes `style_group` and refined `image_type` back to each Job; then fires one chord per group (process_image / extract_specs → assign_to_slide) |
| `extract_specs` | `pipeline/tasks/extract.py` | For spec-type images, calls Gemini 2.5 Flash to parse the label and extract `reference_no`, `fabric`, `gsm`, `date`, `afs` into `Job.spec_data` |
| `process_image` | `pipeline/tasks/process.py` | For front/back/detail images, applies EXIF correction, brightness/contrast enhancement, and resizes (front/back→1200px, detail→600px); writes result to `storage/processed/` |
| `assign_to_slide` | `pipeline/tasks/assign_to_slide.py` | Chord callback per group — waits for all per-job tasks to finish, picks best image per role by confidence, merges spec data, upserts `GarmentGroup` and `Slide` records, marks all eligible jobs `ASSIGNED` |

### Job status flow

```
UPLOADED → CLASSIFYING → CLASSIFIED → GROUPED → PROCESSING → PROCESSED → ASSIGNED  (garment images)
                                              → EXTRACTING → SPEC_EXTRACTED → ASSIGNED (spec images)
                                    → DUPLICATE
                                    → NEEDS_REVIEW
                       → FAILED
```

### Job.image_type values

After classification: `garment` or `spec`  
After grouping: `front`, `back`, `detail`, `spec`, or `duplicate`

## Database Models

| Model | Purpose |
|-------|---------|
| `Job` | One record per uploaded image — tracks status, `image_type`, `style_group`, `confidence`, `spec_data`, `original_path`, `processed_path` |
| `GarmentGroup` | Groups front/back/detail/spec jobs of the same style — populated by `assign_to_slide` |
| `Slide` | One per complete garment group — holds all editable PPT fields; populated by `assign_to_slide` with ref_number, fabric, gsm, date, and image paths |

## API Routes

### Implemented

```
POST   /upload          — accept image uploads, create Job records, fire chord
GET    /jobs            — list all jobs (ordered by created_at desc)
GET    /jobs/{id}       — single job status
GET    /health          — liveness check
```

Static file mounts: `/uploads/*` and `/processed/*`

### Planned (not yet built)

```
GET    /groups          — list garment groups
PATCH  /groups/{id}     — update group (manual reclassification)
GET    /slides          — list slides
PATCH  /slides/{id}     — edit slide fields before export
GET    /export/pptx     — trigger PPT generation, return file
WS     /ws              — WebSocket for real-time events
```

## Folder Structure

```
catalog-builder/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                  ← FastAPI app, mounts static files, includes routers
│   ├── celery_app.py            ← Celery instance (auto-discovers all tasks)
│   ├── api/
│   │   └── routes/
│   │       ├── upload.py        ← POST /upload (chord dispatch)
│   │       └── jobs.py          ← GET /jobs, GET /jobs/{id}
│   ├── pipeline/
│   │   └── tasks/
│   │       ├── classify.py      ← classify_image task
│   │       ├── group.py         ← visual_group_images task (fires per-group chords)
│   │       ├── extract.py       ← extract_specs task
│   │       ├── process.py       ← process_image task
│   │       └── assign_to_slide.py ← assign_to_slide task (chord callback, builds GarmentGroup + Slide)
│   ├── models/
│   │   ├── database.py          ← SQLAlchemy engine + session
│   │   └── job.py               ← Job, GarmentGroup, Slide ORM models
│   └── storage/
│       ├── uploads/             ← raw incoming images
│       ├── processed/           ← cleaned + resized images
│       └── output/              ← final Catalog.pptx (planned)
└── frontend/                    ← not yet built
```

## Dev Commands

```bash
# Start backend services
docker compose up redis api worker flower

# View worker logs
docker compose logs -f worker

# Access Flower (Celery monitoring)
http://localhost:5555

# Access API docs
http://localhost:8000/docs

# Rebuild a single service
docker compose build api
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

Key variables: `OPENROUTER_API_KEY`, `REDIS_URL`, `DATABASE_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

# alaiy-catalog-builder

A full-stack automated garment catalog builder built as a job application project for Alaiy. Accepts raw garment photos, runs them through an AI classification + grouping pipeline, and generates a PowerPoint catalog matching the reference template.

## Tech Stack

- **Backend:** Python 3.11 + FastAPI
- **Queue:** Celery + Redis (message broker)
- **Database:** PostgreSQL 16 via SQLAlchemy (psycopg2-binary); `postgres_data` named volume persists across restarts
- **Image processing:** Pillow (EXIF correction, brightness/contrast enhancement, resize by type)
- **AI:** OpenRouter API — two models:
  - `google/gemini-2.0-flash-lite-001` for per-image classification
  - `google/gemini-2.5-flash` for visual batch grouping and spec extraction
- **PPT generation:** python-pptx (planned)
- **Frontend:** React 18 + Tailwind CSS + `@dnd-kit/core` (interactive canvas view)
- **Infra:** Docker Compose (6 services: redis, postgres, api, worker, flower, frontend)
- **Worker pool:** gevent (`--pool=gevent --concurrency=20`) — I/O-bound tasks (API calls) run as greenlets, not processes

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
| `classify_image` | `pipeline/tasks/classify.py` | Resizes image to 300px thumbnail before sending (same as group.py) — sending full 3–6MB images causes 17–27s API calls; thumbnails bring it to ~1–2s. Sets `image_type` and `confidence` |
| `visual_group_images` | `pipeline/tasks/group.py` | Sends all thumbnails (300px) in one multi-image call to Gemini 2.5 Flash; returns groups with `best_front`, `best_back`, `details`, `spec`, `duplicates`; writes `style_group` and refined `image_type` back to each Job; then fires one chord per group (process_image / extract_specs → assign_to_slide) |
| `extract_specs` | `pipeline/tasks/extract.py` | For spec-type images, calls Gemini 2.5 Flash to parse the label and extract `reference_no`, `fabric`, `gsm`, `date`, `afs` into `Job.spec_data` |
| `process_image` | `pipeline/tasks/process.py` | For front/back/detail images, applies EXIF correction, brightness/contrast enhancement, and resizes (front/back→1200px, detail→600px); writes result to `storage/processed/` |
| `assign_to_slide` | `pipeline/tasks/assign_to_slide.py` | Chord callback per group — waits for all per-job tasks to finish, picks best image per role by confidence, merges spec data, upserts `GarmentGroup` and `Slide` records, marks all eligible jobs `ASSIGNED` |
| `emit` (helper)   | `pipeline/events.py`                | Called by every task to publish job status events to Redis channel `catalog:events`; FastAPI startup subscribes and broadcasts to all connected WS clients |

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
PATCH  /jobs/{id}       — update style_group and/or image_type; emits job.reassigned WS event;
                          auto-promotes NEEDS_REVIEW → ASSIGNED when style_group is set;
                          setting style_group=null resets job to NEEDS_REVIEW;
                          changing image_type away from "duplicate" promotes DUPLICATE → ASSIGNED/NEEDS_REVIEW;
                          calls _sync_slide() for affected groups and emits group.complete with slide_id
GET    /groups          — list GarmentGroups with their member jobs
GET    /groups/{id}     — single group with member jobs
POST   /groups          — create a new empty group; emits group.created WS event
PATCH  /groups/{id}     — rename style_name and/or style_number; cascades style_group rename to member Jobs; emits group.updated
DELETE /groups/{id}     — delete group; moves all member jobs back to NEEDS_REVIEW; emits group.deleted
GET    /health          — liveness check
WS     /ws              — WebSocket for real-time pipeline events (push-only; clients send to detect disconnect)
```

Static file mounts: `/uploads/*` and `/processed/*`

### Also implemented (in `api/routes/export.py`)

```
GET    /slides          — list slides
GET    /slides/{id}     — single slide
PATCH  /slides/{id}     — edit slide fields; sets is_edited=True to prevent pipeline overwrites
POST   /export/pptx     — session-scoped export: accepts {slide_ids, layouts}
POST   /export/pdf      — same as pptx but converts via LibreOffice (requires libreoffice-impress in container)
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
│   │   ├── routes/
│   │   │   ├── upload.py        ← POST /upload (chord dispatch)
│   │   │   ├── jobs.py          ← GET /jobs, GET /jobs/{id}, PATCH /jobs/{id}
│   │   │   ├── groups.py        ← GET/POST /groups, GET/PATCH/DELETE /groups/{id}
│   │   │   └── ws.py            ← WS /ws endpoint
│   │   └── ws/
│   │       └── manager.py       ← ConnectionManager + redis_subscriber (started on FastAPI startup)
│   ├── pipeline/
│   │   ├── events.py            ← emit() — publishes job events to Redis from workers
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
└── frontend/
    ├── src/
    │   ├── App.jsx              ← root; DndContext lives here so Canvas + Tray share one drag context
    │   ├── components/
    │   │   ├── Canvas.jsx       ← infinite pan/zoom canvas (mouse drag = pan, scroll = zoom)
    │   │   ├── GroupCard.jsx    ← repositionable group card + @dnd-kit drop zone; click header (no drag) → GroupModal
    │   │   ├── GroupModal.jsx   ← expand modal: shows all jobs in a group with role badges; Esc to close
    │   │   ├── ImageThumbnail.jsx ← draggable chip (@dnd-kit useDraggable); click (no drag) → ImageModal
    │   │   ├── ImageModal.jsx   ← image detail + role editor; PATCH /jobs/{id} on save; Esc to close
    │   │   ├── Tray.jsx         ← sidebar of unassigned jobs; also a drop target
    │   │   ├── PipelineGrid.jsx ← monitoring view (status grid)
    │   │   ├── SlideReview.jsx
    │   │   ├── UploadPanel.jsx
    │   │   ├── Header.jsx
    │   │   ├── JobCard.jsx
    │   │   └── StatusBadge.jsx
    │   └── hooks/
    │       ├── useGroups.js     ← group state; session-scoped (starts empty, grows via WS)
    │       ├── useJobs.js       ← job state; session-scoped (same pattern)
    │       └── useWebSocket.js  ← shared WS connection with auto-reconnect
```

## Real-time Events

Workers can't touch FastAPI's WebSocket list (separate process). Bridge: workers call `pipeline/events.py:emit()` → Redis pub/sub channel `catalog:events` → `api/ws/manager.py:redis_subscriber()` (started as `asyncio.create_task` on FastAPI startup) → broadcasts to all connected WS clients.

### WebSocket event catalogue

| Event | Emitted by | Payload highlights |
|---|---|---|
| `job.status` | every pipeline task | `job_id`, `status`, `image_type`, `style_group` |
| `group.complete` | `assign_to_slide` + `PATCH /jobs/{id}` | `group_id`, `slide_id`, `group` (style_name), `has_front/back/detail/spec` |
| `job.reassigned` | `PATCH /jobs/{id}` | `job_id`, `from_group`, `to_group` (null = moved to tray), `image_type`, `status`, `original_path`, `processed_path` |
| `group.created` | `POST /groups` | `group_id`, `style_name`, `style_number` |
| `group.updated` | `PATCH /groups/{id}` | `group_id`, `style_name`, `style_number`, `old_name` |
| `group.deleted` | `DELETE /groups/{id}` | `group_id`, `style_name` |

## Frontend Architecture

### Canvas (interactive grouping view)
- `Canvas.jsx` — pan/zoom canvas; pan with **mouse drag** on background, zoom with scroll wheel; contains `NewGroupButton` (top-left) which expands inline to an input — Enter or "Create" calls `POST /groups`
- `GroupCard.jsx` — drag header to reposition card; **click without moving** (< 3px) fires `onGroupClick` to open GroupModal; drop zone via `@dnd-kit/core`
- `GroupModal.jsx` — full-screen overlay listing all jobs in a group; click group name to inline-rename (PATCH /groups/{id}); trash icon with confirmation step to delete group; clicking an image thumbnail opens ImageModal; Esc closes (or cancels rename/delete confirmation if in progress)
- `ImageThumbnail.jsx` — draggable chip via `useDraggable`; passes `{ job, groupId }` as drag data; **click (no drag)** opens ImageModal
- `ImageModal.jsx` — shows full image + current role; lets user change `image_type` via PATCH; Esc closes
- `Tray.jsx` — sidebar for jobs not yet in any group; also a `useDroppable` with `id="tray"`
- `DndContext` must be in `App.jsx` (parent of both Canvas and Tray) so sibling components share the same drag context
- Canvas uses **mouse events** for pan — avoids conflict with `@dnd-kit` which uses pointer events
- `PointerSensor` has `activationConstraint: { distance: 8 }` — prevents drag from firing on short taps, so onClick handlers work reliably

### Session-scoping pattern for data hooks
Both `useJobs` and `useGroups` start empty and never auto-load DB history:
- Items arrive via WS events or explicit upload responses only
- On WS reconnect, only re-fetch IDs already known in local state (`knownIds.size > 0` guard)
- Apply this same pattern to any new data hook to keep the UI session-scoped

`useGroups` exposes `createGroup(name)`, `renameGroup(groupId, newName)`, `deleteGroup(groupId)` — each calls the REST API and updates local state optimistically. Also handles `group.created`, `group.updated`, `group.deleted` WS events (for multi-tab sync).

`useJobs` handles `group.deleted` — resets all in-memory jobs whose `style_group` matches the deleted group's `style_name` to `NEEDS_REVIEW`.

`useSlides` handles `group.complete` (adds/refreshes a slide by fetching `slide_id`) and `group.deleted` (removes the matching slide by `group_id`). Slides are keyed by `id`; matched to groups via `slide.group_id`.

## Dev Commands

```bash
# Start all services
docker compose up redis postgres api worker flower

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

## Dev Quirks & Gotchas

### httpx vs requests in Celery tasks
- **Never use `httpx` in Celery tasks when running `--pool=gevent`** — httpx runs its own asyncio event loop internally which gevent cannot monkey-patch, making all API calls effectively serial despite high concurrency
- Use `requests` instead — it uses `urllib3` → stdlib `socket` which gevent patches for cooperative I/O

### Rebuilding a service after requirements.txt changes
- `docker compose build <svc>` rebuilds the image but `docker compose up -d <svc>` may reuse the old container
- Always follow with `docker compose up -d --force-recreate <svc>` to guarantee the new image is used

### WebSocket / Redis subscriber
- `asyncio.create_task(redis_subscriber())` tasks are killed by uvicorn `--reload` on every file save. The subscriber must have a `while True` retry loop and re-raise `asyncio.CancelledError` to be resilient.
- Use `lifespan` context manager (not deprecated `@app.on_event("startup")`) — it properly cancels background tasks on shutdown.
- Verify subscription is live: `docker compose exec redis redis-cli pubsub numsub catalog:events` → should return `1` while API is up.
- Publish a test event: `docker compose exec redis redis-cli publish catalog:events '{"event":"job.status","job_id":"test","status":"CLASSIFYING"}'`

### Docker / Python logging
- Python stdout is block-buffered in Docker — `print()` inside long-running async tasks may not appear in `docker compose logs`. Use `print(..., flush=True)` or add `ENV PYTHONUNBUFFERED=1` to Dockerfile.

### Image path → URL conversion
- Paths in DB: `storage/uploads/<id>.jpg` / `storage/processed/<id>.jpg`
- Static mounts serve at `/uploads/` and `/processed/` — no `storage/` prefix
- Always strip it: `path.replace(/^storage\//, '')` — see `JobCard.jsx:imgUrl()` for the canonical helper

### Adding npm packages to the frontend container
- `docker compose build frontend` bakes packages into the image, but `docker compose up` reuses the old anonymous `node_modules` volume from the previous container
- After a rebuild that adds packages: `docker compose exec frontend npm install`
- The anonymous volume is declared as `/app/node_modules` in docker-compose.yml to prevent the host mount from wiping installed packages

### Frontend (React dev)
- React StrictMode mounts effects twice → two WS connections briefly (`total=2` in API logs). Normal in dev; only one persists.
- If hooks change order between HMR updates (e.g. adding/removing `useEffect`), React throws a hook-order error. Fix: hard refresh (Ctrl+Shift+R) to clear HMR state.

### useJobs status ranking
- `useJobs` maintains a `STATUS_RANK` map. When merging a new update, it keeps whichever status is further along the pipeline. This prevents the upload response (`status=UPLOADED`) from clobbering a status that arrived via WebSocket before the HTTP response returned.
- `handleEvent` for `job.status` silently ignores events for job IDs not already in local state — prevents ghost cards from stale Celery tasks left over from a previous worker session.
- `job.reassigned` payload: `to_group` is `null` when a job is moved to the tray (not `undefined`). The handler checks `!== undefined` rather than truthiness so null is applied correctly.
- `patchJob(id, fields)` — optimistic single-job update; bypasses STATUS_RANK, use for immediate UI feedback on drag before WS round-trip.

### Slide ↔ Job matching
- `slide.style_number` = canonical group slug — always matches `job.style_group`; use this for joins
- `slide.style_name` = `ref_no or canonical_name` — can be overwritten with a spec reference number; do NOT use for matching jobs
- `CatalogView` reads `slides` state (DB records written once by `assign_to_slide`). Manual job moves on the canvas don't update `Slide` records. Fix: compute `liveSlides` in `App.jsx` merging `slides` metadata with live image paths from `jobs` state, then pass `liveSlides` to `CatalogView`.
- When computing `liveSlides`, fall back to `null` (not `slide.*_image_path`) if no live job found for a role — the DB path is stale when a job has been removed from the group.

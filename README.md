# Catalog Builder

An automated garment catalog builder. Upload raw garment photos, watch them flow through an AI classification and grouping pipeline, then export a PowerPoint catalog matching the reference template.

## How it works

1. Upload garment images through the web UI
2. Each image is classified (front, back, detail, or spec label) by Gemini 2.0 Flash Lite
3. Images are visually grouped into style groups by Gemini 2.5 Flash
4. Processed images and extracted spec data are assembled into slides
5. Review and edit groupings on the interactive canvas, then export to PPTX

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- An [OpenRouter](https://openrouter.ai) API key (used for Gemini 2.0 Flash Lite and Gemini 2.5 Flash)

## Setup

**1. Clone the repo**

```bash
git clone https://github.com/HumanGoose/catalog-builder.git
cd catalog-builder
```

**2. Create your `.env` file**

```bash
cp .env.example .env
```

Open `.env` and replace `your_openrouter_api_key_here` with your actual OpenRouter API key. Leave the other values as-is.

**3. Start all services**

```bash
docker compose up redis postgres api worker worker-process frontend
```

The first run will build the Docker images, which takes a few minutes. Subsequent starts are fast.

**4. Open the app**

Go to `http://localhost:3000` in your browser.

## Usage

- **Upload** images using the upload panel (top bar)
- **Watch** the pipeline grid to see each image move through: Uploaded -> Classifying -> Classified -> Grouped -> Processing -> Assigned
- **Canvas** shows style groups with their assigned images; drag images between groups to reassign
- **Tray** (right sidebar) holds images that could not be automatically grouped; drag them onto a group card to assign
- **Slide Review** tab shows the final catalog slides with extracted spec data; click a slide to edit fields

## Services

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | React UI |
| API | http://localhost:8000 | FastAPI backend |
| API docs | http://localhost:8000/docs | Interactive API reference |
| Flower | http://localhost:5555 | Celery task monitoring |

## Stopping

```bash
docker compose down
```

To also wipe the database (start fresh):

```bash
docker compose down -v
```

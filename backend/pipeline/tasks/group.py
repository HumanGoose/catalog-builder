import os
import base64
import json
import io
import requests
from PIL import Image
from celery_app import celery_app
from models.database import SessionLocal
from models.job import Job
from celery import chord
from pipeline.tasks.assign_to_slide import assign_to_slide
from pipeline.tasks.extract import extract_specs
from pipeline.tasks.process import process_image
from pipeline.events import emit

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Smaller than classify thumbnails (300px) because we send ALL images in one call.
# Keeping them at 200px / quality 60 keeps the JSON payload under ~400KB for
# batches of 30, well within OpenRouter's request-body limit.
_GROUP_THUMB_PX = 200
_GROUP_THUMB_Q  = 60


def encode_image(path, max_size=_GROUP_THUMB_PX):
    with Image.open(path) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=_GROUP_THUMB_Q)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


@celery_app.task(bind=True, name="visual_group_images", max_retries=5)
def visual_group_images(self, classify_results, job_ids: list):
    db = SessionLocal()
    try:
        jobs = db.query(Job).filter(Job.id.in_(job_ids)).all()
        valid_jobs = [j for j in jobs if j.status in ("CLASSIFIED", "GROUPING")]

        if not valid_jobs:
            return {"grouped": 0}

        # Garment images first, spec images last
        garment_jobs = [j for j in valid_jobs if j.image_type == "garment"]
        spec_jobs = [j for j in valid_jobs if j.image_type == "spec"]
        spec_count = len(spec_jobs)
        ordered_jobs = garment_jobs + spec_jobs

        print(f"[GROUP] Grouping {len(ordered_jobs)} images ({len(garment_jobs)} garments, {len(spec_jobs)} specs)")

        # Build message content before committing status change
        content = []
        for job in ordered_jobs:
            content.append({
                "type": "text",
                "text": f"Image ID: {job.id} | filename: {job.filename} | type: {job.image_type}"
            })
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{encode_image(job.original_path)}"
                }
            })

        content.append({
            "type": "text",
            "text": f"""Group these garment images and spec labels into product groups for a fashion catalog.

        There are {spec_count} spec label images, suggesting roughly {spec_count} unique garment styles — but create as many or as few groups as the images actually warrant. When in doubt, create MORE groups rather than fewer: two separate groups for the same garment can be manually merged, but two unrelated garments in the same group breaks the catalog.

        === RULE 1 — FILENAME PROXIMITY IS THE PRIMARY SIGNAL (most important rule) ===
        Images taken in the same shooting session are the same garment. Use these filename patterns:
        - DSC-style: "DSC03601.JPG", "DSC03602.JPG" — sequential numbers within ~10 = same session = same garment.
        - Timestamp-style: "20260406_095838.jpg", "20260406_095843.jpg" — within ~5 minutes = same session = same garment.

        CRITICAL: Images from DIFFERENT sessions are DIFFERENT garments, even if they look visually similar (same color, same style).
        - DSC03601 vs DSC03650 → DIFFERENT garments (gap of 49 = different session)
        - Timestamps 10+ minutes apart → DIFFERENT garments
        - Only merge cross-session images if you are 100% certain they are literally the same physical item (exact same fabric texture, stitching, and color match).
        - When uncertain whether two sessions show the same garment: CREATE SEPARATE GROUPS.

        === RULE 2 — ASSIGNING ROLES ===
        - best_front: The clearest full-garment shot with the front visible (collar, placket, buttons, or chest facing camera). Pick the sharpest one. Extra front shots of the same garment that are nearly identical go in duplicates; otherwise create a separate group.
        - best_back: Any full-garment photo where the BACK is shown (back seam visible, no front buttons/placket). This includes photos where you cannot see the front opening. NEVER put a full-body back view in "details" — if it shows the whole garment from behind, it is best_back, always.
        - details: Genuine close-up shots of a small part of the garment. Valid detail types include: collar close-up, pocket detail, fabric texture macro, label/logo close-up, AND close-up shots of any graphic, print, embroidery, or artwork on the garment. A graphic detail shot may look very different from the full garment (it may show only an illustration or print) — this is fine; use filename proximity to link it to the correct garment group. A photo showing the FULL garment from ANY angle is NEVER a detail — it is best_front, best_back, or belongs to a different group.
        - spec: the printed spec label/hangtag. Match to garment group using filename proximity as the primary signal, then by any color swatch visible on the label.
        - duplicates: ONLY for photos that are literally the same shot taken twice (burst mode, accidental re-shoot). The framing, angle, and lighting must be nearly identical. Rules: (a) two different garments are NEVER duplicates; (b) a back view is NEVER a duplicate of a front view; (c) if there is any doubt, do NOT duplicate — either assign to a role or create a new group.

        === RULE 3 — EVERY FULL-GARMENT PHOTO MUST GO SOMEWHERE ===
        Every photo showing the full garment must be assigned to best_front, best_back, or its own group. Never silently discard a garment photo by marking it a duplicate unless it is genuinely a repeated identical shot.

        === RULE 4 — SPEC MATCHING ===
        Match each spec label to the garment group by filename proximity. If two spec labels appear near each other in filename order, check their color swatches — they likely belong to different garment groups.

        Respond with ONLY this JSON (no markdown, no explanation):
        {{
        "groups": [
            {{
            "canonical_name": "descriptive-slug",
            "best_front": "job_id or null",
            "best_back": "job_id or null",
            "details": ["job_id"],
            "spec": "job_id or null",
            "duplicates": ["job_id"]
            }}
        ]
        }}"""
        })

        # Signal grouping has started — gives immediate UI feedback while the slow API call runs
        for job in valid_jobs:
            job.status = "GROUPING"
            emit("job.status", {"job_id": job.id, "status": "GROUPING", "image_type": job.image_type})
        db.commit()

        payload = {
            "model": "google/gemini-2.5-flash",
            "max_tokens": 8000,
            "messages": [{"role": "user", "content": content}]
        }
        payload_kb = len(json.dumps(payload).encode()) / 1024
        print(f"[GROUP] Sending request: {len(ordered_jobs)} images, payload={payload_kb:.0f}KB", flush=True)

        response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=240.0
        )

        response.raise_for_status()
        result = response.json()

        usage = result.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cost_usd = (prompt_tokens / 1_000_000 * 0.15) + (completion_tokens / 1_000_000 * 0.60)
        print(f"[USAGE] visual_group prompt_tokens={prompt_tokens} completion_tokens={completion_tokens} cost=${cost_usd:.6f}")

        content_text = result["choices"][0]["message"]["content"].strip()
        if content_text.startswith("```"):
            content_text = content_text.split("```")[1]
            if content_text.startswith("json"):
                content_text = content_text[4:]
        content_text = content_text.strip()
        spec_job_ids = []
        parsed = json.loads(content_text)

        # Write results to database
        for group in parsed["groups"]:
            canonical = group["canonical_name"]

            if group.get("best_front"):
                job = db.query(Job).filter(Job.id == group["best_front"]).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "front"
                    job.status = "GROUPED"
                    emit("job.status", {"job_id": job.id, "status": "GROUPED", "image_type": "front", "style_group": canonical})

            if group.get("best_back"):
                job = db.query(Job).filter(Job.id == group["best_back"]).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "back"
                    job.status = "GROUPED"
                    emit("job.status", {"job_id": job.id, "status": "GROUPED", "image_type": "back", "style_group": canonical})

            for detail_id in group.get("details", []):
                job = db.query(Job).filter(Job.id == detail_id).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "detail"
                    job.status = "GROUPED"
                    emit("job.status", {"job_id": job.id, "status": "GROUPED", "image_type": "detail", "style_group": canonical})

            if group.get("spec"):
                spec_job_ids.append(group["spec"])
                job = db.query(Job).filter(Job.id == group["spec"]).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "spec"
                    job.status = "GROUPED"
                    emit("job.status", {"job_id": job.id, "status": "GROUPED", "image_type": "spec", "style_group": canonical})

            for dup_id in group.get("duplicates", []):
                job = db.query(Job).filter(Job.id == dup_id).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "duplicate"
                    job.status = "DUPLICATE"
                    emit("job.status", {"job_id": job.id, "status": "DUPLICATE", "style_group": canonical})

        db.flush()
        
        ungrouped = db.query(Job).filter(
            Job.id.in_(job_ids),
            Job.status == "GROUPING"
        ).all()
        for job in ungrouped:
            job.status = "NEEDS_REVIEW"
            emit("job.status", {"job_id": job.id, "status": "NEEDS_REVIEW"})
            print(f"[GROUP] Job {job.id} ({job.filename}) was not assigned to any group")

        db.commit()

        # ------------------------------------------------------------------
        # Fan out: one chord per canonical group.
        # Each chord runs all per-job tasks in parallel, then fires
        # assign_to_slide once everything in that group is done.
        # ------------------------------------------------------------------
        # Reload jobs to get fresh status/style_group after commit
        grouped_jobs = (
            db.query(Job)
            .filter(Job.id.in_(job_ids), Job.status == "GROUPED")
            .all()
        )
 
        # Bucket jobs by canonical group name
        by_group: dict[str, list] = {}
        for job in grouped_jobs:
            by_group.setdefault(job.style_group, []).append(job)
 
        for canonical_name, group_jobs in by_group.items():
            per_job_sigs = []
            for job in group_jobs:
                if job.image_type == "spec":
                    per_job_sigs.append(extract_specs.s(job.id))
                else:
                    per_job_sigs.append(process_image.s(job.id))

            if per_job_sigs:
                batch_ids = [j.id for j in group_jobs]
                chord(per_job_sigs)(
                    assign_to_slide.s(canonical_name, batch_ids)
                )

        db.commit()
        
        return {
            "grouped": len(parsed["groups"]),
            "groups": [{"name": g["canonical_name"]} for g in parsed["groups"]]
        }

    except Exception as e:
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()
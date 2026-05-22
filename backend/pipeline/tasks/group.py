import os
import base64
import json
import io
import httpx
from PIL import Image
from celery_app import celery_app
from models.database import SessionLocal
from models.job import Job
from celery import chord
from pipeline.tasks.assign_to_slide import assign_to_slide
from pipeline.tasks.extract import extract_specs
from pipeline.tasks.process import process_image

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def encode_image(path, max_size=300):
    with Image.open(path) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=70)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


@celery_app.task(bind=True, name="visual_group_images", max_retries=5)
def visual_group_images(self, classify_results, job_ids: list):
    db = SessionLocal()
    try:
        jobs = db.query(Job).filter(Job.id.in_(job_ids)).all()
        valid_jobs = [j for j in jobs if j.status == "CLASSIFIED"]

        if not valid_jobs:
            return {"grouped": 0}

        # Garment images first, spec images last
        garment_jobs = [j for j in valid_jobs if j.image_type == "garment"]
        spec_jobs = [j for j in valid_jobs if j.image_type == "spec"]
        spec_count = len(spec_jobs)
        ordered_jobs = garment_jobs + spec_jobs

        print(f"[GROUP] Grouping {len(ordered_jobs)} images ({len(garment_jobs)} garments, {len(spec_jobs)} specs)")
        

        # Build message — all images as thumbnails in one call
        content = []
        for job in ordered_jobs:
            content.append({
                "type": "text",
                "text": f"Image ID: {job.id} (type: {job.image_type})"
            })
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{encode_image(job.original_path)}"
                }
            })

        content.append({
            "type": "text",
            "text": f"""Group these garment images and spec labels into product groups for a catalog.

        Context: There are {spec_count} spec label images in this batch, which indicates approximately {spec_count} unique garment styles. Some garments may be missing a spec label.

        Rules:
        1. Group images that show the same physical garment together.
        - Same garment = same fabric texture, color, and silhouette
        - When in doubt, GROUP TOGETHER rather than split
        - Only create separate groups if garments are clearly different products

        2. Within each group identify:
        - best_front: clearest front-facing photo (collar/placket/buttons visible from front). Pick best if multiple.
        - best_back: clearest back-facing photo (plain back panel, no front buttons). Pick best if multiple.
        - details: all close-up images showing specific parts, fabric texture, or design elements. Keep ALL.
        - spec: the spec label image — match to garment by fabric visible in background/edges of the label
        - duplicates: near-identical images — keep only the best one, list the rest here

        3. If unsure whether an image is front or back, put it in details.

        Respond with only this JSON, no other text:
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

        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.5-flash",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": content}]
            },
            timeout=120.0
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

            if group.get("best_back"):
                job = db.query(Job).filter(Job.id == group["best_back"]).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "back"
                    job.status = "GROUPED"

            for detail_id in group.get("details", []):
                job = db.query(Job).filter(Job.id == detail_id).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "detail"
                    job.status = "GROUPED"

            if group.get("spec"):
                spec_job_ids.append(group["spec"])
                job = db.query(Job).filter(Job.id == group["spec"]).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "spec"
                    job.status = "GROUPED"

            for dup_id in group.get("duplicates", []):
                job = db.query(Job).filter(Job.id == dup_id).first()
                if job:
                    job.style_group = canonical
                    job.image_type = "duplicate"
                    job.status = "DUPLICATE"

        db.flush()
        
        ungrouped = db.query(Job).filter(
            Job.id.in_(job_ids),
            Job.status == "CLASSIFIED"
        ).all()
        for job in ungrouped:
            job.status = "NEEDS_REVIEW"
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
                    job.status = "EXTRACTING"
                    per_job_sigs.append(extract_specs.s(job.id))
                else:
                    job.status = "PROCESSING"
                    per_job_sigs.append(process_image.s(job.id))
 
            if per_job_sigs:
                # chord: all per-job tasks → assign_to_slide callback
                chord(per_job_sigs)(
                    assign_to_slide.s(canonical_name)
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
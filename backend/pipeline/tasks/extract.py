import os
import io
import base64
import json
import re
import requests
from PIL import Image
from celery_app import celery_app
from models.database import SessionLocal
from models.job import Job
from pipeline.events import emit


def _thumbnail_b64(path, max_size=800):
    with Image.open(path) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@celery_app.task(bind=True, name="extract_specs", max_retries=3)
def extract_specs(self, job_id: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        if job.image_type != "spec":
            return {"job_id": job_id, "skipped": True}

        job.status = "EXTRACTING"
        db.commit()
        emit("job.status", {"job_id": job_id, "status": "EXTRACTING"})

        image_data = _thumbnail_b64(job.original_path)
        media_type = "image/jpeg"

        prompt = """Extract the specification data from this garment label image.

Look for these fields:
- reference_no: the reference or style number (e.g. "AND 5144", "FH AND-1208", "SD-BOG-002")
- fabric: the fabric composition (e.g. "100% COTTON", "60% ORGANIC COTTON 40% RECYCLED POLYESTER")
- gsm: the GSM value as a number (e.g. 270, 205, 220)
- date: any date visible (e.g. "01-04-2026", "24-03-2026")
- afs: the AFS number if visible (e.g. "AFS-4386", "AFS-4354")

If a field is not visible or not legible, use null.

Respond with only this JSON:
{
  "reference_no": "...",
  "fabric": "...",
  "gsm": 000,
  "date": "...",
  "afs": "..."
}"""

        response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.0-flash-lite-001",
                "max_tokens": 200,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{image_data}"
                                }
                            },
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
            },
            timeout=30.0
        )

        response.raise_for_status()
        result = response.json()

        usage = result.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cost_usd = (prompt_tokens / 1_000_000 * 0.15) + (completion_tokens / 1_000_000 * 0.60)
        print(f"[USAGE] extract_specs job={job_id} prompt_tokens={prompt_tokens} completion_tokens={completion_tokens} cost=${cost_usd:.6f}")

        content = result["choices"][0]["message"]["content"].strip()

        # Strip markdown fences if present
        if "```" in content:
            parts = content.split("```")
            if len(parts) >= 2:
                content = parts[1]
                if content.startswith("json"):
                    content = content[4:]
        content = content.strip()

        # Extract the first {...} block — handles any surrounding text the model adds
        m = re.search(r'\{.*\}', content, re.DOTALL)
        if m:
            content = m.group()

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            print(f"[EXTRACT] JSON parse failed for job {job_id}, using empty spec_data. Raw: {content[:300]}", flush=True)
            parsed = {}

        job.spec_data = parsed
        job.status = "SPEC_EXTRACTED"
        db.commit()
        emit("job.status", {"job_id": job_id, "status": "SPEC_EXTRACTED", "spec_data": parsed})

        return {"job_id": job_id, "spec_data": parsed}

    except json.JSONDecodeError:
        # Already handled above; this branch is unreachable but keeps the retry
        # handler below from swallowing parse failures as retryable errors.
        raise
    except Exception as e:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "FAILED"
            job.error = str(e)
            db.commit()
            emit("job.status", {"job_id": job_id, "status": "FAILED"})
        raise self.retry(exc=e, countdown=5)
    finally:
        db.close()
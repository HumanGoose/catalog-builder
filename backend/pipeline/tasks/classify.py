import os
import base64
import json
import httpx
from celery_app import celery_app
from models.database import SessionLocal
from models.job import Job
from pipeline.events import emit

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def update_job(db, job_id, **kwargs):
    job = db.query(Job).filter(Job.id == job_id).first()
    if job:
        for key, value in kwargs.items():
            setattr(job, key, value)
        db.commit()
    return job


@celery_app.task(bind=True, name="classify_image", max_retries=3)
def classify_image(self, job_id: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        update_job(db, job_id, status="CLASSIFYING")
        emit("job.status", {"job_id": job_id, "status": "CLASSIFYING"})

        with open(job.original_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        ext = os.path.splitext(job.original_path)[1].lower()
        media_type = "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/png"

        prompt = """Is this a garment image or a spec label?

- garment: any photo of a clothing item (front, back, detail, close-up)
- spec: a printed label or card with text showing reference number, fabric content, GSM

Respond with only this JSON:
{"type": "garment", "confidence": 0.0}
or
{"type": "spec", "confidence": 0.0}"""

        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.0-flash-lite-001",
                "max_tokens": 50,
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

        # Log usage
        usage = result.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cost_usd = (prompt_tokens / 1_000_000 * 0.075) + (completion_tokens / 1_000_000 * 0.30)
        print(f"[USAGE] classify job={job_id} prompt_tokens={prompt_tokens} completion_tokens={completion_tokens} cost=${cost_usd:.6f}")

        content = result["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()

        parsed = json.loads(content)
        image_type = "spec" if parsed["type"] == "spec" else "garment"

        update_job(db, job_id,
            status="CLASSIFIED",
            image_type=image_type,
            confidence=parsed.get("confidence", 0.0)
        )
        emit("job.status", {"job_id": job_id, "status": "CLASSIFIED", "image_type": image_type})
        
        return {"job_id": job_id, "image_type": image_type}

    except Exception as e:
        update_job(db, job_id, status="FAILED", error=str(e))
        emit("job.status", {"job_id": job_id, "status": "FAILED"})
        raise self.retry(exc=e, countdown=5)
    finally:
        db.close()
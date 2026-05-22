import os
from PIL import Image, ImageEnhance, ImageOps
from celery_app import celery_app
from models.database import SessionLocal
from models.job import Job
from pipeline.events import emit

PROCESSED_DIR = "storage/processed"


def clean_image(input_path, output_path, image_type):
    img = Image.open(input_path).convert("RGB")
    img = ImageOps.exif_transpose(img)
    
    # Subtle enhancement for consistency across different cameras/lighting
    img = ImageEnhance.Brightness(img).enhance(1.05)
    img = ImageEnhance.Contrast(img).enhance(1.1)
    
    if image_type in ("front", "back"):
        img.thumbnail((1200, 1200), Image.LANCZOS)
    elif image_type == "detail":
        img.thumbnail((600, 600), Image.LANCZOS)
    
    img.save(output_path, "JPEG", quality=90)
    return output_path


@celery_app.task(bind=True, name="process_image", max_retries=3)
def process_image(self, job_id: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        if job.image_type not in ("front", "back", "detail"):
            job.status = "PROCESSED"
            db.commit()
            return {"job_id": job_id, "skipped": True}

        job.status = "PROCESSING"
        db.commit()
        emit("job.status", {"job_id": job_id, "status": "PROCESSING"})

        original_filename = os.path.basename(job.original_path)
        name_without_ext = os.path.splitext(original_filename)[0]
        output_filename = f"{name_without_ext}_processed.jpg"
        output_path = os.path.join(PROCESSED_DIR, output_filename)

        print(f"[PROCESS] Processing {job.image_type} image: {original_filename}")
        actual_output_path = clean_image(job.original_path, output_path, job.image_type)

        job.processed_path = actual_output_path
        job.status = "PROCESSED"
        db.commit()
        emit("job.status", {"job_id": job_id, "status": "PROCESSED", "processed_path": actual_output_path})

        print(f"[PROCESS] Done: {actual_output_path}")
        return {"job_id": job_id, "processed_path": actual_output_path}

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
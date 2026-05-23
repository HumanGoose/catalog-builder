import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from celery import chord
from models.database import get_db
from models.job import Job
from pipeline.tasks.classify import classify_image
from pipeline.tasks.group import visual_group_images

router = APIRouter()

UPLOAD_DIR = "storage/uploads"

@router.post("/upload")
async def upload_images(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    created_jobs = []

    for file in files:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"{file.filename} is not an image")

        job_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1]
        saved_filename = f"{job_id}{ext}"
        save_path = os.path.join(UPLOAD_DIR, saved_filename)

        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        job = Job(
            id=job_id,
            filename=file.filename,
            original_path=save_path,
            status="UPLOADED"
        )
        db.add(job)
        created_jobs.append(job)

    db.commit()

    job_ids = [j.id for j in created_jobs]

    chord(
        classify_image.s(job_id) for job_id in job_ids
    )(visual_group_images.s(job_ids))

    return {
        "uploaded": len(created_jobs),
        "jobs": [{"id": j.id, "filename": j.filename, "status": j.status, "original_path": j.original_path} for j in created_jobs]
    }
import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from models.database import get_db
from models.job import Job

router = APIRouter()

UPLOAD_DIR = "storage/uploads"

@router.post("/upload")
async def upload_images(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    created_jobs = []

    for file in files:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"{file.filename} is not an image")

        # Give it a unique name so duplicate filenames don't collide
        job_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1]
        saved_filename = f"{job_id}{ext}"
        save_path = os.path.join(UPLOAD_DIR, saved_filename)

        # Save file to disk
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Create Job record in database
        job = Job(
            id=job_id,
            filename=file.filename,
            original_path=save_path,
            status="UPLOADED"
        )
        db.add(job)
        created_jobs.append(job)

    db.commit()

    return {
        "uploaded": len(created_jobs),
        "jobs": [{"id": j.id, "filename": j.filename, "status": j.status} for j in created_jobs]
    }
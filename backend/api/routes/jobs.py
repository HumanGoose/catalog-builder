from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from models.database import get_db
from models.job import Job
from pipeline.events import emit

router = APIRouter()


class JobOut(BaseModel):
    id: str
    filename: str
    original_path: str
    processed_path: Optional[str] = None
    status: str
    image_type: Optional[str] = None
    style_group: Optional[str] = None
    confidence: Optional[float] = None
    spec_data: Optional[dict] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)):
    return db.query(Job).order_by(Job.created_at.desc()).all()


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


class PatchJobBody(BaseModel):
    style_group: Optional[str] = None
    image_type: Optional[str] = None


@router.patch("/jobs/{job_id}")
def patch_job(job_id: str, body: PatchJobBody, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    old_group = job.style_group

    if "style_group" in body.model_fields_set:
        job.style_group = body.style_group
        # Promote a NEEDS_REVIEW job when the user manually assigns it to a group.
        # Use ASSIGNED (not GROUPED) so assign_to_slide treats it as terminal,
        # not as in-flight work waiting for a process_image task.
        if body.style_group is not None and job.status == "NEEDS_REVIEW":
            job.status = "ASSIGNED"
    if body.image_type is not None:
        job.image_type = body.image_type

    db.commit()
    db.refresh(job)

    emit("job.reassigned", {
        "job_id": job.id,
        "from_group": old_group,
        "to_group": job.style_group,
        "image_type": job.image_type,
        "filename": job.filename,
        "status": job.status,
        "original_path": job.original_path,
        "processed_path": job.processed_path,
    })

    return {"ok": True, "job_id": job.id, "style_group": job.style_group}
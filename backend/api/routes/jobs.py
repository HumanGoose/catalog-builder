from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from models.database import get_db
from models.job import Job, GarmentGroup, Slide
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


ELIGIBLE = {"PROCESSED", "SPEC_EXTRACTED", "ASSIGNED"}


def _sync_slide(db: Session, style_name: str):
    """Upsert the Slide for a group based on current assigned jobs. Returns (slide, group_id) or None."""
    group = db.query(GarmentGroup).filter(GarmentGroup.style_name == style_name).first()
    if not group:
        return None

    jobs = db.query(Job).filter(Job.style_group == style_name, Job.status.in_(ELIGIBLE)).all()

    def best(candidates):
        return max(candidates, key=lambda j: j.confidence or 0.0) if candidates else None

    front_job  = best([j for j in jobs if j.image_type == "front"])
    back_job   = best([j for j in jobs if j.image_type == "back"])
    detail_job = best([j for j in jobs if j.image_type == "detail"])
    spec_jobs  = [j for j in jobs if j.image_type == "spec"]

    merged_spec: dict = {}
    for sj in spec_jobs:
        if sj.spec_data:
            merged_spec.update(sj.spec_data)

    slide = db.query(Slide).filter(Slide.group_id == group.id).first()
    if slide is None:
        slide = Slide(group_id=group.id)
        db.add(slide)

    slide.style_number      = style_name
    # Only overwrite metadata fields the user hasn't manually edited
    if not slide.is_edited:
        ref_no              = merged_spec.get("reference_no") or merged_spec.get("ref_no")
        slide.style_name    = ref_no or style_name
        slide.ref_number    = ref_no
        slide.fabric        = merged_spec.get("fabric") or slide.fabric
        if merged_spec.get("gsm") is not None:
            slide.gsm       = str(merged_spec["gsm"])
        if merged_spec.get("date"):
            slide.date      = str(merged_spec["date"])
        if merged_spec.get("afs"):
            slide.afs       = str(merged_spec["afs"])

    slide.front_image_path  = (front_job.processed_path  or front_job.original_path)  if front_job  else None
    slide.back_image_path   = (back_job.processed_path   or back_job.original_path)   if back_job   else None
    slide.detail_image_path = (detail_job.processed_path or detail_job.original_path) if detail_job else None

    db.commit()
    db.refresh(slide)
    return slide, group.id


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
        if body.style_group is not None and job.status == "NEEDS_REVIEW":
            # Promote a NEEDS_REVIEW job when the user manually assigns it to a group.
            # Use ASSIGNED (not GROUPED) so assign_to_slide treats it as terminal,
            # not as in-flight work waiting for a process_image task.
            job.status = "ASSIGNED"
        elif body.style_group is None:
            job.status = "NEEDS_REVIEW"
    if body.image_type is not None:
        job.image_type = body.image_type
        # Promote out of DUPLICATE when user assigns a real role.
        if body.image_type != "duplicate" and job.status == "DUPLICATE":
            job.status = "ASSIGNED" if job.style_group else "NEEDS_REVIEW"

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

    # Sync slides for every group affected by this change
    groups_to_sync = set()
    style_group_changed = "style_group" in body.model_fields_set
    if style_group_changed and old_group:
        groups_to_sync.add(old_group)
    if job.style_group:
        groups_to_sync.add(job.style_group)

    for group_name in groups_to_sync:
        result = _sync_slide(db, group_name)
        if result:
            slide, group_id = result
            emit("group.complete", {
                "group":    group_name,
                "group_id": group_id,
                "slide_id": slide.id,
            })

    return {"ok": True, "job_id": job.id, "style_group": job.style_group}
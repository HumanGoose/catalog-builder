from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from models.database import get_db
from models.job import GarmentGroup, Job, Slide
from pipeline.events import emit

router = APIRouter()


class JobSnippet(BaseModel):
    id: str
    filename: str
    status: str
    image_type: Optional[str] = None
    style_group: Optional[str] = None
    original_path: str
    processed_path: Optional[str] = None
    confidence: Optional[float] = None

    class Config:
        from_attributes = True


class GroupOut(BaseModel):
    id: str
    style_name: Optional[str] = None
    style_number: Optional[str] = None
    jobs: List[JobSnippet] = []

    class Config:
        from_attributes = True


def _group_with_jobs(g: GarmentGroup, db: Session) -> dict:
    jobs = db.query(Job).filter(Job.style_group == g.style_name).all()
    return {"id": g.id, "style_name": g.style_name, "style_number": g.style_number, "jobs": jobs}


@router.get("/groups", response_model=List[GroupOut])
def list_groups(db: Session = Depends(get_db)):
    groups = db.query(GarmentGroup).all()
    return [_group_with_jobs(g, db) for g in groups]


@router.get("/groups/{group_id}", response_model=GroupOut)
def get_group(group_id: str, db: Session = Depends(get_db)):
    g = db.query(GarmentGroup).filter(GarmentGroup.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return _group_with_jobs(g, db)


class CreateGroupBody(BaseModel):
    style_name: str
    style_number: Optional[str] = None


@router.post("/groups", response_model=GroupOut)
def create_group(body: CreateGroupBody, db: Session = Depends(get_db)):
    g = GarmentGroup(style_name=body.style_name, style_number=body.style_number)
    db.add(g)
    db.commit()
    db.refresh(g)
    emit("group.created", {"group_id": g.id, "style_name": g.style_name, "style_number": g.style_number})
    return _group_with_jobs(g, db)


class PatchGroupBody(BaseModel):
    style_name: Optional[str] = None
    style_number: Optional[str] = None


@router.patch("/groups/{group_id}", response_model=GroupOut)
def patch_group(group_id: str, body: PatchGroupBody, db: Session = Depends(get_db)):
    g = db.query(GarmentGroup).filter(GarmentGroup.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

    old_name = g.style_name
    if body.style_name is not None:
        g.style_name = body.style_name
        if old_name:
            db.query(Job).filter(Job.style_group == old_name).update({"style_group": body.style_name})
    if body.style_number is not None:
        g.style_number = body.style_number

    db.commit()
    db.refresh(g)
    emit("group.updated", {"group_id": g.id, "style_name": g.style_name, "style_number": g.style_number, "old_name": old_name})
    return _group_with_jobs(g, db)


@router.delete("/groups/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db)):
    g = db.query(GarmentGroup).filter(GarmentGroup.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

    style_name = g.style_name
    db.query(Job).filter(Job.style_group == style_name).update({"style_group": None, "status": "NEEDS_REVIEW"})
    db.query(Slide).filter(Slide.group_id == group_id).delete()
    db.delete(g)
    db.commit()
    emit("group.deleted", {"group_id": group_id, "style_name": style_name})
    return {"ok": True}

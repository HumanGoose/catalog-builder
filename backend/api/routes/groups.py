from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from models.database import get_db
from models.job import GarmentGroup, Job

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

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, JSON, Boolean, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from models.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    filename = Column(String, nullable=False)
    original_path = Column(String, nullable=False)
    processed_path = Column(String, nullable=True)
    status = Column(String, default="UPLOADED")  # UPLOADED→CLASSIFIED→SPEC_EXTRACTED→PROCESSED→ASSIGNED→DONE
    image_type = Column(String, nullable=True)    # front, back, detail, spec
    style_group = Column(String, nullable=True)   # which garment this belongs to
    confidence = Column(Float, nullable=True)
    spec_data = Column(JSON, nullable=True)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GarmentGroup(Base):
    __tablename__ = "garment_groups"

    id = Column(String, primary_key=True, default=generate_uuid)
    style_name = Column(String, nullable=True)
    style_number = Column(String, nullable=True)
    front_job_id = Column(String, ForeignKey("jobs.id"), nullable=True)
    back_job_id = Column(String, ForeignKey("jobs.id"), nullable=True)
    detail_job_id = Column(String, ForeignKey("jobs.id"), nullable=True)
    spec_job_id = Column(String, ForeignKey("jobs.id"), nullable=True)
    slide_assigned = Column(Boolean, default=False)

    front_job = relationship("Job", foreign_keys=[front_job_id])
    back_job = relationship("Job", foreign_keys=[back_job_id])
    detail_job = relationship("Job", foreign_keys=[detail_job_id])
    spec_job = relationship("Job", foreign_keys=[spec_job_id])


class Slide(Base):
    __tablename__ = "slides"

    id = Column(String, primary_key=True, default=generate_uuid)
    group_id = Column(String, ForeignKey("garment_groups.id"), nullable=False)
    slide_number = Column(Integer, nullable=True)
    style_name = Column(String, nullable=True)
    style_number = Column(String, nullable=True)
    ref_number = Column(String, nullable=True)
    fabric = Column(String, nullable=True)
    gsm = Column(String, nullable=True)
    date = Column(String, nullable=True)
    front_image_path = Column(String, nullable=True)
    back_image_path = Column(String, nullable=True)
    detail_image_path = Column(String, nullable=True)
    is_edited = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    group = relationship("GarmentGroup", foreign_keys=[group_id])
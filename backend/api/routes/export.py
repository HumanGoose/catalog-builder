"""
export.py
---------
Slides CRUD + PPTX/PDF export endpoints.

POST /export/pptx and POST /export/pdf accept { slide_ids, layouts } so the
frontend can scope the export to the current session and pass per-slide layout
overrides (in canvas-pixel space, 100px = 1 inch).
"""

import io
import logging
import os
import subprocess
import tempfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.database import SessionLocal
from models.job import Slide
from pipeline.export_pptx import build_catalog_pptx
from api.routes.logo import find_logo

logger = logging.getLogger(__name__)
router = APIRouter()

PX_PER_INCH = 100.0


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _to_dict(slide: Slide) -> dict:
    return {
        "id": slide.id,
        "group_id": slide.group_id,
        "style_name": slide.style_name,
        "style_number": slide.style_number,
        "ref_number": slide.ref_number,
        "fabric": slide.fabric,
        "gsm": slide.gsm,
        "date": slide.date,
        "afs": slide.afs,
        "front_image_path": slide.front_image_path,
        "back_image_path": slide.back_image_path,
        "detail_image_path": slide.detail_image_path,
        "is_edited": slide.is_edited,
        "created_at": slide.created_at.isoformat() if slide.created_at else None,
    }


@router.get("/slides")
def list_slides(db: Session = Depends(get_db)):
    slides = db.query(Slide).order_by(Slide.created_at).all()
    return [_to_dict(s) for s in slides]


@router.get("/slides/{slide_id}")
def get_slide(slide_id: str, db: Session = Depends(get_db)):
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(404, "Slide not found")
    return _to_dict(slide)


class SlideUpdate(BaseModel):
    style_name: str | None = None
    ref_number: str | None = None
    fabric: str | None = None
    gsm: str | None = None
    date: str | None = None
    afs: str | None = None


@router.patch("/slides/{slide_id}")
def update_slide(slide_id: str, body: SlideUpdate, db: Session = Depends(get_db)):
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(404, "Slide not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(slide, field, value)
    slide.is_edited = True
    db.commit()
    db.refresh(slide)
    return _to_dict(slide)


# ── Session-scoped export ──────────────────────────────────────────────────────

class LayoutEl(BaseModel):
    left: float
    top: float
    width: float
    height: float | None = None
    rotation: float | None = None


class SlideLayout(BaseModel):
    front: LayoutEl | None = None
    back: LayoutEl | None = None
    detail: LayoutEl | None = None
    specs: LayoutEl | None = None


class ExportRequest(BaseModel):
    slide_ids: list[str]
    layouts: dict[str, SlideLayout] = {}
    logo_layout: LayoutEl | None = None
    specs_font_pt: float | None = None


def _el_to_inches(el: LayoutEl) -> dict:
    d = {
        "left": el.left / PX_PER_INCH,
        "top": el.top / PX_PER_INCH,
        "width": el.width / PX_PER_INCH,
    }
    if el.height is not None:
        d["height"] = el.height / PX_PER_INCH
    if el.rotation is not None:
        d["rotation"] = el.rotation
    return d


def _layout_to_inches(lo: SlideLayout) -> dict:
    result = {}
    for key in ("front", "back", "detail", "specs"):
        el = getattr(lo, key, None)
        if el is not None:
            result[key] = _el_to_inches(el)
    return result


def _build_slides_data(body: ExportRequest, db: Session) -> list[dict]:
    slide_map = {
        s.id: s
        for s in db.query(Slide).filter(Slide.id.in_(body.slide_ids)).all()
    }
    slides_data = []
    for sid in body.slide_ids:
        s = slide_map.get(sid)
        if not s:
            continue
        d = _to_dict(s)
        lo = body.layouts.get(sid)
        if lo:
            d["layout"] = _layout_to_inches(lo)
        slides_data.append(d)
    return slides_data


@router.post("/export/pptx")
def export_pptx_session(body: ExportRequest, db: Session = Depends(get_db)):
    if not body.slide_ids:
        raise HTTPException(400, "No slide IDs provided")

    slides_data = _build_slides_data(body, db)
    if not slides_data:
        raise HTTPException(404, "No slides found for the given IDs")

    logo_pos = _el_to_inches(body.logo_layout) if body.logo_layout else None
    pptx_bytes = build_catalog_pptx(
        slides_data, logo_path=find_logo(),
        logo_pos=logo_pos, specs_font_pt=body.specs_font_pt,
    )
    return StreamingResponse(
        io.BytesIO(pptx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": 'attachment; filename="catalog.pptx"'},
    )


@router.post("/export/pdf")
def export_pdf_session(body: ExportRequest, db: Session = Depends(get_db)):
    if not body.slide_ids:
        raise HTTPException(400, "No slide IDs provided")

    slides_data = _build_slides_data(body, db)
    if not slides_data:
        raise HTTPException(404, "No slides found for the given IDs")

    logo_pos = _el_to_inches(body.logo_layout) if body.logo_layout else None
    pptx_bytes = build_catalog_pptx(
        slides_data, logo_path=find_logo(),
        logo_pos=logo_pos, specs_font_pt=body.specs_font_pt,
    )

    with tempfile.TemporaryDirectory() as tmp:
        pptx_path = os.path.join(tmp, "catalog.pptx")
        pdf_path  = os.path.join(tmp, "catalog.pdf")

        with open(pptx_path, "wb") as f:
            f.write(pptx_bytes)

        try:
            result = subprocess.run(
                ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, pptx_path],
                capture_output=True,
                timeout=60,
            )
        except FileNotFoundError:
            raise HTTPException(503, "PDF export unavailable — LibreOffice not installed in this container")

        if result.returncode != 0 or not os.path.exists(pdf_path):
            logger.error("LibreOffice PDF conversion failed: %s", result.stderr.decode())
            raise HTTPException(500, "PDF conversion failed")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="catalog.pdf"'},
    )

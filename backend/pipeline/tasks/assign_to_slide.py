"""
assign_to_slide.py
------------------
Final pipeline task. Called once per canonical group after all
process_image / extract_specs tasks for that group complete.

Responsibilities:
  1. Load all Job records sharing the canonical style_group name.
  2. Wait (retry) if any are still in-flight.
  3. Pick the best image per role by confidence score.
  4. Merge spec data across all spec jobs.
  5. Upsert a GarmentGroup record.
  6. Upsert a Slide record linked to that group.
  7. Mark all jobs ASSIGNED.
"""

import logging
from celery import shared_task
from celery_app import celery_app
from models.database import SessionLocal
from models.job import Job, GarmentGroup, Slide

logger = logging.getLogger(__name__)

# Statuses that mean a job has finished its individual processing step
TERMINAL = {"PROCESSED", "SPEC_EXTRACTED", "ASSIGNED", "DUPLICATE", "NEEDS_REVIEW", "FAILED"}
# Statuses we actually want to include in the slide assembly
ELIGIBLE  = {"PROCESSED", "SPEC_EXTRACTED", "ASSIGNED"}


@celery_app.task(bind=True, name="assign_to_slide", max_retries=10, default_retry_delay=5)
def assign_to_slide(self, _chord_results, canonical_name: str):
    """
    Assemble a GarmentGroup + Slide for *canonical_name*.

    The leading `_chord_results` arg absorbs the list Celery passes when this
    is used as a chord callback. It is intentionally ignored.

    Args:
        canonical_name: The value written to Job.style_group by visual_group_images.
    """
    logger.info("assign_to_slide: starting for group=%s", canonical_name)

    db = SessionLocal()
    try:
        # ------------------------------------------------------------------
        # 1. Load all jobs that belong to this group
        # ------------------------------------------------------------------
        all_jobs = (
            db.query(Job)
            .filter(Job.style_group == canonical_name)
            .all()
        )

        if not all_jobs:
            logger.warning("assign_to_slide: no jobs found for group=%s", canonical_name)
            return {"status": "skipped", "reason": "no jobs", "group": canonical_name}

        # ------------------------------------------------------------------
        # 2. Retry if any jobs are still being processed
        # ------------------------------------------------------------------
        in_flight = [j for j in all_jobs if j.status not in TERMINAL]
        if in_flight:
            logger.info(
                "assign_to_slide: %d jobs still in-flight for %s, retrying…",
                len(in_flight), canonical_name,
            )
            raise self.retry(countdown=8)

        # ------------------------------------------------------------------
        # 3. Partition eligible jobs by role
        # ------------------------------------------------------------------
        eligible = [j for j in all_jobs if j.status in ELIGIBLE]

        fronts  = [j for j in eligible if j.image_type == "front"]
        backs   = [j for j in eligible if j.image_type == "back"]
        details = [j for j in eligible if j.image_type == "detail"]
        specs   = [j for j in eligible if j.image_type == "spec"]

        def best(candidates):
            if not candidates:
                return None
            return max(candidates, key=lambda j: j.confidence or 0.0)

        front_job  = best(fronts)
        back_job   = best(backs)
        detail_job = best(details)
        spec_job   = best(specs)

        # ------------------------------------------------------------------
        # 4. Merge spec data across all spec jobs
        # ------------------------------------------------------------------
        merged_spec: dict = {}
        for sj in specs:
            if sj.spec_data:
                merged_spec.update(sj.spec_data)

        ref_no  = merged_spec.get("reference_no") or merged_spec.get("ref_no")
        fabric  = merged_spec.get("fabric")
        gsm     = merged_spec.get("gsm")
        date    = merged_spec.get("date")
        # Style name: prefer the canonical slug unless we have a real ref number
        style_name = ref_no or canonical_name

        # ------------------------------------------------------------------
        # 5. Upsert GarmentGroup — look up by style_name since there's no
        #    style_group column on GarmentGroup
        # ------------------------------------------------------------------
        garment_group = (
            db.query(GarmentGroup)
            .filter(GarmentGroup.style_name == canonical_name)
            .first()
        )
        if garment_group is None:
            garment_group = GarmentGroup(style_name=canonical_name)
            db.add(garment_group)
            db.flush()   # populate garment_group.id before Slide FK

        garment_group.style_number  = ref_no
        garment_group.front_job_id  = front_job.id  if front_job  else None
        garment_group.back_job_id   = back_job.id   if back_job   else None
        garment_group.detail_job_id = detail_job.id if detail_job else None
        garment_group.spec_job_id   = spec_job.id   if spec_job   else None
        garment_group.slide_assigned = True

        # ------------------------------------------------------------------
        # 6. Upsert Slide
        # ------------------------------------------------------------------
        slide = (
            db.query(Slide)
            .filter(Slide.group_id == garment_group.id)
            .first()
        )
        if slide is None:
            slide = Slide(group_id=garment_group.id)
            db.add(slide)

        slide.style_name        = style_name
        slide.style_number      = canonical_name        # keep the slug as a stable key
        slide.ref_number        = ref_no
        slide.fabric            = fabric
        slide.gsm               = str(gsm) if gsm is not None else None
        slide.date              = str(date) if date else None
        slide.front_image_path  = front_job.processed_path  if front_job  else None
        slide.back_image_path   = back_job.processed_path   if back_job   else None
        slide.detail_image_path = detail_job.processed_path if detail_job else None

        # ------------------------------------------------------------------
        # 7. Advance all eligible jobs to ASSIGNED
        # ------------------------------------------------------------------
        for job in eligible:
            job.status = "ASSIGNED"

        db.commit()

        logger.info(
            "assign_to_slide: group=%s → GarmentGroup %s, Slide %s (ref=%s)",
            canonical_name, garment_group.id, slide.id, ref_no,
        )

        return {
            "status":     "ok",
            "group":      canonical_name,
            "group_id":   garment_group.id,
            "slide_id":   slide.id,
            "ref_no":     ref_no,
            "has_front":  front_job  is not None,
            "has_back":   back_job   is not None,
            "has_detail": detail_job is not None,
            "has_spec":   spec_job   is not None,
        }

    except self.MaxRetriesExceededError:
        logger.error("assign_to_slide: max retries exceeded for group=%s", canonical_name)
        return {"status": "error", "reason": "max retries exceeded", "group": canonical_name}
    except Exception as exc:
        db.rollback()
        logger.exception("assign_to_slide: unexpected error for group=%s", canonical_name)
        raise self.retry(exc=exc)
    finally:
        db.close()
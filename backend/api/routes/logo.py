import os
import shutil
from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()

LOGO_DIR = "storage/logo"
LOGO_BASE = os.path.join(LOGO_DIR, "current")
_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp")


def find_logo() -> str | None:
    for ext in _EXTS:
        p = LOGO_BASE + ext
        if os.path.exists(p):
            return p
    return None


def _clear():
    for ext in _EXTS:
        p = LOGO_BASE + ext
        if os.path.exists(p):
            os.remove(p)


@router.get("/logo")
def get_logo():
    path = find_logo()
    if not path:
        return {"exists": False}
    ext = os.path.splitext(path)[1]
    return {"exists": True, "url": f"/logo-img/current{ext}"}


@router.post("/logo")
async def upload_logo(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Logo must be an image file")
    os.makedirs(LOGO_DIR, exist_ok=True)
    _clear()
    ext = os.path.splitext(file.filename or "")[1] or ".png"
    save_path = LOGO_BASE + ext
    with open(save_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    return {"path": save_path, "url": f"/logo-img/current{ext}"}


@router.delete("/logo")
def delete_logo():
    path = find_logo()
    if path:
        os.remove(path)
    return {"deleted": bool(path)}

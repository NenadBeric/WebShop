import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import settings
from app.dependencies import AuthUser
from app.i18n import tr

router = APIRouter(prefix="/uploads", tags=["uploads"])

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@router.post("/product-image", status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    user: AuthUser,
    file: UploadFile = File(...),
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    if not file.filename:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    suf = Path(file.filename).suffix.lower()
    if suf not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    raw = await file.read()
    if len(raw) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=tr("upload_too_large"))
    base = Path(settings.UPLOAD_DIR)
    base.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{suf}"
    path = base / name
    path.write_bytes(raw)
    return {"url": f"/static/{name}"}

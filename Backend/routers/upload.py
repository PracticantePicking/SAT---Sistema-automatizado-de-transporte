import os
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from config import load_config, UPLOAD_FOLDER
from procesador import obtener_columnas_excel, sugerir_mapeo

router = APIRouter()


@router.post("/upload")
async def upload_file(
    file:       UploadFile = File(...),
    carrier_id: str        = Form(...),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Solo .xlsx o .xls")

    filename = f"{carrier_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    contenido = await file.read()
    with open(filepath, "wb") as f:
        f.write(contenido)

    config     = load_config()
    carrier    = next(
        (c for c in config["carriers"] if c["id"] == carrier_id),
        None
    )
    header_row = carrier.get("header_row", 0) if carrier else 0

    try:
        columnas_excel = obtener_columnas_excel(filepath, header_row)
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {e}")

    sugerencias  = sugerir_mapeo(columnas_excel, config["finalCols"])
    mapeo_actual = carrier.get("mapping", {}) if carrier else {}

    return {
        "filename":       filename,
        "original":       file.filename,
        "columnas_excel": columnas_excel,
        "sugerencias":    sugerencias,
        "mapeo_actual":   mapeo_actual,
    }
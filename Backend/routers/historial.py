import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from database import (
    obtener_historial,
    obtener_historial_por_id,
    eliminar_historial,
)
from config import RESULT_FOLDER

router = APIRouter()


@router.get("/historial")
def get_historial():
    """
    Retorna el historial con el campo rama incluido.
    El frontend lo usa para mostrar la columna Rama
    y para construir el selector del dashboard.
    """
    return obtener_historial()


@router.delete("/historial/{hid}")
def delete_historial(hid: int):
    archivo = eliminar_historial(hid)
    if archivo is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    filepath = os.path.join(RESULT_FOLDER, archivo)
    if os.path.exists(filepath):
        os.remove(filepath)

    return {"ok": True}


@router.get("/metricas/{hid}")
def get_metricas(hid: int):
    registro = obtener_historial_por_id(hid)
    if registro is None:
        raise HTTPException(status_code=404, detail="No encontrado")
    return registro["metricas"]


@router.get("/download/{filename}")
def download(filename: str):
    filename = os.path.basename(filename)
    filepath = os.path.join(RESULT_FOLDER, filename)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
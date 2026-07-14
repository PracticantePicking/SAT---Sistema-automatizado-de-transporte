"""
routers/process.py

Endpoint de procesamiento de archivos.
procesar_archivos retorna 5 valores:
  df, df_devoluciones, stats, reportes_calidad, metricas
"""

import os
import traceback
import uuid
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from config import load_config, UPLOAD_FOLDER, RESULT_FOLDER
from database import guardar_historial
from logger import get_logger
from models import ProcessRequest
from procesador import procesar_archivos

router    = APIRouter()
logger    = get_logger("process")
job_store: dict = {}


def _run_job(job_id: str, tasks: list, final_cols: list, rama_id: str = ""):
    def progress_cb(pct: int, msg: str):
        job_store[job_id]["pct"] = pct
        job_store[job_id]["msg"] = msg

    try:
        # procesar_archivos retorna 5 valores
        df, df_devoluciones, stats, reportes_calidad, metricas = procesar_archivos(
            tasks, final_cols, progress_cb
        )

        ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
        rama_tag    = f"_{rama_id}" if rama_id else ""
        output_name = f"resultado{rama_tag}_{ts}.xlsx"
        output_path = os.path.join(RESULT_FOLDER, output_name)

        # Guardar con dos hojas: DB y Devoluciones
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="DB", index=False)
            df_devoluciones.to_excel(writer, sheet_name="Devoluciones", index=False)

        # reportes_calidad es lista de dicts: [{carrier, score, issues}]
        # convertir a dict por nombre de carrier para el frontend
        reportes_dict = {r["carrier"]: r for r in reportes_calidad}

        carriers_usados = [c["name"] for c, _ in tasks]
        guardar_historial(
            archivo=output_name,
            total_filas=len(df),
            carriers_usados=carriers_usados,
            stats=stats,
            metricas=metricas,
            rama=rama_id,
        )

        preview = df.head(100).fillna("").astype(str).to_dict(orient="records")

        job_store[job_id]["status"] = "done"
        job_store[job_id]["result"] = {
            "ok":                 True,
            "output_file":        output_name,
            "total_rows":         len(df),
            "total_devoluciones": len(df_devoluciones),
            "rama":               rama_id,
            "stats":              stats,
            "reportes":           reportes_dict,
            "metricas":           metricas,
            "preview":            preview,
            "columns":            list(df.columns),
        }

    except Exception as e:
        logger.error("Error en job %s: %s", job_id, traceback.format_exc())
        job_store[job_id]["status"] = "error"
        job_store[job_id]["error"]  = str(e)


@router.post("/process")
def process(data: ProcessRequest, background_tasks: BackgroundTasks):
    config   = load_config()
    carriers = {c["id"]: c for c in config["carriers"]}

    tasks = []
    for job in data.jobs:
        if job.carrier_id not in carriers:
            raise HTTPException(
                status_code=400,
                detail=f"Carrier '{job.carrier_id}' no encontrado"
            )
        rutas = []
        for fname in job.files:
            ruta = os.path.join(UPLOAD_FOLDER, fname)
            if not os.path.exists(ruta):
                raise HTTPException(
                    status_code=400,
                    detail=f"Archivo no encontrado: {fname}"
                )
            rutas.append(ruta)

        if rutas:
            tasks.append((carriers[job.carrier_id], rutas))

    if not tasks:
        raise HTTPException(status_code=400, detail="Sin tareas válidas")

    job_id = uuid.uuid4().hex[:10]
    job_store[job_id] = {
        "status": "running",
        "pct":    0,
        "msg":    "Iniciando...",
        "result": None,
        "error":  None,
    }

    rama_id = getattr(data, "rama_id", "") or ""
    background_tasks.add_task(_run_job, job_id, tasks, config["finalCols"], rama_id)
    return {"ok": True, "job_id": job_id}


@router.get("/process/status/{job_id}")
def process_status(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return job


@router.get("/download/{filename}")
def download_resultado(filename: str):
    """Descarga un archivo Excel generado del folder resultado."""
    filename = os.path.basename(filename)
    filepath = os.path.join(RESULT_FOLDER, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
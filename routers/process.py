import os
import traceback
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from models import ProcessRequest
from config import load_config, UPLOAD_FOLDER, RESULT_FOLDER
from database import guardar_historial
from procesador import procesar_archivos

router    = APIRouter()
job_store: dict = {}


def _run_job(job_id: str, tasks: list, final_cols: list):
    def progress_cb(pct: int, msg: str):
        job_store[job_id]["pct"] = pct
        job_store[job_id]["msg"] = msg

    try:
        # procesar_archivos ahora retorna 5 valores: df, df_devoluciones, stats, reportes, metricas
        df, df_devoluciones, stats, reportes, metricas = procesar_archivos(
            tasks, final_cols, progress_cb
        )

        ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_name = f"resultado_transportadores_{ts}.xlsx"
        output_path = os.path.join(RESULT_FOLDER, output_name)

        # Guardar con dos hojas: DB y Devoluciones
        with __import__("pandas").ExcelWriter(output_path, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="DB", index=False)
            df_devoluciones.to_excel(writer, sheet_name="Devoluciones", index=False)

        carriers_usados = [c["name"] for c, _ in tasks]
        guardar_historial(output_name, len(df), carriers_usados, stats, metricas)

        preview = df.head(100).fillna("").astype(str).to_dict(orient="records")

        job_store[job_id]["status"] = "done"
        job_store[job_id]["result"] = {
            "ok":               True,
            "output_file":      output_name,
            "total_rows":       len(df),
            "total_devoluciones": len(df_devoluciones),
            "stats":            stats,
            "reportes":         reportes,
            "metricas":         metricas,
            "preview":          preview,
            "columns":          list(df.columns),
        }

    except Exception as e:
        print(f"\n❌ ERROR EN JOB {job_id}:\n{traceback.format_exc()}")
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

    background_tasks.add_task(_run_job, job_id, tasks, config["finalCols"])
    return {"ok": True, "job_id": job_id}


@router.get("/process/status/{job_id}")
def process_status(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return job
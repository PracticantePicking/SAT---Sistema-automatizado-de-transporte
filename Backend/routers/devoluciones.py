"""
routers/devoluciones.py
Módulo de gestión de devoluciones
"""
import os
import uuid
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from config import UPLOAD_FOLDER

router = APIRouter()

_estado = {
    "df":        None,
    "filename":  None,
    "procesado": None,
}


def _leer_excel(filepath: str) -> pd.DataFrame:
    try:
        df = pd.read_excel(filepath, engine="openpyxl")
    except Exception:
        df = pd.read_excel(filepath, sheet_name=0, engine="openpyxl")

    df.columns = df.columns.str.strip()
    df = df.dropna(how="all").reset_index(drop=True)

    # Normalizar columnas de fecha
    for col in df.columns:
        if any(k in col.lower() for k in ["fecha", "date", "fec"]):
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


# ── UPLOAD ────────────────────────────────────────────────────────────────
@router.post("/devoluciones/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos Excel (.xlsx, .xls)")

    uid      = uuid.uuid4().hex[:8]
    fname    = f"devoluciones_{uid}.xlsx"
    filepath = os.path.join(UPLOAD_FOLDER, fname)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    df = _leer_excel(filepath)
    _estado["df"]        = df
    _estado["filename"]  = fname
    _estado["procesado"] = datetime.now().isoformat()

    return {
        "ok":       True,
        "filename": fname,
        "filas":    len(df),
        "columnas": list(df.columns),
    }


# ── STATS ─────────────────────────────────────────────────────────────────
@router.get("/devoluciones/stats")
def get_stats():
    df = _estado.get("df")
    if df is None:
        return {"total": 0, "cargado": False, "por_carrier": [],
                "por_estado": [], "por_mes": []}

    # Columna de carrier
    carrier_col = next(
        (c for c in df.columns if any(
            k in c.lower() for k in ["transport", "carrier", "mensajer", "empresa"]
        )), None
    )
    # Columna de estado
    estado_col = next(
        (c for c in df.columns if any(
            k in c.lower() for k in ["estado", "status", "novedad", "resultado"]
        )), None
    )
    # Columna de fecha
    fecha_col = next(
        (c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])), None
    )

    por_carrier = []
    if carrier_col:
        vc = df[carrier_col].value_counts().reset_index()
        vc.columns = ["nombre", "total"]
        por_carrier = vc.to_dict(orient="records")

    por_estado = []
    if estado_col:
        vc = df[estado_col].value_counts().reset_index()
        vc.columns = ["estado", "total"]
        por_estado = vc.to_dict(orient="records")

    por_mes = []
    if fecha_col:
        tmp = df.copy()
        tmp["_mes"] = df[fecha_col].dt.to_period("M").astype(str)
        vc = tmp["_mes"].value_counts().sort_index().reset_index()
        vc.columns = ["mes", "total"]
        por_mes = vc.to_dict(orient="records")

    return {
        "total":       len(df),
        "cargado":     True,
        "procesado":   _estado["procesado"],
        "por_carrier": por_carrier,
        "por_estado":  por_estado,
        "por_mes":     por_mes,
    }


# ── TABLA ─────────────────────────────────────────────────────────────────
@router.get("/devoluciones")
def get_devoluciones(
    page:     int = Query(1,  ge=1),
    limit:    int = Query(50, ge=1, le=500),
    carrier:  str = Query(""),
    estado:   str = Query(""),
    busqueda: str = Query(""),
):
    df = _estado.get("df")
    if df is None:
        return {"data": [], "total": 0, "page": page, "pages": 0, "columnas": []}

    res = df.copy()

    carrier_col = next(
        (c for c in res.columns if any(
            k in c.lower() for k in ["transport", "carrier", "mensajer", "empresa"]
        )), None
    )
    estado_col = next(
        (c for c in res.columns if any(
            k in c.lower() for k in ["estado", "status", "novedad", "resultado"]
        )), None
    )

    if carrier and carrier_col:
        res = res[res[carrier_col].astype(str).str.contains(carrier, case=False, na=False)]
    if estado and estado_col:
        res = res[res[estado_col].astype(str).str.contains(estado, case=False, na=False)]
    if busqueda:
        mask = res.apply(
            lambda row: row.astype(str).str.contains(busqueda, case=False, na=False).any(),
            axis=1,
        )
        res = res[mask]

    total  = len(res)
    pages  = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit

    # Convertir fechas a string
    for col in res.columns:
        if pd.api.types.is_datetime64_any_dtype(res[col]):
            res[col] = res[col].dt.strftime("%Y-%m-%d").fillna("")

    res = res.where(res.notna(), other=None)

    return {
        "data":     res.iloc[offset : offset + limit].to_dict(orient="records"),
        "total":    total,
        "page":     page,
        "pages":    pages,
        "columnas": list(df.columns),
    }


# ── DESCARGA ──────────────────────────────────────────────────────────────
@router.get("/devoluciones/download")
def download(
    carrier:  str = Query(""),
    estado:   str = Query(""),
    busqueda: str = Query(""),
):
    df = _estado.get("df")
    if df is None:
        raise HTTPException(404, "No hay datos cargados")

    res = df.copy()

    carrier_col = next(
        (c for c in res.columns if any(
            k in c.lower() for k in ["transport", "carrier", "mensajer", "empresa"]
        )), None
    )
    estado_col = next(
        (c for c in res.columns if any(
            k in c.lower() for k in ["estado", "status", "novedad", "resultado"]
        )), None
    )

    if carrier and carrier_col:
        res = res[res[carrier_col].astype(str).str.contains(carrier, case=False, na=False)]
    if estado and estado_col:
        res = res[res[estado_col].astype(str).str.contains(estado, case=False, na=False)]
    if busqueda:
        mask = res.apply(
            lambda row: row.astype(str).str.contains(busqueda, case=False, na=False).any(),
            axis=1,
        )
        res = res[mask]

    uid          = uuid.uuid4().hex[:8]
    out_fname    = f"devoluciones_export_{uid}.xlsx"
    out_path     = os.path.join(UPLOAD_FOLDER, out_fname)
    res.to_excel(out_path, index=False, engine="openpyxl")

    return FileResponse(
        path=out_path,
        filename=out_fname,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

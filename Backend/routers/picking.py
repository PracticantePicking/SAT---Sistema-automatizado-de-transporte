"""
routers/picking.py

Lógica de negocio:
- Meta diaria de LÍNEAS   = 68  por usuario
- Meta diaria de UNIDADES = 640 por usuario
- Desempeño = líneas reales / meta × 100 (máximo 100%)
- Si supera la meta = 100%, si no = el % que alcanzó
- Por eso usamos min(pct, 100) para no mostrar 13000%
"""

import os
import uuid
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from config import UPLOAD_FOLDER
from database import guardar_picking

router  = APIRouter()
_estado = { "df": None, "filename": None, "cargado": None }


def _leer_picking(filepath: str) -> pd.DataFrame:
    try:
        df = pd.read_excel(filepath, sheet_name="Datos con Tiempos", engine="openpyxl")
    except Exception:
        df = pd.read_excel(filepath, sheet_name=0, engine="openpyxl")

    df.columns = df.columns.str.strip()

    # Fecha viene como "02/03/2026" → dayfirst=True para DD/MM/YYYY
    if "Fecha confirmacion" in df.columns:
        df["Fecha confirmacion"] = pd.to_datetime(
            df["Fecha confirmacion"], dayfirst=True, errors="coerce"
        )
        df["_año"]       = df["Fecha confirmacion"].dt.year
        df["_mes"]       = df["Fecha confirmacion"].dt.month
        df["_dia"]       = df["Fecha confirmacion"].dt.day
        df["_fecha_str"] = df["Fecha confirmacion"].dt.strftime("%Y-%m-%d")

    for col in ["Total Unidades", "Total Lineas", "Meta unidades", "Meta Lineas"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    if "Usuario" in df.columns:
        df["Usuario"] = df["Usuario"].astype(str).str.strip().str.upper()

    df = df[df["Usuario"].notna() & (df["Usuario"] != "NAN")].reset_index(drop=True)
    return df


def _calcular_metricas(df: pd.DataFrame) -> dict:

    if df.empty:
        return { "kpis": {}, "por_usuario": [], "bajo_meta": [],
                 "tendencia_mensual": [], "detalle": [] }

    META_L = float(df["Meta Lineas"].median())   if "Meta Lineas"   in df.columns else 68
    META_U = float(df["Meta unidades"].median()) if "Meta unidades" in df.columns else 640

    # ── Por usuario + día ─────────────────────────────────────────────────
    # Primero agrupamos por usuario+día para obtener el total de ese día
    por_dia = df.groupby(["Usuario", "_fecha_str", "_mes", "_dia"]).agg(
        lineas=("Total Lineas", "sum"),
        unidades=("Total Unidades", "sum"),
    ).reset_index()

    # ── Por usuario (resumen) ─────────────────────────────────────────────
    u_grp = por_dia.groupby("Usuario").agg(
        dias=("_fecha_str", "nunique"),
        lineas_total=("lineas", "sum"),
        unidades_total=("unidades", "sum"),
        lineas_dia=("lineas", "mean"),        # promedio diario
        unidades_dia=("unidades", "mean"),    # promedio diario
        dias_meta_l=("lineas",   lambda x: (x >= META_L).sum()),
        dias_meta_u=("unidades", lambda x: (x >= META_U).sum()),
    ).reset_index()

    u_grp["lineas_dia"]   = u_grp["lineas_dia"].round(1)
    u_grp["unidades_dia"] = u_grp["unidades_dia"].round(1)

    # Desempeño = % de la meta que alcanzó — máximo 100%
    # Si hizo 136 líneas con meta 68 → 100% (no 200%)
    # Si hizo 50 líneas con meta 68  → 73.5%
    u_grp["pct_lineas"]   = u_grp["lineas_dia"].apply(
        lambda x: min(round(x / META_L * 100, 1), 100) if META_L > 0 else 0
    )
    u_grp["pct_unidades"] = u_grp["unidades_dia"].apply(
        lambda x: min(round(x / META_U * 100, 1), 100) if META_U > 0 else 0
    )
    u_grp["cumple_lineas"]   = u_grp["lineas_dia"]   >= META_L
    u_grp["cumple_unidades"] = u_grp["unidades_dia"] >= META_U

    # Consistencia: % de días que cumplió
    u_grp["consistencia_l"] = (u_grp["dias_meta_l"] / u_grp["dias"] * 100).round(1)
    u_grp["consistencia_u"] = (u_grp["dias_meta_u"] / u_grp["dias"] * 100).round(1)

    por_usuario = u_grp.sort_values("lineas_total", ascending=False).to_dict(orient="records")
    bajo_meta   = [u for u in por_usuario if not u["cumple_lineas"]]

    # ── Tendencia mensual ─────────────────────────────────────────────────
    tendencia_mensual = []
    if "_mes" in df.columns:
        m_grp = por_dia.groupby(["_mes"]).agg(
            lineas_prom=("lineas", "mean"),
            unidades_prom=("unidades", "mean"),
            lineas_total=("lineas", "sum"),
            dias=("_fecha_str", "nunique"),
        ).reset_index()
        m_grp["lineas_prom"]   = m_grp["lineas_prom"].round(1)
        m_grp["unidades_prom"] = m_grp["unidades_prom"].round(1)
        m_grp["meta_l"]        = META_L
        m_grp["meta_u"]        = META_U
        tendencia_mensual = m_grp.sort_values("_mes").to_dict(orient="records")

    # ── Detalle por usuario + mes ─────────────────────────────────────────
    # Para la tabla con columnas: usuario | mes | unidades | líneas | desempeño
    detalle = []
    if "_mes" in df.columns:
        det = df.groupby(["Usuario", "_mes"]).agg(
            lineas=("Total Lineas", "sum"),
            unidades=("Total Unidades", "sum"),
            dias=("_fecha_str", "nunique"),
        ).reset_index()
        det["lineas_dia"]   = (det["lineas"]   / det["dias"]).round(1)
        det["unidades_dia"] = (det["unidades"] / det["dias"]).round(1)
        det["pct_lineas"]   = det["lineas_dia"].apply(
            lambda x: min(round(x / META_L * 100, 1), 100) if META_L > 0 else 0
        )
        det["pct_unidades"] = det["unidades_dia"].apply(
            lambda x: min(round(x / META_U * 100, 1), 100) if META_U > 0 else 0
        )
        det["cumple"] = (det["lineas_dia"] >= META_L) & (det["unidades_dia"] >= META_U)
        detalle = det.sort_values(["Usuario", "_mes"]).to_dict(orient="records")

    # KPIs globales
    avg_lineas_dia   = round(u_grp["lineas_dia"].mean(),   1) if not u_grp.empty else 0
    avg_unidades_dia = round(u_grp["unidades_dia"].mean(), 1) if not u_grp.empty else 0

    return {
        "kpis": {
            "total_ordenes":     len(df),
            "total_lineas":      float(df["Total Lineas"].sum()),
            "total_unidades":    float(df["Total Unidades"].sum()),
            "meta_lineas_dia":   META_L,
            "meta_unidades_dia": META_U,
            "usuarios_unicos":   df["Usuario"].nunique(),
            "avg_lineas_dia":    avg_lineas_dia,
            "avg_unidades_dia":  avg_unidades_dia,
            "pct_cumplimiento":  min(round(avg_lineas_dia / META_L * 100, 1), 100) if META_L > 0 else 0,
        },
        "por_usuario":       por_usuario,
        "bajo_meta":         bajo_meta,
        "tendencia_mensual": tendencia_mensual,
        "detalle":           detalle,
    }


@router.post("/picking/upload")
async def upload_picking(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Solo .xlsx o .xls")

    filename = f"picking_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    contenido = await file.read()
    with open(filepath, "wb") as f:
        f.write(contenido)

    try:
        df       = _leer_picking(filepath)
        metricas = _calcular_metricas(df)
        guardar_picking(file.filename, len(df), metricas) 
        _estado.update({ "df": df, "filename": file.filename,
                         "cargado": datetime.now().strftime("%Y-%m-%d %H:%M:%S") })
        return { "ok": True, "filename": file.filename,
                 "filas": len(df), "cargado": _estado["cargado"], "metricas": metricas }
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")


@router.get("/picking/metricas")
def get_metricas(usuario: str = "", mes: int = 0, dia: int = 0):
    if _estado["df"] is None:
        raise HTTPException(status_code=404, detail="No hay datos cargados")

    df = _estado["df"].copy()

    if usuario:
        df = df[df["Usuario"] == usuario.upper()]
    if mes > 0:
        df = df[df["_mes"] == mes]
    if dia > 0:
        df = df[df["_dia"] == dia]

    metricas = _calcular_metricas(df)

    return {
        "ok":          True,
        "filename":    _estado["filename"],
        "cargado":     _estado["cargado"],
        "total_filas": len(df),
        "metricas":    metricas,
        "valores_filtro": {
            "usuarios": sorted(_estado["df"]["Usuario"].unique().tolist()),
            "meses":    sorted(_estado["df"]["_mes"].dropna().unique().astype(int).tolist()),
            "dias":     sorted(_estado["df"]["_dia"].dropna().unique().astype(int).tolist()),
        }
    }


@router.get("/picking/estado")
def get_estado():
    return {
        "cargado":  _estado["df"] is not None,
        "filename": _estado["filename"],
        "procesado":_estado["cargado"],
        "filas":    len(_estado["df"]) if _estado["df"] is not None else 0,
    }
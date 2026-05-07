"""
routers/sbl.py
Módulo de productividad SBL
"""

import os
import uuid
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from config import UPLOAD_FOLDER
from database import guardar_sbl

router  = APIRouter()
_estado = { "df": None, "filename": None, "cargado": None }


def _leer_sbl(filepath: str) -> pd.DataFrame:
    try:
        df = pd.read_excel(filepath, sheet_name="DB", engine="openpyxl")
    except Exception:
        df = pd.read_excel(filepath, sheet_name=0, engine="openpyxl")

    # strip() elimina espacios en nombres de columnas
    # El archivo tiene "Fecha " con espacio al final
    df.columns = df.columns.str.strip()

    # ── Normalizar fecha ──────────────────────────────────────────────────
    if "Fecha" in df.columns:
        df["Fecha"]      = pd.to_datetime(df["Fecha"], errors="coerce")
        df["_fecha_str"] = df["Fecha"].dt.strftime("%Y-%m-%d")
        df["_mes"]       = df["Fecha"].dt.month.astype("Int64")
        df["_año"]       = df["Fecha"].dt.year.astype("Int64")
        df["_dia"]       = df["Fecha"].dt.day.astype("Int64")
    elif "DD" in df.columns:
        df["_fecha_str"] = (
            df["AA"].astype(str) + "-" +
            df["MM"].astype(str).str.zfill(2) + "-" +
            df["DD"].astype(str).str.zfill(2)
        )
        df["_mes"] = df["MM"].astype(int)
        df["_año"] = df["AA"].astype(int)
        df["_dia"] = df["DD"].astype(int)

    # ── Normalizar números ────────────────────────────────────────────────
    for col in ["Unidades confirmadas", "Líneas", "Unidades / Hora",
                "Líneas / Hora", "Total tiempo", "Unidades * Hora",
                "Lineas*Hora", "Meta 500u", "Meta proyeccion/Unidades",
                "Tiempo de actividad * Hora"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # ── Normalizar texto ──────────────────────────────────────────────────
    # IMPORTANTE: Desempeño es texto "Cumpliendo"/"Incumpliendo"
    # NO convertir a número — es una columna categórica
    if "Operario" in df.columns:
        df["Operario"] = df["Operario"].astype(str).str.strip().str.upper()

    if "Desempeño" in df.columns:
        df["Desempeño"] = df["Desempeño"].astype(str).str.strip()

    if "Nombre Mes" in df.columns:
        df["Nombre Mes"] = df["Nombre Mes"].astype(str).str.strip()

    df = df[df["Operario"].notna() & (df["Operario"] != "NAN")].reset_index(drop=True)
    return df


def _calcular_metricas_sbl(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"kpis": {}, "por_operario": [], "bajo_meta": [],
                "tendencia_mensual": [], "detalle": []}

    META_UPH = 500

    total_unidades   = float(df["Unidades confirmadas"].sum()) if "Unidades confirmadas" in df.columns else 0
    total_lineas     = float(df["Líneas"].sum())               if "Líneas"               in df.columns else 0
    operarios_unicos = int(df["Operario"].nunique())

    avg_uph = round(float(df["Unidades / Hora"].mean()), 1) if "Unidades / Hora" in df.columns else 0
    avg_lph = round(float(df["Líneas / Hora"].mean()),   1) if "Líneas / Hora"   in df.columns else 0

    # Cumplimiento: registros donde Desempeño == "Cumpliendo"
    # Usamos strip().lower() para evitar errores por espacios o mayúsculas
    cumpliendo      = 0
    total_registros = len(df)
    if "Desempeño" in df.columns:
        cumpliendo = int(
            (df["Desempeño"].astype(str).str.strip().str.lower() == "cumpliendo").sum()
        )
    pct_cumplimiento = round(cumpliendo / total_registros * 100, 1) if total_registros > 0 else 0

    # ── Por operario ──────────────────────────────────────────────────────
    por_operario = []
    if "Operario" in df.columns:
        agg_dict = {
            "unidades":   ("Unidades confirmadas", "sum"),
            "lineas":     ("Líneas",               "sum"),
            "uph":        ("Unidades / Hora",       "mean"),
            "lph":        ("Líneas / Hora",         "mean"),
            "registros":  ("Operario",              "count"),
        }
        if "_fecha_str" in df.columns:
            agg_dict["dias"] = ("_fecha_str", "nunique")

        op_grp = df.groupby("Operario").agg(**agg_dict).reset_index()
        op_grp["uph"] = op_grp["uph"].round(1)
        op_grp["lph"] = op_grp["lph"].round(1)

        # Calcular cumpliendo por operario
        if "Desempeño" in df.columns:
            cumpliendo_op = df.groupby("Operario").apply(
                lambda x: (x["Desempeño"].astype(str).str.strip().str.lower() == "cumpliendo").sum()
            ).reset_index(name="cumpliendo_cnt")
            op_grp = op_grp.merge(cumpliendo_op, on="Operario", how="left")
            op_grp["pct_cumplimiento"] = (
                op_grp["cumpliendo_cnt"] / op_grp["registros"] * 100
            ).round(1)
        else:
            op_grp["pct_cumplimiento"] = 0

        op_grp["cumple_meta"] = op_grp["uph"] >= META_UPH
        op_grp["pct_meta"]    = op_grp["uph"].apply(
            lambda x: min(round(x / META_UPH * 100, 1), 100)
        )

        por_operario = op_grp.sort_values("uph", ascending=False).to_dict(orient="records")

    bajo_meta = [o for o in por_operario if not o.get("cumple_meta", True)]

    # ── Tendencia mensual ─────────────────────────────────────────────────
    tendencia_mensual = []
    if "_mes" in df.columns and "_año" in df.columns:
        m_grp = df.groupby(["_año", "_mes"]).agg(
            uph=("Unidades / Hora", "mean"),
            lph=("Líneas / Hora",   "mean"),
            unidades=("Unidades confirmadas", "sum"),
            lineas=("Líneas", "sum"),
            dias=("_fecha_str", "nunique") if "_fecha_str" in df.columns else ("Operario", "count"),
        ).reset_index()
        m_grp["uph"]  = m_grp["uph"].round(1)
        m_grp["lph"]  = m_grp["lph"].round(1)
        m_grp["meta"] = META_UPH
        # Convertir Int64 a int normal para JSON
        m_grp["_mes"] = m_grp["_mes"].astype(int)
        m_grp["_año"] = m_grp["_año"].astype(int)
        tendencia_mensual = m_grp.sort_values(["_año", "_mes"]).to_dict(orient="records")

    # ── Detalle por operario + mes ────────────────────────────────────────
    detalle = []
    if "_mes" in df.columns:
        agg_det = {
            "unidades":  ("Unidades confirmadas", "sum"),
            "lineas":    ("Líneas",               "sum"),
            "uph":       ("Unidades / Hora",       "mean"),
            "lph":       ("Líneas / Hora",         "mean"),
            "registros": ("Operario",              "count"),
        }
        if "_fecha_str" in df.columns:
            agg_det["dias"] = ("_fecha_str", "nunique")

        det = df.groupby(["Operario", "_mes"]).agg(**agg_det).reset_index()
        det["uph"] = det["uph"].round(1)
        det["lph"] = det["lph"].round(1)
        det["pct_meta"] = det["uph"].apply(
            lambda x: min(round(x / META_UPH * 100, 1), 100)
        )
        det["cumple"] = det["uph"] >= META_UPH

        if "Desempeño" in df.columns:
            cumpliendo_det = df.groupby(["Operario", "_mes"]).apply(
                lambda x: (x["Desempeño"].astype(str).str.strip().str.lower() == "cumpliendo").sum()
            ).reset_index(name="cumpliendo_cnt")
            det = det.merge(cumpliendo_det, on=["Operario", "_mes"], how="left")
            det["pct_cumplimiento"] = (
                det["cumpliendo_cnt"] / det["registros"] * 100
            ).round(1)
        else:
            det["pct_cumplimiento"] = 0

        # Convertir Int64 a int para JSON
        det["_mes"] = det["_mes"].astype(int)
        detalle = det.sort_values(["Operario", "_mes"]).to_dict(orient="records")

    return {
        "kpis": {
            "total_unidades":   total_unidades,
            "total_lineas":     total_lineas,
            "operarios_unicos": operarios_unicos,
            "avg_uph":          avg_uph,
            "avg_lph":          avg_lph,
            "pct_cumplimiento": pct_cumplimiento,
            "meta_uph":         META_UPH,
            "cumpliendo":       cumpliendo,
            "total_registros":  total_registros,
        },
        "por_operario":     por_operario,
        "bajo_meta":        bajo_meta,
        "tendencia_mensual":tendencia_mensual,
        "detalle":          detalle,
    }


@router.post("/sbl/upload")
async def upload_sbl(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Solo .xlsx o .xls")

    filename = f"sbl_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    contenido = await file.read()
    with open(filepath, "wb") as f:
        f.write(contenido)

    try:
        df       = _leer_sbl(filepath)
        metricas = _calcular_metricas_sbl(df)
        guardar_sbl(file.filename, len(df), metricas) 
        _estado.update({
            "df":       df,
            "filename": file.filename,
            "cargado":  datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        return { "ok": True, "filename": file.filename,
                 "filas": len(df), "cargado": _estado["cargado"], "metricas": metricas }
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")


@router.get("/sbl/metricas")
def get_metricas_sbl(
    operario: str = "", mes: int = 0, año: int = 0, dia: int = 0
):
    if _estado["df"] is None:
        raise HTTPException(status_code=404, detail="No hay datos cargados")

    df = _estado["df"].copy()

    if operario: df = df[df["Operario"] == operario.upper()]
    if mes > 0 and "_mes" in df.columns:
        df = df[df["_mes"] == mes]
    if año > 0 and "_año" in df.columns:
        df = df[df["_año"] == año]
    if dia > 0 and "_dia" in df.columns:
        df = df[df["_dia"] == dia]

    metricas = _calcular_metricas_sbl(df)

    return {
        "ok":          True,
        "filename":    _estado["filename"],
        "cargado":     _estado["cargado"],
        "total_filas": len(df),
        "metricas":    metricas,
        "valores_filtro": {
            "operarios": sorted(_estado["df"]["Operario"].dropna().unique().tolist()),
            "meses":     sorted(_estado["df"]["_mes"].dropna().astype(int).unique().tolist()) if "_mes" in _estado["df"].columns else [],
            "años":      sorted(_estado["df"]["_año"].dropna().astype(int).unique().tolist()) if "_año" in _estado["df"].columns else [],
            "dias":      sorted(_estado["df"]["_dia"].dropna().astype(int).unique().tolist()) if "_dia" in _estado["df"].columns else [],
        }
    }


@router.get("/sbl/estado")
def get_estado_sbl():
    return {
        "cargado":  _estado["df"] is not None,
        "filename": _estado["filename"],
        "procesado":_estado["cargado"],
        "filas":    len(_estado["df"]) if _estado["df"] is not None else 0,
    }
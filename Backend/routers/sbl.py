"""
routers/sbl.py

Módulo de productividad SBL (Sistema de Bandas Logísticas).

Lógica de negocio:
- Recibe el Excel generado por el script de Selenium (web AtpPut)
- Lee la hoja "DB"
- Calcula KPIs de productividad por operario
- Compara contra meta de 500 unidades/hora
- Identifica operarios bajo meta y tendencia de desempeño

Columnas esperadas:
  Fecha, Operario, Tiempo de actividad * Hora,
  Unidades confirmadas, Líneas, Unidades / Hora,
  Líneas / Hora, Total tiempo, Unidades * Hora,
  Lineas*Hora, DD, MM, AA, Meta 500u,
  Meta proyeccion/Unidades, Desempeño, Nombre Mes
"""

import os
import uuid
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from config import UPLOAD_FOLDER

router  = APIRouter()

_estado = {
    "df":       None,
    "filename": None,
    "cargado":  None,
}


def _leer_sbl(filepath: str) -> pd.DataFrame:
    """
    Lee y normaliza el Excel de SBL.

    ¿Por qué leer la hoja 'DB'?
    El script de Selenium genera varias hojas pero 'DB'
    es la que tiene el detalle por operario por día —
    que es lo que necesitamos para calcular KPIs individuales.
    """
    try:
        df = pd.read_excel(filepath, sheet_name="DB", engine="openpyxl")
    except Exception:
        df = pd.read_excel(filepath, sheet_name=0, engine="openpyxl")

    df.columns = df.columns.str.strip()

    # ── Normalizar fecha ──────────────────────────────────────────────────
    if "Fecha" in df.columns:
        df["Fecha"] = pd.to_datetime(df["Fecha"], errors="coerce")
        df["_fecha_str"] = df["Fecha"].dt.strftime("%Y-%m-%d")
        df["_mes"]  = df["Fecha"].dt.month
        df["_año"]  = df["Fecha"].dt.year
    elif "DD" in df.columns and "MM" in df.columns and "AA" in df.columns:
        # Construir fecha desde columnas separadas DD, MM, AA
        df["_fecha_str"] = (
            df["AA"].astype(str) + "-" +
            df["MM"].astype(str).str.zfill(2) + "-" +
            df["DD"].astype(str).str.zfill(2)
        )
        df["_mes"] = df["MM"].astype(int)
        df["_año"] = df["AA"].astype(int)

    # ── Normalizar números ────────────────────────────────────────────────
    for col in ["Unidades confirmadas", "Líneas", "Unidades / Hora",
                "Líneas / Hora", "Total tiempo", "Unidades * Hora",
                "Lineas*Hora", "Meta 500u", "Meta proyeccion/Unidades",
                "Desempeño", "Tiempo de actividad * Hora"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # ── Normalizar texto ──────────────────────────────────────────────────
    if "Operario" in df.columns:
        df["Operario"] = df["Operario"].astype(str).str.strip().str.upper()

    if "Nombre Mes" in df.columns:
        df["Nombre Mes"] = df["Nombre Mes"].astype(str).str.strip()

    # Limpiar filas sin operario
    df = df.dropna(subset=["Operario"]).reset_index(drop=True)
    df = df[df["Operario"] != "NAN"].reset_index(drop=True)

    return df


def _calcular_metricas_sbl(df: pd.DataFrame) -> dict:
    """
    Calcula KPIs de SBL.

    Lógica de negocio:
    - Meta = 500 unidades/hora (estándar Prebel)
    - Desempeño = (Unidades/Hora real / 500) * 100
    - Un operario "cumple" si su Unidades/Hora >= 500
    - Tendencia muestra si el equipo está mejorando o empeorando
    """

    # ── KPIs globales ─────────────────────────────────────────────────────
    total_unidades   = float(df["Unidades confirmadas"].sum()) if "Unidades confirmadas" in df.columns else 0
    total_lineas     = float(df["Líneas"].sum())               if "Líneas"               in df.columns else 0
    operarios_unicos = df["Operario"].nunique()                if "Operario"              in df.columns else 0

    # Promedio de Unidades/Hora del equipo completo
    # Esta es la métrica más importante del SBL —
    # si baja de 500 hay un problema operativo
    avg_uph = round(
        float(df["Unidades / Hora"].mean())
        if "Unidades / Hora" in df.columns else 0, 1
    )

    # Promedio de Líneas/Hora
    avg_lph = round(
        float(df["Líneas / Hora"].mean())
        if "Líneas / Hora" in df.columns else 0, 1
    )

    # Desempeño promedio del equipo
    avg_desempeno = round(
        float(df["Desempeño"].mean())
        if "Desempeño" in df.columns else 0, 1
    )

    META_UPH = 500  # Meta estándar de Prebel

    pct_cumplimiento = round((avg_uph / META_UPH * 100), 1) if META_UPH > 0 else 0

    # ── Por operario ──────────────────────────────────────────────────────
    por_operario = []
    if "Operario" in df.columns:
        op_grp = df.groupby("Operario").agg(
            unidades=("Unidades confirmadas", "sum"),
            lineas=("Líneas", "sum"),
            uph=("Unidades / Hora", "mean"),
            lph=("Líneas / Hora", "mean"),
            desempeno=("Desempeño", "mean"),
            dias=("_fecha_str", "nunique") if "_fecha_str" in df.columns else ("Operario", "count"),
        ).reset_index()

        op_grp["uph"]      = op_grp["uph"].round(1)
        op_grp["lph"]      = op_grp["lph"].round(1)
        op_grp["desempeno"]= op_grp["desempeno"].round(1)
        op_grp["cumple_meta"] = op_grp["uph"] >= META_UPH

        por_operario = op_grp.sort_values("uph", ascending=False).to_dict(orient="records")

    # ── Bajo meta ─────────────────────────────────────────────────────────
    # Alerta crítica: operarios con UPH < 500
    # El supervisor necesita saber quiénes están bajo meta
    bajo_meta = [o for o in por_operario if not o.get("cumple_meta", True)]

    # ── Tendencia diaria ──────────────────────────────────────────────────
    tendencia_diaria = []
    if "_fecha_str" in df.columns:
        d_grp = df.groupby("_fecha_str").agg(
            unidades=("Unidades confirmadas", "sum"),
            lineas=("Líneas", "sum"),
            uph=("Unidades / Hora", "mean"),
            operarios=("Operario", "nunique"),
        ).reset_index()
        d_grp["uph"] = d_grp["uph"].round(1)
        d_grp["cumple_meta"] = d_grp["uph"] >= META_UPH
        tendencia_diaria = d_grp.sort_values("_fecha_str").to_dict(orient="records")

    # ── Tendencia mensual ─────────────────────────────────────────────────
    tendencia_mensual = []
    if "_año" in df.columns and "_mes" in df.columns:
        col_mes = "Nombre Mes" if "Nombre Mes" in df.columns else "_mes"
        m_grp = df.groupby(["_año", "_mes"]).agg(
            unidades=("Unidades confirmadas", "sum"),
            lineas=("Líneas", "sum"),
            uph=("Unidades / Hora", "mean"),
        ).reset_index()
        m_grp["uph"] = m_grp["uph"].round(1)
        tendencia_mensual = m_grp.sort_values(["_año", "_mes"]).to_dict(orient="records")

    return {
        "kpis": {
            "total_unidades":   total_unidades,
            "total_lineas":     total_lineas,
            "operarios_unicos": operarios_unicos,
            "avg_uph":          avg_uph,
            "avg_lph":          avg_lph,
            "avg_desempeno":    avg_desempeno,
            "pct_cumplimiento": pct_cumplimiento,
            "meta_uph":         META_UPH,
        },
        "por_operario":     por_operario,
        "bajo_meta":        bajo_meta,
        "tendencia_diaria": tendencia_diaria,
        "tendencia_mensual":tendencia_mensual,
    }


# ══════════════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

@router.post("/sbl/upload")
async def upload_sbl(file: UploadFile = File(...)):
    """
    Recibe el Excel de SBL generado por el script de Selenium.
    Mismo patrón que picking/upload.
    """
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

        _estado["df"]       = df
        _estado["filename"] = file.filename
        _estado["cargado"]  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        return {
            "ok":       True,
            "filename": file.filename,
            "filas":    len(df),
            "cargado":  _estado["cargado"],
            "metricas": metricas,
        }
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Error al procesar: {str(e)}")


@router.get("/sbl/metricas")
def get_metricas_sbl(
    operario:    str = "",
    mes:         int = 0,
    año:         int = 0,
    fecha_desde: str = "",
    fecha_hasta: str = "",
):
    if _estado["df"] is None:
        raise HTTPException(status_code=404, detail="No hay datos cargados")

    df = _estado["df"].copy()

    if operario:
        df = df[df["Operario"].str.upper().str.contains(operario.upper(), na=False)]
    if mes > 0 and "_mes" in df.columns:
        df = df[df["_mes"] == mes]
    if año > 0 and "_año" in df.columns:
        df = df[df["_año"] == año]
    if fecha_desde and "_fecha_str" in df.columns:
        df = df[df["_fecha_str"] >= fecha_desde]
    if fecha_hasta and "_fecha_str" in df.columns:
        df = df[df["_fecha_str"] <= fecha_hasta]

    metricas = _calcular_metricas_sbl(df)

    operarios_lista = sorted(
        _estado["df"]["Operario"].dropna().unique().tolist()
    ) if "Operario" in _estado["df"].columns else []

    meses_lista = sorted(
        _estado["df"]["_mes"].dropna().unique().astype(int).tolist()
    ) if "_mes" in _estado["df"].columns else []

    años_lista = sorted(
        _estado["df"]["_año"].dropna().unique().astype(int).tolist()
    ) if "_año" in _estado["df"].columns else []

    return {
        "ok":           True,
        "filename":     _estado["filename"],
        "cargado":      _estado["cargado"],
        "total_filas":  len(df),
        "metricas":     metricas,
        "valores_filtro": {
            "operarios": operarios_lista,
            "meses":     meses_lista,
            "años":      años_lista,
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
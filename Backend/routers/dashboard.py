import os
from datetime import datetime
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from config import RESULT_FOLDER
from database import obtener_historial_por_id, obtener_ultimo_excel
from procesador import (
    aplicar_filtros_dashboard,
    calcular_metricas,
    obtener_valores_filtro,
)

router = APIRouter()


def _leer_y_normalizar(excel_path: str) -> pd.DataFrame:
    df = pd.read_excel(excel_path, engine="openpyxl").fillna("")
    if "Estado" in df.columns:
        def _norm(val):
            v = str(val).strip().upper()
            if v in ("ENTREGADA", "ENTREGADO", "CUMPLIDO"):
                return "CUMPLIDO"
            return str(val).strip()
        df["Estado"] = df["Estado"].apply(_norm)
    return df


def _resolver_excel(historial_id, rama: str = "") -> str:
    if historial_id is not None:
        registro = obtener_historial_por_id(historial_id)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        path = os.path.join(RESULT_FOLDER, registro["archivo"])
    else:
        path = obtener_ultimo_excel(rama)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No hay datos procesados aún")
    return path


@router.get("/dashboard")
def get_dashboard(
    historial_id:     Optional[int] = Query(default=None),
    rama:             Optional[str] = Query(default=""),
    numero_documento: Optional[str] = Query(default=""),
    mes:              Optional[str] = Query(default=""),
    transportador:    Optional[str] = Query(default=""),
    ciudad_destino:   Optional[str] = Query(default=""),
    destinatario:     Optional[str] = Query(default=""),
    estado:           Optional[str] = Query(default=""),
):
    excel_path = _resolver_excel(historial_id, rama or "")

    try:
        df = _leer_y_normalizar(excel_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo Excel: {e}")

    valores_filtro = obtener_valores_filtro(df)

    filtros = {
        "numero_documento": numero_documento or "",
        "mes":              mes              or "",
        "transportador":    transportador    or "",
        "ciudad_destino":   ciudad_destino   or "",
        "destinatario":     destinatario     or "",
        "estado":           estado           or "",
    }
    df_filtrado = aplicar_filtros_dashboard(df, filtros)
    metricas    = calcular_metricas(df_filtrado)
    preview     = df_filtrado.head(100).astype(str).to_dict(orient="records")

    return {
        "total_original":  len(df),
        "total_filtrado":  len(df_filtrado),
        "metricas":        metricas,
        "preview":         preview,
        "columns":         list(df_filtrado.columns),
        "valores_filtro":  valores_filtro,
        "filtros_activos": {k: v for k, v in filtros.items() if v},
        "archivo":         os.path.basename(excel_path),
    }


@router.get("/dashboard/download")
def download_dashboard_filtrado(
    historial_id:     Optional[int] = Query(default=None),
    rama:             Optional[str] = Query(default=""),
    numero_documento: Optional[str] = Query(default=""),
    mes:              Optional[str] = Query(default=""),
    transportador:    Optional[str] = Query(default=""),
    ciudad_destino:   Optional[str] = Query(default=""),
    destinatario:     Optional[str] = Query(default=""),
    estado:           Optional[str] = Query(default=""),
):
    excel_path = _resolver_excel(historial_id, rama or "")

    try:
        df = _leer_y_normalizar(excel_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo Excel: {e}")

    filtros = {
        "numero_documento": numero_documento or "",
        "mes":              mes              or "",
        "transportador":    transportador    or "",
        "ciudad_destino":   ciudad_destino   or "",
        "destinatario":     destinatario     or "",
        "estado":           estado           or "",
    }
    df_filtrado = aplicar_filtros_dashboard(df, filtros)

    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp_name = f"filtrado_{rama or 'todos'}_{ts}.xlsx"
    tmp_path = os.path.join(RESULT_FOLDER, tmp_name)
    df_filtrado.to_excel(tmp_path, index=False)

    return FileResponse(
        path=tmp_path,
        filename=tmp_name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
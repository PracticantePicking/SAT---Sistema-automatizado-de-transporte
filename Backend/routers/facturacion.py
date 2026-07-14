"""
routers/facturacion.py
Módulo de análisis estratégico de facturación SAP
"""
import os
import json
import uuid
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from config import UPLOAD_FOLDER

router = APIRouter()

#  Storage en memoria del último archivo procesado 
_estado = {
    "df":        None,
    "filename":  None,
    "procesado": None,
}

#  HELPER: leer y normalizar el Excel de SAP 
def _leer_sap(filepath: str) -> pd.DataFrame:
    # Intentar detectar automáticamente dónde están los headers
    # Primero leer sin headers para encontrar la fila correcta
    raw = pd.read_excel(filepath, engine="openpyxl", header=None)
    
    # Buscar la fila que contiene los headers reales
    header_row = 0
    for i, row in raw.iterrows():
        valores = [str(v).strip() for v in row if pd.notna(v)]
        # Si la fila tiene al menos 3 valores no nulos que parecen headers
        if len(valores) >= 3 and any(
            v in valores for v in ['Solicitante', 'Pedido', 'Factura', 'Valor Neto', 'Suma de Valor Neto']
        ):
            header_row = i
            break

    df = pd.read_excel(filepath, engine="openpyxl", header=header_row)
    df.columns = df.columns.str.strip()

    # Eliminar columnas Unnamed
    df = df.loc[:, ~df.columns.str.startswith('Unnamed')]

    # Eliminar filas completamente vacías
    df = df.dropna(how='all').reset_index(drop=True)

    # Normalizar columna de valor — puede llamarse "Valor Neto" o "Suma de Valor Neto"
    if 'Suma de Valor Neto' in df.columns and 'Valor Neto' not in df.columns:
        df.rename(columns={'Suma de Valor Neto': 'Valor Neto'}, inplace=True)

    # Normalizar tipos
    if 'Valor Neto' in df.columns:
        df['Valor Neto'] = pd.to_numeric(df['Valor Neto'], errors='coerce').fillna(0)

    if 'Cantidad' in df.columns:
        df['Cantidad'] = pd.to_numeric(df['Cantidad'], errors='coerce').fillna(0)
    else:
        df['Cantidad'] = 0

    # Fecha — puede no existir en tabla dinámica
    if 'Fecha factura' in df.columns:
        df['Fecha factura'] = pd.to_datetime(df['Fecha factura'], errors='coerce')
        df['Mes']       = df['Fecha factura'].dt.month
        df['Año']       = df['Fecha factura'].dt.year
        df['MesNombre'] = df['Fecha factura'].dt.strftime('%B %Y')
    else:
        df['Mes'] = 0
        df['Año'] = 0
        df['MesNombre'] = ''

    # CDis — limpiar
    if 'CDis' in df.columns:
        df['CDis'] = df['CDis'].astype(str).str.strip().str.zfill(2)

    # Solicitante
    if 'Solicitante' in df.columns:
        df['Solicitante'] = df['Solicitante'].astype(str).str.strip()

    # Solo tomar columnas relevantes que existen
    cols_relevantes = [c for c in [
        'Pedido', 'Nº de pedido', 'Solicitante', 'CDis',
        'Valor Neto', 'Cantidad', 'Mes', 'Año', 'MesNombre',
        'Grupo de artículos', 'Número de material', 'MARCA', 'Factura'
    ] if c in df.columns]

    df = df[cols_relevantes].copy()

    # Eliminar filas donde Valor Neto es 0 o NaN y no hay solicitante
    df = df[df['Valor Neto'] > 0].reset_index(drop=True)

    return df


#  HELPER: calcular métricas 
def _calcular_metricas(df: pd.DataFrame) -> dict:

    total_facturado  = float(df["Valor Neto"].sum())
    total_unidades   = float(df["Cantidad"].sum())
    total_facturas   = df["Factura"].nunique() if "Factura" in df.columns else 0
    ticket_promedio  = total_facturado / total_facturas if total_facturas > 0 else 0

    #  Por canal (CDis)
    por_canal = []
    if "CDis" in df.columns:
        canal_grp = df.groupby("CDis").agg(
            valor=("Valor Neto", "sum"),
            unidades=("Cantidad", "sum"),
            facturas=("Factura", "nunique") if "Factura" in df.columns else ("Cantidad", "count")
        ).reset_index().sort_values("valor", ascending=False)
        por_canal = canal_grp.to_dict(orient="records")

    #  Top 10 clientes 
    top_clientes = []
    if "Solicitante" in df.columns:
        cli_grp = df.groupby("Solicitante").agg(
            valor=("Valor Neto", "sum"),
            unidades=("Cantidad", "sum")
        ).reset_index().sort_values("valor", ascending=False).head(10)
        top_clientes = cli_grp.to_dict(orient="records")

    #  Top 10 productos 
    top_productos = []
    col_prod = "Número de material" if "Número de material" in df.columns else None
    if col_prod:
        prod_grp = df.groupby(col_prod).agg(
            valor=("Valor Neto", "sum"),
            unidades=("Cantidad", "sum")
        ).reset_index().sort_values("valor", ascending=False).head(10)
        top_productos = prod_grp.to_dict(orient="records")

    # ── Por categoría (Grupo artículos)
    por_categoria = []
    if "Grupo de artículos" in df.columns:
        cat_grp = df.groupby("Grupo de artículos").agg(
            valor=("Valor Neto", "sum"),
            unidades=("Cantidad", "sum")
        ).reset_index().sort_values("valor", ascending=False)
        por_categoria = cat_grp.to_dict(orient="records")

    # ── Tendencia mensual 
    tendencia_mensual = []
    if "MesNombre" in df.columns:
        mes_grp = df.groupby(["Año", "Mes", "MesNombre"]).agg(
            valor=("Valor Neto", "sum"),
            unidades=("Cantidad", "sum")
        ).reset_index().sort_values(["Año", "Mes"])
        tendencia_mensual = mes_grp.to_dict(orient="records")

    # ── Por marca 
    por_marca = []
    if "MARCA" in df.columns:
        marca_grp = df.groupby("MARCA").agg(
            valor=("Valor Neto", "sum"),
            unidades=("Cantidad", "sum")
        ).reset_index().sort_values("valor", ascending=False)
        por_marca = marca_grp.to_dict(orient="records")

    return {
        "kpis": {
            "total_facturado": total_facturado,
            "total_unidades":  total_unidades,
            "total_facturas":  total_facturas,
            "ticket_promedio": ticket_promedio,
        },
        "por_canal":        por_canal,
        "top_clientes":     top_clientes,
        "top_productos":    top_productos,
        "por_categoria":    por_categoria,
        "tendencia_mensual":tendencia_mensual,
        "por_marca":        por_marca,
    }

#  ENDPOINTS

@router.post("/facturacion/upload")
async def upload_facturacion(file: UploadFile = File(...)):
    """Sube y procesa el archivo Excel de SAP"""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Solo .xlsx o .xls")

    filename = f"sap_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    contenido = await file.read()
    with open(filepath, "wb") as f:
        f.write(contenido)

    try:
        df = _leer_sap(filepath)
        metricas = _calcular_metricas(df)

        _estado["df"]        = df
        _estado["filename"]  = file.filename
        _estado["procesado"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        return {
            "ok":       True,
            "filename": file.filename,
            "filas":    len(df),
            "columnas": list(df.columns),
            "procesado": _estado["procesado"],
            "metricas": metricas,
        }
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Error al procesar: {str(e)}")


@router.get("/facturacion/metricas")
def get_metricas(
    canal:     str = "",
    cliente:   str = "",
    categoria: str = "",
    marca:     str = "",
    mes:       int = 0,
    año:       int = 0,
):
    """Retorna las métricas con filtros opcionales"""
    if _estado["df"] is None:
        raise HTTPException(status_code=404, detail="No hay datos cargados")

    df = _estado["df"].copy()

    # Aplicar filtros
    if canal:
        df = df[df["CDis"].str.upper() == canal.upper()]
    if cliente:
        df = df[df["Solicitante"].str.upper().str.contains(cliente.upper(), na=False)]
    if categoria and "Grupo de artículos" in df.columns:
        df = df[df["Grupo de artículos"].str.upper().str.contains(categoria.upper(), na=False)]
    if marca and "MARCA" in df.columns:
        df = df[df["MARCA"].str.upper() == marca.upper()]
    if mes > 0 and "Mes" in df.columns:
        df = df[df["Mes"] == mes]
    if año > 0 and "Año" in df.columns:
        df = df[df["Año"] == año]

    metricas = _calcular_metricas(df)

    return {
        "ok":           True,
        "filename":     _estado["filename"],
        "procesado":    _estado["procesado"],
        "total_filas":  len(df),
        "filtros_activos": {
            k: v for k, v in {
                "canal": canal, "cliente": cliente,
                "categoria": categoria, "marca": marca,
                "mes": mes, "año": año
            }.items() if v
        },
        "metricas": metricas,
        "valores_filtro": {
            "canales":    sorted(_estado["df"]["CDis"].dropna().unique().tolist()),
            "marcas":     sorted(_estado["df"]["MARCA"].dropna().unique().tolist()) if "MARCA" in _estado["df"].columns else [],
            "categorias": sorted(_estado["df"]["Grupo de artículos"].dropna().unique().tolist()) if "Grupo de artículos" in _estado["df"].columns else [],
            "años":       sorted(_estado["df"]["Año"].dropna().unique().astype(int).tolist()) if "Año" in _estado["df"].columns else [],
            "meses":      sorted(_estado["df"]["Mes"].dropna().unique().astype(int).tolist()) if "Mes" in _estado["df"].columns else [],
        }
    }


@router.get("/facturacion/estado")
def get_estado():
    """Retorna si hay datos cargados"""
    return {
        "cargado":   _estado["df"] is not None,
        "filename":  _estado["filename"],
        "procesado": _estado["procesado"],
        "filas":     len(_estado["df"]) if _estado["df"] is not None else 0,
    }
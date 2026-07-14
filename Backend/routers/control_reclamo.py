"""
routers/control_reclamo.py
Módulo Control Reclamo — Dashboard + Registro + Filtros

Conceptos clave:
  - Un CONTROL = un FACTURA2 único (puede tener varias referencias/filas)
  - "Controles" → COUNT(DISTINCT factura2)
  - "Valor"     → SUM(valor)
"""

import sqlite3
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from database import DB_FILE, insertar_control_reclamo

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════
#  CONSTRUCTOR DE FILTROS (patrón WHERE 1=1)
# ══════════════════════════════════════════════════════════════════════════

def _construir_filtros(año, mes, canal, usuario, cliente):
    """
    Construye la cláusula WHERE dinámica y la lista de parámetros.
    Retorna (where_sql, params).
    """
    where  = " WHERE 1=1"
    params = []

    if año:
        where += " AND año = ?"
        params.append(año)
    if mes:
        where += " AND mes = ?"
        params.append(mes)
    if canal:
        where += " AND canal = ?"
        params.append(canal)
    if usuario:
        where += " AND usuario = ?"
        params.append(usuario)
    if cliente:
        where += " AND nombre_cliente LIKE ?"
        params.append(f"%{cliente}%")

    return where, params


# ══════════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ══════════════════════════════════════════════════════════════════════════

@router.get("/control-reclamo/dashboard")
def dashboard(
    año:     int = 0,
    mes:     int = 0,
    canal:   str = "",
    usuario: str = "",
    cliente: str = "",
):
    where, params = _construir_filtros(año, mes, canal, usuario, cliente)

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    def q(sql, p=None):
        return conn.execute(sql, p or params).fetchall()

    # ── KPIs generales ────────────────────────────────────────────────────
    kpi_row = conn.execute(
        f"SELECT COUNT(DISTINCT factura2) AS controles, "
        f"       COUNT(*) AS lineas, "
        f"       COALESCE(SUM(valor), 0) AS valor_total "
        f"FROM control_reclamo{where}", params
    ).fetchone()

    total_controles = kpi_row["controles"]
    total_lineas    = kpi_row["lineas"]
    valor_total     = kpi_row["valor_total"]

    # ── 1. Controles por año (COUNT DISTINCT factura2) ────────────────────
    por_año = [
        {"año": r["año"], "controles": r["controles"]}
        for r in q(
            f"SELECT año, COUNT(DISTINCT factura2) AS controles "
            f"FROM control_reclamo{where} AND año > 0 "
            f"GROUP BY año ORDER BY año"
        )
    ]

    # ── 2. Valor por mes (SUM valor) ──────────────────────────────────────
    MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
             'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    por_mes = [
        {"mes": r["mes"], "nombre_mes": MESES[r["mes"]] if 0 < r["mes"] <= 12 else str(r["mes"]),
         "valor": r["valor"]}
        for r in q(
            f"SELECT mes, COALESCE(SUM(valor),0) AS valor "
            f"FROM control_reclamo{where} AND mes > 0 "
            f"GROUP BY mes ORDER BY mes"
        )
    ]

    # ── 3. Participación por novedad (% por conteo de controles) ──────────
    novedad_rows = q(
        f"SELECT novedad, COUNT(DISTINCT factura2) AS controles, "
        f"       COALESCE(SUM(valor),0) AS valor "
        f"FROM control_reclamo{where} AND novedad != '' "
        f"GROUP BY novedad ORDER BY controles DESC"
    )
    suma_controles_nov = sum(r["controles"] for r in novedad_rows) or 1
    suma_valor_nov     = sum(r["valor"] for r in novedad_rows) or 1

    participacion_novedad = [
        {
            "novedad":    r["novedad"],
            "controles":  r["controles"],
            "valor":      r["valor"],
            "pct_control": round(r["controles"] / suma_controles_nov * 100, 1),
            "pct_valor":   round(r["valor"]     / suma_valor_nov     * 100, 1),
        }
        for r in novedad_rows
    ]

    # ── 4. Controles y valor por canal ────────────────────────────────────
    por_canal = [
        {"canal": r["canal"], "controles": r["controles"], "valor": r["valor"]}
        for r in q(
            f"SELECT canal, COUNT(DISTINCT factura2) AS controles, "
            f"       COALESCE(SUM(valor),0) AS valor "
            f"FROM control_reclamo{where} AND canal != '' "
            f"GROUP BY canal ORDER BY controles DESC"
        )
    ]

    # ── 5. Top 10 clientes más afectados (por # de controles) ─────────────
    top_clientes = [
        {"cliente": r["nombre_cliente"], "controles": r["controles"], "valor": r["valor"]}
        for r in q(
            f"SELECT nombre_cliente, COUNT(DISTINCT factura2) AS controles, "
            f"       COALESCE(SUM(valor),0) AS valor "
            f"FROM control_reclamo{where} AND nombre_cliente != '' "
            f"GROUP BY nombre_cliente ORDER BY controles DESC, valor DESC LIMIT 10"
        )
    ]

    # ── Valores para los selectores de filtro ─────────────────────────────
    años_disp    = [r[0] for r in conn.execute("SELECT DISTINCT año FROM control_reclamo WHERE año > 0 ORDER BY año DESC").fetchall()]
    canales_disp = [r[0] for r in conn.execute("SELECT DISTINCT canal FROM control_reclamo WHERE canal != '' ORDER BY canal").fetchall()]
    usuarios_disp = [r[0] for r in conn.execute("SELECT DISTINCT usuario FROM control_reclamo WHERE usuario != '' ORDER BY usuario").fetchall()]

    conn.close()

    return {
        "ok": True,
        "kpis": {
            "total_controles": total_controles,
            "total_lineas":    total_lineas,
            "valor_total":     round(valor_total, 2),
        },
        "por_año":               por_año,
        "por_mes":               por_mes,
        "participacion_novedad": participacion_novedad,
        "por_canal":             por_canal,
        "top_clientes":          top_clientes,
        "valores_filtro": {
            "años":     años_disp,
            "canales":  canales_disp,
            "usuarios": usuarios_disp,
            "meses":    [{"num": i, "nombre": MESES[i]} for i in range(1, 13)],
        },
    }


# ══════════════════════════════════════════════════════════════════════════
#  REGISTRAR NUEVO CONTROL (formulario web)
# ══════════════════════════════════════════════════════════════════════════

class NuevoReclamo(BaseModel):
    fecha:                    str = ""
    nota_credito:             str = ""
    factura2:                 str = ""
    fecha_factura:            str = ""
    codigo_cliente:           str = ""
    nombre_cliente:           str = ""
    codigo_vendedor:          str = ""
    nombre_vendedor:          str = ""
    referencia:               str = ""
    marca_referencia:         str = ""
    unidades:                 float = 0
    novedad:                  str = ""
    responsable:              str = ""
    trazabilidad:             str = ""
    unidades_3002:            float = 0
    usuario:                  str = ""
    tipo_picking:             str = ""
    estado:                   str = ""
    valor:                    float = 0
    fecha_entrega:            str = ""
    observaciones_transporte: str = ""
    dias_proceso:             float = 0
    indicador:                str = ""
    ciudad:                   str = ""
    canal:                    str = ""
    ceco:                     str = ""
    guias:                    str = ""
    permanencia_dias:         float = 0


MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
}


@router.post("/control-reclamo/registrar")
def registrar(reclamo: NuevoReclamo):
    r = reclamo.dict()

    # Derivar mes/año/nombre_mes desde la fecha
    if r["fecha"]:
        try:
            f = datetime.strptime(r["fecha"][:10], "%Y-%m-%d")
            r["mes"]        = f.month
            r["año"]        = f.year
            r["nombre_mes"] = MESES_ES.get(f.month, "")
        except Exception:
            r["mes"], r["año"], r["nombre_mes"] = 0, 0, ""
    else:
        r["mes"], r["año"], r["nombre_mes"] = 0, 0, ""

    r["fecha_insercion"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    resultado = insertar_control_reclamo([r])
    return {"ok": True, "insertados": resultado["insertados"]}


# ══════════════════════════════════════════════════════════════════════════
#  BÚSQUEDA / LISTADO con paginación
# ══════════════════════════════════════════════════════════════════════════

@router.get("/control-reclamo/registros")
def listar_registros(
    año:     int = 0,
    mes:     int = 0,
    canal:   str = "",
    usuario: str = "",
    cliente: str = "",
    limit:   int = 200,
):
    where, params = _construir_filtros(año, mes, canal, usuario, cliente)

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        f"SELECT * FROM control_reclamo{where} ORDER BY fecha DESC LIMIT ?",
        params + [limit]
    ).fetchall()
    conn.close()

    return {"ok": True, "total": len(rows), "registros": [dict(r) for r in rows]}


@router.get("/control-reclamo/estado")
def estado():
    conn  = sqlite3.connect(DB_FILE)
    total = conn.execute("SELECT COUNT(*) FROM control_reclamo").fetchone()[0]
    ctrl  = conn.execute("SELECT COUNT(DISTINCT factura2) FROM control_reclamo").fetchone()[0]
    conn.close()
    return {"total_filas": total, "total_controles": ctrl}
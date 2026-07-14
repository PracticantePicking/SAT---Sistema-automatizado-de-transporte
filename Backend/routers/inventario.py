"""
routers/inventario.py
Módulo de Inventario — Dashboard + Ingest + Ejecución script
"""

import os
import re
import threading
import subprocess
from datetime import datetime, date
from collections import defaultdict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from database import insertar_inventario_registros


router = APIRouter()


META = 99.0

MESES_NOMBRE = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}


#  Estado del proceso de ejecución
_proceso = {
    "corriendo": False,
    "iniciado":  None,
    "log":       [],
    "resultado": None,   # "ok" | "error" | None
}


#  INGEST — recibe datos del script de automatización

class InventarioRegistro(BaseModel):
    documento_inventario: Optional[str] = ""
    ubicacion:            Optional[str] = ""
    material:             Optional[str] = ""
    fecha:                Optional[str] = ""
    mes:                  Optional[str] = ""
    año:                  Optional[int] = 0
    nombre_mes:           Optional[str] = ""
    cantidad_teorica:     Optional[float] = 0
    cantidad_fisica:      Optional[float] = 0
    costo_cant_fisica:    Optional[float] = 0
    costo_cant_teorica:   Optional[float] = 0
    diferencia_abs:       Optional[float] = 0
    valor_abs:            Optional[float] = 0
    clasificacion:        Optional[str] = ""
    tipo_material:        Optional[str] = ""
    novedad:              Optional[str] = ""
    almacen:              Optional[str] = ""


class IngestRequest(BaseModel):
    registros: List[InventarioRegistro]


@router.post("/inventario/ingest")
def ingest_inventario(data: IngestRequest):
    if not data.registros:
        raise HTTPException(status_code=400, detail="Sin registros para insertar")

    registros_dict = [r.dict() for r in data.registros]
    resultado = insertar_inventario_registros(registros_dict)

    return {
        "ok":         True,
        "insertados": resultado["insertados"],
        "duplicados": resultado["duplicados"],
        "total":      len(registros_dict),
    }


#  EJECUCIÓN DEL SCRIPT EN SEGUNDO PLANO

def _construir_env():
    env = os.environ.copy()
    env["SAP_USUARIO"]  = os.getenv("SAP_USUARIO",  "")
    env["SAP_PASSWORD"] = os.getenv("SAP_PASSWORD", "")
    env["SAP_MANDANTE"] = os.getenv("SAP_MANDANTE", "400")
    env["SAP_SERVER"]   = os.getenv("SAP_SERVER",   "PRD [PRODUCTIVO]")
    env["SAP_SYS_NUM"]  = os.getenv("SAP_SYS_NUM",  "00")
    return env


def _ejecutar_script():
    """Corre en un hilo separado — lee el output línea por línea."""
    script_path = os.getenv("INVENTARIO_SCRIPT_PATH", "")

    if not script_path:
        _proceso["log"].append("ERROR: INVENTARIO_SCRIPT_PATH no configurado en .env")
        _proceso["resultado"] = "error"
        _proceso["corriendo"] = False
        return

    try:
        proceso = subprocess.Popen(
            ["python", script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=_construir_env(),
        )

        for linea in proceso.stdout:
            linea = linea.rstrip()
            if linea:
                _proceso["log"].append(linea)

        proceso.wait()

        if proceso.returncode == 0:
            _proceso["resultado"] = "ok"
            _proceso["log"].append("✅ Proceso completado exitosamente")
        else:
            _proceso["resultado"] = "error"
            _proceso["log"].append(f"❌ Proceso terminó con código {proceso.returncode}")

    except Exception as e:
        _proceso["log"].append(f"❌ Error: {str(e)}")
        _proceso["resultado"] = "error"
    finally:
        _proceso["corriendo"] = False


@router.post("/inventario/ejecutar")
def ejecutar_inventario():
    if _proceso["corriendo"]:
        raise HTTPException(status_code=409, detail="Ya hay un proceso corriendo")

    _proceso["corriendo"] = True
    _proceso["iniciado"]  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _proceso["log"]       = ["🚀 Iniciando automatización de inventario..."]
    _proceso["resultado"] = None

    hilo = threading.Thread(target=_ejecutar_script, daemon=True)
    hilo.start()

    return {"ok": True, "mensaje": "Proceso iniciado", "iniciado": _proceso["iniciado"]}


@router.get("/inventario/ejecutar/estado")
def get_estado_ejecucion():
    return {
        "corriendo": _proceso["corriendo"],
        "iniciado":  _proceso["iniciado"],
        "resultado": _proceso["resultado"],
        "log":       _proceso["log"],
    }


# ══════════════════════════════════════════════════════════════════════════
#  DASHBOARD — consulta y KPIs
# ══════════════════════════════════════════════════════════════════════════

@router.get("/inventario/dashboard")
def get_dashboard(
    mes:    str = "",
    año:    int = 0,
    clasificacion: str = "",
    novedad: str = "",
):
    from database import DB_FILE
    import sqlite3

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    query  = "SELECT * FROM inventario_registros WHERE 1=1"
    params = []

    if mes:
        query += " AND mes = ?"
        params.append(mes)
    if año > 0:
        query += " AND año = ?"
        params.append(año)
    if clasificacion:
        query += " AND clasificacion = ?"
        params.append(clasificacion)
    if novedad:
        query += " AND novedad = ?"
        params.append(novedad)

    rows = [dict(r) for r in conn.execute(query, params).fetchall()]

    # Valores únicos para filtros
    meses          = [r[0] for r in conn.execute("SELECT DISTINCT mes FROM inventario_registros WHERE mes != '' ORDER BY año, mes").fetchall()]
    años           = [r[0] for r in conn.execute("SELECT DISTINCT año FROM inventario_registros WHERE año > 0 ORDER BY año").fetchall()]
    clasificaciones = [r[0] for r in conn.execute("SELECT DISTINCT clasificacion FROM inventario_registros WHERE clasificacion != '' ORDER BY clasificacion").fetchall()]
    conn.close()

    if not rows:
        return {
            "ok": True,
            "total_filas": 0,
            "kpis": _kpis_vacios(),
            "tendencia_mensual": [],
            "por_clasificacion": [],
            "valores_filtro": {"meses": meses, "años": años, "clasificaciones": clasificaciones},
        }

    kpis = _calcular_kpis(rows)
    tendencia = _tendencia_mensual(rows)
    por_clas  = _por_clasificacion(rows)

    return {
        "ok":               True,
        "total_filas":      len(rows),
        "kpis":             kpis,
        "tendencia_mensual": tendencia,
        "por_clasificacion": por_clas,
        "valores_filtro":   {"meses": meses, "años": años, "clasificaciones": clasificaciones},
    }


def _kpis_vacios():
    return {
        "ind_valor": 0, "ind_unidades": 0,
        "ind_absoluto": 0, "ind_impacto": 0,
        "meta": META,
        "total_costo_fisica": 0, "total_costo_teorica": 0,
        "total_cant_fisica": 0,  "total_cant_teorica": 0,
        "total_diferencia_abs": 0, "total_valor_abs": 0,
    }


# ── Cálculo central de indicadores ─────────────────────────────────────────
# Denominador SIEMPRE el teórico, igual que la hoja 'Indicador 2026'.
# Una sola definición usada por KPIs, tendencia y clasificación.

def _indicadores(cf, ct, qf, qt, dabs, vabs) -> dict:
    return {
        # #1 Valor (neto): penaliza sobrante y faltante por igual
        "ind_valor":    round(max(0, 100 - abs((cf / ct) * 100 - 100)), 2) if ct else 0,
        # #2 Unidades (neto)
        "ind_unidades": round(max(0, 100 - abs((qf / qt) * 100 - 100)), 2) if qt else 0,
        # #4 Absoluto en unidades:  Σ|dif unidades| / unidades teóricas
        "ind_absoluto": round(max(0, 100 - (dabs / qt) * 100), 2) if qt else 0,
        # #3 Valor absoluto (impacto):  Σ|dif valor| / valor teórico
        "ind_impacto":  round(max(0, 100 - (vabs / ct) * 100), 2) if ct else 0,
    }


def _sumar(rows: list) -> dict:
    acc = {"cf": 0, "ct": 0, "qf": 0, "qt": 0, "dabs": 0, "vabs": 0}
    for r in rows:
        acc["cf"]   += r.get("costo_cant_fisica",  0) or 0
        acc["ct"]   += r.get("costo_cant_teorica", 0) or 0
        acc["qf"]   += r.get("cantidad_fisica",    0) or 0
        acc["qt"]   += r.get("cantidad_teorica",   0) or 0
        acc["dabs"] += r.get("diferencia_abs",     0) or 0
        acc["vabs"] += r.get("valor_abs",          0) or 0
    return acc


def _calcular_kpis(rows: list) -> dict:
    s = _sumar(rows)
    ind = _indicadores(s["cf"], s["ct"], s["qf"], s["qt"], s["dabs"], s["vabs"])
    return {
        **ind,
        "meta":                 META,
        "total_costo_fisica":   round(s["cf"], 2),
        "total_costo_teorica":  round(s["ct"], 2),
        "total_cant_fisica":    round(s["qf"], 2),
        "total_cant_teorica":   round(s["qt"], 2),
        "total_diferencia_abs": round(s["dabs"], 2),
        "total_valor_abs":      round(s["vabs"], 2),
    }


def _tendencia_mensual(rows: list) -> list:
    por_mes = defaultdict(lambda: {"cf": 0, "ct": 0, "qf": 0, "qt": 0, "dabs": 0, "vabs": 0, "nombre": ""})

    for r in rows:
        k = f"{r.get('año', 0)}-{str(r.get('mes', '')).zfill(2)}"
        d = por_mes[k]
        d["cf"]   += r.get("costo_cant_fisica",  0) or 0
        d["ct"]   += r.get("costo_cant_teorica", 0) or 0
        d["qf"]   += r.get("cantidad_fisica",    0) or 0
        d["qt"]   += r.get("cantidad_teorica",   0) or 0
        d["dabs"] += r.get("diferencia_abs",     0) or 0
        d["vabs"] += r.get("valor_abs",          0) or 0
        d["nombre"] = r.get("nombre_mes", "")

    resultado = []
    for mk in sorted(por_mes.keys()):
        d = por_mes[mk]
        ind = _indicadores(d["cf"], d["ct"], d["qf"], d["qt"], d["dabs"], d["vabs"])
        resultado.append({
            "mes":        mk,
            "nombre_mes": d["nombre"],
            **ind,
            "meta":       META,
        })

    return resultado


def _por_clasificacion(rows: list) -> list:
    por_clas = defaultdict(lambda: {"cf": 0, "ct": 0, "qf": 0, "qt": 0, "dabs": 0, "vabs": 0})

    for r in rows:
        k = r.get("clasificacion", "Sin clasificar") or "Sin clasificar"
        d = por_clas[k]
        d["cf"]   += r.get("costo_cant_fisica",  0) or 0
        d["ct"]   += r.get("costo_cant_teorica", 0) or 0
        d["qf"]   += r.get("cantidad_fisica",    0) or 0
        d["qt"]   += r.get("cantidad_teorica",   0) or 0
        d["dabs"] += r.get("diferencia_abs",     0) or 0
        d["vabs"] += r.get("valor_abs",          0) or 0

    resultado = []
    for clas, d in sorted(por_clas.items()):
        ind = _indicadores(d["cf"], d["ct"], d["qf"], d["qt"], d["dabs"], d["vabs"])
        resultado.append({
            "clasificacion":  clas,
            **ind,
            "valor_abs":      round(d["vabs"], 2),
            "diferencia_abs": round(d["dabs"], 2),
        })

    return sorted(resultado, key=lambda x: x["ind_valor"])


@router.get("/inventario/estado")
def get_estado_inventario():
    from database import DB_FILE
    import sqlite3
    conn  = sqlite3.connect(DB_FILE)
    total = conn.execute("SELECT COUNT(*) FROM inventario_registros").fetchone()[0]
    ultima = conn.execute("SELECT MAX(fecha) FROM inventario_registros").fetchone()[0]
    conn.close()
    return {"total_registros": total, "ultima_fecha": ultima}


# ══════════════════════════════════════════════════════════════════════════
#  VALIDACIÓN DE CALIDAD DE DATOS — registros ya cargados en la tabla
# ══════════════════════════════════════════════════════════════════════════

_FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validar_registro(r: dict, año_actual: int) -> list:
    problemas = []

    if not (r.get("documento_inventario") or "").strip():
        problemas.append("documento_inventario vacío")
    if not (r.get("ubicacion") or "").strip():
        problemas.append("ubicación vacía")
    if not (r.get("material") or "").strip():
        problemas.append("material vacío")
    if not (r.get("fecha") or "").strip():
        problemas.append("fecha vacía")

    if (r.get("cantidad_teorica")   or 0) < 0: problemas.append("cantidad_teorica negativa")
    if (r.get("cantidad_fisica")    or 0) < 0: problemas.append("cantidad_fisica negativa")
    if (r.get("costo_cant_fisica")  or 0) < 0: problemas.append("costo_cant_fisica negativo")
    if (r.get("costo_cant_teorica") or 0) < 0: problemas.append("costo_cant_teorica negativo")
    if (r.get("valor_abs")          or 0) < 0: problemas.append("valor_abs negativo (debería ser siempre ≥ 0)")
    if (r.get("diferencia_abs")     or 0) < 0: problemas.append("diferencia_abs negativo (debería ser siempre ≥ 0)")

    fecha = (r.get("fecha") or "").strip()
    if fecha:
        if not _FECHA_RE.match(fecha):
            problemas.append("fecha con formato inválido (se espera AAAA-MM-DD)")
        else:
            try:
                f = date.fromisoformat(fecha)
                if str(r.get("año") or 0) != str(f.year):
                    problemas.append("año no coincide con la fecha")
                if str(r.get("mes") or "").zfill(2) != f"{f.month:02d}":
                    problemas.append("mes no coincide con la fecha")
                nombre_esperado = MESES_NOMBRE.get(f.month, "")
                if (r.get("nombre_mes") or "").strip().lower() != nombre_esperado.lower():
                    problemas.append("nombre_mes no coincide con la fecha")
            except ValueError:
                problemas.append("fecha con formato inválido (se espera AAAA-MM-DD)")

    año = r.get("año") or 0
    if año and (año < 2000 or año > año_actual + 1):
        problemas.append("año fuera de rango razonable")

    return problemas


def _duplicados_logicos(rows: list) -> list:
    """Mismo material + ubicación + fecha registrado bajo documentos distintos."""
    grupos = defaultdict(lambda: {"documentos": set(), "ids": []})
    for r in rows:
        k = (r.get("material"), r.get("ubicacion"), r.get("fecha"))
        d = grupos[k]
        d["documentos"].add(r.get("documento_inventario"))
        d["ids"].append(r["id"])

    resultado = []
    for (material, ubicacion, fecha), d in grupos.items():
        if len(d["documentos"]) > 1:
            resultado.append({
                "material":   material,
                "ubicacion":  ubicacion,
                "fecha":      fecha,
                "documentos": sorted(doc for doc in d["documentos"]),
                "ids":        d["ids"],
            })
    return resultado


@router.get("/inventario/validacion")
def validar_calidad_inventario():
    from database import DB_FILE
    import sqlite3

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute("SELECT * FROM inventario_registros").fetchall()]
    conn.close()

    if not rows:
        return {
            "ok": True,
            "total_registros": 0,
            "total_con_problemas": 0,
            "resumen": [],
            "detalle": [],
            "duplicados_logicos": [],
        }

    año_actual = datetime.now().year
    conteo  = defaultdict(int)
    detalle = []

    for r in rows:
        problemas = _validar_registro(r, año_actual)
        if problemas:
            for p in problemas:
                conteo[p] += 1
            detalle.append({
                "id":                   r["id"],
                "documento_inventario": r.get("documento_inventario"),
                "ubicacion":            r.get("ubicacion"),
                "material":             r.get("material"),
                "fecha":                r.get("fecha"),
                "problemas":            problemas,
            })

    duplicados = _duplicados_logicos(rows)
    resumen = [{"problema": p, "cantidad": c} for p, c in sorted(conteo.items(), key=lambda x: -x[1])]

    return {
        "ok":                  True,
        "total_registros":     len(rows),
        "total_con_problemas": len(detalle),
        "resumen":             resumen,
        "detalle":             detalle,
        "duplicados_logicos":  duplicados,
    }

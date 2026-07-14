from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from collections import defaultdict
from database import (
    insertar_picking_registros,
    consultar_picking_registros,
    obtener_valores_filtro_picking,
    calcular_kpis_picking,
)

router = APIRouter()


class PickingRegistro(BaseModel):
    fecha_confirmacion: Optional[str]   = ""
    numero_orden:       Optional[str]   = ""
    usuario:            Optional[str]   = ""
    hora_inicio:        Optional[str]   = ""
    hora_fin:           Optional[str]   = ""
    tiempo_total:       Optional[float] = 0
    tipo_picking:       Optional[str]   = ""
    ubicacion_destino:  Optional[str]   = ""
    mes:                Optional[str]   = ""
    ano:                Optional[int]   = 0
    total_unidades:     Optional[int]   = 0
    total_lineas:       Optional[int]   = 0


class IngestRequest(BaseModel):
    registros:       List[PickingRegistro]
    fecha_ejecucion: Optional[str] = ""


@router.post("/picking2/ingest")
def ingest_picking(data: IngestRequest):
    if not data.registros:
        raise HTTPException(status_code=400, detail="Sin registros para insertar")

    registros_dict = []
    for r in data.registros:
        d = r.dict()
        # Normalizar año — el campo puede venir como 'ano' o 'año'
        d["año"] = d.pop("ano", 0) or 0
        registros_dict.append(d)

    resultado = insertar_picking_registros(registros_dict)
    return {
        "ok":         True,
        "insertados": resultado["insertados"],
        "duplicados": resultado["duplicados"],
        "total":      len(registros_dict),
    }


@router.get("/picking2/dashboard")
def get_dashboard(
    usuario:      str = "",
    tipo_picking: str = "",
    mes:          str = "",
    ano:          int = 0,
    fecha:        str = "",
):
    registros = consultar_picking_registros(
        usuario=usuario, tipo_picking=tipo_picking,
        mes=mes, año=ano, fecha=fecha
    )

    kpis = calcular_kpis_picking(registros)

    # Tendencia diaria
    por_fecha = defaultdict(lambda: {"unidades":0,"lineas":0,"tiempo":0,"ordenes":0})
    for r in registros:
        k = str(r.get("fecha_confirmacion",""))[:10]
        por_fecha[k]["unidades"] += r.get("total_unidades",0) or 0
        por_fecha[k]["lineas"]   += r.get("total_lineas",  0) or 0
        por_fecha[k]["tiempo"]   += r.get("tiempo_total",  0) or 0
        por_fecha[k]["ordenes"]  += 1

    tendencia = []
    for fk in sorted(por_fecha.keys()):
        d = por_fecha[fk]
        t = d["tiempo"]
        tendencia.append({
            "fecha":    fk,
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
            "tiempo":   round(t, 2),
            "uxh":      round(d["unidades"]/t,1) if t>0 else 0,
            "lxh":      round(d["lineas"]  /t,1) if t>0 else 0,
            "ordenes":  d["ordenes"],
        })

    # Ranking por usuario
    por_usuario = defaultdict(lambda: {"unidades":0,"lineas":0,"tiempo":0,"ordenes":0,"fechas":set()})
    for r in registros:
        u = r.get("usuario","")
        por_usuario[u]["unidades"] += r.get("total_unidades",0) or 0
        por_usuario[u]["lineas"]   += r.get("total_lineas",  0) or 0
        por_usuario[u]["tiempo"]   += r.get("tiempo_total",  0) or 0
        por_usuario[u]["ordenes"]  += 1
        fecha_str = str(r.get("fecha_confirmacion",""))[:10]
        if fecha_str:
            por_usuario[u]["fechas"].add(fecha_str)

    ranking = []
    for uk, d in por_usuario.items():
        t = d["tiempo"]
        ranking.append({
            "usuario":  uk,
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
            "tiempo":   round(t, 2),
            "uxh":      round(d["unidades"]/t,1) if t>0 else 0,
            "lxh":      round(d["lineas"]  /t,1) if t>0 else 0,
            "ordenes":  d["ordenes"],
            "dias":     len(d["fechas"]),
        })
    ranking.sort(key=lambda x: x["uxh"], reverse=True)

    # Por tipo de picking
    por_tipo = defaultdict(lambda: {"unidades":0,"lineas":0,"tiempo":0})
    for r in registros:
        tp = r.get("tipo_picking","")
        por_tipo[tp]["unidades"] += r.get("total_unidades",0) or 0
        por_tipo[tp]["lineas"]   += r.get("total_lineas",  0) or 0
        por_tipo[tp]["tiempo"]   += r.get("tiempo_total",  0) or 0

    tipos_data = []
    for tk, d in por_tipo.items():
        t = d["tiempo"]
        tipos_data.append({
            "tipo":     tk,
            "unidades": d["unidades"],
            "uxh":      round(d["unidades"]/t,1) if t>0 else 0,
            "lxh":      round(d["lineas"]  /t,1) if t>0 else 0,
        })

    return {
        "ok":           True,
        "total_filas":  len(registros),
        "kpis":         kpis,
        "tendencia":    tendencia,
        "ranking":      ranking,
        "por_tipo":     tipos_data,
        "valores_filtro": obtener_valores_filtro_picking(),
    }


@router.get("/picking2/estado")
def get_estado():
    from database import DB_FILE
    import sqlite3
    conn   = sqlite3.connect(DB_FILE)
    total  = conn.execute("SELECT COUNT(*) FROM picking_registros").fetchone()[0]
    ultima = conn.execute(
        "SELECT MAX(fecha_confirmacion) FROM picking_registros"
    ).fetchone()[0]
    conn.close()
    return {"total_registros": total, "ultima_fecha": ultima}
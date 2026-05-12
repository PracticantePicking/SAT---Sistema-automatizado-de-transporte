from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from collections import defaultdict
from database import (
    insertar_sbl2_registros,
    consultar_sbl2_registros,
    obtener_filtros_sbl2,
    calcular_kpis_sbl2,
)

router = APIRouter()
META_UPH = 478


class SBLRegistro(BaseModel):
    fecha:       Optional[str]   = ""
    operario:    Optional[str]   = ""
    tiempo_act:  Optional[str]   = ""
    unidades:    Optional[float] = 0
    lineas:      Optional[float] = 0
    u_hora:      Optional[float] = 0
    l_hora:      Optional[float] = 0
    horas:       Optional[float] = 0
    u_hora_real: Optional[float] = 0
    l_hora_real: Optional[float] = 0
    dia:         Optional[int]   = 0
    mes_num:     Optional[int]   = 0
    ano:         Optional[int]   = 0
    meta:        Optional[float] = 500
    meta_proy:   Optional[float] = 0
    desempeno:   Optional[str]   = ""
    nombre_mes:  Optional[str]   = ""


class IngestSBL(BaseModel):
    registros:       List[SBLRegistro]
    fecha_ejecucion: Optional[str] = ""


@router.post("/sbl2/ingest")
def ingest_sbl2(data: IngestSBL):
    if not data.registros:
        raise HTTPException(status_code=400, detail="Sin registros")
    registros_dict = [r.dict() for r in data.registros]
    resultado      = insertar_sbl2_registros(registros_dict)
    return {
        "ok":         True,
        "insertados": resultado["insertados"],
        "duplicados": resultado["duplicados"],
        "total":      len(registros_dict),
    }


@router.get("/sbl2/dashboard")
def get_dashboard(
    operario: str = "",
    mes_num:  int = 0,
    ano:      int = 0,
    fecha:    str = "",
):
    registros = consultar_sbl2_registros(
        operario=operario, mes_num=mes_num, ano=ano, fecha=fecha
    )
    kpis = calcular_kpis_sbl2(registros)

    # Tendencia mensual
    por_mes = defaultdict(lambda: {"unidades":0,"lineas":0,"horas":0,"nombre":""})
    for r in registros:
        k = f"{r.get('ano','')}-{str(r.get('mes_num',0)).zfill(2)}"
        por_mes[k]["unidades"] += r.get("unidades",0) or 0
        por_mes[k]["lineas"]   += r.get("lineas",  0) or 0
        por_mes[k]["horas"]    += r.get("horas",   0) or 0
        por_mes[k]["nombre"]    = r.get("nombre_mes","")

    tendencia = []
    for mk in sorted(por_mes.keys()):
        d = por_mes[mk]
        h = d["horas"]
        tendencia.append({
            "mes":      mk,
            "nombre":   d["nombre"],
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
            "uph":      round(d["unidades"]/h,1) if h>0 else 0,
            "lph":      round(d["lineas"]  /h,1) if h>0 else 0,
        })

    # Por operario
    por_op = defaultdict(lambda: {"unidades":0,"lineas":0,"horas":0,
                                   "registros":0,"cumpliendo":0})
    for r in registros:
        op = r.get("operario","")
        por_op[op]["unidades"]  += r.get("unidades",0) or 0
        por_op[op]["lineas"]    += r.get("lineas",  0) or 0
        por_op[op]["horas"]     += r.get("horas",   0) or 0
        por_op[op]["registros"] += 1
        if str(r.get("desempeno","")).strip().lower() == "cumpliendo":
            por_op[op]["cumpliendo"] += 1

    ranking = []
    for op, d in por_op.items():
        h   = d["horas"]
        uph = round(d["unidades"]/h,1) if h>0 else 0
        lph = round(d["lineas"]  /h,1) if h>0 else 0
        ranking.append({
            "operario":         op,
            "unidades":         d["unidades"],
            "lineas":           d["lineas"],
            "horas":            round(h,2),
            "uph":              uph,
            "lph":              lph,
            "registros":        d["registros"],
            "cumpliendo":       d["cumpliendo"],
            "pct_cumplimiento": round(d["cumpliendo"]/d["registros"]*100,1)
                                if d["registros"]>0 else 0,
            "cumple_meta":      uph >= META_UPH,
        })
    ranking.sort(key=lambda x: x["uph"], reverse=True)

    # Tendencia diaria
    por_fecha = defaultdict(lambda: {"unidades":0,"lineas":0,"horas":0,"operarios":set()})
    for r in registros:
        f = str(r.get("fecha",""))
        por_fecha[f]["unidades"]  += r.get("unidades",0) or 0
        por_fecha[f]["lineas"]    += r.get("lineas",  0) or 0
        por_fecha[f]["horas"]     += r.get("horas",   0) or 0
        por_fecha[f]["operarios"].add(r.get("operario",""))

    tendencia_diaria = []
    for fk in sorted(por_fecha.keys()):
        d = por_fecha[fk]
        h = d["horas"]
        tendencia_diaria.append({
            "fecha":     fk,
            "unidades":  d["unidades"],
            "lineas":    d["lineas"],
            "uph":       round(d["unidades"]/h,1) if h>0 else 0,
            "lph":       round(d["lineas"]  /h,1) if h>0 else 0,
            "operarios": len(d["operarios"]),
        })

    return {
        "ok":               True,
        "total_filas":      len(registros),
        "kpis":             kpis,
        "tendencia":        tendencia,
        "tendencia_diaria": tendencia_diaria,
        "ranking":          ranking,
        "valores_filtro":   obtener_filtros_sbl2(),
    }


@router.get("/sbl2/estado")
def get_estado():
    from database import DB_FILE
    import sqlite3
    conn   = sqlite3.connect(DB_FILE)
    total  = conn.execute("SELECT COUNT(*) FROM sbl2_registros").fetchone()[0]
    ultima = conn.execute("SELECT MAX(fecha) FROM sbl2_registros").fetchone()[0]
    conn.close()
    return {"total_registros": total, "ultima_fecha": ultima}
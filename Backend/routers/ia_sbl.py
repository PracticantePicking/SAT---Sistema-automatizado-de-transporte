"""
routers/ia_sbl.py
Análisis de productividad SBL con IA
"""

import os
import numpy as np
from dotenv import load_dotenv
from datetime import datetime
from collections import defaultdict
from fastapi import APIRouter, HTTPException
from database import consultar_sbl2_registros, calcular_kpis_sbl2

from logger import get_logger

logger = get_logger("ia_sbl")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
load_dotenv(dotenv_path=_env_path, override=True)

router   = APIRouter()
META_UPH = 478


#  SCIKIT-LEARN — Predicción UPH próximo período

def _predecir_uph(serie: list, campo="uph") -> dict:
    try:
        from sklearn.linear_model import LinearRegression
        if len(serie) < 2:
            return {"uph_predicho": 0, "tendencia": "insuficientes datos",
                    "pendiente_mensual": 0, "probabilidad_meta": 0}

        X = np.array(range(len(serie))).reshape(-1, 1)
        y = np.array([t[campo] for t in serie])
        modelo = LinearRegression().fit(X, y)
        pred   = float(modelo.predict([[len(serie)]])[0])
        pend   = float(modelo.coef_[0])

        tendencia = "creciente ↑" if pend > 5 else ("decreciente ↓" if pend < -5 else "estable →")
        return {
            "uph_predicho":      round(pred, 1),
            "tendencia":         tendencia,
            "pendiente_mensual": round(pend, 2),
            "probabilidad_meta": round(min(max((pred / META_UPH) * 100, 0), 100), 1),
        }
    except Exception as e:
        return {"uph_predicho": 0, "tendencia": "error", "error": str(e)}



#  CALCULAR DATOS COMPLETOS (todos los indicadores necesarios para la IA)
def _calcular_datos_completos(registros: list, filtros: dict) -> dict:
    kpis = calcular_kpis_sbl2(registros)

    # ── Tendencia mensual 
    por_mes = defaultdict(lambda: {"unidades": 0, "lineas": 0, "horas": 0, "nombre": ""})
    for r in registros:
        k = f"{r.get('ano','')}-{str(r.get('mes_num',0)).zfill(2)}"
        por_mes[k]["unidades"] += r.get("unidades", 0) or 0
        por_mes[k]["lineas"]   += r.get("lineas",   0) or 0
        por_mes[k]["horas"]    += r.get("horas",    0) or 0
        por_mes[k]["nombre"]    = r.get("nombre_mes", "")

    tendencia_mensual = []
    for mk in sorted(por_mes.keys()):
        d = por_mes[mk]
        h = d["horas"]
        tendencia_mensual.append({
            "mes":    mk,
            "nombre": d["nombre"],
            "uph":    round(d["unidades"] / h, 1) if h > 0 else 0,
            "lph":    round(d["lineas"]   / h, 1) if h > 0 else 0,
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
        })

    # ── Tendencia diaria 
    por_dia = defaultdict(lambda: {"unidades": 0, "lineas": 0, "horas": 0, "ops": set()})
    for r in registros:
        f = str(r.get("fecha", ""))
        por_dia[f]["unidades"] += r.get("unidades", 0) or 0
        por_dia[f]["lineas"]   += r.get("lineas",   0) or 0
        por_dia[f]["horas"]    += r.get("horas",    0) or 0
        por_dia[f]["ops"].add(r.get("operario", ""))

    tendencia_diaria = []
    for fk in sorted(por_dia.keys()):
        d = por_dia[fk]
        h = d["horas"]
        tendencia_diaria.append({
            "fecha":     fk,
            "uph":       round(d["unidades"] / h, 1) if h > 0 else 0,
            "lph":       round(d["lineas"]   / h, 1) if h > 0 else 0,
            "unidades":  d["unidades"],
            "lineas":    d["lineas"],
            "operarios": len(d["ops"]),
        })

    dias_sorted  = sorted(tendencia_diaria, key=lambda x: x["uph"], reverse=True)
    mejores_dias = dias_sorted[:3]
    peores_dias  = [d for d in dias_sorted[-3:] if d["uph"] > 0][::-1]

    # ── Ranking por operario 
    por_op = defaultdict(lambda: {"unidades": 0, "lineas": 0, "horas": 0,
                                   "registros": 0, "cumpliendo": 0})
    for r in registros:
        op = r.get("operario", "")
        por_op[op]["unidades"]  += r.get("unidades", 0) or 0
        por_op[op]["lineas"]    += r.get("lineas",   0) or 0
        por_op[op]["horas"]     += r.get("horas",    0) or 0
        por_op[op]["registros"] += 1
        if (r.get("u_hora_real") or 0) >= META_UPH:
            por_op[op]["cumpliendo"] += 1

    ranking = []
    for op, d in por_op.items():
        h = d["horas"]
        uph = round(d["unidades"] / h, 1) if h > 0 else 0
        lph = round(d["lineas"]   / h, 1) if h > 0 else 0
        ranking.append({
            "operario":         op,
            "uph":              uph,
            "lph":              lph,
            "unidades":         d["unidades"],
            "lineas":           d["lineas"],
            "horas":            round(h, 2),
            "registros":        d["registros"],
            "pct_cumplimiento": round(d["cumpliendo"] / d["registros"] * 100, 1)
                                if d["registros"] > 0 else 0,
        })
    ranking.sort(key=lambda x: x["uph"], reverse=True)

    # ── Cuellos de botella 
    cuellos = []
    for op in ranking:
        uph  = op["uph"]
        dias = op["registros"]
        nom  = op["operario"]
        if uph < META_UPH * 0.5:
            cuellos.append({"tipo": "critico",    "operario": nom, "impacto": "alto",
                "mensaje": f"{nom} opera al {round(uph/META_UPH*100,1)}% de la meta ({uph} UPH)"})
        elif uph < META_UPH * 0.7:
            cuellos.append({"tipo": "advertencia", "operario": nom, "impacto": "medio",
                "mensaje": f"{nom} está bajo meta ({uph} UPH — {round(uph/META_UPH*100,1)}%)"})
        if dias < 5:
            cuellos.append({"tipo": "advertencia", "operario": nom, "impacto": "medio",
                "mensaje": f"{nom} solo tiene {dias} días registrados"})

    if len(tendencia_mensual) >= 3:
        ultimos = [t["uph"] for t in tendencia_mensual[-3:]]
        if all(ultimos[i] > ultimos[i+1] for i in range(2)):
            cuellos.append({"tipo": "tendencia", "operario": "EQUIPO", "impacto": "alto",
                "mensaje": f"UPH descendiendo 3 meses consecutivos ({ultimos[0]} → {ultimos[-1]})"})

    # ── Predicción 
    serie_pred = tendencia_diaria if filtros.get("fecha") else tendencia_mensual
    prediccion = _predecir_uph(serie_pred)

    # ── Contexto del filtro 
    if filtros.get("fecha"):
        contexto = "dia"
    elif filtros.get("mes_num", 0) > 0:
        contexto = "mes"
    elif filtros.get("operario"):
        contexto = "operario"
    else:
        contexto = "general"

    return {
        "kpis":             kpis,
        "tendencia_mensual": tendencia_mensual,
        "tendencia_diaria":  tendencia_diaria,
        "ranking":           ranking,
        "mejores_dias":      mejores_dias,
        "peores_dias":       peores_dias,
        "prediccion":        prediccion,
        "cuellos":           cuellos,
        "contexto":          contexto,
    }



#  PROMPT - Esto hace el analiss del Dasshboard

def _construir_prompt(datos: dict, filtros: dict) -> str:
    kpis     = datos["kpis"]
    ranking  = datos["ranking"]
    pred     = datos["prediccion"]
    cuellos  = datos["cuellos"]
    top3     = ranking[:3]
    bottom3  = ranking[-3:] if len(ranking) > 3 else ranking
    mjd      = datos["mejores_dias"]
    prd      = datos["peores_dias"]
    contexto = datos["contexto"]

    if contexto == "dia":
        ctx = f"DÍA ESPECÍFICO: {filtros.get('fecha')}"
        tendencia_txt = "\n".join(
            [f"  {d['fecha']}: {d['uph']} UPH | {d['lph']} LPH | {d['unidades']:,.0f} u | {d['operarios']} ops"
             for d in datos["tendencia_diaria"]]
        )
        titulo_tend = "DETALLE DEL DÍA / HORAS"
    elif contexto == "mes":
        ctx = f"MES: {filtros.get('nombre_mes', '')} {filtros.get('ano', '')} (mes #{filtros.get('mes_num')})"
        tendencia_txt = "\n".join(
            [f"  {t['nombre']} {t['mes']}: {t['uph']} UPH | {t['lph']} LPH | {t['unidades']:,.0f} u"
             for t in datos["tendencia_mensual"]]
        )
        titulo_tend = "TENDENCIA MENSUAL"
    elif contexto == "operario":
        ctx = f"OPERARIO: {filtros.get('operario')}"
        tendencia_txt = "\n".join(
            [f"  {t['mes']} ({t['nombre']}): {t['uph']} UPH | {t['lph']} LPH"
             for t in datos["tendencia_mensual"]]
        )
        titulo_tend = "EVOLUCIÓN MENSUAL DEL OPERARIO"
    else:
        ctx = "PERÍODO COMPLETO (todos los operarios y fechas)"
        tendencia_txt = "\n".join(
            [f"  {t['nombre']} {t['mes']}: {t['uph']} UPH | {t['lph']} LPH | {t['unidades']:,.0f} u"
             for t in datos["tendencia_mensual"][-6:]]
        )
        titulo_tend = "TENDENCIA MENSUAL (últimos 6 meses)"

    top3_txt    = "\n".join([f"  {i+1}. {o['operario']}: {o['uph']} UPH | {o['lph']} LPH | {o['pct_cumplimiento']}% cumpl."
                             for i, o in enumerate(top3)])
    bottom3_txt = "\n".join([f"  - {o['operario']}: {o['uph']} UPH | {o['pct_cumplimiento']}% cumpl."
                             for o in bottom3])
    mjd_txt = "\n".join([f"  {d['fecha']}: {d['uph']} UPH | {d['unidades']:,.0f} unidades" for d in mjd])
    prd_txt = "\n".join([f"  {d['fecha']}: {d['uph']} UPH | {d['unidades']:,.0f} unidades" for d in prd])
    cuellos_txt = "\n".join([f"  [{c['tipo'].upper()}] {c['mensaje']}" for c in cuellos]) or "  Ninguno crítico detectado"

    return f"""Eres un experto analista de productividad logística.
Genera un informe ejecutivo completo del Sorter por Guiado de Luz (Put-to-Light) o (SBL).
Contexto del análisis: {ctx}
Meta de referencia: {META_UPH} UPH

═══ KPIs GLOBALES DEL PERÍODO ═══
• Unidades totales  : {kpis.get('total_unidades',0):,.0f}
• Líneas totales    : {kpis.get('total_lineas',0):,.0f}
• Horas trabajadas  : {kpis.get('total_horas',0):.1f} h
• UPH promedio      : {kpis.get('avg_uph',0)} u/hora  (meta: {META_UPH})
• LPH promedio      : {kpis.get('avg_lph',0)} l/hora
• % Cumplimiento    : {kpis.get('pct_cumplimiento',0)}%  ({kpis.get('cumpliendo',0)}/{kpis.get('total_registros',0)} registros)

═══ {titulo_tend} ═══
{tendencia_txt}

═══ TOP 3 MEJORES OPERARIOS ═══
{top3_txt}

═══ OPERARIOS CON MENOR DESEMPEÑO ═══
{bottom3_txt}

═══ DÍAS DE MEJOR DESEMPEÑO ═══
{mjd_txt if mjd_txt else '  Sin datos'}

═══ DÍAS DE MENOR DESEMPEÑO ═══
{prd_txt if prd_txt else '  Sin datos'}

═══ PREDICCIÓN (Scikit-learn Linear Regression) ═══
• UPH proyectado próximo período: {pred.get('uph_predicho',0)}
• Tendencia: {pred.get('tendencia','')}
• Probabilidad de cumplir meta  : {pred.get('probabilidad_meta',0)}%

═══ CUELLOS DE BOTELLA DETECTADOS ═══
{cuellos_txt}

═══ INSTRUCCIÓN ═══
Responde ÚNICAMENTE con estas secciones en este orden exacto, sin agregar texto antes ni después:

**RESUMEN_EJECUTIVO:**
[2-3 párrafos: estado general, comparación vs meta, contexto del período analizado]

**ANALISIS_UPH_LPH:**
[1-2 párrafos: interpretación de UPH y LPH, qué significa para la eficiencia de la operación]

**TOP_OPERARIOS:**
[Análisis de los 3 mejores y los de menor desempeño, qué factores pueden explicar la diferencia]

**DIAS_DESTACADOS:**
[Interpretación de los mejores y peores días: posibles causas, patrones]

**CUELLOS_DE_BOTELLA:**
[Lista numerada de los problemas más críticos con su impacto en la operación]

**PLAN_DE_ACCION:**
[Lista numerada de 5 acciones concretas, priorizadas por impacto, con responsable sugerido]
"""



#  EXTRACCIÓN DE SECCIONES
SECCIONES = [
    "RESUMEN_EJECUTIVO", "ANALISIS_UPH_LPH", "TOP_OPERARIOS",
    "DIAS_DESTACADOS", "CUELLOS_DE_BOTELLA", "PLAN_DE_ACCION",
]

def _extraer_seccion(texto: str, clave: str) -> str:
    patrones = [
        f"**{clave}:**", f"**{clave}**:", f"## {clave}",
        f"# {clave}", f"{clave}:",
    ]
    inicio = -1
    for p in patrones:
        idx = texto.upper().find(p.upper())
        if idx != -1:
            inicio = idx + len(p)
            break
    if inicio == -1:
        return ""
    fin = len(texto)
    for c in SECCIONES:
        if c == clave:
            continue
        for p in [f"**{c}:**", f"**{c}**:", f"## {c}", f"# {c}", f"{c}:"]:
            pos = texto.upper().find(p.upper(), inicio)
            if pos != -1 and pos < fin:
                fin = pos
                break
    return texto[inicio:fin].strip()

#  ANÁLISIS LOCAL (fallback sin API)
def _analisis_local(datos: dict) -> dict:
    kpis   = datos["kpis"]
    pred   = datos["prediccion"]
    cuellos = datos["cuellos"]
    top3   = datos["ranking"][:3]
    mjd    = datos["mejores_dias"]
    prd    = datos["peores_dias"]
    criticos = [c for c in cuellos if c["tipo"] == "critico"]

    avg_uph = kpis.get("avg_uph", 0)
    estado  = ("dentro de la meta" if avg_uph >= META_UPH
               else "por debajo de la meta" if avg_uph >= META_UPH * 0.7
               else "en estado crítico")

    resumen = (
        f"El equipo SBL registra un UPH promedio de {avg_uph} u/hora "
        f"({round(avg_uph/META_UPH*100,1)}% de la meta de {META_UPH} u/hora), "
        f"situándose {estado}. "
        f"El cumplimiento de la meta alcanza el {kpis.get('pct_cumplimiento',0)}% "
        f"con {kpis.get('cumpliendo',0)} de {kpis.get('total_registros',0)} registros. "
        f"Se procesaron {kpis.get('total_unidades',0):,.0f} unidades y "
        f"{kpis.get('total_lineas',0):,.0f} líneas en {kpis.get('total_horas',0):.1f} horas."
    )

    uph_lph = (
        f"UPH promedio: {avg_uph} u/hora | LPH promedio: {kpis.get('avg_lph',0)} l/hora. "
        f"La relación UPH/LPH indica la densidad promedio por línea procesada."
    )

    top_txt = " | ".join(
        [f"{i+1}. {o['operario']} ({o['uph']} UPH, {o['pct_cumplimiento']}%)"
         for i, o in enumerate(top3)]
    ) or "Sin datos de operarios"

    dias_txt = (
        f"Mejores: {', '.join([d['fecha']+' ('+str(d['uph'])+' UPH)' for d in mjd])} | "
        f"Peores: {', '.join([d['fecha']+' ('+str(d['uph'])+' UPH)' for d in prd])}"
    )

    cuellos_txt = "\n".join(
        [f"{i+1}. {c['mensaje']}" for i, c in enumerate(cuellos)]
    ) or "No se detectaron cuellos de botella críticos."

    plan = (
        "1. Reforzar capacitación a operarios con UPH < 70% de la meta\n"
        "2. Auditar los días de menor desempeño para identificar causas operativas\n"
        "3. Establecer seguimiento diario de KPIs con el supervisor de turno\n"
        "4. Revisar asignación de carga entre operarios para equilibrar rendimiento\n"
        "5. Evaluar absentismo y rotación en operarios con pocos días registrados"
    )

    return {
        "resumen_ejecutivo": resumen,
        "analisis_uph_lph":  uph_lph,
        "top_operarios":     top_txt,
        "dias_destacados":   dias_txt,
        "cuellos_texto":     cuellos_txt,
        "plan_de_accion":    plan,
    }


# ══════════════════════════════════════════════════════════════════════════
#  GROQ
# ══════════════════════════════════════════════════════════════════════════
def _get_groq_client():
    from groq import Groq
    # timeout=20s: si Groq no responde rápido, mejor fallar rápido y caer al
    # análisis local que dejar al usuario esperando (el frontend antes no
    # tenía timeout propio y se quedaba colgado en "Analizando...").
    # max_retries=3: reintenta automáticamente rate-limit (429) y errores
    # transitorios de red/servidor antes de darse por vencido.
    return Groq(api_key=os.getenv("GROQ_API_KEY", ""), timeout=20.0, max_retries=3)


# ══════════════════════════════════════════════════════════════════════════
#  ENDPOINT PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════
@router.get("/sbl2/analisis-ia")
def analisis_ia(operario: str = "", mes_num: int = 0, ano: int = 0, fecha: str = ""):
    filtros = {"operario": operario, "mes_num": mes_num, "ano": ano, "fecha": fecha}

    registros = consultar_sbl2_registros(
        operario=operario, mes_num=mes_num, ano=ano, fecha=fecha
    )
    if not registros:
        raise HTTPException(status_code=404, detail="Sin datos para analizar")

    datos = _calcular_datos_completos(registros, filtros)

    api_key = os.getenv("GROQ_API_KEY", "")
    logger.debug("GROQ_API_KEY presente: %s", bool(api_key))

    if not api_key:
        analisis = _analisis_local(datos)
        return {
            "ok": True, "modo": "local",
            "generado_en": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "contexto": datos["contexto"], "filtros": filtros,
            "kpis": datos["kpis"], "prediccion": datos["prediccion"],
            "cuellos": datos["cuellos"], "ranking": datos["ranking"],
            "mejores_dias": datos["mejores_dias"], "peores_dias": datos["peores_dias"],
            "analisis": analisis,
        }

    try:
        client    = _get_groq_client()
        prompt    = _construir_prompt(datos, filtros)
        respuesta = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        texto = respuesta.choices[0].message.content
        logger.debug("Groq respuesta (200c): %s", texto[:200])

        analisis = {
            "resumen_ejecutivo": _extraer_seccion(texto, "RESUMEN_EJECUTIVO"),
            "analisis_uph_lph":  _extraer_seccion(texto, "ANALISIS_UPH_LPH"),
            "top_operarios":     _extraer_seccion(texto, "TOP_OPERARIOS"),
            "dias_destacados":   _extraer_seccion(texto, "DIAS_DESTACADOS"),
            "cuellos_texto":     _extraer_seccion(texto, "CUELLOS_DE_BOTELLA"),
            "plan_de_accion":    _extraer_seccion(texto, "PLAN_DE_ACCION"),
        }
        # Fallback si el modelo no respetó el formato
        if not analisis["resumen_ejecutivo"] and not analisis["plan_de_accion"]:
            analisis["resumen_ejecutivo"] = texto

        return {
            "ok": True, "modo": "groq",
            "generado_en": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "contexto": datos["contexto"], "filtros": filtros,
            "kpis": datos["kpis"], "prediccion": datos["prediccion"],
            "cuellos": datos["cuellos"], "ranking": datos["ranking"],
            "mejores_dias": datos["mejores_dias"], "peores_dias": datos["peores_dias"],
            "analisis": analisis, "texto_completo": texto,
        }
    except Exception as e:
        # Groq falló (rate limit, timeout, sin internet, etc.) incluso tras
        # los reintentos automáticos del cliente. En vez de devolver 500 y
        # dejar al usuario sin informe, se cae al análisis local para que
        # SIEMPRE se genere un reporte.
        logger.warning("Groq falló, usando fallback local: %s", e)
        analisis = _analisis_local(datos)
        return {
            "ok": True, "modo": "local_fallback",
            "aviso": f"No se pudo contactar a Groq ({e}). Se generó un análisis local.",
            "generado_en": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "contexto": datos["contexto"], "filtros": filtros,
            "kpis": datos["kpis"], "prediccion": datos["prediccion"],
            "cuellos": datos["cuellos"], "ranking": datos["ranking"],
            "mejores_dias": datos["mejores_dias"], "peores_dias": datos["peores_dias"],
            "analisis": analisis,
        }

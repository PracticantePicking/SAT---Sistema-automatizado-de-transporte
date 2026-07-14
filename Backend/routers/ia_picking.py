"""
routers/ia_picking.py
Análisis de productividad Picking con IA — adaptado al filtro activo.
"""

import os
import numpy as np
from dotenv import load_dotenv
from datetime import datetime
from collections import defaultdict
from fastapi import APIRouter, HTTPException
from database import consultar_picking_registros, calcular_kpis_picking

from logger import get_logger

logger = get_logger("ia_picking")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
load_dotenv(dotenv_path=_env_path, override=True)

router    = APIRouter()
META_UXH  = 640
META_LXH  = 68


# ══════════════════════════════════════════════════════════════════════════
#  SCIKIT-LEARN — Predicción LxH próximo período
# ══════════════════════════════════════════════════════════════════════════
def _predecir(serie: list, campo: str) -> dict:
    try:
        from sklearn.linear_model import LinearRegression
        if len(serie) < 2:
            return {"predicho": 0, "tendencia": "insuficientes datos",
                    "pendiente": 0, "probabilidad_meta": 0}

        meta = META_LXH if campo == "lxh" else META_UXH
        X    = np.array(range(len(serie))).reshape(-1, 1)
        y    = np.array([t[campo] for t in serie])
        mod  = LinearRegression().fit(X, y)
        pred = float(mod.predict([[len(serie)]])[0])
        pend = float(mod.coef_[0])

        tendencia = "creciente ↑" if pend > 2 else ("decreciente ↓" if pend < -2 else "estable →")
        return {
            "predicho":          round(pred, 1),
            "tendencia":         tendencia,
            "pendiente":         round(pend, 2),
            "probabilidad_meta": round(min(max((pred / meta) * 100, 0), 100), 1),
        }
    except Exception as e:
        return {"predicho": 0, "tendencia": "error", "error": str(e)}



#  CALCULAR DATOS COMPLETOS
def _calcular_datos(registros: list, filtros: dict) -> dict:
    kpis = calcular_kpis_picking(registros)

    # ── Tendencia diaria ─────────────────────────────────────────────────
    por_dia = defaultdict(lambda: {"unidades": 0, "lineas": 0, "tiempo": 0, "usuarios": set()})
    for r in registros:
        f = str(r.get("fecha_confirmacion", ""))[:10]
        por_dia[f]["unidades"] += r.get("total_unidades", 0) or 0
        por_dia[f]["lineas"]   += r.get("total_lineas",   0) or 0
        por_dia[f]["tiempo"]   += r.get("tiempo_total",   0) or 0
        por_dia[f]["usuarios"].add(r.get("usuario", ""))

    tendencia_diaria = []
    for fk in sorted(por_dia.keys()):
        d = por_dia[fk]
        t = d["tiempo"]
        tendencia_diaria.append({
            "fecha":    fk,
            "uxh":      round(d["unidades"] / t, 1) if t > 0 else 0,
            "lxh":      round(d["lineas"]   / t, 1) if t > 0 else 0,
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
            "usuarios": len(d["usuarios"]),
        })

    # ── Tendencia mensual ────────────────────────────────────────────────
    por_mes = defaultdict(lambda: {"unidades": 0, "lineas": 0, "tiempo": 0, "mes_nombre": ""})
    for r in registros:
        k = f"{r.get('año', '')}-{r.get('mes', '')}"
        por_mes[k]["unidades"]   += r.get("total_unidades", 0) or 0
        por_mes[k]["lineas"]     += r.get("total_lineas",   0) or 0
        por_mes[k]["tiempo"]     += r.get("tiempo_total",   0) or 0
        por_mes[k]["mes_nombre"]  = r.get("mes", "")

    tendencia_mensual = []
    for mk in sorted(por_mes.keys()):
        d = por_mes[mk]
        t = d["tiempo"]
        tendencia_mensual.append({
            "mes":      mk,
            "nombre":   d["mes_nombre"],
            "uxh":      round(d["unidades"] / t, 1) if t > 0 else 0,
            "lxh":      round(d["lineas"]   / t, 1) if t > 0 else 0,
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
        })

    dias_sorted  = sorted(tendencia_diaria, key=lambda x: x["lxh"], reverse=True)
    mejores_dias = dias_sorted[:3]
    peores_dias  = [d for d in dias_sorted[-3:] if d["lxh"] > 0][::-1]

    # ── Ranking por usuario ──────────────────────────────────────────────
    por_usuario = defaultdict(lambda: {"unidades": 0, "lineas": 0, "tiempo": 0,
                                        "registros": 0, "cumpliendo_lxh": 0,
                                        "cumpliendo_uxh": 0, "fechas": set()})
    for r in registros:
        u = r.get("usuario", "")
        por_usuario[u]["unidades"]      += r.get("total_unidades", 0) or 0
        por_usuario[u]["lineas"]        += r.get("total_lineas",   0) or 0
        por_usuario[u]["tiempo"]        += r.get("tiempo_total",   0) or 0
        por_usuario[u]["registros"]     += 1
        fecha_str = str(r.get("fecha_confirmacion", ""))[:10]
        if fecha_str:
            por_usuario[u]["fechas"].add(fecha_str)

    ranking = []
    for u, d in por_usuario.items():
        t   = d["tiempo"]
        uxh = round(d["unidades"] / t, 1) if t > 0 else 0
        lxh = round(d["lineas"]   / t, 1) if t > 0 else 0
        ranking.append({
            "usuario":          u,
            "uxh":              uxh,
            "lxh":              lxh,
            "unidades":         d["unidades"],
            "lineas":           d["lineas"],
            "tiempo":           round(t, 2),
            "registros":        d["registros"],
            "dias":             len(d["fechas"]),
            "pct_cumpl_lxh":   round(lxh / META_LXH * 100, 1),
            "pct_cumpl_uxh":   round(uxh / META_UXH * 100, 1),
            "cumple_lxh":      lxh >= META_LXH,
            "cumple_uxh":      uxh >= META_UXH,
        })
    ranking.sort(key=lambda x: x["lxh"], reverse=True)

    # ── Por tipo de picking ──────────────────────────────────────────────
    por_tipo = defaultdict(lambda: {"unidades": 0, "lineas": 0, "tiempo": 0, "ordenes": 0})
    for r in registros:
        tp = r.get("tipo_picking", "") or "Sin tipo"
        por_tipo[tp]["unidades"] += r.get("total_unidades", 0) or 0
        por_tipo[tp]["lineas"]   += r.get("total_lineas",   0) or 0
        por_tipo[tp]["tiempo"]   += r.get("tiempo_total",   0) or 0
        por_tipo[tp]["ordenes"]  += 1

    tipos_data = []
    for tp, d in por_tipo.items():
        t = d["tiempo"]
        uxh = round(d["unidades"] / t, 1) if t > 0 else 0
        lxh = round(d["lineas"]   / t, 1) if t > 0 else 0
        tipos_data.append({
            "tipo":     tp,
            "uxh":      uxh,
            "lxh":      lxh,
            "unidades": d["unidades"],
            "lineas":   d["lineas"],
            "tiempo":   round(t, 2),
            "ordenes":  d["ordenes"],
            "pct_lxh":  round(lxh / META_LXH * 100, 1),
        })
    tipos_data.sort(key=lambda x: x["lxh"], reverse=True)

    # ── Cuellos de botella ───────────────────────────────────────────────
    cuellos = []

    for u in ranking:
        lxh  = u["lxh"]
        uxh  = u["uxh"]
        dias = u["dias"]
        nom  = u["usuario"]
        if lxh < META_LXH * 0.5:
            cuellos.append({"tipo": "critico", "origen": "usuario", "impacto": "alto",
                "mensaje": f"{nom} opera al {round(lxh/META_LXH*100,1)}% de la meta LxH ({lxh} l/h)"})
        elif lxh < META_LXH * 0.75:
            cuellos.append({"tipo": "advertencia", "origen": "usuario", "impacto": "medio",
                "mensaje": f"{nom} está bajo meta LxH ({lxh} l/h — {round(lxh/META_LXH*100,1)}%)"})
        if dias < 3:
            cuellos.append({"tipo": "advertencia", "origen": "usuario", "impacto": "bajo",
                "mensaje": f"{nom} tiene solo {dias} días registrados"})

    for tp in tipos_data:
        if tp["lxh"] < META_LXH * 0.5 and tp["ordenes"] >= 5:
            cuellos.append({"tipo": "critico", "origen": "tipo", "impacto": "alto",
                "mensaje": f"Tipo '{tp['tipo']}' opera al {tp['pct_lxh']}% de la meta ({tp['lxh']} l/h)"})
        elif tp["lxh"] < META_LXH * 0.75 and tp["ordenes"] >= 5:
            cuellos.append({"tipo": "advertencia", "origen": "tipo", "impacto": "medio",
                "mensaje": f"Tipo '{tp['tipo']}' bajo meta ({tp['lxh']} l/h — {tp['pct_lxh']}%)"})

    if len(tendencia_mensual) >= 3:
        ultimos = [t["lxh"] for t in tendencia_mensual[-3:]]
        if all(ultimos[i] > ultimos[i + 1] for i in range(2)):
            cuellos.append({"tipo": "tendencia", "origen": "global", "impacto": "alto",
                "mensaje": f"LxH descendiendo 3 meses consecutivos ({ultimos[0]} → {ultimos[-1]})"})

    # ── Predicción ───────────────────────────────────────────────────────
    serie_pred  = tendencia_diaria if filtros.get("fecha") else tendencia_mensual
    pred_lxh    = _predecir(serie_pred, "lxh")
    pred_uxh    = _predecir(serie_pred, "uxh")

    # ── Contexto del filtro ──────────────────────────────────────────────
    if filtros.get("fecha"):
        contexto = "dia"
    elif filtros.get("mes"):
        contexto = "mes"
    elif filtros.get("usuario"):
        contexto = "usuario"
    elif filtros.get("tipo_picking"):
        contexto = "tipo"
    else:
        contexto = "general"

    return {
        "kpis":             kpis,
        "tendencia_diaria":  tendencia_diaria,
        "tendencia_mensual": tendencia_mensual,
        "ranking":           ranking,
        "tipos":             tipos_data,
        "mejores_dias":      mejores_dias,
        "peores_dias":       peores_dias,
        "pred_lxh":          pred_lxh,
        "pred_uxh":          pred_uxh,
        "cuellos":           cuellos,
        "contexto":          contexto,
    }


#  PROMPT
CTX_LABEL = {
    "dia": "Día específico", "mes": "Análisis mensual",
    "usuario": "Por usuario", "tipo": "Por tipo de picking", "general": "Período completo",
}

def _construir_prompt(datos: dict, filtros: dict) -> str:
    kpis    = datos["kpis"]
    ranking = datos["ranking"]
    tipos   = datos["tipos"]
    cuellos = datos["cuellos"]
    pred_l  = datos["pred_lxh"]
    pred_u  = datos["pred_uxh"]
    top3    = ranking[:3]
    bot3    = ranking[-3:] if len(ranking) > 3 else ranking
    mjd     = datos["mejores_dias"]
    prd     = datos["peores_dias"]
    ctx     = datos["contexto"]

    if ctx == "dia":
        ctx_txt = f"DÍA ESPECÍFICO: {filtros.get('fecha')}"
        tend_txt = "\n".join(
            f"  {d['fecha']}: {d['lxh']} LxH | {d['uxh']} UxH | {d['unidades']:,.0f} u | {d['usuarios']} usuarios"
            for d in datos["tendencia_diaria"]
        )
        titulo_tend = "DETALLE DEL DÍA"
    elif ctx == "mes":
        ctx_txt = f"MES: {filtros.get('mes')} {filtros.get('ano', '')}"
        tend_txt = "\n".join(
            f"  {t['nombre']} ({t['mes']}): {t['lxh']} LxH | {t['uxh']} UxH | {t['unidades']:,.0f} u"
            for t in datos["tendencia_mensual"]
        )
        titulo_tend = "TENDENCIA MENSUAL"
    elif ctx == "usuario":
        ctx_txt = f"USUARIO: {filtros.get('usuario')}"
        tend_txt = "\n".join(
            f"  {t['nombre']} ({t['mes']}): {t['lxh']} LxH | {t['uxh']} UxH"
            for t in datos["tendencia_mensual"]
        )
        titulo_tend = "EVOLUCIÓN MENSUAL DEL USUARIO"
    elif ctx == "tipo":
        ctx_txt = f"TIPO DE PICKING: {filtros.get('tipo_picking')}"
        tend_txt = "\n".join(
            f"  {t['nombre']} ({t['mes']}): {t['lxh']} LxH | {t['uxh']} UxH"
            for t in datos["tendencia_mensual"]
        )
        titulo_tend = "EVOLUCIÓN MENSUAL DEL TIPO"
    else:
        ctx_txt = "PERÍODO COMPLETO"
        tend_txt = "\n".join(
            f"  {t['nombre']} ({t['mes']}): {t['lxh']} LxH | {t['uxh']} UxH | {t['unidades']:,.0f} u"
            for t in datos["tendencia_mensual"][-6:]
        )
        titulo_tend = "TENDENCIA MENSUAL (últimos 6 meses)"

    tipos_txt = "\n".join(
        f"  {tp['tipo']}: {tp['lxh']} LxH | {tp['uxh']} UxH | {tp['ordenes']} órdenes | {tp['pct_lxh']}% meta"
        for tp in tipos
    )
    top3_txt = "\n".join(
        f"  {i+1}. {u['usuario']}: {u['lxh']} LxH | {u['uxh']} UxH | {u['pct_cumpl_lxh']}% meta"
        for i, u in enumerate(top3)
    )
    bot3_txt = "\n".join(
        f"  - {u['usuario']}: {u['lxh']} LxH | {u['pct_cumpl_lxh']}% meta"
        for u in bot3
    )
    mjd_txt = "\n".join(
        f"  {d['fecha']}: {d['lxh']} LxH | {d['unidades']:,.0f} unidades"
        for d in mjd
    )
    prd_txt = "\n".join(
        f"  {d['fecha']}: {d['lxh']} LxH | {d['unidades']:,.0f} unidades"
        for d in prd
    )
    cuellos_txt = "\n".join(
        f"  [{c['tipo'].upper()}][{c['origen']}] {c['mensaje']}"
        for c in cuellos
    ) or "  Ninguno crítico detectado"

    return f"""Eres un experto analista de productividad logística en Prebel S.A.S.
Genera un informe ejecutivo completo de la operación de Picking (selección de pedidos).
Contexto del análisis: {ctx_txt}
Metas de referencia: LxH = {META_LXH} líneas/hora | UxH = {META_UXH} unidades/hora

═══ KPIs GLOBALES DEL PERÍODO ═══
• Total unidades  : {kpis.get('total_unidades', 0):,.0f}
• Total líneas    : {kpis.get('total_lineas', 0):,.0f}
• Tiempo total    : {kpis.get('tiempo_total', 0):.1f} h
• UxH promedio    : {kpis.get('uxh', 0)} u/hora  (meta: {META_UXH})
• LxH promedio    : {kpis.get('lxh', 0)} l/hora  (meta: {META_LXH})

═══ {titulo_tend} ═══
{tend_txt}

═══ DISTRIBUCIÓN POR TIPO DE PICKING ═══
{tipos_txt}

═══ TOP 3 MEJORES USUARIOS ═══
{top3_txt}

═══ USUARIOS CON MENOR DESEMPEÑO ═══
{bot3_txt}

═══ DÍAS DE MEJOR DESEMPEÑO (LxH) ═══
{mjd_txt if mjd_txt else '  Sin datos'}

═══ DÍAS DE MENOR DESEMPEÑO (LxH) ═══
{prd_txt if prd_txt else '  Sin datos'}

═══ PREDICCIÓN SCIKIT-LEARN ═══
• LxH proyectado: {pred_l.get('predicho', 0)} l/hora | Tendencia: {pred_l.get('tendencia', '')} | Prob. meta: {pred_l.get('probabilidad_meta', 0)}%
• UxH proyectado: {pred_u.get('predicho', 0)} u/hora | Tendencia: {pred_u.get('tendencia', '')}

═══ CUELLOS DE BOTELLA DETECTADOS ═══
{cuellos_txt}

═══ INSTRUCCIÓN ═══
Responde ÚNICAMENTE con estas secciones en este orden exacto, sin agregar texto antes ni después:

**RESUMEN_EJECUTIVO:**
[2-3 párrafos: estado general vs metas, contexto del período analizado]

**ANALISIS_METRICAS:**
[Interpretación de UxH y LxH, análisis del tipo de picking más y menos eficiente]

**TOP_USUARIOS:**
[Análisis de los 3 mejores usuarios y los de menor desempeño, qué factores explican la diferencia]

**ANALISIS_TIPOS:**
[Análisis detallado de cada tipo de picking: cuál genera cuellos de botella, cuál es más eficiente y por qué]

**CUELLOS_DE_BOTELLA:**
[Lista numerada de los problemas más críticos con su impacto en la operación]

**PLAN_DE_ACCION:**
[Lista numerada de 5 acciones concretas, priorizadas por impacto, con responsable sugerido]
"""


# ══════════════════════════════════════════════════════════════════════════
#  EXTRACCIÓN DE SECCIONES
# ══════════════════════════════════════════════════════════════════════════
SECCIONES = [
    "RESUMEN_EJECUTIVO", "ANALISIS_METRICAS", "TOP_USUARIOS",
    "ANALISIS_TIPOS", "CUELLOS_DE_BOTELLA", "PLAN_DE_ACCION",
]

def _extraer(texto: str, clave: str) -> str:
    patrones = [f"**{clave}:**", f"**{clave}**:", f"## {clave}", f"# {clave}", f"{clave}:"]
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


# ══════════════════════════════════════════════════════════════════════════
#  ANÁLISIS LOCAL (fallback sin API)
# ══════════════════════════════════════════════════════════════════════════
def _analisis_local(datos: dict) -> dict:
    kpis    = datos["kpis"]
    pred_l  = datos["pred_lxh"]
    cuellos = datos["cuellos"]
    top3    = datos["ranking"][:3]
    tipos   = datos["tipos"]
    mjd     = datos["mejores_dias"]
    prd     = datos["peores_dias"]

    lxh_actual = kpis.get("lxh", 0)
    uxh_actual = kpis.get("uxh", 0)
    estado_lxh = ("dentro de la meta" if lxh_actual >= META_LXH
                  else "por debajo de la meta" if lxh_actual >= META_LXH * 0.75
                  else "en estado crítico")

    tipo_critico = next((tp for tp in tipos if tp["lxh"] < META_LXH * 0.75), None)
    tipo_top     = tipos[0] if tipos else None

    resumen = (
        f"La operación de Picking registra un LxH de {lxh_actual} l/hora "
        f"({round(lxh_actual/META_LXH*100,1)}% de la meta de {META_LXH} l/hora), "
        f"situándose {estado_lxh}. "
        f"El UxH promedio es de {uxh_actual} u/hora (meta: {META_UXH}). "
        f"Se procesaron {kpis.get('total_unidades',0):,.0f} unidades y "
        f"{kpis.get('total_lineas',0):,.0f} líneas en {kpis.get('tiempo_total',0):.1f} horas."
    )

    metricas = (
        f"LxH: {lxh_actual} l/hora ({round(lxh_actual/META_LXH*100,1)}% meta) | "
        f"UxH: {uxh_actual} u/hora ({round(uxh_actual/META_UXH*100,1)}% meta). "
        + (f"El tipo más eficiente es '{tipo_top['tipo']}' con {tipo_top['lxh']} LxH. " if tipo_top else "")
        + (f"El tipo '{tipo_critico['tipo']}' requiere atención con solo {tipo_critico['lxh']} LxH." if tipo_critico else "")
    )

    top_txt = " | ".join(
        f"{i+1}. {u['usuario']} ({u['lxh']} LxH, {u['pct_cumpl_lxh']}%)"
        for i, u in enumerate(top3)
    ) or "Sin datos"

    tipos_txt = " | ".join(
        f"{tp['tipo']}: {tp['lxh']} LxH ({tp['pct_lxh']}%)"
        for tp in tipos
    ) or "Sin datos de tipos"

    dias_txt = (
        f"Mejores: {', '.join(d['fecha']+' ('+str(d['lxh'])+' LxH)' for d in mjd)} | "
        f"Peores: {', '.join(d['fecha']+' ('+str(d['lxh'])+' LxH)' for d in prd)}"
    )

    cuellos_txt = "\n".join(
        f"{i+1}. {c['mensaje']}" for i, c in enumerate(cuellos)
    ) or "No se detectaron cuellos de botella críticos."

    plan = (
        "1. Capacitar a usuarios con LxH < 75% de la meta en técnicas de picking eficiente\n"
        "2. Revisar el proceso del tipo de picking con menor LxH para identificar tiempos muertos\n"
        "3. Establecer seguimiento diario de LxH y UxH con el supervisor de turno\n"
        "4. Redistribuir carga entre usuarios para equilibrar el rendimiento por tipo\n"
        "5. Auditar días de menor desempeño para detectar causas operativas recurrentes"
    )

    return {
        "resumen_ejecutivo": resumen,
        "analisis_metricas": metricas,
        "top_usuarios":      top_txt,
        "analisis_tipos":    tipos_txt,
        "cuellos_texto":     cuellos_txt,
        "plan_de_accion":    plan,
    }


# ══════════════════════════════════════════════════════════════════════════
#  ENDPOINT PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════
@router.get("/picking2/analisis-ia")
def analisis_ia_picking(
    usuario:      str = "",
    tipo_picking: str = "",
    mes:          str = "",
    ano:          int = 0,
    fecha:        str = "",
):
    filtros   = {"usuario": usuario, "tipo_picking": tipo_picking,
                 "mes": mes, "ano": ano, "fecha": fecha}
    registros = consultar_picking_registros(
        usuario=usuario, tipo_picking=tipo_picking,
        mes=mes, año=ano, fecha=fecha
    )
    if not registros:
        raise HTTPException(status_code=404, detail="Sin datos para analizar")

    datos   = _calcular_datos(registros, filtros)
    api_key = os.getenv("GROQ_API_KEY", "")

    if not api_key:
        analisis = _analisis_local(datos)
        return _build_response(datos, filtros, analisis, "local")

    try:
        from groq import Groq
        # timeout=20s + max_retries=3: igual que en ia_sbl.py — falla rápido
        # y reintenta automáticamente rate-limit/errores transitorios antes
        # de caer al análisis local.
        client    = Groq(api_key=api_key, timeout=20.0, max_retries=3)
        prompt    = _construir_prompt(datos, filtros)
        respuesta = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        texto = respuesta.choices[0].message.content
        analisis = {
            "resumen_ejecutivo": _extraer(texto, "RESUMEN_EJECUTIVO"),
            "analisis_metricas": _extraer(texto, "ANALISIS_METRICAS"),
            "top_usuarios":      _extraer(texto, "TOP_USUARIOS"),
            "analisis_tipos":    _extraer(texto, "ANALISIS_TIPOS"),
            "cuellos_texto":     _extraer(texto, "CUELLOS_DE_BOTELLA"),
            "plan_de_accion":    _extraer(texto, "PLAN_DE_ACCION"),
        }
        if not analisis["resumen_ejecutivo"] and not analisis["plan_de_accion"]:
            analisis["resumen_ejecutivo"] = texto
        return _build_response(datos, filtros, analisis, "groq")
    except Exception as e:
        # Igual que en ia_sbl.py: si Groq falla tras los reintentos, no se
        # devuelve 500 — se cae al análisis local para siempre entregar
        # un informe.
        logger.warning("Groq falló, usando fallback local: %s", e)
        analisis = _analisis_local(datos)
        return _build_response(
            datos, filtros, analisis, "local_fallback",
            aviso=f"No se pudo contactar a Groq ({e}). Se generó un análisis local.",
        )


def _build_response(datos, filtros, analisis, modo, aviso=None):
    resp = {
        "ok":          True,
        "modo":        modo,
        "generado_en": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "contexto":    datos["contexto"],
        "filtros":     filtros,
        "kpis":        datos["kpis"],
        "pred_lxh":    datos["pred_lxh"],
        "pred_uxh":    datos["pred_uxh"],
        "cuellos":     datos["cuellos"],
        "ranking":     datos["ranking"],
        "tipos":       datos["tipos"],
        "mejores_dias": datos["mejores_dias"],
        "peores_dias":  datos["peores_dias"],
        "analisis":    analisis,
    }
    if aviso:
        resp["aviso"] = aviso
    return resp

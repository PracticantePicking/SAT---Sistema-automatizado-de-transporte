import pandas as pd
import os
from rapidfuzz import fuzz, process as fuzz_process

# ── CONSTANTES ──────────────────────────────────────────────────────
MESES_ES = {
    1:"Enero", 2:"Febrero", 3:"Marzo", 4:"Abril",
    5:"Mayo", 6:"Junio", 7:"Julio", 8:"Agosto",
    9:"Septiembre", 10:"Octubre", 11:"Noviembre", 12:"Diciembre"
}

FINAL_COLS_DEFAULT = [
    "Numero_Documento", "NOMBRE TARIFARIO", "Guia",
    "Numero Unidades", "Estado", "Fec_Entrega",
    "Fec_AproxEntrega", "Transportador",
    "Fecha de captura de guia", "Destinatario",
    "Ciudad Destino", "MES", "ON TIME",
    "ON TIME (SI=1 Y NO=0)", "CANAL"
]

AUTO_COLS = {"Transportador", "MES", "ON TIME", "ON TIME (SI=1 Y NO=0)"}

CARRIERS_DEFAULT = {
    "finalCols": FINAL_COLS_DEFAULT,
    "carriers": [
        {
            "id": "solistica", "name": "Solistica",
            "color": "#4f6ef7", "isStatic": True,
            "header_row": 4,
            "mapping": {
                "Numero_Documento":         "DOCUMENTO NRO 1",
                "NOMBRE TARIFARIO":         "NOMBRE TARIFARIO",
                "Guia":                     "REMESA",
                "Numero Unidades":          "TOTAL CAJAS",
                "Estado":                   "NOMBRE DEL ESTADO",
                "Fec_Entrega":              "FECHA ENTREGA",
                "Fec_AproxEntrega":         "FECHA DE ENTREGA PROMETIDA",
                "Fecha de captura de guia": "FECHA ELABORACIÓN",
                "Destinatario":             "DESTINATARIO",
                "Ciudad Destino":           "CIUDAD DESTINO",
                "CANAL":                    ""
            }
        },
        {
            "id": "coordinadora", "name": "Coordinadora",
            "color": "#22c55e", "isStatic": True,
            "ontime_mode": "column",
            "ontime_col": "Eficiencia",
            "ontime_val": "A tiempo",
            "mapping": {
                "Numero_Documento":         "Documento",
                "NOMBRE TARIFARIO":         "Division",
                "Guia":                     "Codigo remision",
                "Numero Unidades":          "Unidades",
                "Estado":                   "Estado",
                "Fec_Entrega":              "Fecha entrega",
                "Fec_AproxEntrega":         "",
                "Fecha de captura de guia": "Fecha recogida",
                "Destinatario":             "Nombre destinatario",
                "Ciudad Destino":           "Term destino",
                "CANAL":                    ""
            }
        },
        {
            "id": "internacional", "name": "Internacional",
            "color": "#f59e0b", "isStatic": True,
            "mapping": {
                "Numero_Documento":         "Codigo identificador",
                "NOMBRE TARIFARIO":         "Remitente",
                "Guia":                     "Guia",
                "Numero Unidades":          "Cantidad",
                "Estado":                   "Estado",
                "Fec_Entrega":              "Fecha reparto",
                "Fec_AproxEntrega":         "Fecha estimada",
                "Fecha de captura de guia": "En sistema",
                "Destinatario":             "Destinatario",
                "Ciudad Destino":           "Ciudad",
                "CANAL":                    ""
            }
        }
    ]
}

# ── KEYWORDS DEVOLUCIONES ────────────────────────────────────────────
KEYWORDS_DEVOLUCION = [
    "prebel", "dev", "devolucion", "devolución",
    "disnal", "pedir cita"
]

def es_devolucion(destinatario) -> bool:
    """
    Retorna True si el destinatario corresponde a una devolución.
    Case-insensitive — busca cualquiera de las keywords en el texto.
    Solo aplica a Solistica y Coordinadora.
    """
    if not destinatario or str(destinatario).strip() in ("", "nan", "NaN", "None"):
        return False
    texto = str(destinatario).lower().strip()
    return any(kw in texto for kw in KEYWORDS_DEVOLUCION)


# ════════════════════════════════════════════════════
#  LECTURA
# ════════════════════════════════════════════════════
def leer_excel(ruta: str, header_row: int = 0) -> pd.DataFrame:
    ext = os.path.splitext(ruta)[1].lower()
    engine = "openpyxl" if ext == ".xlsx" else "xlrd"
    df = pd.read_excel(ruta, engine=engine, header=header_row)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def obtener_columnas_excel(ruta: str, header_row: int = 0) -> list:
    ext = os.path.splitext(ruta)[1].lower()
    engine = "openpyxl" if ext == ".xlsx" else "xlrd"
    df = pd.read_excel(ruta, engine=engine, header=header_row, nrows=0)
    return [str(c).strip() for c in df.columns]


# ════════════════════════════════════════════════════
#  AUTO-DETECCIÓN DE TRANSPORTADORA
# ════════════════════════════════════════════════════
def detectar_transportadora(ruta: str, carriers: list) -> tuple:
    nombre_archivo = os.path.basename(ruta).lower()

    mejor_por_nombre = None
    mejor_score_nombre = 0

    for carrier in carriers:
        alias = [carrier["name"].lower()]
        if len(carrier["name"]) >= 4:
            alias.append(carrier["name"][:4].lower())
        alias_map = {
            "coordinadora": ["coord", "coordinadora"],
            "solistica":    ["soli", "solistica"],
            "internacional":["inter", "internacional", "intl"],
        }
        alias += alias_map.get(carrier["name"].lower(), [])

        for a in alias:
            if a in nombre_archivo:
                score = len(a) * 10
                if score > mejor_score_nombre:
                    mejor_score_nombre = score
                    mejor_por_nombre = carrier

    if mejor_por_nombre and mejor_score_nombre >= 30:
        return mejor_por_nombre, "nombre", mejor_score_nombre

    try:
        columnas_excel = []
        for hr in [0, 1, 4]:
            try:
                cols = obtener_columnas_excel(ruta, hr)
                if len(cols) > 2:
                    columnas_excel = cols
                    break
            except Exception:
                continue

        if not columnas_excel:
            return None, "sin_columnas", 0

        mejor_por_cols = None
        mejor_score_cols = 0

        for carrier in carriers:
            mapping = carrier.get("mapping", {})
            cols_mapeo = [v for v in mapping.values() if v and v.strip()]
            if not cols_mapeo:
                continue

            coincidencias = sum(
                1 for col_m in cols_mapeo
                if any(
                    fuzz.token_sort_ratio(col_m.lower(), col_e.lower()) >= 80
                    for col_e in columnas_excel
                )
            )
            score = int(coincidencias / len(cols_mapeo) * 100) if cols_mapeo else 0

            if score > mejor_score_cols:
                mejor_score_cols = score
                mejor_por_cols = carrier

        if mejor_por_cols and mejor_score_cols >= 40:
            return mejor_por_cols, "columnas", mejor_score_cols

    except Exception:
        pass

    return None, "no_detectado", 0


# ════════════════════════════════════════════════════
#  AUTO-DETECCIÓN DE COLUMNAS CON SIMILITUD
# ════════════════════════════════════════════════════
def sugerir_mapeo(columnas_excel: list, final_cols: list, umbral: int = 60) -> dict:
    sugerencias = {}
    cols_mapeables = [c for c in final_cols if c not in AUTO_COLS]

    for col_final in cols_mapeables:
        if not columnas_excel:
            sugerencias[col_final] = {"sugerido": "", "score": 0, "opciones": []}
            continue

        matches = fuzz_process.extract(
            col_final, columnas_excel,
            scorer=fuzz.token_sort_ratio, limit=5
        )
        top   = [{"col": m[0], "score": m[1]} for m in matches]
        mejor = top[0] if top else {"col": "", "score": 0}

        sugerencias[col_final] = {
            "sugerido": mejor["col"] if mejor["score"] >= umbral else "",
            "score":    mejor["score"],
            "opciones": top
        }

    return sugerencias



#  FILTROS PARA EL DASHBOARD
def aplicar_filtros_dashboard(df: pd.DataFrame, filtros: dict) -> pd.DataFrame:
    resultado = df.copy()

    doc = (filtros.get("numero_documento") or "").strip()
    if doc:
        col = _find_col(resultado, "Numero_Documento")
        if col:
            resultado = resultado[resultado[col].astype(str).str.lower().str.contains(doc.lower(), na=False)]

    mes = (filtros.get("mes") or "").strip()
    if mes:
        col = _find_col(resultado, "MES")
        if col:
            resultado = resultado[resultado[col].astype(str).str.strip() == mes]

    trans = (filtros.get("transportador") or "").strip()
    if trans:
        col = _find_col(resultado, "Transportador")
        if col:
            resultado = resultado[resultado[col].astype(str).str.strip() == trans]

    ciudad = (filtros.get("ciudad_destino") or "").strip()
    if ciudad:
        col = _find_col(resultado, "Ciudad Destino")
        if col:
            resultado = resultado[resultado[col].astype(str).str.lower().str.contains(ciudad.lower(), na=False)]

    dest = (filtros.get("destinatario") or "").strip()
    if dest:
        col = _find_col(resultado, "Destinatario")
        if col:
            resultado = resultado[resultado[col].astype(str).str.lower().str.contains(dest.lower(), na=False)]
    estado = (filtros.get("estado") or "").strip()
    if estado:
        col = _find_col(resultado, "Estado")
        if col:
            resultado = resultado[resultado[col].astype(str).str.strip() == estado]
    return resultado.reset_index(drop=True)


def _find_col(df: pd.DataFrame, nombre: str):
    for c in df.columns:
        if c.strip().lower() == nombre.strip().lower():
            return c
    return None


def obtener_valores_filtro(df: pd.DataFrame) -> dict:
    meses_orden = list(MESES_ES.values())

    def col_values(nombre):
        col = _find_col(df, nombre)
        if col is None:
            return []
        return sorted(df[col].dropna().astype(str).str.strip().unique().tolist())

    meses_raw      = col_values("MES")
    meses_ordenados = sorted(
        [m for m in meses_raw if m in meses_orden],
        key=lambda m: meses_orden.index(m)
    ) + [m for m in meses_raw if m not in meses_orden]

    return {
        "meses":           meses_ordenados,
        "transportadoras": col_values("Transportador"),
        "ciudades":        col_values("Ciudad Destino"),
        "estados":         col_values("Estado"),   #Bueva linea para validar y filtrar por estados.
    }


#  VALIDACIÓN DE CALIDAD
def validar_calidad(df: pd.DataFrame, carrier_name: str) -> dict:
    total  = len(df)
    issues = []
    score  = 100

    if "Guia" in df.columns:
        guias = df["Guia"].replace("", pd.NA).dropna()
        dupes = guias.duplicated().sum()
        if dupes > 0:
            issues.append({"tipo":"warning","icono":"⚠️",
                "mensaje":f"{dupes} guías duplicadas",
                "detalle":f"Existen {dupes} registros con número de guía repetido",
                "cantidad":int(dupes)})
            score -= min(20, dupes / total * 100)

    for col, label in [
        ("Fecha de captura de guia","Fecha de captura"),
        ("Fec_Entrega","Fecha de entrega"),
        ("Fec_AproxEntrega","Fecha aproximada")
    ]:
        if col in df.columns:
            vacias = (df[col] == "").sum() + df[col].isna().sum()
            if vacias > 0:
                pct  = vacias / total * 100
                tipo = "error" if pct > 20 else "warning"
                issues.append({"tipo":tipo,"icono":"📅",
                    "mensaje":f"{vacias} filas sin {label} ({pct:.1f}%)",
                    "detalle":"Sin esta fecha no se puede calcular ON TIME correctamente",
                    "cantidad":int(vacias)})
                score -= min(15, pct * 0.5)

    if "Guia" in df.columns:
        vacias_guia = (df["Guia"] == "").sum() + df["Guia"].isna().sum()
        if vacias_guia > 0:
            pct = vacias_guia / total * 100
            issues.append({"tipo":"error","icono":"🔢",
                "mensaje":f"{vacias_guia} registros sin número de guía ({pct:.1f}%)",
                "detalle":"Registros sin guía no pueden ser rastreados",
                "cantidad":int(vacias_guia)})
            score -= min(25, pct)

    if "ON TIME" in df.columns:
        si  = (df["ON TIME"] == "SI").sum()
        no  = (df["ON TIME"] == "NO").sum()
        ne  = (df["ON TIME"] == "NO ENTREGADO").sum()
        pct = si / total * 100 if total > 0 else 0
        issues.append({"tipo":"info","icono":"📊",
            "mensaje":f"ON TIME: {pct:.1f}% ({si} de {si+no})",
            "detalle":f"A tiempo: {si} | Tarde: {no} | Sin entregar: {ne}",
            "cantidad":int(si)})

    if "Destinatario" in df.columns:
        vacios = (df["Destinatario"] == "").sum()
        if vacios > 0:
            issues.append({"tipo":"warning","icono":"👤",
                "mensaje":f"{vacios} registros sin destinatario",
                "detalle":"Registros sin nombre de destinatario",
                "cantidad":int(vacios)})

    return {"carrier":carrier_name,"total":total,"score":max(0,round(score)),"issues":issues}


# ════════════════════════════════════════════════════
#  MÉTRICAS PARA DASHBOARD
# ════════════════════════════════════════════════════
def calcular_metricas(df: pd.DataFrame) -> dict:
    total = len(df)
    if total == 0:
        return {}

    metricas = {"total_filas": total}

    # ── ON TIME global ────────────────────────────────
    if "ON TIME" in df.columns:
        si   = int((df["ON TIME"] == "SI").sum())
        no   = int((df["ON TIME"] == "NO").sum())
        ne   = int((df["ON TIME"] == "NO ENTREGADO").sum())
        base = si + no
        metricas["on_time"] = {
            "si": si, "no": no, "no_entregado": ne,
            "pct": round(si / base * 100, 1) if base > 0 else 0
        }

    # ── ON TIME por transportadora ────────────────────
    if "Transportador" in df.columns and "ON TIME" in df.columns:
        por_trans = []
        for trans, grp in df.groupby("Transportador"):
            si   = int((grp["ON TIME"] == "SI").sum())
            no   = int((grp["ON TIME"] == "NO").sum())
            base = si + no
            por_trans.append({
                "name":  trans,
                "si":    si,
                "no":    no,
                "total": len(grp),
                "pct":   round(si / base * 100, 1) if base > 0 else 0
            })
        por_trans.sort(key=lambda x: x["pct"], reverse=True)
        metricas["por_transportadora"] = por_trans

    # ── Tendencia mensual ─────────────────────────────
    if "MES" in df.columns and "ON TIME" in df.columns:
        orden_meses = list(MESES_ES.values())
        tendencia   = []
        for mes, grp in df.groupby("MES"):
            if not mes:
                continue
            si   = int((grp["ON TIME"] == "SI").sum())
            no   = int((grp["ON TIME"] == "NO").sum())
            base = si + no
            tendencia.append({
                "mes":   mes,
                "si":    si,
                "no":    no,
                "total": len(grp),
                "pct":   round(si / base * 100, 1) if base > 0 else 0,
                "orden": orden_meses.index(mes) if mes in orden_meses else 99
            })
        tendencia.sort(key=lambda x: x["orden"])
        metricas["tendencia_mensual"] = tendencia

    # ── Estados — todos sin límite ────────────────────
    if "Estado" in df.columns:
        estados = (
            df["Estado"]
            .fillna("Sin estado")
            .replace("", "Sin estado")
            .value_counts()
        )
        metricas["estados"] = [
            {"estado": str(e), "cantidad": int(v)}
            for e, v in estados.items()
        ]

    # ── Participación por ciudad — sin duplicar carriers ──
    if "Ciudad Destino" in df.columns:
        ciudades = (
            df["Ciudad Destino"]
            .replace("", pd.NA)
            .dropna()
            .astype(str)
            .str.strip()
            .str.upper()
            .value_counts()
        )
        metricas["participacion_ciudades"] = [
            {"ciudad": str(c), "cantidad": int(v)}
            for c, v in ciudades.items()
            if str(c).strip() and str(c) != "NAN"
        ]

    # ── Ciudad x carrier (para filtro por ciudad) ─────
    if "Ciudad Destino" in df.columns and "Transportador" in df.columns:
        ciudad_carrier = (
            df.assign(_ciudad=df["Ciudad Destino"].astype(str).str.strip().str.upper())
            .groupby(["_ciudad", "Transportador"])
            .size()
            .reset_index(name="cantidad")
            .rename(columns={"_ciudad": "ciudad"})
        )
        metricas["ciudad_por_carrier"] = ciudad_carrier.to_dict(orient="records")

    # ── ON TIME por ciudad ────────────────────────────
    if "Ciudad Destino" in df.columns and "ON TIME" in df.columns:
        ontime_ciudad = []
        df_c = df.copy()
        df_c["_ciudad"] = df_c["Ciudad Destino"].astype(str).str.strip().str.upper()
        for ciudad, grp in df_c.groupby("_ciudad"):
            if not ciudad or ciudad == "NAN":
                continue
            si   = int((grp["ON TIME"] == "SI").sum())
            no   = int((grp["ON TIME"] == "NO").sum())
            base = si + no
            ontime_ciudad.append({
                "ciudad": ciudad,
                "si":     si,
                "no":     no,
                "total":  len(grp),
                "pct":    round(si / base * 100, 1) if base > 0 else 0
            })
        ontime_ciudad.sort(key=lambda x: x["total"], reverse=True)
        metricas["ontime_por_ciudad"] = ontime_ciudad

    # ── Top ciudades con retrasos ─────────────────────
    if "Ciudad Destino" in df.columns and "ON TIME" in df.columns:
        retrasos = (
            df[df["ON TIME"] == "NO"]["Ciudad Destino"]
            .astype(str).str.strip().str.upper()
            .value_counts()
        )
        metricas["top_ciudades_retraso"] = [
            {"ciudad": str(c), "cantidad": int(v)}
            for c, v in retrasos.items()
            if str(c).strip() and str(c) != "NAN"
        ]

    # ── Devoluciones ──────────────────────────────────
    if "Destinatario" in df.columns:
        mask_dev  = df["Destinatario"].apply(es_devolucion)
        df_dev    = df[mask_dev]
        total_dev = len(df_dev)

        dev_info = {
            "total": total_dev,
            "pct":   round(total_dev / total * 100, 1) if total > 0 else 0,
        }

        if "Transportador" in df.columns:
            dev_por_trans = df_dev["Transportador"].value_counts().to_dict()
            dev_info["por_transportadora"] = [
                {"name": k, "cantidad": int(v)}
                for k, v in dev_por_trans.items()
            ]

        if "Ciudad Destino" in df.columns:
            dev_ciudades = (
                df_dev["Ciudad Destino"]
                .astype(str).str.strip().str.upper()
                .value_counts()
                .head(10)
            )
            dev_info["por_ciudad"] = [
                {"ciudad": str(c), "cantidad": int(v)}
                for c, v in dev_ciudades.items()
                if str(c).strip() and str(c) != "NAN"
            ]

        metricas["devoluciones"] = dev_info

    # ── Filas por transportadora ──────────────────────
    if "Transportador" in df.columns:
        metricas["filas_por_transportadora"] = {
            str(k): int(v)
            for k, v in df["Transportador"].value_counts().items()
        }

    return metricas


#  PROCESAMIENTO PRINCIPAL
def aplicar_mapeo(df: pd.DataFrame, carrier: dict, final_cols: list) -> pd.DataFrame:
    mapping   = carrier.get("mapping", {})
    resultado = pd.DataFrame()

    for col_final in final_cols:
        if col_final in AUTO_COLS - {"Transportador"}:
            resultado[col_final] = ""
            continue
        if col_final == "Transportador":
            resultado[col_final] = carrier["name"]
            continue
        col_origen = mapping.get(col_final, "").strip()
        if col_origen and col_origen in df.columns:
            resultado[col_final] = df[col_origen].values
        else:
            resultado[col_final] = ""

    ontime_col = carrier.get("ontime_col", "")
    if carrier.get("ontime_mode") == "column" and ontime_col and ontime_col in df.columns:
        resultado["_ontime_src"] = df[ontime_col].values

    return resultado.reset_index(drop=True)


def _parsear_fecha(serie: pd.Series) -> pd.Series:
    resultado = pd.to_datetime(serie, errors="coerce", format="mixed", dayfirst=False)
    mask = resultado.isna() & serie.notna() & (
        ~serie.astype(str).str.strip().isin(["", "nan", "NaT", "None"])
    )
    if mask.any():
        resultado[mask] = pd.to_datetime(serie[mask], errors="coerce", dayfirst=True)
    return resultado


def calcular_columnas(df: pd.DataFrame, carrier: dict = None) -> pd.DataFrame:
    for col in ("Fecha de captura de guia","Fec_Entrega","Fec_AproxEntrega"):
        if col in df.columns:
            df[col] = _parsear_fecha(df[col])

    if "Fecha de captura de guia" in df.columns:
        df["MES"] = df["Fecha de captura de guia"].dt.month.map(MESES_ES).fillna("")
    else:
        df["MES"] = ""

    ontime_mode = carrier.get("ontime_mode","dates") if carrier else "dates"
    if ontime_mode == "column":
        val_ok = carrier.get("ontime_val","A tiempo")
        if "_ontime_src" in df.columns:
            src = df["_ontime_src"]
        else:
            col_ref = carrier.get("ontime_col","")
            src = df[col_ref] if col_ref and col_ref in df.columns else None
        if src is not None:
            df["ON TIME"] = src.astype(str).str.strip().apply(
                lambda v: "SI" if v.lower()==val_ok.lower()
                else ("NO ENTREGADO" if v in ("","nan","NaN") else "NO")
            )
        else:
            df["ON TIME"] = ""
        if "_ontime_src" in df.columns:
            df.drop(columns=["_ontime_src"], inplace=True)
    else:
        if "Fec_Entrega" in df.columns and "Fec_AproxEntrega" in df.columns:
            ent   = df["Fec_Entrega"].notna()
            aprox = df["Fec_AproxEntrega"].notna()
            ok    = df["Fec_Entrega"] <= df["Fec_AproxEntrega"]
            df["ON TIME"] = ""
            df.loc[ent & aprox & ok,  "ON TIME"] = "SI"
            df.loc[ent & aprox & ~ok, "ON TIME"] = "NO"
            df.loc[~ent,              "ON TIME"] = "NO ENTREGADO"
        else:
            df["ON TIME"] = ""

    df["ON TIME (SI=1 Y NO=0)"] = df["ON TIME"].map(
        {"SI":1,"NO":0,"NO ENTREGADO":0}
    ).fillna("")

    if "Estado" in df.columns:
        def _normalizar_estado(val):
            v = str(val).strip().upper()
            if v in ("ENTREGADA", "ENTREGADO", "CUMPLIDO"):
                return "CUMPLIDO"
            return str(val).strip()
        df["Estado"] = df["Estado"].apply(_normalizar_estado)

    for col in ("Fecha de captura de guia","Fec_Entrega","Fec_AproxEntrega"):
        if col in df.columns:
            df[col] = df[col].dt.strftime("%d/%m/%Y").fillna("")

    return df


def procesar_archivos(tasks: list, final_cols: list, progress_cb=None) -> tuple:
    dfs              = []
    stats            = {}
    reportes_calidad = []
    total_tasks      = sum(len(r) for _,r in tasks)
    procesados       = 0

    def emit(pct, msg):
        if progress_cb: progress_cb(pct, msg)

    emit(5, "Iniciando procesamiento...")

    for carrier, rutas in tasks:
        nombre        = carrier["name"]
        filas_carrier = 0
        dfs_carrier   = []

        for ruta in rutas:
            procesados += 1
            pct = int(10 + (procesados/total_tasks)*60)
            emit(pct, f"Leyendo {nombre}: {os.path.basename(ruta)}")

            df_raw = leer_excel(ruta, carrier.get("header_row",0))
            if df_raw.empty: continue

            df_m = aplicar_mapeo(df_raw, carrier, final_cols)
            df_c = calcular_columnas(df_m, carrier)
            filas_carrier += len(df_c)
            dfs_carrier.append(df_c)

        if dfs_carrier:
            df_carrier_total = pd.concat(dfs_carrier, ignore_index=True)
            emit(70+int(procesados/total_tasks*10), f"Validando {nombre}...")
            reporte = validar_calidad(df_carrier_total, nombre)
            reportes_calidad.append(reporte)
            dfs.append(df_carrier_total)

        stats[nombre] = filas_carrier

    if not dfs:
        raise ValueError("No se encontraron datos. Verifica el mapeo de columnas.")

    emit(82, "Unificando datos...")
    df_final = pd.concat(dfs, ignore_index=True)
    cols_ok  = [c for c in final_cols if c in df_final.columns]
    df_final = df_final[cols_ok].fillna("")

    emit(90, "Calculando métricas del dashboard...")
    metricas = calcular_metricas(df_final)

    emit(95, "Detectando devoluciones...")
    if "Destinatario" in df_final.columns:
        mask_dev     = df_final["Destinatario"].apply(es_devolucion)
        df_devoluciones = df_final[mask_dev].copy()
    else:
        df_devoluciones = pd.DataFrame(columns=df_final.columns)
    
    #  Convertir Guia a número donde sea posible 
    if "Guia" in df_final.columns:
        df_final["Guia"] = pd.to_numeric(df_final["Guia"], errors="coerce").fillna(df_final["Guia"])
    if "Guia" in df_devoluciones.columns:
        df_devoluciones["Guia"] = pd.to_numeric(df_devoluciones["Guia"], errors="coerce").fillna(df_devoluciones["Guia"])



    emit(98, "Guardando Excel con dos hojas...")
    return df_final, df_devoluciones, stats, reportes_calidad, metricas
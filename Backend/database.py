import json
import os
import sqlite3
from datetime import datetime

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
DB_FILE       = os.path.join(BASE_DIR, "historial.db")
RESULT_FOLDER = os.path.join(BASE_DIR, "resultado")


# ══════════════════════════════════════════════════════════════════════════
#  INIT — Crea todas las tablas si no existen
#
#  ¿Por qué una sola función init_db()?
#  Se llama una vez al arrancar el backend (main.py)
#  Si las tablas ya existen no hace nada — es idempotente
#  Si es la primera vez las crea todas
# ══════════════════════════════════════════════════════════════════════════
def init_db():
    conn = sqlite3.connect(DB_FILE)

    # ── Tabla historial logístico (ya existente) ──────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS historial (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha       TEXT NOT NULL,
            archivo     TEXT NOT NULL,
            total_filas INTEGER,
            carriers    TEXT,
            stats       TEXT,
            metricas    TEXT,
            rama        TEXT DEFAULT ''
        )
    """)
    # Migración: agregar columna rama si ya existe la tabla sin ella
    try:
        conn.execute("ALTER TABLE historial ADD COLUMN rama TEXT DEFAULT ''")
    except Exception:
        pass

    # ── Tabla picking ─────────────────────────────────────────────────────
    # Guarda cada sesión de carga del archivo de Picking
    # Una sesión = un archivo subido con sus métricas calculadas
    conn.execute("""
        CREATE TABLE IF NOT EXISTS picking_historial (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha         TEXT NOT NULL,
            filename      TEXT NOT NULL,
            total_filas   INTEGER DEFAULT 0,
            total_lineas  REAL    DEFAULT 0,
            total_unidades REAL   DEFAULT 0,
            meta_lineas   REAL    DEFAULT 68,
            meta_unidades REAL    DEFAULT 640,
            usuarios      INTEGER DEFAULT 0,
            pct_cumplimiento REAL DEFAULT 0,
            metricas      TEXT,
            periodo_desde TEXT,
            periodo_hasta TEXT
        )
    """)

    # ── Tabla SBL ─────────────────────────────────────────────────────────
    # Guarda cada sesión de carga del archivo de SBL
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sbl_historial (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha            TEXT NOT NULL,
            filename         TEXT NOT NULL,
            total_filas      INTEGER DEFAULT 0,
            total_unidades   REAL    DEFAULT 0,
            total_lineas     REAL    DEFAULT 0,
            avg_uph          REAL    DEFAULT 0,
            avg_lph          REAL    DEFAULT 0,
            pct_cumplimiento REAL    DEFAULT 0,
            meta_uph         REAL    DEFAULT 500,
            operarios        INTEGER DEFAULT 0,
            metricas         TEXT,
            periodo_desde    TEXT,
            periodo_hasta    TEXT
        )
    """)

    conn.commit()
    conn.close()

    init_picking_registros()
    init_sbl2_registros()

#  HISTORIAL LOGÍSTICO — funciones existentes sin cambios


def guardar_historial(archivo, total_filas, carriers_usados, stats, metricas, rama=""):
    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        INSERT INTO historial (fecha, archivo, total_filas, carriers, stats, metricas, rama)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        archivo,
        total_filas,
        json.dumps(carriers_usados, ensure_ascii=False),
        json.dumps(stats,           ensure_ascii=False),
        json.dumps(metricas,        ensure_ascii=False),
        rama,
    ))
    conn.commit()
    conn.close()


def obtener_historial(limit: int = 50) -> list:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM historial ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        item["carriers"] = json.loads(item["carriers"] or "[]")
        item["stats"]    = json.loads(item["stats"]    or "{}")
        item["metricas"] = json.loads(item["metricas"] or "{}")
        item["rama"]     = item.get("rama", "")
        result.append(item)
    return result


def obtener_historial_por_id(hid: int):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM historial WHERE id = ?", (hid,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    item["carriers"] = json.loads(item["carriers"] or "[]")
    item["stats"]    = json.loads(item["stats"]    or "{}")
    item["metricas"] = json.loads(item["metricas"] or "{}")
    item["rama"]     = item.get("rama", "")
    return item


def eliminar_historial(hid: int):
    conn = sqlite3.connect(DB_FILE)
    row  = conn.execute(
        "SELECT archivo FROM historial WHERE id = ?", (hid,)
    ).fetchone()
    if not row:
        conn.close()
        return None
    conn.execute("DELETE FROM historial WHERE id = ?", (hid,))
    conn.commit()
    conn.close()
    return row[0]


def obtener_ultimo_excel(rama: str = "") -> str:
    if not os.path.exists(RESULT_FOLDER):
        return None
    if rama:
        conn = sqlite3.connect(DB_FILE)
        row = conn.execute(
            "SELECT archivo FROM historial WHERE rama=? ORDER BY id DESC LIMIT 1",
            (rama,)
        ).fetchone()
        conn.close()
        if row:
            path = os.path.join(RESULT_FOLDER, row[0])
            if os.path.exists(path):
                return path
    archivos = [f for f in os.listdir(RESULT_FOLDER) if f.endswith(".xlsx")]
    if not archivos:
        return None
    archivos.sort(
        key=lambda f: os.path.getmtime(os.path.join(RESULT_FOLDER, f)),
        reverse=True
    )
    return os.path.join(RESULT_FOLDER, archivos[0])


# ══════════════════════════════════════════════════════════════════════════
#  PICKING — guardar y obtener historial
#
#  ¿Por qué guardar en BD y no solo en memoria?
#  - El historial persiste aunque se reinicie el servidor
#  - Permite comparar sesiones anteriores
#  - El supervisor puede ver la evolución semana a semana
# ══════════════════════════════════════════════════════════════════════════

def guardar_picking(filename, total_filas, metricas):
    """
    Guarda una sesión de Picking en la base de datos.
    Se llama automáticamente después de procesar el archivo.
    """
    k = metricas.get("kpis", {})

    # Calcular período desde/hasta de los datos
    tendencia = metricas.get("tendencia_mensual", [])
    periodo_desde = ""
    periodo_hasta = ""
    if tendencia:
        primer = tendencia[0]
        ultimo = tendencia[-1]
        periodo_desde = f"{primer.get('_año','')}-{str(primer.get('_mes','')).zfill(2)}"
        periodo_hasta = f"{ultimo.get('_año','')}-{str(ultimo.get('_mes','')).zfill(2)}"

    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        INSERT INTO picking_historial (
            fecha, filename, total_filas, total_lineas, total_unidades,
            meta_lineas, meta_unidades, usuarios, pct_cumplimiento,
            metricas, periodo_desde, periodo_hasta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        filename,
        total_filas,
        k.get("total_lineas",       0),
        k.get("total_unidades",     0),
        k.get("meta_lineas_dia",    68),
        k.get("meta_unidades_dia",  640),
        k.get("usuarios_unicos",    0),
        k.get("pct_cumplimiento",   0),
        json.dumps(metricas, ensure_ascii=False),
        periodo_desde,
        periodo_hasta,
    ))
    conn.commit()
    conn.close()


def obtener_picking_historial(limit: int = 20) -> list:
    """Retorna los últimos registros de Picking."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM picking_historial ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        item["metricas"] = json.loads(item["metricas"] or "{}")
        result.append(item)
    return result


def eliminar_picking_historial(hid: int):
    conn = sqlite3.connect(DB_FILE)
    conn.execute("DELETE FROM picking_historial WHERE id = ?", (hid,))
    conn.commit()
    conn.close()


# ══════════════════════════════════════════════════════════════════════════
#  SBL — guardar y obtener historial
#
#  Mismo patrón que Picking — una fila por sesión de carga
# ══════════════════════════════════════════════════════════════════════════

def guardar_sbl(filename, total_filas, metricas):
    """
    Guarda una sesión de SBL en la base de datos.
    Se llama automáticamente después de procesar el archivo.
    """
    k = metricas.get("kpis", {})

    tendencia = metricas.get("tendencia_mensual", [])
    periodo_desde = ""
    periodo_hasta = ""
    if tendencia:
        primer = tendencia[0]
        ultimo = tendencia[-1]
        periodo_desde = f"{primer.get('_año','')}-{str(primer.get('_mes','')).zfill(2)}"
        periodo_hasta = f"{ultimo.get('_año','')}-{str(ultimo.get('_mes','')).zfill(2)}"

    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        INSERT INTO sbl_historial (
            fecha, filename, total_filas, total_unidades, total_lineas,
            avg_uph, avg_lph, pct_cumplimiento, meta_uph, operarios,
            metricas, periodo_desde, periodo_hasta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        filename,
        total_filas,
        k.get("total_unidades",   0),
        k.get("total_lineas",     0),
        k.get("avg_uph",          0),
        k.get("avg_lph",          0),
        k.get("pct_cumplimiento", 0),
        k.get("meta_uph",         500),
        k.get("operarios_unicos", 0),
        json.dumps(metricas, ensure_ascii=False),
        periodo_desde,
        periodo_hasta,
    ))
    conn.commit()
    conn.close()


def obtener_sbl_historial(limit: int = 20) -> list:
    """Retorna los últimos registros de SBL."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM sbl_historial ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        item["metricas"] = json.loads(item["metricas"] or "{}")
        result.append(item)
    return result


def eliminar_sbl_historial(hid: int):
    conn = sqlite3.connect(DB_FILE)
    conn.execute("DELETE FROM sbl_historial WHERE id = ?", (hid,))
    conn.commit()
    conn.close()

"""**********Este bloque es para poder guardar los datos del Scrtp Picking a la base de datos*********"""
# ══════════════════════════════════════════════════════════════════════════
#  PICKING2 — tabla de registros individuales del script SAP
#
#  ¿Por qué una tabla separada de picking_historial?
#  picking_historial guarda resúmenes por sesión de carga manual
#  picking_registros guarda cada orden individual del script automático
#  Así podemos filtrar por usuario, día, tipo de picking con precisión
# ══════════════════════════════════════════════════════════════════════════

def init_picking_registros():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS picking_registros (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_confirmacion          TEXT,
            numero_orden                TEXT,
            usuario                     TEXT,
            hora_inicio                 TEXT,
            hora_fin                    TEXT,
            tiempo_total                REAL DEFAULT 0,
            tipo_picking                TEXT,
            ubicacion_destino           TEXT,
            mes                         TEXT,
            año                         INTEGER,
            total_unidades              INTEGER DEFAULT 0,
            total_lineas                INTEGER DEFAULT 0,
            fecha_insercion             TEXT
        )
    """)
    # Índices para que los filtros sean rápidos
    conn.execute("CREATE INDEX IF NOT EXISTS idx_picking_usuario ON picking_registros(usuario)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_picking_fecha   ON picking_registros(fecha_confirmacion)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_picking_tipo    ON picking_registros(tipo_picking)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_picking_mes     ON picking_registros(mes)")
    conn.commit()
    conn.close()


def insertar_picking_registros(registros: list) -> dict:
    """
    Recibe una lista de dicts con los registros del script SAP
    y los inserta en la base de datos.

    ¿Por qué INSERT OR IGNORE con numero_orden?
    Si el script corre dos veces el mismo día no duplica registros.
    La combinación fecha+numero_orden identifica unívocamente cada registro.
    """
    if not registros:
        return {"insertados": 0, "duplicados": 0}

    conn     = sqlite3.connect(DB_FILE)
    inserted = 0
    skipped  = 0

    for r in registros:
        try:
            conn.execute("""
                INSERT OR IGNORE INTO picking_registros (
                    fecha_confirmacion, numero_orden, usuario,
                    hora_inicio, hora_fin, tiempo_total,
                    tipo_picking, ubicacion_destino,
                    mes, año, total_unidades, total_lineas,
                    fecha_insercion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(r.get("fecha_confirmacion", "")),
                str(r.get("numero_orden",        "")),
                str(r.get("usuario",             "")).strip().upper(),
                str(r.get("hora_inicio",         "")),
                str(r.get("hora_fin",            "")),
                float(r.get("tiempo_total",      0) or 0),
                str(r.get("tipo_picking",        "")),
                str(r.get("ubicacion_destino",   "")),
                str(r.get("mes",                 "")),
                int(r.get("año",                 0) or 0),
                int(r.get("total_unidades",      0) or 0),
                int(r.get("total_lineas",        0) or 0),
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ))
            if conn.execute("SELECT changes()").fetchone()[0] > 0:
                inserted += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"Error insertando registro: {e}")

    conn.commit()
    conn.close()
    return {"insertados": inserted, "duplicados": skipped}


def consultar_picking_registros(
    usuario:      str = "",
    tipo_picking: str = "",
    mes:          str = "",
    año:          int = 0,
    fecha:        str = "",
    limit:        int = 10000
) -> list:
    """Consulta registros con filtros opcionales."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    query  = "SELECT * FROM picking_registros WHERE 1=1"
    params = []

    if usuario:
        query += " AND usuario = ?"
        params.append(usuario.strip().upper())
    if tipo_picking:
        query += " AND tipo_picking LIKE ?"
        params.append(f"%{tipo_picking}%")
    if mes:
        query += " AND mes = ?"
        params.append(mes)
    if año > 0:
        query += " AND año = ?"
        params.append(año)
    if fecha:
        query += " AND fecha_confirmacion LIKE ?"
        params.append(f"{fecha}%")

    query += " ORDER BY fecha_confirmacion DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def obtener_valores_filtro_picking() -> dict:
    """Retorna los valores únicos para poblar los selectores del frontend."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    usuarios     = [r[0] for r in conn.execute(
        "SELECT DISTINCT usuario FROM picking_registros ORDER BY usuario"
    ).fetchall()]
    tipos        = [r[0] for r in conn.execute(
        "SELECT DISTINCT tipo_picking FROM picking_registros ORDER BY tipo_picking"
    ).fetchall()]
    meses        = [r[0] for r in conn.execute(
        "SELECT DISTINCT mes FROM picking_registros ORDER BY año, mes"
    ).fetchall()]
    años         = [r[0] for r in conn.execute(
        "SELECT DISTINCT año FROM picking_registros WHERE año > 0 ORDER BY año"
    ).fetchall()]
    fechas       = [r[0] for r in conn.execute(
        "SELECT DISTINCT DATE(fecha_confirmacion) as d FROM picking_registros ORDER BY d DESC LIMIT 60"
    ).fetchall()]

    conn.close()
    return {
        "usuarios":  usuarios,
        "tipos":     tipos,
        "meses":     meses,
        "años":      años,
        "fechas":    fechas,
    }


def calcular_kpis_picking(registros: list) -> dict:
    """
    Calcula los KPIs desde los registros filtrados.

    Lógica:
    UxH = Suma total unidades / Suma tiempo total (en horas)
    LxH = Suma total lineas   / Suma tiempo total (en horas)
    Tiempo total viene en horas decimales (ej: 1.5 = 1h 30min)
    """
    if not registros:
        return {
            "total_unidades": 0, "total_lineas": 0,
            "tiempo_total": 0, "uxh": 0, "lxh": 0,
            "total_ordenes": 0,
        }

    total_unidades = sum(r.get("total_unidades", 0) or 0 for r in registros)
    total_lineas   = sum(r.get("total_lineas",   0) or 0 for r in registros)
    tiempo_total   = sum(r.get("tiempo_total",   0) or 0 for r in registros)
    total_ordenes  = len(registros)

    uxh = round(total_unidades / tiempo_total, 1) if tiempo_total > 0 else 0
    lxh = round(total_lineas   / tiempo_total, 1) if tiempo_total > 0 else 0

    return {
        "total_unidades": total_unidades,
        "total_lineas":   total_lineas,
        "tiempo_total":   round(tiempo_total, 2),
        "uxh":            uxh,
        "lxh":            lxh,
        "total_ordenes":  total_ordenes,
    }

    # ══════════════════════════════════════════════════════════════════════════
#  SBL2 — registros individuales del script automático AtpPut
# ══════════════════════════════════════════════════════════════════════════

def init_sbl2_registros():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sbl2_registros (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha           TEXT,
            operario        TEXT,
            tiempo_act      TEXT,
            unidades        REAL DEFAULT 0,
            lineas          REAL DEFAULT 0,
            u_hora          REAL DEFAULT 0,
            l_hora          REAL DEFAULT 0,
            horas           REAL DEFAULT 0,
            u_hora_real     REAL DEFAULT 0,
            l_hora_real     REAL DEFAULT 0,
            dia             INTEGER DEFAULT 0,
            mes_num         INTEGER DEFAULT 0,
            ano             INTEGER DEFAULT 0,
            meta            REAL DEFAULT 500,
            meta_proy       REAL DEFAULT 0,
            desempeno       TEXT,
            nombre_mes      TEXT,
            fecha_insercion TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sbl2_operario ON sbl2_registros(operario)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sbl2_fecha    ON sbl2_registros(fecha)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sbl2_mes      ON sbl2_registros(mes_num)")
    conn.commit()
    conn.close()


def insertar_sbl2_registros(registros: list) -> dict:
    if not registros:
        return {"insertados": 0, "duplicados": 0}

    conn     = sqlite3.connect(DB_FILE)
    inserted = 0
    skipped  = 0

    for r in registros:
        try:
            # Clave única: fecha + operario + tiempo_act
            # Permite múltiples registros del mismo operario en el mismo día
            # si tienen diferente hora de actividad
            existe = conn.execute(
                "SELECT id FROM sbl2_registros WHERE fecha=? AND operario=? AND tiempo_act=?",
                (
                    str(r.get("fecha",        "")),
                    str(r.get("operario",     "")).strip().upper(),
                    str(r.get("tiempo_act",   "")),
                )
            ).fetchone()

            if existe:
                skipped += 1
                continue

            conn.execute("""
                INSERT INTO sbl2_registros (
                    fecha, operario, tiempo_act, unidades, lineas,
                    u_hora, l_hora, horas, u_hora_real, l_hora_real,
                    dia, mes_num, ano, meta, meta_proy, desempeno,
                    nombre_mes, fecha_insercion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(r.get("fecha",         "")),
                str(r.get("operario",      "")).strip().upper(),
                str(r.get("tiempo_act",    "")),
                float(r.get("unidades",    0) or 0),
                float(r.get("lineas",      0) or 0),
                float(r.get("u_hora",      0) or 0),
                float(r.get("l_hora",      0) or 0),
                float(r.get("horas",       0) or 0),
                float(r.get("u_hora_real", 0) or 0),
                float(r.get("l_hora_real", 0) or 0),
                int(r.get("dia",     0) or 0),
                int(r.get("mes_num", 0) or 0),
                int(r.get("ano",     r.get("año", 0)) or 0),
                float(r.get("meta",      500) or 500),
                float(r.get("meta_proy", 0)   or 0),
                str(r.get("desempeno",   r.get("desempeño","")) or "").strip(),
                str(r.get("nombre_mes",  "") or ""),
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ))
            inserted += 1
        except Exception as e:
            print(f"Error insertando SBL2: {e}")

    conn.commit()
    conn.close()
    return {"insertados": inserted, "duplicados": skipped}


def consultar_sbl2_registros(
    operario: str = "",
    mes_num:  int = 0,
    ano:      int = 0,
    fecha:    str = "",
    limit:    int = 10000,
) -> list:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    q      = "SELECT * FROM sbl2_registros WHERE 1=1"
    params = []

    if operario:
        q += " AND operario = ?"
        params.append(operario.strip().upper())
    if mes_num > 0:
        q += " AND mes_num = ?"
        params.append(mes_num)
    if ano > 0:
        q += " AND ano = ?"
        params.append(ano)
    if fecha:
        q += " AND fecha = ?"
        params.append(fecha)

    q += " ORDER BY fecha DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def obtener_filtros_sbl2() -> dict:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    operarios = [r[0] for r in conn.execute(
        "SELECT DISTINCT operario FROM sbl2_registros ORDER BY operario"
    ).fetchall()]
    meses = conn.execute(
        "SELECT DISTINCT mes_num, nombre_mes FROM sbl2_registros ORDER BY ano, mes_num"
    ).fetchall()
    anos = [r[0] for r in conn.execute(
        "SELECT DISTINCT ano FROM sbl2_registros WHERE ano>0 ORDER BY ano"
    ).fetchall()]
    fechas = [r[0] for r in conn.execute(
        "SELECT DISTINCT fecha FROM sbl2_registros ORDER BY fecha DESC LIMIT 60"
    ).fetchall()]

    conn.close()
    return {
        "operarios": operarios,
        "meses":     [{"num": m[0], "nombre": m[1]} for m in meses],
        "anos":      anos,
        "fechas":    fechas,
    }


def calcular_kpis_sbl2(registros: list) -> dict:
    if not registros:
        return {
            "total_unidades": 0, "total_lineas": 0,
            "total_horas": 0, "avg_uph": 0, "avg_lph": 0,
            "pct_cumplimiento": 0, "total_registros": 0,
        }

    total_unidades = sum(r.get("unidades", 0) or 0 for r in registros)
    total_lineas   = sum(r.get("lineas",   0) or 0 for r in registros)
    total_horas    = sum(r.get("horas",    0) or 0 for r in registros)
    total          = len(registros)

    avg_uph = round(total_unidades / total_horas, 1) if total_horas > 0 else 0
    avg_lph = round(total_lineas   / total_horas, 1) if total_horas > 0 else 0

    cumpliendo = sum(
        1 for r in registros
        if str(r.get("desempeno","")).strip().lower() == "cumpliendo"
    )
    pct = round(cumpliendo / total * 100, 1) if total > 0 else 0

    return {
        "total_unidades":  total_unidades,
        "total_lineas":    total_lineas,
        "total_horas":     round(total_horas, 2),
        "avg_uph":         avg_uph,
        "avg_lph":         avg_lph,
        "pct_cumplimiento":pct,
        "cumpliendo":      cumpliendo,
        "total_registros": total,
    }
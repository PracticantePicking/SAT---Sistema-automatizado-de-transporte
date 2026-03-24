import json
import os
import sqlite3
from datetime import datetime

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
DB_FILE       = os.path.join(BASE_DIR, "historial.db")
RESULT_FOLDER = os.path.join(BASE_DIR, "resultado")


def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS historial (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha       TEXT NOT NULL,
            archivo     TEXT NOT NULL,
            total_filas INTEGER,
            carriers    TEXT,
            stats       TEXT,
            metricas    TEXT
        )
    """)
    conn.commit()
    conn.close()


def guardar_historial(archivo, total_filas, carriers_usados, stats, metricas):
    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        INSERT INTO historial (fecha, archivo, total_filas, carriers, stats, metricas)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        archivo,
        total_filas,
        json.dumps(carriers_usados, ensure_ascii=False),
        json.dumps(stats,           ensure_ascii=False),
        json.dumps(metricas,        ensure_ascii=False),
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


def obtener_ultimo_excel():
    if not os.path.exists(RESULT_FOLDER):
        return None

    archivos = [
        f for f in os.listdir(RESULT_FOLDER)
        if f.endswith(".xlsx")
    ]

    if not archivos:
        return None

    archivos.sort(
        key=lambda f: os.path.getmtime(os.path.join(RESULT_FOLDER, f)),
        reverse=True
    )
    return os.path.join(RESULT_FOLDER, archivos[0])
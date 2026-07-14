"""
migrar_control_reclamo.py
Migración one-time del Excel maestro → tabla control_reclamo (con normalización).

Ubícalo en:  C:\SAT_Prebel\Backend\migrar_control_reclamo.py
Ejecútalo desde ahí para que 'database' se importe bien.

Uso:
    python migrar_control_reclamo.py              # migra SOLO si la tabla está vacía
    python migrar_control_reclamo.py --reset      # BORRA la tabla y migra desde cero
    python migrar_control_reclamo.py --append     # inserta aunque ya haya filas (duplica)
"""

import sys
import sqlite3
import pandas as pd
from datetime import datetime

from database import DB_FILE, insertar_control_reclamo

EXCEL_PATH = "ControlReclamo.xlsx"   # ← ajusta la ruta si el Excel está en otra carpeta
HOJA       = "Control_Reclamo"

# ─────────────────────────────────────────────────────────────────────────────
#  1) MAPEO  header del Excel  →  columna de la tabla
# ─────────────────────────────────────────────────────────────────────────────
MAPA = {
    "FECHA":                              "fecha",
    "NOTA CREDITO":                       "nota_credito",
    "FACTURA2":                           "factura2",
    "FECHA FACTURA":                      "fecha_factura",
    "CÓDIGO CLIENTE":                     "codigo_cliente",
    "NOMBRE CLIENTE":                     "nombre_cliente",
    "CÓDIGO VENDEDOR":                    "codigo_vendedor",
    "NOMBRE VENDOR":                      "nombre_vendedor",   # ojo: VENDOR, no VENDEDOR
    "REFERENCIA":                         "referencia",
    "MARCA Y NOMBRE DE LA REFERENCIA":    "marca_referencia",
    "UNIDADES":                           "unidades",
    "NOVEDAD":                            "novedad",
    "RESPONSABLE":                        "responsable",
    "TRAZABILIDAD ":                      "trazabilidad",      # header trae espacio final
    "UNIDADES AL 3002":                   "unidades_3002",
    "USUARIO":                            "usuario",
    "TIPO PICKING":                       "tipo_picking",
    "ESTADO":                             "estado",
    "VALOR":                              "valor",
    "FECHA   ENTREGA Y/O PROCESADO":      "fecha_entrega",
    "OBSERVACIONES  TRANSPORTE":          "observaciones_transporte",
    "DIAS DE PROCESO":                    "dias_proceso",
    "INDICADOR":                          "indicador",
    "Ciudad":                             "ciudad",
    "Canal":                              "canal",
    "CECO":                               "ceco",
    "GUIAS":                              "guias",
    "PERMANENCIA DE REPORTE NOVEDAD DIAS":"permanencia_dias",
}

# ─────────────────────────────────────────────────────────────────────────────
#  2) CANON  — a qué se traduce cada variante sucia (edítalo con tu equipo)
# ─────────────────────────────────────────────────────────────────────────────
CANON_CANAL = {
    "PROFESSIONAL": "PROFESIONAL",
    "PROFECIONAL":  "PROFESIONAL",
    "PROFESIONAL":  "PROFESIONAL",
    # "MODERNO GRANDES CADENAS": "MODERNO",  # ← descomenta si es el MISMO canal que MODERNO
}

# Columnas que van SIEMPRE en mayúscula y sin espacios sobrantes
COLS_UPPER = {
    "nota_credito", "factura2", "nombre_cliente", "nombre_vendedor",
    "referencia", "marca_referencia", "novedad", "responsable",
    "trazabilidad", "usuario", "tipo_picking", "estado", "indicador",
    "ciudad", "canal", "observaciones_transporte",
}

MESES_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}

# ─────────────────────────────────────────────────────────────────────────────
#  Helpers de limpieza
# ─────────────────────────────────────────────────────────────────────────────
def limpiar_texto(v):
    if pd.isna(v):
        return ""
    return " ".join(str(v).split()).strip()   # colapsa espacios internos + trim

def limpiar_entero_como_texto(v):
    """CECO, GUIAS, codigo_cliente, codigo_vendedor → texto sin '.0'."""
    if pd.isna(v):
        return ""
    try:
        return str(int(float(v)))
    except (ValueError, TypeError):
        return limpiar_texto(v)

def fecha_iso(v):
    if pd.isna(v):
        return ""
    if isinstance(v, (datetime, pd.Timestamp)):
        return v.strftime("%Y-%m-%d")
    try:
        return pd.to_datetime(v).strftime("%Y-%m-%d")
    except Exception:
        return ""

COLS_FECHA   = {"fecha", "fecha_factura", "fecha_entrega"}
COLS_ENTERO  = {"codigo_cliente", "codigo_vendedor", "ceco", "guias"}


def normalizar_fila(row: dict) -> dict:
    out = {}
    for header, col in MAPA.items():
        val = row.get(header)
        if col in COLS_FECHA:
            out[col] = fecha_iso(val)
        elif col in COLS_ENTERO:
            out[col] = limpiar_entero_como_texto(val)
        elif col in COLS_UPPER:
            txt = limpiar_texto(val).upper()
            if col == "canal":
                txt = CANON_CANAL.get(txt, txt)
            out[col] = txt
        else:
            out[col] = limpiar_texto(val)

    # Derivar mes / año / nombre_mes desde la fecha (no confiar en las columnas del Excel)
    mes = anio = 0
    nombre_mes = ""
    if out.get("fecha"):
        try:
            dt = datetime.strptime(out["fecha"], "%Y-%m-%d")
            mes, anio, nombre_mes = dt.month, dt.year, MESES_ES[dt.month]
        except ValueError:
            pass
    out["mes"] = mes
    out["año"] = anio
    out["nombre_mes"] = nombre_mes
    out["fecha_insercion"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return out


def contar_filas():
    conn = sqlite3.connect(DB_FILE)
    n = conn.execute("SELECT COUNT(*) FROM control_reclamo").fetchone()[0]
    conn.close()
    return n

def vaciar_tabla():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("DELETE FROM control_reclamo")
    conn.commit()
    conn.close()


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else ""

    existentes = contar_filas()
    print(f"Filas actuales en control_reclamo: {existentes}")

    if existentes > 0 and modo not in ("--reset", "--append"):
        print("\n⚠  La tabla YA tiene datos. Como no hay UNIQUE, migrar ahora DUPLICARÍA.")
        print("   Usa  --reset  (borra y migra)  o  --append  (inserta igual). Abortando.")
        return

    if modo == "--reset" and existentes > 0:
        vaciar_tabla()
        print("Tabla vaciada.")

    df = pd.read_excel(EXCEL_PATH, sheet_name=HOJA, header=0)
    print(f"Leídas {len(df)} filas del Excel.")

    registros = [normalizar_fila(r) for r in df.to_dict(orient="records")]

    # Vista previa del canon aplicado
    canales = sorted({r["canal"] for r in registros})
    pickings = sorted({r["tipo_picking"] for r in registros})
    print("Canales tras normalizar:", canales)
    print("Tipos picking tras normalizar:", pickings)

    resultado = insertar_control_reclamo(registros)
    print(f"\n✅ Insertados: {resultado['insertados']} de {len(registros)}")
    print(f"Total en tabla ahora: {contar_filas()}")


if __name__ == "__main__":
    main()
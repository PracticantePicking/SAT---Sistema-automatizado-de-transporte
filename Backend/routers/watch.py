"""
routers/watch.py

Equivalente al bloque Watch Folder de servidor.py en Flask.

Cambios respecto a Flask:
- socketio.emit()  →  emit_from_thread(event, data)
- threading es igual, pero la emisión cruza al loop async
- Los endpoints usan APIRouter en lugar de @app.route
- WatchRequest importado desde models.py
"""

import asyncio
import os
import shutil
import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from models import WatchRequest
from config import load_config, UPLOAD_FOLDER, RESULT_FOLDER
from database import guardar_historial
from procesador import detectar_transportadora, procesar_archivos

router = APIRouter()

# ── Constantes ────────────────────────────────────────
POLL_INTERVAL = 10   # segundos entre revisiones de carpeta

# ── Estado global del watch ───────────────────────────
sio  = None   # se inyecta desde main.py en startup
loop = None   # se inyecta desde main.py en startup

watch_config = {
    "activo":  False,
    "carpeta": "",
    "espera":  3,
}

watch_cola      = {}
watch_cola_lock = threading.Lock()
watch_timer     = None
watch_thread    = None
watch_stop_evt  = threading.Event()
watch_vistos    = set()


# ════════════════════════════════════════════════════
#  UTILIDAD: emitir Socket.IO desde un hilo síncrono
# ════════════════════════════════════════════════════
def emit_from_thread(event: str, data: dict):
    """
    En Flask-SocketIO podías llamar socketio.emit() desde cualquier hilo.
    En FastAPI el server es async, así que hay que cruzar al event loop
    de uvicorn usando run_coroutine_threadsafe.

    Este es el único truco nuevo respecto a Flask.
    """
    if sio is None or loop is None:
        return
    asyncio.run_coroutine_threadsafe(
        sio.emit(event, data),
        loop
    )


# ════════════════════════════════════════════════════
#  HILO DE POLLING
# ════════════════════════════════════════════════════
def _poll_loop(carpeta: str):
    """
    Corre en su propio hilo (threading.Thread).
    Revisa la carpeta cada POLL_INTERVAL segundos.
    Detecta archivos nuevos y los encola.
    """
    emit_from_thread("watch_log", {
        "msg": f"🔍 Polling activo — revisando cada {POLL_INTERVAL}s"
    })

    while not watch_stop_evt.is_set():
        try:
            if not os.path.exists(carpeta):
                emit_from_thread("watch_log", {
                    "msg": f"⚠️ Carpeta no accesible: {carpeta}"
                })
                watch_stop_evt.wait(POLL_INTERVAL)
                continue

            archivos_actuales = set()
            for fname in os.listdir(carpeta):
                ext = os.path.splitext(fname)[1].lower()
                if ext in (".xlsx", ".xls"):
                    ruta = os.path.join(carpeta, fname)
                    archivos_actuales.add(ruta)

            nuevos = archivos_actuales - watch_vistos
            for ruta in nuevos:
                watch_vistos.add(ruta)
                threading.Timer(2.0, _encolar_archivo, args=[ruta]).start()

        except Exception as e:
            emit_from_thread("watch_log", {"msg": f"❌ Error polling: {e}"})

        watch_stop_evt.wait(POLL_INTERVAL)

    emit_from_thread("watch_log", {"msg": "⏹ Polling detenido"})


# ════════════════════════════════════════════════════
#  ENCOLAR ARCHIVO
# ════════════════════════════════════════════════════
def _encolar_archivo(ruta: str):
    """
    Identifica la transportadora del archivo.
    Si lo identifica → lo agrega a watch_cola y reinicia el timer.
    Si no → emite watch_no_identificado.
    """
    try:
        if not os.path.exists(ruta):
            return

        try:
            with open(ruta, "rb") as f:
                f.read(512)
        except (IOError, PermissionError):
            threading.Timer(3.0, _encolar_archivo, args=[ruta]).start()
            return

        config   = load_config()
        carriers = config["carriers"]

        emit_from_thread("watch_log", {
            "msg": f"📁 Detectado: {os.path.basename(ruta)} — identificando..."
        })

        carrier, metodo, score = detectar_transportadora(ruta, carriers)

        if carrier:
            emit_from_thread("watch_log", {
                "msg": f"✅ <strong>{carrier['name']}</strong> ({metodo}, {score}%)"
            })
            emit_from_thread("watch_detectado", {
                "archivo": os.path.basename(ruta),
                "carrier": carrier["name"],
                "metodo":  metodo,
                "score":   score,
            })

            with watch_cola_lock:
                watch_cola[ruta] = {
                    "carrier": carrier,
                    "metodo":  metodo,
                    "score":   score,
                    "ts":      datetime.now().isoformat()
                }

            _reset_batch_timer()

        else:
            emit_from_thread("watch_log", {
                "msg": f"⚠️ No identificado: {os.path.basename(ruta)}"
            })
            emit_from_thread("watch_no_identificado", {
                "archivo": os.path.basename(ruta)
            })

    except Exception as e:
        emit_from_thread("watch_log", {
            "msg": f"❌ Error al encolar {os.path.basename(ruta)}: {e}"
        })


# ════════════════════════════════════════════════════
#  TIMER DEL BATCH
# ════════════════════════════════════════════════════
def _reset_batch_timer():
    """
    Cada vez que llega un archivo nuevo reinicia el contador.
    Cuando llega a 0 sin interrupciones dispara _procesar_batch.
    """
    global watch_timer
    espera = watch_config.get("espera", 3)

    if watch_timer and watch_timer.is_alive():
        watch_timer.cancel()

    emit_from_thread("watch_log", {
        "msg": f"⏳ Esperando {espera} min por más archivos..."
    })
    emit_from_thread("watch_cola_update", {"cola": _cola_resumen()})

    watch_timer = threading.Timer(espera * 60, _procesar_batch)
    watch_timer.daemon = True
    watch_timer.start()


# ════════════════════════════════════════════════════
#  PROCESAR BATCH
# ════════════════════════════════════════════════════
def _procesar_batch():
    """
    Toma todo lo que hay en watch_cola, lo procesa como un único
    Excel unificado y emite el resultado por Socket.IO.
    """
    global watch_cola

    with watch_cola_lock:
        if not watch_cola:
            return
        cola_snapshot = dict(watch_cola)
        watch_cola    = {}

    emit_from_thread("watch_log", {
        "msg": f"🚀 Procesando {len(cola_snapshot)} archivo(s)..."
    })
    emit_from_thread("watch_cola_update", {"cola": []})

    try:
        config     = load_config()
        final_cols = config["finalCols"]

        # Agrupar por carrier y copiar a /uploads
        grupos = {}

        for ruta_orig, info in cola_snapshot.items():
            carrier = info["carrier"]
            cid     = carrier["id"]
            ext     = os.path.splitext(ruta_orig)[1]
            fname   = f"{cid}_{uuid.uuid4().hex[:8]}{ext}"
            destino = os.path.join(UPLOAD_FOLDER, fname)

            try:
                shutil.copy2(ruta_orig, destino)
            except Exception as e:
                emit_from_thread("watch_log", {
                    "msg": f"⚠️ No se pudo copiar {os.path.basename(ruta_orig)}: {e}"
                })
                continue

            if cid not in grupos:
                grupos[cid] = (carrier, [])
            grupos[cid][1].append(destino)

        if not grupos:
            emit_from_thread("watch_log", {
                "msg": "❌ No hay archivos válidos para procesar"
            })
            return

        tasks = list(grupos.values())

        def progress_cb(pct, msg):
            emit_from_thread("watch_progreso", {"pct": pct, "msg": msg})
            emit_from_thread("watch_log",      {"msg": f"  {pct}% — {msg}"})

        df, stats, reportes, metricas = procesar_archivos(
            tasks, final_cols, progress_cb
        )

        ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_name = f"watch_unificado_{ts}.xlsx"
        output_path = os.path.join(RESULT_FOLDER, output_name)
        df.to_excel(output_path, index=False)

        carriers_usados = [c["name"] for c, _ in tasks]
        guardar_historial(output_name, len(df), carriers_usados, stats, metricas)

        emit_from_thread("watch_log", {
            "msg": f"✅ {output_name} — {len(df)} filas"
        })
        emit_from_thread("watch_completado", {
            "archivo":     output_name,
            "total_filas": len(df),
            "carriers":    carriers_usados,
            "stats":       stats,
        })

    except Exception as e:
        emit_from_thread("watch_log",   {"msg": f"❌ {e}"})
        emit_from_thread("watch_error", {"error": str(e)})


# ════════════════════════════════════════════════════
#  INICIAR / DETENER
# ════════════════════════════════════════════════════
def iniciar_watch(carpeta: str, espera: int = 3):
    global watch_thread, watch_vistos, watch_config

    detener_watch()

    try:
        os.listdir(carpeta)
    except Exception as e:
        return False, f"No se puede acceder: {e}"

    # Pre-cargar existentes para ignorarlos
    watch_vistos = set()
    try:
        for fname in os.listdir(carpeta):
            ext = os.path.splitext(fname)[1].lower()
            if ext in (".xlsx", ".xls"):
                watch_vistos.add(os.path.join(carpeta, fname))
        emit_from_thread("watch_log", {
            "msg": f"📋 {len(watch_vistos)} archivo(s) existentes ignorados"
        })
    except Exception:
        pass

    watch_config["activo"]  = True
    watch_config["carpeta"] = carpeta
    watch_config["espera"]  = espera

    watch_stop_evt.clear()
    watch_thread = threading.Thread(
        target=_poll_loop,
        args=[carpeta],
        daemon=True
    )
    watch_thread.start()
    return True, "Watch activo"


def detener_watch():
    global watch_thread, watch_timer

    if watch_timer and watch_timer.is_alive():
        watch_timer.cancel()
        watch_timer = None

    watch_stop_evt.set()

    if watch_thread and watch_thread.is_alive():
        watch_thread.join(timeout=POLL_INTERVAL + 2)

    watch_thread = None
    watch_config["activo"] = False


# ════════════════════════════════════════════════════
#  ENDPOINTS
# ════════════════════════════════════════════════════
@router.get("/watch")
def get_watch():
    return {
        **watch_config,
        "activo": watch_thread is not None and watch_thread.is_alive(),
        "cola":   _cola_resumen()
    }


@router.post("/watch")
def set_watch(data: WatchRequest):
    if data.activo:
        if not data.carpeta:
            raise HTTPException(status_code=400, detail="Carpeta requerida")

        ok, msg = iniciar_watch(data.carpeta, data.espera)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
    else:
        detener_watch()

    return {"ok": True, "activo": data.activo}


@router.post("/watch/procesar_ahora")
def watch_procesar_ahora():
    global watch_timer

    if watch_timer and watch_timer.is_alive():
        watch_timer.cancel()
        watch_timer = None

    t = threading.Thread(target=_procesar_batch)
    t.daemon = True
    t.start()
    return {"ok": True}


@router.post("/watch/vaciar_cola")
def watch_vaciar_cola():
    global watch_cola, watch_timer

    if watch_timer and watch_timer.is_alive():
        watch_timer.cancel()
        watch_timer = None

    with watch_cola_lock:
        watch_cola = {}

    emit_from_thread("watch_cola_update", {"cola": []})
    return {"ok": True}


# ════════════════════════════════════════════════════
#  UTILIDAD INTERNA
# ════════════════════════════════════════════════════
def _cola_resumen():
    with watch_cola_lock:
        return [
            {
                "archivo": os.path.basename(ruta),
                "carrier": info["carrier"]["name"],
                "metodo":  info["metodo"],
                "score":   info["score"],
                "ts":      info["ts"]
            }
            for ruta, info in watch_cola.items()
        ]
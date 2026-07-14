import asyncio
import os
import time
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import socketio
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from logger import get_logger
from database import init_db
from config import load_config, BASE_DIR
from routers import (
    carriers, upload, process, dashboard,
    historial, facturacion, picking, sbl,
    picking2, sbl2, ia_sbl, ia_picking, inventario, control_reclamo
)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'), override=True)

logger = get_logger("main")


# ── CORS ──────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://172.15.2.53:5173"
    ).split(",") if o.strip()
]

# ── SOCKET.IO ─────────────────────────────────────────────────────────────
sio = socketio.AsyncServer(
    cors_allowed_origins=ALLOWED_ORIGINS,
    async_mode="asgi"
)

# ── LIFESPAN ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app):
    init_db()
    logger.info("=" * 50)
    logger.info("  SAT PREBEL — FastAPI + React")
    logger.info("  API:      http://localhost:5000")
    logger.info("  Docs:     http://localhost:5000/docs")
    logger.info("  Frontend: http://localhost:5173")
    logger.info("=" * 50)
    yield

# ── APP ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SAT Prebel",
    version="2.0",
    description="Sistema de Automatización de Transportadoras",
    lifespan=lifespan
)

# ── REQUEST LOGGING ───────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start    = time.perf_counter()
    response = await call_next(request)
    ms       = round((time.perf_counter() - start) * 1000)
    logger.info("%s %s → %s (%dms)", request.method, request.url.path, response.status_code, ms)
    return response

# ── MIDDLEWARE ────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── ROUTERS ───────────────────────────────────────────────────────────────
app.include_router(carriers.router,    prefix="/api", tags=["Carriers"])
app.include_router(upload.router,      prefix="/api", tags=["Upload"])
app.include_router(process.router,     prefix="/api", tags=["Process"])
app.include_router(dashboard.router,   prefix="/api", tags=["Dashboard"])
app.include_router(historial.router,   prefix="/api", tags=["Historial"])
app.include_router(facturacion.router, prefix="/api", tags=["Facturacion"])
app.include_router(picking.router,     prefix="/api", tags=["Picking"])
app.include_router(sbl.router,         prefix="/api", tags=["SBL"])
app.include_router(picking2.router,    prefix="/api", tags=["Picking2"])
app.include_router(sbl2.router,        prefix="/api", tags=["SBL2"])
app.include_router(ia_sbl.router,      prefix="/api", tags=["IA"])
app.include_router(ia_picking.router,  prefix="/api", tags=["IA"])
app.include_router(inventario.router, prefix="/api", tags=["Inventario"])
app.include_router(control_reclamo.router, prefix="/api", tags=["Control Reclamo"])


# ── ENDPOINT RAÍZ ─────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "status":  "online",
        "sistema": "SAT Prebel",
        "fronted": "http://localhost:5173",
        "version": "2.0"
    }


# ── SOCKET.IO ─────────────────────────────────────────────────────────────
@sio.event
async def connect(sid, environ):
    await sio.emit("conectado", {"msg": "Servidor listo"}, to=sid)

# ── COMBINED APP ──────────────────────────────────────────────────────────
combined_app = socketio.ASGIApp(sio, other_asgi_app=app)

# ── ARRANQUE ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:combined_app",
        host="0.0.0.0",
        port=5000,
        reload=os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    )
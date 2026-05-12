import asyncio
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from config import load_config, BASE_DIR
from routers import (
    carriers, upload, process, dashboard,
    historial, facturacion, picking, sbl,
    picking2, sbl2, ia_sbl
)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'), override=True)


# ── SOCKET.IO ─────────────────────────────────────────────────────────────
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode="asgi"
)

# ── LIFESPAN ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app):
    init_db()
    print("=" * 50)
    print("  SAT PREBEL — FastAPI + React")
    print("  API:      http://localhost:5000")
    print("  Docs:     http://localhost:5000/docs")
    print("  Frontend: http://localhost:5173")
    print("=" * 50)
    yield

# ── APP ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SAT Prebel",
    version="2.0",
    description="Sistema de Automatización de Transportadoras",
    lifespan=lifespan
)

# ── MIDDLEWARE ────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5000",
    ],
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
        reload=True
    )
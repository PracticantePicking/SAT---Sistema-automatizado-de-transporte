import asyncio
import os
from contextlib import asynccontextmanager

import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import carriers, upload, process, dashboard, historial, facturacion
from database import init_db
from config import load_config, BASE_DIR
from routers import carriers, upload, process, dashboard, historial, watch
from routers import carriers, upload, process, dashboard, historial, facturacion, picking, sbl

# 1. SOCKET.IO 
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode="asgi"
)


#  2. LIFESPAN
# Reemplaza @app.on_event("startup") — forma moderna en FastAPI
# Se ejecuta al arrancar y al apagar el servidor
@asynccontextmanager
async def lifespan(app):
    # STARTUP
    init_db()
    wc = watch.watch_config
    if wc.get("activo") and wc.get("carpeta"):
        watch.iniciar_watch(wc["carpeta"], wc.get("espera", 3))
        print(f"  ▶ Watch reactivado: {wc['carpeta']}")
    print("=" * 50)
    print("  SAT PREBEL — FastAPI + React")
    print("  API:      http://localhost:5000")
    print("  Docs:     http://localhost:5000/docs")
    print("  Frontend: http://localhost:5173")
    print("=" * 50)
    yield
    # SHUTDOWN
    watch.detener_watch()


#  3. APP 
# lifespan se pasa aquí — por eso debe estar definido antes
app = FastAPI(
    title="SAT Prebel",
    version="2.0",
    description="Sistema de Automatización de Transportadoras",
    lifespan=lifespan
)


#  4. MIDDLEWARE
# allow_origins incluye el puerto de Vite (5173) para que
# React pueda llamar al backend sin errores de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite — React dev server
        "http://localhost:3000",  # por si acaso
        "http://localhost:5000",  # el mismo backend
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


#  5. ROUTERS 
# Cada router agrupa los endpoints de su módulo
# prefix="/api" agrega el prefijo a todos automáticamente
app.include_router(carriers.router,  prefix="/api", tags=["Carriers"])
app.include_router(upload.router,    prefix="/api", tags=["Upload"])
app.include_router(process.router,   prefix="/api", tags=["Process"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(historial.router, prefix="/api", tags=["Historial"])
app.include_router(facturacion.router, prefix="/api", tags=["Facturacion"])
app.include_router(picking.router, prefix="/api", tags=["Picking"])
app.include_router(sbl.router,     prefix="/api", tags=["SBL"])


#  6. ENDPOINT RAÍZ 
# Ya no sirve el HTML — React corre en su propio servidor
# Este endpoint confirma que la API está activa
@app.get("/")
async def root():
    return {
        "status":  "online",
        "sistema": "SAT Prebel",
        "fronted":     "http://localhost:5173",
        "version": "2.0"
    }


#  7. SOCKET.IO EVENT
# Cuando el frontend conecta por WebSocket emite "conectado"
@sio.event
async def connect(sid, environ):
    await sio.emit("conectado", {"msg": "Servidor listo"}, to=sid)


# 8. COMBINED APP 
# Socket.IO se monta como capa ASGI sobre FastAPI
# Las rutas /socket.io/* las maneja sio
# El resto las maneja app (FastAPI)
combined_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app
)


#  9. ARRANQUE 
# Solo se ejecuta con: python main.py
# Con uvicorn directo: uvicorn main:combined_app --reload
if __name__ == "__main__":
    uvicorn.run(
        "main:combined_app",
        host="0.0.0.0",
        port=5000,
        reload=True
    )
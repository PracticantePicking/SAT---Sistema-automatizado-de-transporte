import asyncio
import os

import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from database import init_db
from config import load_config, BASE_DIR
from routers import carriers, upload, process, dashboard, historial, watch

sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode="asgi"
)

app = FastAPI(
    title="Transportadores Prebel",
    version="2.0",
    description="Sistema de unificación de reportes de transportadoras"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(carriers.router,  prefix="/api", tags=["Carriers"])
app.include_router(upload.router,    prefix="/api", tags=["Upload"])
app.include_router(process.router,   prefix="/api", tags=["Process"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(historial.router, prefix="/api", tags=["Historial"])
app.include_router(watch.router,     prefix="/api", tags=["Watch"])


@app.on_event("startup")
async def startup():
    init_db()

    watch.sio  = sio
    watch.loop = asyncio.get_event_loop()

    wc = watch.watch_config
    if wc.get("activo") and wc.get("carpeta"):
        watch.iniciar_watch(wc["carpeta"], wc.get("espera", 3))
        print(f"  ▶ Watch reactivado: {wc['carpeta']}")

    print("=" * 50)
    print("  TRANSPORTADORES v2 — FastAPI")
    print("  http://localhost:5000")
    print("  Docs: http://localhost:5000/docs")
    print("=" * 50)

#  Lee el archivo directamente y lo sirve como string; Se cambio por JinJA2
@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = os.path.join(BASE_DIR, "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@sio.event
async def connect(sid, environ):
    await sio.emit("conectado", {"msg": "Servidor listo"}, to=sid)


combined_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app
)

if __name__ == "__main__":
    uvicorn.run(
        "main:combined_app",
        host="0.0.0.0",
        port=5000,
        reload=True
    )
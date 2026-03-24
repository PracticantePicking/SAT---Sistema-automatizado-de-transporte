# Sistema de Automatización de Transportadoras (SAT v2.0)
**Prebel S.A. — Área de Tecnología de Información**

Sistema web interno que automatiza la consolidación, procesamiento y análisis de los reportes de entrega de las transportadoras Solistica, Coordinadora e Internacional de Carga.

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + Uvicorn |
| Tiempo real | python-socketio |
| Procesamiento | pandas + rapidfuzz |
| Excel | openpyxl + xlrd |
| Validación | Pydantic |
| Frontend | HTML5 + CSS3 + JavaScript |
| Gráficos | Chart.js |
| Base de datos | SQLite (desarrollo) → SQL Server (producción) |

---

## Estructura del Proyecto

```
Automatizacion_transportadoras/
├── main.py               # Punto de entrada — FastAPI + Socket.IO
├── procesador.py         # Lógica de negocio — pandas, ON TIME, devoluciones
├── database.py           # Persistencia SQLite / SQL Server
├── config.py             # Rutas y configuración de transportadoras
├── models.py             # Schemas Pydantic
├── routers/
│   ├── carriers.py       # CRUD de transportadoras
│   ├── upload.py         # Carga de archivos Excel
│   ├── process.py        # Procesamiento asíncrono con BackgroundTasks
│   ├── dashboard.py      # Indicadores y métricas con filtros
│   ├── historial.py      # Historial de procesamientos y descarga
│   └── watch.py          # Watch Folder — polling automático
├── templates/
│   └── index.html        # Interfaz web SPA
├── uploads/              # Archivos Excel cargados (temporal)
├── resultado/            # Excel generados
└── requirements.txt
```

---

## Instalación

### 1. Clonar o descargar el proyecto

```bash
cd Z:\Análisis ingreso de lineas por semana\Automatizacion_transportadoras
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 3. Iniciar el servidor

```bash
uvicorn main:combined_app --host 0.0.0.0 --port 5000 --reload
```

### 4. Abrir en el navegador

```
http://localhost:5000
```

La documentación interactiva de la API está disponible en:
```
http://localhost:5000/docs
```

---

## Dependencias

```txt
fastapi
uvicorn[standard]
python-socketio
pandas
openpyxl
xlrd
rapidfuzz
pydantic
python-multipart
httpx
jinja2
```

---

## Funcionalidades

### Pestaña Procesar
- Carga de archivos `.xlsx` / `.xls` por transportadora (hasta 5 por carrier)
- Sugerencia automática de mapeo de columnas con porcentaje de confianza (rapidfuzz)
- Generación de Excel unificado con dos hojas:
  - **DB**: todas las remesas con 15 columnas estándar
  - **Devoluciones**: remesas devueltas detectadas por palabras clave
- Reporte de calidad por transportadora (score 0-100)

### Pestaña Indicadores
Dashboard interactivo con 7 indicadores:

| Indicador | Descripción |
|-----------|-------------|
| Estado de Remesas | Todos los estados con recuento y porcentaje |
| Participación por Ciudad | Remesas por ciudad sin duplicar entre carriers |
| ON TIME Global | Gráfico de dona con SI / NO / NO ENTREGADO |
| ON TIME por Transportadora | Comparativo entre carriers |
| Tendencia Mensual | Evolución del % ON TIME mes a mes |
| ON TIME por Ciudad | Desglose por ciudad ordenado por volumen |
| Devoluciones | Por transportadora y top de ciudades |

Filtros disponibles: Transportadora, Ciudad, MES, Estado, Numero_Documento, Destinatario

### Pestaña Historial
- Registro de todos los procesamientos con fecha, filas y transportadoras
- Descarga de cualquier Excel generado anteriormente
- Re-análisis de cualquier procesamiento en el dashboard
- Eliminación de registros

### Watch Folder
- Vigilancia automática de carpetas de red (compatible con `Z:\`, rutas UNC)
- Polling cada 10 segundos (sin watchdog — compatible con discos mapeados)
- Identificación automática de transportadora por nombre de archivo o columnas
- Procesamiento por batch con timer configurable (1-15 minutos)
- Log en tiempo real vía Socket.IO

### Configuración
- Gestión de mapeo de columnas por transportadora desde la interfaz web
- Creación y eliminación de transportadoras personalizadas
- Las transportadoras estáticas (Solistica, Coordinadora, Internacional) no pueden eliminarse

---

## Cálculo de ON TIME

| Transportadora | Modo | Lógica |
|----------------|------|--------|
| Solistica | Fechas | `Fec_Entrega <= Fec_AproxEntrega` → SI |
| Internacional | Fechas | `Fec_Entrega <= Fec_AproxEntrega` → SI |
| Coordinadora | Columna | `Eficiencia == "A tiempo"` → SI |

Valores posibles: `SI` / `NO` / `NO ENTREGADO`

---

## Detección de Devoluciones

El sistema detecta remesas devueltas buscando las siguientes palabras clave en el campo **Destinatario** (insensible a mayúsculas):

```
prebel, dev, devolucion, devolución, disnal, pedir cita
```

Aplica únicamente a Solistica y Coordinadora.

---

## Columnas del Excel Unificado

| Columna | Origen |
|---------|--------|
| Numero_Documento | Mapeo |
| NOMBRE TARIFARIO | Mapeo |
| Guia | Mapeo (formato numérico) |
| Numero Unidades | Mapeo |
| Estado | Mapeo + normalización |
| Fec_Entrega | Mapeo |
| Fec_AproxEntrega | Mapeo |
| Transportador | **Automático** |
| Fecha de captura de guia | Mapeo |
| Destinatario | Mapeo |
| Ciudad Destino | Mapeo |
| MES | **Automático** |
| ON TIME | **Automático** |
| ON TIME (SI=1 Y NO=0) | **Automático** |
| CANAL | Mapeo |

---

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/carriers` | Lista transportadoras y configuración |
| POST | `/api/carriers` | Crear nueva transportadora |
| PUT | `/api/carriers/{id}` | Actualizar mapeo o color |
| DELETE | `/api/carriers/{id}` | Eliminar transportadora custom |
| POST | `/api/upload` | Subir archivo Excel |
| POST | `/api/process` | Lanzar procesamiento (retorna job_id) |
| GET | `/api/process/status/{job_id}` | Estado del procesamiento |
| GET | `/api/dashboard` | Indicadores con filtros |
| GET | `/api/dashboard/download` | Descargar Excel filtrado |
| GET | `/api/historial` | Lista de procesamientos |
| DELETE | `/api/historial/{id}` | Eliminar registro |
| GET | `/api/download/{filename}` | Descargar Excel generado |
| GET | `/api/watch` | Estado del Watch Folder |
| POST | `/api/watch` | Activar / desactivar Watch Folder |
| POST | `/api/watch/procesar_ahora` | Forzar procesamiento inmediato |
| POST | `/api/watch/vaciar_cola` | Vaciar cola sin procesar |

---

## Fases Futuras

- Migración de SQLite a SQL Server corporativo de Prebel S.A.
- Asistente de análisis con IA (Claude API) para consultas en lenguaje natural
- Conexión con SAP mediante RFC u OData
- Autenticación de usuarios con roles diferenciados
- Despliegue en servidor interno de Prebel

---

## Desarrollado por

**John Esteban García Cely**
Practicante de Tecnología de Información — Prebel S.A.
Marzo 2026
# SAT — Sistema de Automatización de Transportadoras

Plataforma interna para la gestión, seguimiento y análisis de operaciones logísticas con transportadoras. Incluye dashboards de OTD (On Time Delivery) por ciudad, filtros dinámicos y exportación de reportes multi-hoja a Excel.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-2.x-E92063?logo=pydantic&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.x-D71F00)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-blue?logo=docker&logoColor=white)

---

## Contexto

Proyecto de automatización en el área de logística de una empresa del sector cosmético. Reemplaza procesos manuales basados en hojas de cálculo por una plataforma centralizada que estandariza la captura de datos, automatiza el cálculo de indicadores y expone reportes para la toma de decisiones operativas.

## Stack Técnico

**Backend**
- Python 3.11+
- FastAPI + Uvicorn
- Pydantic v2 (validación y serialización)
- SQLAlchemy 2.x (ORM)
- SQLite (entorno actual) → SQL Server (migración planificada)

**Frontend**
- Jinja2 templates server-side
- Tailwind CSS
- JavaScript vanilla para interactividad de filtros

**Procesamiento de datos**
- Pandas
- OpenPyXL (generación de Excel multi-hoja)

**Infraestructura**
- Docker (contenerización)
- Variables de entorno para configuración por ambiente

---

## Características

- Dashboards de OTD agregados a nivel ciudad con visualización de tendencias.
- Sistema de filtros dinámicos combinables (estado, fecha, ciudad, transportadora).
- Exportación a Excel multi-hoja con datos crudos y resúmenes agregados.
- Endpoint dedicado para descarga de archivos generados.
- Validación automática de payloads con Pydantic.
- Documentación interactiva auto-generada (Swagger UI + ReDoc).

---

## Arquitectura

Estructura modular con separación estricta por capas:

```
app/
├── routers/         # Endpoints HTTP organizados por dominio
├── services/        # Lógica de negocio
├── repositories/    # Acceso a datos
├── schemas/         # Modelos Pydantic (request/response)
├── models/          # Modelos SQLAlchemy
├── core/            # Configuración, seguridad, dependencias
├── utils/           # Procesamiento Excel, helpers
└── templates/       # Vistas Jinja2
```

**Principios aplicados**
- Inversión de dependencias entre routers y services.
- Repositorios desacoplados del ORM mediante interfaces.
- Configuración centralizada con Pydantic Settings.
- Manejo de errores por excepciones de dominio mapeadas a respuestas HTTP.

---

## Hitos Técnicos

### Migración Flask → FastAPI
Refactor completo desde una base Flask monolítica hacia una arquitectura modular en FastAPI, manteniendo compatibilidad de endpoints durante la transición. Beneficios obtenidos: validación automática con Pydantic, documentación OpenAPI generada, soporte async nativo y mejor performance bajo carga concurrente.

### Modularización por routers
División del monolito original en routers por dominio funcional. Cada router agrupa sus dependencias, schemas y rutas, lo que facilita el mantenimiento y permite a múltiples desarrolladores trabajar sin colisiones.

### Pipeline de exportación a Excel
Generación de reportes multi-hoja con OpenPyXL aplicando estilos, formato condicional y validaciones. Los archivos se generan en memoria y se sirven vía streaming para evitar saturar el disco.

---

## Decisiones Técnicas

| Decisión | Alternativa considerada | Motivo |
|----------|------------------------|--------|
| FastAPI | Django REST Framework | Mejor performance async, validación nativa con Pydantic, OpenAPI automático. |
| Jinja2 server-side | SPA (React/Next.js) | Menor complejidad para un alcance interno; despliegue más simple. |
| SQLite inicial | SQL Server desde el día 1 | Permitió validar la lógica de negocio sin depender de permisos administrativos del entorno corporativo. |
| Repositorios desacoplados | Acceso directo al ORM en services | Facilita testing y migración futura entre motores de base de datos. |

---

## Roadmap

- [ ] Migración a SQL Server (pendiente por permisos administrativos del entorno).
- [ ] Integración con LLM para consultas en lenguaje natural sobre métricas logísticas.
- [ ] Sistema de alertas automáticas por umbrales de OTD incumplidos.
- [ ] Tests de integración con cobertura sobre routers críticos.
- [ ] Pipeline CI/CD con validación automática de migraciones.

---

## Aprendizajes

- Migrar un monolito en producción exige mantener compatibilidad hacia atrás durante la transición; los endpoints se versionaron y refactorizaron por dominio, no de golpe.
- La separación en capas paga rápido: agregar un nuevo filtro o cambiar el motor de base de datos se hace sin tocar la lógica de negocio.
- Pydantic v2 cambia las reglas de validación respecto a v1; vale la pena entender los `field_validator` y `model_validator` antes de migrar esquemas existentes.

---

## Autor

**John Esteban García Cely**
Backend Developer & Automation Engineer · Medellín, Colombia

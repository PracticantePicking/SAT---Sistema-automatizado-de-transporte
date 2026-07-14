import axios from 'axios'

// ── URL BASE ──────────────────────────────────────────────────────────────
// Apunta al backend FastAPI en desarrollo
// En producción se camba esto a la IP del servidor de Prebel
//const BASE_URL = 'http://localhost:5000' cambio por el .env
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
// ── CLIENTE AXIOS ─────────────────────────────────────────────────────────
// Creamos una instancia con la URL base ya configurada
// Así en cada llamada solo escribimos el path: /api/carriers
// En lugar de la URL completa cada vez
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 segundos — el procesamiento puede demorar
})

// ── INTERCEPTOR DE ERRORES ────────────────────────────────────────────────
// Este bloque se ejecuta automáticamente cuando CUALQUIER llamada falla
// En lugar de manejar el error en cada componente, lo centralizamos aquí
api.interceptors.response.use(
  response => response,      // si sale bien → devuelve la respuesta normal
  error => {
    // Si el servidor no responde (backend apagado)
    if (!error.response) {
      console.error('❌ Backend no disponible:', error.message)
    }
    return Promise.reject(error)
  }
)


//  CARRIERS — Transportadoras


// Trae la configuración completa: carriers + ramas + columnas finales
export const getCarriers = () =>
  api.get('/api/carriers').then(r => r.data)

// Crea una nueva transportadora
// data = { name: "Mi Carrier", color: "#FF5733", rama_id: "disnal" }
export const createCarrier = (data) =>
  api.post('/api/carriers', data).then(r => r.data)

// Actualiza el mapeo de columnas o el color de una transportadora
// id = "carrier_abc123"
// data = { mapping: { Guia: "GUIA_NUMERO" }, color: "#00FF00" }
export const updateCarrier = (id, data) =>
  api.put(`/api/carriers/${id}`, data).then(r => r.data)

// Elimina una transportadora custom (las estáticas no se pueden borrar)
export const deleteCarrier = (id) =>
  api.delete(`/api/carriers/${id}`).then(r => r.data)


//  RAMAS — DISNAL / CEDI / Rionegro


// Trae todas las ramas con sus transportadoras expandidas (objetos completos)
export const getRamas = () =>
  api.get('/api/ramas').then(r => r.data)

// Crea una nueva rama custom
export const createRama = (data) =>
  api.post('/api/ramas', data).then(r => r.data)

// Actualiza el nombre o la lista de carriers de una rama
export const updateRama = (id, data) =>
  api.put(`/api/ramas/${id}`, data).then(r => r.data)

// Elimina una rama custom (DISNAL, CEDI y Rionegro no se pueden borrar)
export const deleteRama = (id) =>
  api.delete(`/api/ramas/${id}`).then(r => r.data)

// Asigna una transportadora existente a una rama
// ramaId = "disnal", carrierId = "carrier_abc123"
export const asignarCarrierARama = (ramaId, carrierId) =>
  api.post(`/api/ramas/${ramaId}/carriers`, { carrier_id: carrierId }).then(r => r.data)

// Quita una transportadora de una rama (sin eliminarla del sistema)
export const quitarCarrierDeRama = (ramaId, carrierId) =>
  api.delete(`/api/ramas/${ramaId}/carriers/${carrierId}`).then(r => r.data)


//  UPLOAD — Subir archivos Excel


// Sube un archivo Excel al backend
// file = File (el objeto del input[type=file])
// carrierId = "carrier_abc123"
// onProgress = función que recibe el % de subida (para la barra de progreso)
export const uploadFile = (file, carrierId, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('carrier_id', carrierId)

  return api.post('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    },
  }).then(r => r.data)
}


//  PROCESS — Procesamiento de archivos


// Inicia el procesamiento de archivos subidos
// ramaId = "disnal"
// jobs = [{ carrier_id: "carrier_abc", files: ["archivo1.xlsx"] }]
// Retorna un job_id para consultar el estado después
export const procesarArchivos = (ramaId, jobs) =>
  api.post('/api/process', { rama_id: ramaId, jobs }).then(r => r.data)

// Consulta el estado de un job en curso
// Retorna { status: "running"|"done"|"error", pct: 0-100, msg: "..." }
export const getJobStatus = (jobId) =>
  api.get(`/api/process/status/${jobId}`).then(r => r.data)


//  DASHBOARD — Indicadores


// Trae los indicadores con filtros opcionales
// Todos los parámetros son opcionales
// historialId → analizar un procesamiento específico del historial
// rama        → filtrar por rama ("disnal", "cedi", "rionegro")
// Los demás   → filtros del dashboard (transportador, ciudad, mes, etc.)
export const getDashboard = (params = {}) =>
  api.get('/api/dashboard', { params }).then(r => r.data)

// Descarga el Excel con los filtros activos del dashboard
// Construye la URL con los parámetros y abre el archivo en el navegador
export const downloadDashboard = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  window.open(`${BASE_URL}/api/dashboard/download?${query}`, '_blank')
}


//  HISTORIAL


// Trae todos los registros del historial
// Cada registro incluye: id, fecha, archivo, total_filas, carriers, rama
export const getHistorial = () =>
  api.get('/api/historial').then(r => r.data)

// Elimina un registro del historial y su archivo Excel del servidor
export const deleteHistorial = (id) =>
  api.delete(`/api/historial/${id}`).then(r => r.data)

// Descarga el Excel de un procesamiento específico del historial
export const downloadHistorial = (filename) => {
  window.open(`${BASE_URL}/api/download/${filename}`, '_blank')
}

// ── EXPORT DEFAULT ────────────────────────────────────────────────────────
// Exportamos también la instancia de axios por si algún componente
// necesita hacer una llamada personalizada
export default api

// Descarga una tabla específica del dashboard como CSV
// tabla puede ser: 'estados', 'ciudades', 'ontime_ciudad', 'devoluciones'
export const downloadTabla = (tabla, datos, columnas) => {
  // Generar HTML de tabla que Excel abre correctamente
  // Es más confiable que CSV para Excel en español
  const headers = columnas
    .map(c => `<th style="background:#1B3A6B;color:white;padding:6px 10px;font-weight:600;">${c.toUpperCase()}</th>`)
    .join('')

  const rows = datos.map((row, i) => {
    const celdas = columnas
      .map(col => `<td style="padding:5px 10px;border-bottom:1px solid #E2E8F0;">${row[col] ?? ''}</td>`)
      .join('')
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    return `<tr style="background:${bg}">${celdas}</tr>`
  }).join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <!--[if gte mso 9]>
      <xml><x:ExcelWorkbook><x:ExcelWorksheets>
        <x:ExcelWorksheet><x:Name>${tabla}</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets></x:ExcelWorkbook></xml>
      <![endif]-->
    </head>
    <body>
      <table border="1">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>
  `

  const blob = new Blob([html], {
    type: 'application/vnd.ms-excel;charset=utf-8'
  })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = `${tabla}_${new Date().toISOString().slice(0,10)}.xls`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
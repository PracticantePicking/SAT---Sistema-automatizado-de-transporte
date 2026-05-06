import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:5000',
  timeout: 30000,
})

api.interceptors.response.use(
  r => r,
  err => {
    if (!err.response) console.error('Backend no disponible:', err.message)
    return Promise.reject(err)
  }
)

export const uploadDevoluciones = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/api/devoluciones/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getStats = () =>
  api.get('/api/devoluciones/stats').then(r => r.data)

export const getDevoluciones = (params) =>
  api.get('/api/devoluciones', { params }).then(r => r.data)

export const getHistorial = () =>
  api.get('/api/historial').then(r => r.data)

export const buildDownloadUrl = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return `http://localhost:5000/api/devoluciones/download${q ? `?${q}` : ''}`
}

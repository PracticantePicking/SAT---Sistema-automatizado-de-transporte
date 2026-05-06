import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Upload, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react'
import { uploadDevoluciones } from '../api/index'

export default function Procesar() {
  const [uploading, setUploading] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError]         = useState(null)

  const onDrop = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    setUploading(true)
    setResultado(null)
    setError(null)

    try {
      const data = await uploadDevoluciones(file)
      setResultado(data)
      toast.success(`Archivo procesado: ${data.filas.toLocaleString('es-CO')} registros`)
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Error al procesar el archivo'
      setError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: uploading,
  })

  return (
    <div style={{ maxWidth: 640 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Procesar archivo</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Carga un Excel de devoluciones para analizar los datos
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      >
        <div
          {...getRootProps()}
          className={`dropzone${isDragActive ? ' active' : ''}`}
          style={{ opacity: uploading ? 0.5 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
        >
          <input {...getInputProps()} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {uploading ? (
              <>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: '3px solid rgba(99,102,241,0.3)',
                  borderTop: '3px solid #6366f1',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <div style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Procesando...</div>
              </>
            ) : (
              <>
                <Upload size={40} color="#6366f1" />
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                  {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra tu archivo Excel aquí'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}>
                  o haz clic para seleccionar · .xlsx, .xls
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '20px 24px', marginTop: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <CheckCircle size={20} color="#22c55e" />
              <span style={{ fontWeight: 600, color: '#22c55e' }}>Archivo cargado exitosamente</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="glass-card" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Registros</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6366f1' }}>
                  {resultado.filas.toLocaleString('es-CO')}
                </div>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Columnas</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6' }}>
                  {resultado.columnas?.length}
                </div>
              </div>
            </div>
            {resultado.columnas?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                  Columnas detectadas
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {resultado.columnas.map(col => (
                    <span key={col} style={{
                      background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.25)',
                      borderRadius: 6, padding: '2px 10px',
                      fontSize: '0.75rem', color: '#a5b4fc',
                    }}>
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '16px 20px', marginTop: 20, borderColor: 'rgba(239,68,68,0.3)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <XCircle size={18} color="#ef4444" />
              <span style={{ color: '#ef4444', fontWeight: 500 }}>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { History, Package } from 'lucide-react'
import { getHistorial } from '../api/index'

export default function Historial() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHistorial()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Historial</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Procesamientos realizados en el sistema SAT
        </p>
      </motion.div>

      {loading && (
        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '4rem' }}>
          Cargando...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
          <History size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>No hay registros en el historial</div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-card"
              style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(99,102,241,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Package size={18} color="#6366f1" />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: 2 }}>
                  {item.archivo}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>
                  {item.fecha}
                  {item.rama ? ` · ${item.rama}` : ''}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#6366f1' }}>
                  {item.total_filas?.toLocaleString('es-CO')}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>registros</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

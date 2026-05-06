import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Package, Truck, TrendingDown, AlertCircle } from 'lucide-react'
import { getStats } from '../api/index'

const COLORS = ['#6366f1','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899']

// Contador animado
function CountUp({ target, duration = 1500 }) {
  const [val, setVal] = useState(0)
  const start = useRef(null)

  useEffect(() => {
    if (!target) return
    start.current = null
    const step = (ts) => {
      if (!start.current) start.current = ts
      const progress = Math.min((ts - start.current) / duration, 1)
      setVal(Math.floor(progress * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])

  return <span>{val.toLocaleString('es-CO')}</span>
}

const card = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const kpis = stats ? [
    { label: 'Total Devoluciones', value: stats.total,                 icon: Package,      color: '#6366f1' },
    { label: 'Transportadoras',    value: stats.por_carrier?.length,   icon: Truck,        color: '#22c55e' },
    { label: 'Estados distintos',  value: stats.por_estado?.length,    icon: AlertCircle,  color: '#f59e0b' },
    { label: 'Meses en historial', value: stats.por_mes?.length,       icon: TrendingDown, color: '#8b5cf6' },
  ] : []

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Resumen de devoluciones cargadas
        </p>
      </motion.div>

      {loading && (
        <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4rem', textAlign: 'center' }}>
          Cargando...
        </div>
      )}

      {!loading && !stats?.cargado && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass-card"
          style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}
        >
          <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 6 }}>Sin datos</div>
          <div style={{ fontSize: '0.875rem' }}>
            Ve a <strong>Procesar</strong> y carga un archivo Excel de devoluciones
          </div>
        </motion.div>
      )}

      {stats?.cargado && (
        <>
          {/* KPI Cards */}
          <motion.div
            variants={container} initial="hidden" animate="show"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}
          >
            {kpis.map(({ label, value, icon: Icon, color }) => (
              <motion.div key={label} variants={card} className="glass-card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={18} color={color} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                    {label}
                  </span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color }}>
                  <CountUp target={value ?? 0} />
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Gráficas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Por carrier */}
            {stats.por_carrier?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="glass-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>Por Transportadora</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.por_carrier} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="nombre" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#1a1f35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="total" fill="#6366f1" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Por estado */}
            {stats.por_estado?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="glass-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>Por Estado</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={stats.por_estado} dataKey="total" nameKey="estado"
                      cx="50%" cy="50%" outerRadius={80} label={({ estado, percent }) =>
                        `${estado} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    >
                      {stats.por_estado.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1a1f35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>

          {/* Tendencia mensual */}
          {stats.por_mes?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="glass-card" style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>Tendencia Mensual</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.por_mes} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="mes" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1f35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}

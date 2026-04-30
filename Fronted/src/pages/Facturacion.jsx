import { useState, useRef, useMemo } from 'react'
import {
  Chart as ChartJS,
  ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler
} from 'chart.js'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import { useToast } from '../components/Toast'

ChartJS.register(
  ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler
)

const BASE_URL = 'http://localhost:5000'

// ── COLORES ───────────────────────────────────────────────────────────────
const C = ['#2563EB','#16A34A','#EA580C','#7C3AED','#0891B2','#DB2777','#CA8A04','#DC2626']

// ── HELPERS ───────────────────────────────────────────────────────────────
const formatCOP = (v) => {
  if (!v && v !== 0) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(v)
}

const formatNum = (v) => {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('es-CO')
}

const MESES = {
  1:'Ene', 2:'Feb', 3:'Mar', 4:'Abr', 5:'May', 6:'Jun',
  7:'Jul', 8:'Ago', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dic'
}

// ── COMPONENTES ───────────────────────────────────────────────────────────
function KpiCard({ label, valor, sub, color = 'var(--accent)' }) {
  return (
    <div className="card" style={{ padding:'16px 18px' }}>
      <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--text-muted)',
        textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>
        {label}
      </div>
      <div style={{ fontSize:'1.5rem', fontWeight:700, color, lineHeight:1 }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function Panel({ titulo, badge, accion, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span className="card-title">{titulo}</span>
          {badge && <span className="badge badge-accent">{badge}</span>}
        </div>
        {accion}
      </div>
      <div className="card-body" style={{ padding:'16px' }}>
        {children}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  PÁGINA: Facturación
// ══════════════════════════════════════════════════════════════════════════
function Facturacion() {
  const toast   = useToast()
  const inputRef = useRef(null)

  const [estado,    setEstado]    = useState(null)  // info del archivo cargado
  const [data,      setData]      = useState(null)  // métricas del backend
  const [cargando,  setCargando]  = useState(false)
  const [subiendo,  setSubiendo]  = useState(false)

  // Filtros locales
  const [filtros, setFiltros] = useState({
    canal: '', cliente: '', categoria: '', marca: '', mes: 0, año: 0
  })

  // ── Subir archivo ─────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.warning('Solo se aceptan archivos .xlsx o .xls')
      return
    }
    setSubiendo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE_URL}/api/facturacion/upload`, {
        method: 'POST', body: form
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Error al subir')
      setEstado({ filename: json.filename, procesado: json.procesado, filas: json.filas })
      setData(json)
      toast.success(`Archivo cargado — ${formatNum(json.filas)} filas`)
    } catch (e) {
      toast.error(e.message || 'Error al procesar el archivo')
    } finally {
      setSubiendo(false)
    }
  }

  // ── Aplicar filtros ───────────────────────────────────────────────────
  async function aplicarFiltros() {
    if (!estado) { toast.warning('Primero sube un archivo'); return }
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (filtros.canal)     params.append('canal',     filtros.canal)
      if (filtros.cliente)   params.append('cliente',   filtros.cliente)
      if (filtros.categoria) params.append('categoria', filtros.categoria)
      if (filtros.marca)     params.append('marca',     filtros.marca)
      if (filtros.mes > 0)   params.append('mes',       filtros.mes)
      if (filtros.año > 0)   params.append('año',       filtros.año)
      const res  = await fetch(`${BASE_URL}/api/facturacion/metricas?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail)
      setData(json)
    } catch (e) {
      toast.error('Error al aplicar filtros')
    } finally {
      setCargando(false)
    }
  }

  function limpiarFiltros() {
    setFiltros({ canal:'', cliente:'', categoria:'', marca:'', mes:0, año:0 })
    if (estado) aplicarFiltros()
  }

  // ── Métricas ──────────────────────────────────────────────────────────
  const m  = data?.metricas  || {}
  const vf = data?.valores_filtro || {}
  const k  = m.kpis || {}

  // ── Datos gráficos ────────────────────────────────────────────────────
  const dataBarCanal = useMemo(() => {
    const arr = (m.por_canal || []).slice(0, 8)
    return {
      labels: arr.map(c => `CDis ${c.CDis}`),
      datasets: [{
        label: 'Valor facturado',
        data:  arr.map(c => c.valor),
        backgroundColor: C,
        borderRadius: 4,
      }]
    }
  }, [m])

  const dataBarClientes = useMemo(() => {
    const arr = m.top_clientes || []
    return {
      labels: arr.map(c => {
        const n = String(c.Solicitante)
        return n.length > 20 ? n.slice(0, 20) + '…' : n
      }),
      datasets: [{
        label: 'Valor facturado',
        data:  arr.map(c => c.valor),
        backgroundColor: '#2563EB',
        borderRadius: 4,
      }]
    }
  }, [m])

  const dataLinea = useMemo(() => {
    const arr = [...(m.tendencia_mensual || [])].sort((a,b) =>
      a.Año !== b.Año ? a.Año - b.Año : a.Mes - b.Mes
    )
    return {
      labels: arr.map(x => `${MESES[x.Mes]} ${x.Año}`),
      datasets: [{
        label: 'Facturación COP',
        data:  arr.map(x => x.valor),
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37,99,235,0.08)',
        fill: true, tension: 0.4,
        pointRadius: 5, pointBackgroundColor: '#2563EB',
      }]
    }
  }, [m])

  const dataDonaCategoria = useMemo(() => {
    const arr = (m.por_categoria || []).slice(0, 7)
    return {
      labels: arr.map(c => String(c['Grupo de artículos'])),
      datasets: [{
        data: arr.map(c => c.valor),
        backgroundColor: C,
        borderWidth: 0,
      }]
    }
  }, [m])

  const OPTS = {
    responsive: true, maintainAspectRatio: true,
    plugins: { legend: { labels: { font:{ family:'Inter,sans-serif', size:11 }, color:'#4A5568' } } }
  }

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* ── ZONA DE CARGA ────────────────────────────────────────────── */}
      <div className="card" style={{ padding:'18px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'16px', flexWrap:'wrap' }}>

          <input ref={inputRef} type="file" accept=".xlsx,.xls"
            style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />

          <button
            className="btn btn-primary"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
          >
            {subiendo
              ? <><div className="spinner" style={{ width:'14px', height:'14px' }} /> Procesando...</>
              : '📂 Cargar archivo SAP'}
          </button>

          {/* Zona drag & drop */}
          <div
            style={{ flex:1, minWidth:'200px', padding:'10px 14px',
              border:'1px dashed var(--border)', borderRadius:'var(--radius-md)',
              fontSize:'0.78rem', color:'var(--text-muted)', cursor:'pointer',
              textAlign:'center' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
          >
            {estado
              ? `📄 ${estado.filename} — ${formatNum(estado.filas)} filas — ${estado.procesado}`
              : 'Arrastra el Excel de SAP aquí o haz clic en el botón'}
          </div>
        </div>
      </div>

      {/* ── FILTROS ──────────────────────────────────────────────────── */}
      {data && (
        <div className="card" style={{ padding:'14px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>

            <select className="form-select" style={{ width:'120px' }}
              value={filtros.canal}
              onChange={e => setFiltros(p => ({ ...p, canal: e.target.value }))}>
              <option value="">Todos los canales</option>
              {(vf.canales || []).map(c => <option key={c} value={c}>CDis {c}</option>)}
            </select>

            <input className="form-input" style={{ width:'180px' }}
              placeholder="Buscar cliente..."
              value={filtros.cliente}
              onChange={e => setFiltros(p => ({ ...p, cliente: e.target.value }))} />

            <select className="form-select" style={{ width:'180px' }}
              value={filtros.categoria}
              onChange={e => setFiltros(p => ({ ...p, categoria: e.target.value }))}>
              <option value="">Todas las categorías</option>
              {(vf.categorias || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select className="form-select" style={{ width:'120px' }}
              value={filtros.marca}
              onChange={e => setFiltros(p => ({ ...p, marca: e.target.value }))}>
              <option value="">Todas las marcas</option>
              {(vf.marcas || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select className="form-select" style={{ width:'110px' }}
              value={filtros.mes}
              onChange={e => setFiltros(p => ({ ...p, mes: Number(e.target.value) }))}>
              <option value={0}>Todos los meses</option>
              {(vf.meses || []).map(m => <option key={m} value={m}>{MESES[m]}</option>)}
            </select>

            <select className="form-select" style={{ width:'90px' }}
              value={filtros.año}
              onChange={e => setFiltros(p => ({ ...p, año: Number(e.target.value) }))}>
              <option value={0}>Todos los años</option>
              {(vf.años || []).map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <button className="btn btn-primary btn-sm" onClick={aplicarFiltros}>
              Aplicar
            </button>
            <button className="btn btn-secondary btn-sm" onClick={limpiarFiltros}>
              ✕ Limpiar
            </button>
          </div>

          {/* Info totales */}
          <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px solid var(--border)',
            display:'flex', gap:'20px', fontSize:'0.72rem', color:'var(--text-muted)' }}>
            <span>
              <strong style={{ color:'var(--text-secondary)' }}>Registros: </strong>
              {formatNum(data.total_filas)}
            </span>
            {Object.keys(data.filtros_activos || {}).length > 0 && (
              <span style={{ color:'var(--accent)' }}>
                {Object.keys(data.filtros_activos).length} filtro(s) activo(s)
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── SIN DATOS ────────────────────────────────────────────────── */}
      {!data && !subiendo && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-title">Sin datos de facturación</div>
            <div className="empty-state-desc">
              Carga el archivo Excel exportado de SAP para ver el análisis estratégico.
            </div>
          </div>
        </div>
      )}

      {/* ── CARGANDO ─────────────────────────────────────────────────── */}
      {cargando && (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', color:'var(--text-muted)' }}>
            <div className="spinner" />
            <span>Calculando métricas...</span>
          </div>
        </div>
      )}

      {/* ── DASHBOARD ────────────────────────────────────────────────── */}
      {data && !cargando && (
        <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'12px' }}>
            <KpiCard
              label="Total facturado"
              valor={formatCOP(k.total_facturado)}
              sub="valor neto COP"
              color="#2563EB"
            />
            <KpiCard
              label="Total unidades"
              valor={formatNum(k.total_unidades)}
              sub="unidades vendidas"
              color="#16A34A"
            />
            <KpiCard
              label="Facturas emitidas"
              valor={formatNum(k.total_facturas)}
              sub="documentos únicos"
              color="#7C3AED"
            />
            <KpiCard
              label="Ticket promedio"
              valor={formatCOP(k.ticket_promedio)}
              sub="por factura"
              color="#EA580C"
            />
          </div>

          {/* Fila 1 — Canal + Tendencia */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:'16px' }}>

            <Panel titulo="Facturación por Canal (CDis)"
              badge={`${(m.por_canal||[]).length} canales`}>
              <Bar data={dataBarCanal} options={{
                ...OPTS,
                scales: {
                  y: { ticks: { callback: v => formatCOP(v), font:{ size:10 } } },
                  x: { ticks: { font:{ size:10 } } }
                },
                plugins: { ...OPTS.plugins, legend:{ display:false } }
              }} />
            </Panel>

            <Panel titulo="Tendencia Mensual de Facturación">
              <Line data={dataLinea} options={{
                ...OPTS,
                scales: {
                  y: { ticks: { callback: v => formatCOP(v), font:{ size:10 } } },
                  x: { ticks: { font:{ size:10 } } }
                },
                plugins: { ...OPTS.plugins, legend:{ display:false } }
              }} />
            </Panel>
          </div>

          {/* Fila 2 — Top clientes + Categorías */}
          <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:'16px' }}>

            <Panel titulo="Top 10 Clientes por Facturación">
              <Bar data={dataBarClientes} options={{
                ...OPTS,
                indexAxis: 'y',
                scales: {
                  x: { ticks: { callback: v => formatCOP(v), font:{ size:10 } } },
                  y: { ticks: { font:{ size:10 } } }
                },
                plugins: { ...OPTS.plugins, legend:{ display:false } }
              }} />
            </Panel>

            <Panel titulo="Facturación por Categoría">
              <Doughnut data={dataDonaCategoria} options={{
                ...OPTS,
                cutout: '60%',
                plugins: {
                  ...OPTS.plugins,
                  legend: { ...OPTS.plugins.legend, position:'bottom' }
                }
              }} />
            </Panel>
          </div>

          {/* Top 10 Productos */}
          <Panel titulo="Top 10 Productos"
            badge={`${(m.top_productos||[]).length} productos`}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', fontSize:'0.8rem' }}>
                <thead>
                  <tr style={{ background:'var(--bg-surface2)' }}>
                    {['#','Producto','Valor Neto','Unidades'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', textAlign: h==='#'||h==='Unidades'||h==='Valor Neto' ? 'right' : 'left',
                        fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(m.top_productos || []).map((p, i) => (
                    <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'var(--text-muted)', width:'40px' }}>
                        {i + 1}
                      </td>
                      <td style={{ padding:'7px 10px', maxWidth:'300px',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p['Número de material']}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'#2563EB' }}>
                        {formatCOP(p.valor)}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>
                        {formatNum(p.unidades)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Tabla detalle por canal */}
          <Panel titulo="Detalle por Canal"
            badge={`${(m.por_canal||[]).length} canales`}>
            <table style={{ width:'100%', fontSize:'0.8rem' }}>
              <thead>
                <tr style={{ background:'var(--bg-surface2)' }}>
                  {['Canal (CDis)','Valor Facturado','Unidades','Facturas','% del Total'].map(h => (
                    <th key={h} style={{ padding:'7px 10px',
                      textAlign: h==='Canal (CDis)' ? 'left' : 'right',
                      fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(m.por_canal || []).map((c, i) => {
                  const pct = k.total_facturado > 0
                    ? ((c.valor / k.total_facturado) * 100).toFixed(1)
                    : 0
                  return (
                    <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                      <td style={{ padding:'7px 10px', fontWeight:600 }}>
                        <span style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <span style={{ width:'8px', height:'8px', borderRadius:'50%',
                            background: C[i % C.length], flexShrink:0 }} />
                          CDis {c.CDis}
                        </span>
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#2563EB' }}>
                        {formatCOP(c.valor)}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>
                        {formatNum(c.unidades)}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>
                        {formatNum(c.facturas)}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right',
                        fontWeight:600, color: Number(pct) >= 20 ? '#16A34A' : 'var(--text-secondary)' }}>
                        {pct}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>

        </>
      )}
    </div>
  )
}

export default Facturacion
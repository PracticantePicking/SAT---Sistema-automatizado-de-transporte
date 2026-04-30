import { useState, useEffect, useMemo } from 'react'
import {
  Chart as ChartJS,
  ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler
} from 'chart.js'
import { Doughnut, Bar, Line } from 'react-chartjs-2'

import useStore     from '../store/index'
import { useToast } from '../components/Toast'
import { getDashboard, downloadDashboard, downloadTabla } from '../api/index'


ChartJS.register(
  ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler
)

// ── COLORES ───────────────────────────────────────────────────────────────
const C = {
  azul:     '#1B3A6B',
  azul2:    '#2563EB',
  verde:    '#16A34A',
  rojo:     '#DC2626',
  amarillo: '#CA8A04',
  naranja:  '#EA580C',
  morado:   '#7C3AED',
  gris:     '#6B7280',
  carriers: ['#2563EB', '#16A34A', '#EA580C', '#7C3AED', '#0891B2', '#DB2777'],
}

// ── COLORES RAMA ──────────────────────────────────────────────────────────
const RAMA_OPTS = [
  { value: '',         label: 'Todas las ramas'  },
  { value: 'disnal',   label: 'DISNAL'            },
  { value: 'cedi',     label: 'CEDI'              },
  { value: 'rionegro', label: 'Rionegro'          },
]

// ── HELPER: label selector ────────────────────────────────────────────────
function buildLabel(reg) {
  if (!reg) return '— Último procesamiento —'
  const d = new Date(reg.fecha.replace(' ','T'))
  const fecha = d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' })
  const hora  = d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' })
  const filas = Number(reg.total_filas).toLocaleString('es-CO')
  const carr  = Array.isArray(reg.carriers) ? reg.carriers.join(', ') : ''
  const rama  = reg.rama ? `${reg.rama} · ` : ''
  return `${rama}${fecha} ${hora} · ${filas} filas · ${carr}`
}

// ── KPI ───────────────────────────────────────────────────────────────────
function Kpi({ label, valor, sub, color }) {
  return (
    <div className="card" style={{ padding:'16px 18px' }}>
      <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--text-muted)',
        textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>
        {label}
      </div>
      <div style={{ fontSize:'1.6rem', fontWeight:700, color: color || 'var(--accent)', lineHeight:1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>{sub}</div>}
    </div>
  )
}

// ── CARD ──────────────────────────────────────────────────────────────────
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

// ── BOTON EXCEL ───────────────────────────────────────────────────────────
function BtnExcel({ onClick }) {
  return (
    <button className="btn btn-secondary btn-sm" onClick={onClick}>
      ⬇ Excel
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  PÁGINA: Indicadores
// ══════════════════════════════════════════════════════════════════════════
function Indicadores() {
  const toast = useToast()

  const historial        = useStore(s => s.historial)
  const filtros          = useStore(s => s.filtrosDashboard)
  const setFiltro        = useStore(s => s.setFiltro)
  const limpiarFiltros   = useStore(s => s.limpiarFiltros)
  const dashboardData    = useStore(s => s.dashboardData)
  const setDashboardData = useStore(s => s.setDashboardData)

  const [cargando,   setCargando]   = useState(false)
  // Filtros locales — se aplican al hacer clic en "Aplicar"
  const [filtrosLocales, setFiltrosLocales] = useState({
    transportador:    '',
    ciudad_destino:   '',
    mes:              '',
    estado:           '',
    numero_documento: '',
    destinatario:     '',
    rama:             '',
  })

  // ── Al cambiar historial_id o rama aplicar automáticamente ────────
  // Debe ejecutarse cuando carga la página Y cuando cambian filtros de fuente
  useEffect(() => {
    if (filtros.historial_id && historial.length > 0) {
      const existe = historial.find(h => h.id === filtros.historial_id)
      if (!existe) { setFiltro('historial_id', null); return }
    }
    cargarDashboard()
  }, [filtros.historial_id, filtros.rama, historial])

  async function cargarDashboard(filtrosExtra = {}) {
    setCargando(true)
    try {
      const params = {}
      if (filtros.historial_id)        params.historial_id     = filtros.historial_id
      if (filtros.rama)                params.rama             = filtros.rama
      // filtros del panel
      const fl = { ...filtrosLocales, ...filtrosExtra }
      if (fl.transportador)    params.transportador    = fl.transportador
      if (fl.ciudad_destino)   params.ciudad_destino   = fl.ciudad_destino
      if (fl.mes)              params.mes              = fl.mes
      if (fl.estado)           params.estado           = fl.estado
      if (fl.numero_documento) params.numero_documento = fl.numero_documento
      if (fl.destinatario)     params.destinatario     = fl.destinatario

      const data = await getDashboard(params)
      setDashboardData(data)
    } catch {
      toast.error('Error al cargar los indicadores.')
    } finally {
      setCargando(false)
    }
  }

  function aplicarFiltros() { cargarDashboard(filtrosLocales) }

  function handleLimpiar() {
    const vacios = { transportador:'', ciudad_destino:'', mes:'',
                     estado:'', numero_documento:'', destinatario:'', rama:'' }
    setFiltrosLocales(vacios)
    limpiarFiltros()
    cargarDashboard(vacios)
  }

  // ── Métricas ──────────────────────────────────────────────────────
  const m  = dashboardData?.metricas || {}
  const vf = dashboardData?.valores_filtro || {}

  // ── Datos gráficos ────────────────────────────────────────────────
  const dataDonaOT = useMemo(() => ({
    labels: ['A tiempo','Con retraso','Sin entregar'],
    datasets: [{
      data: [m.on_time?.si||0, m.on_time?.no||0, m.on_time?.no_entregado||0],
      backgroundColor: [C.verde, C.rojo, C.gris],
      borderWidth: 0,
    }]
  }), [m])

  const dataBarCarrier = useMemo(() => {
    const arr = m.por_transportadora || []
    return {
      labels: arr.map(c => c.name),
      datasets: [
        { label:'A tiempo', data: arr.map(c => c.si),    backgroundColor: C.verde,    borderRadius: 4 },
        { label:'Tarde',    data: arr.map(c => c.no),    backgroundColor: C.rojo,     borderRadius: 4 },
      ]
    }
  }, [m])

  const dataLineaMensual = useMemo(() => {
    const arr = [...(m.tendencia_mensual || [])].sort((a,b) => a.orden - b.orden)
    return {
      labels: arr.map(x => x.mes),
      datasets: [{
        label: '% ON TIME',
        data:  arr.map(x => x.pct),
        borderColor:     '#2563EB',
        backgroundColor: 'rgba(37,99,235,0.1)',
        pointBackgroundColor: '#2563EB',
        fill: true, tension: 0.4,
        pointRadius: 5, pointBackgroundColor: C.azul,
      }]
    }
  }, [m])

  const OPTS_BASE = {
    responsive: true, maintainAspectRatio: true,
    plugins: { legend: { labels: { font: { family:'Inter,sans-serif', size:11 }, color:'#4A5568' } } }
  }

  //  RENDER 
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* ── BARRA DE FUENTE Y FILTROS  */}
      <div className="card" style={{ padding:'14px 18px' }}>

        {/* Fila 1 — Fuente + Rama */}
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', marginBottom:'10px' }}>
          <span style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
            FUENTE
          </span>
          <select className="form-select" style={{ flex:1, minWidth:'260px', maxWidth:'480px' }}
            value={filtros.historial_id || ''}
            onChange={e => setFiltro('historial_id', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Último procesamiento —</option>
            {historial.map(r => (
              <option key={r.id} value={r.id}>{buildLabel(r)}</option>
            ))}
          </select>

          {/* Selector de Rama */}
          <select className="form-select" style={{ width:'150px' }}
            value={filtros.rama || ''}
            onChange={e => setFiltro('rama', e.target.value)}
          >
            {RAMA_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Fila 2 — Filtros dinámicos */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>

          <select className="form-select" style={{ width:'170px' }}
            value={filtrosLocales.transportador}
            onChange={e => setFiltrosLocales(p => ({ ...p, transportador: e.target.value }))}
          >
            <option value="">Todas las transportadoras</option>
            {(vf.transportadoras || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <input className="form-input" style={{ width:'160px' }}
            placeholder="Buscar ciudad..."
            value={filtrosLocales.ciudad_destino}
            onChange={e => setFiltrosLocales(p => ({ ...p, ciudad_destino: e.target.value }))}
          />

          <select className="form-select" style={{ width:'130px' }}
            value={filtrosLocales.mes}
            onChange={e => setFiltrosLocales(p => ({ ...p, mes: e.target.value }))}
          >
            <option value="">Todos los meses</option>
            {(vf.meses || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <input className="form-input" style={{ width:'160px' }}
            placeholder="Buscar documento..."
            value={filtrosLocales.numero_documento}
            onChange={e => setFiltrosLocales(p => ({ ...p, numero_documento: e.target.value }))}
          />

          <input className="form-input" style={{ width:'160px' }}
            placeholder="Buscar destinatario..."
            value={filtrosLocales.destinatario}
            onChange={e => setFiltrosLocales(p => ({ ...p, destinatario: e.target.value }))}
          />

          <select className="form-select" style={{ width:'140px' }}
            value={filtrosLocales.estado}
            onChange={e => setFiltrosLocales(p => ({ ...p, estado: e.target.value }))}
          >
            <option value="">Todos los estados</option>
            {(vf.estados || []).map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          <button className="btn btn-primary btn-sm" onClick={aplicarFiltros}>
            Aplicar
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleLimpiar}>
            ✕ Limpiar
          </button>
        </div>

        {/* Info totales */}
        {dashboardData && (
          <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px solid var(--border)',
            display:'flex', gap:'20px', fontSize:'0.72rem', color:'var(--text-muted)' }}>
            <span><strong style={{ color:'var(--text-secondary)' }}>Total: </strong>
              {Number(dashboardData.total_original||0).toLocaleString('es-CO')} registros
            </span>
            <span><strong style={{ color:'var(--text-secondary)' }}>Filtrados: </strong>
              {Number(dashboardData.total_filtrado||0).toLocaleString('es-CO')} registros
            </span>
            {filtros.rama && (
              <span className="badge badge-accent">{filtros.rama.toUpperCase()}</span>
            )}
          </div>
        )}
      </div>

      {/*  CARGANDO  */}
      {cargando && (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', color:'var(--text-muted)' }}>
            <div className="spinner" />
            <span>Cargando indicadores...</span>
          </div>
        </div>
      )}

      {/*   SIN DATOS  */}
      {!cargando && !dashboardData && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">Sin datos procesados</div>
            <div className="empty-state-desc">
              Procesa archivos en la pestaña Procesar para ver los indicadores.
            </div>
          </div>
        </div>
      )}

      {/*DASHBOARD  */}
      {!cargando && dashboardData && (() => {
        const ot = m.on_time || {}
        const total = ot.si + ot.no + (ot.no_entregado||0)

        return (
          <>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'12px' }}>
              <Kpi label="Total remesas"   valor={Number(total).toLocaleString('es-CO')}   sub="registros procesados" />
              <Kpi label="ON TIME global"  valor={`${ot.pct||0}%`}
                sub={`${Number(ot.si||0).toLocaleString('es-CO')} a tiempo`}
                color={Number(ot.pct||0) >= 80 ? C.verde : C.rojo} />
              <Kpi label="Entregas a tiempo" valor={Number(ot.si||0).toLocaleString('es-CO')}
                sub="remesas ON TIME" color={C.verde} />
              <Kpi label="Con retraso"     valor={Number(ot.no||0).toLocaleString('es-CO')}
                sub="fuera de fecha" color={C.rojo} />
              <Kpi label="Sin entregar"    valor={Number(ot.no_entregado||0).toLocaleString('es-CO')}
                sub="sin fecha entrega" color={C.amarillo} />
            </div>

            {/* Fila 1 — Estados + Participación ciudades */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

              {/* Estados de remesas */}
              <Panel titulo="Estados de remesas despachadas"
                badge={`${Number(total).toLocaleString('es-CO')} total`}
                accion={<BtnExcel onClick={() => downloadTabla(
                  'estados_remesas',
                  m.estados || [],
                  ['estado', 'cantidad']
                )} />}
              >
                 {/* Tabla con scroll — igual que participación por ciudad */}
                <div style={{ maxHeight:'280px', overflowY:'auto' }}>
                  <table style={{ width:'100%', fontSize:'0.8rem' }}>
                    <thead>
                      <tr style={{ background:'var(--bg-surface2)', position:'sticky', top:0, zIndex:1 }}>
                        <th style={{ padding:'7px 10px', textAlign:'left', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>ESTADO</th>
                        <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>RECUENTO</th>
                        <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(m.estados || []).map((e, i) => (
                        <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'7px 10px' }}>{e.estado}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>
                            {Number(e.cantidad).toLocaleString('es-CO')}
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:'var(--text-muted)' }}>
                            {total > 0 ? `${((e.cantidad / total) * 100).toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Total fijo al final del scroll */}
                    <tfoot>
                      <tr style={{ borderTop:'2px solid var(--border)', fontWeight:700, background:'var(--bg-surface2)', position:'sticky', bottom:0 }}>
                        <td style={{ padding:'7px 10px' }}>Total</td>
                        <td style={{ padding:'7px 10px', textAlign:'right' }}>
                          {Number(total).toLocaleString('es-CO')}
                        </td>
                        <td style={{ padding:'7px 10px', textAlign:'right' }}>100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>

              {/* Participación por ciudad */}
              <Panel titulo="Participación por ciudad"
                badge={`${(m.participacion_ciudades||[]).length} ciudades`}
                accion={
                <BtnExcel onClick={() => downloadTabla(
                  'participacion_ciudades',
                  (m.participacion_ciudades || []).map(c => ({
                    ciudad:   c.ciudad,
                    cantidad: c.cantidad,
                    pct:      total > 0 ? `${((c.cantidad / total) * 100).toFixed(1)}%` : '0%'
                  })),
                  ['ciudad', 'cantidad', 'pct']
                )} />}
              >
                <div style={{ maxHeight:'280px', overflowY:'auto' }}>
                  <table style={{ width:'100%', fontSize:'0.8rem' }}>
                    <thead>
                      <tr style={{ background:'var(--bg-surface2)' }}>
                        <th style={{ padding:'7px 10px', textAlign:'left', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>CIUDAD</th>
                        <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>REMESAS</th>
                        <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(m.participacion_ciudades || []).map((c, i) => (
                        <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'7px 10px' }}>{c.ciudad}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>
                            {Number(c.cantidad).toLocaleString('es-CO')}
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:'var(--text-muted)' }}>
                            {total > 0 ? `${((c.cantidad / total) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            {/* Fila 2 — Gráficos ON TIME */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr', gap:'16px' }}>

              {/* Dona ON TIME */}
              <Panel titulo="ON TIME Global">
                <div style={{ maxWidth:'220px', margin:'0 auto' }}>
                  <Doughnut data={dataDonaOT} options={{
                    ...OPTS_BASE, cutout:'65%',
                    plugins: { ...OPTS_BASE.plugins, legend: { ...OPTS_BASE.plugins.legend, position:'bottom' } }
                  }} />
                </div>
                <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'4px' }}>
                  {[
                    { label:'A tiempo',     val: ot.si||0,             color: C.verde   },
                    { label:'Con retraso',  val: ot.no||0,             color: C.rojo    },
                    { label:'Sin entregar', val: ot.no_entregado||0,   color: C.gris    },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:color, flexShrink:0 }} />
                        {label}
                      </span>
                      <strong>{Number(val).toLocaleString('es-CO')}</strong>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Barras — comparativa por transportadora */}
              <Panel titulo="Comparativa ON TIME por Transportadora">
                <Bar data={dataBarCarrier} options={{
                  ...OPTS_BASE,
                  scales: {
                    x: { stacked: false, ticks: { font:{ size:11 } } },
                    y: { beginAtZero:true, ticks: { font:{ size:10 } } }
                  }
                }} />
              </Panel>

              {/* Línea — tendencia mensual */}
              <Panel titulo="Tendencia Mensual — % ON TIME">
                <Line data={dataLineaMensual} options={{
                  ...OPTS_BASE,
                  scales: {
                    y: { beginAtZero:true, max:100, ticks: { callback: v=>`${v}%`, font:{ size:10 } } },
                    x: { ticks: { font:{ size:10 } } }
                  },
                  plugins: { ...OPTS_BASE.plugins, legend: { display:false } }
                }} />
              </Panel>
            </div>

            {/* ON TIME por ciudad */}
            <Panel titulo="ON TIME por Ciudad"
              badge={`${(m.ontime_por_ciudad||[]).length} ciudades`}
              accion={
              <BtnExcel onClick={() => downloadDashboard(
                'ontime_por_ciudad',  
                (m.ontime_por_ciudad || []).map(c => ({
                  ciudad:    c.ciudad,
                  total:     c.total,
                  a_tiempo:  c.si,
                  tarde:     c.no,
                  pct_ot:    `${c.pct}%`
                })),
                ['ciudad', 'total', 'a_tiempo', 'tarde', 'pct_ot']
                )} />}
            >
              <div style={{ maxHeight:'320px', overflowY:'auto' }}>
                <table style={{ width:'100%', fontSize:'0.8rem' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-surface2)', position:'sticky', top:0 }}>
                      {['CIUDAD','TOTAL','A TIEMPO','TARDE','% OT'].map(h => (
                        <th key={h} style={{ padding:'7px 10px', textAlign: h==='CIUDAD'?'left':'right',
                          fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(m.ontime_por_ciudad || []).map((c, i) => {
                      const pct = c.pct || 0
                      return (
                        <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'7px 10px', fontWeight:500 }}>{c.ciudad}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right' }}>
                            {Number(c.total).toLocaleString('es-CO')}
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:C.verde, fontWeight:600 }}>
                            {Number(c.si||0).toLocaleString('es-CO')}
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'right', color:C.rojo }}>
                            {Number(c.no||0).toLocaleString('es-CO')}
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700,
                            color: pct >= 80 ? C.verde : pct >= 60 ? C.amarillo : C.rojo }}>
                            {c.pct}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Devoluciones */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

              <Panel titulo="Devoluciones por Transportadora"
                badge={`${Number(m.devoluciones?.total||0).toLocaleString('es-CO')} registros`}
                //</div>accion={<BtnExcel onClick={() => downloadDashboard(
                  //'devoluciones_transportadora',                       Linea de codigo de boton descargar.
                  //m.devoluciones?.por_transportadora || [],
                  //['name', 'cantidad']
                  //)} />}
              >
                {(m.devoluciones?.por_transportadora || []).length === 0 ? (
                  <div className="empty-state" style={{ padding:'20px' }}>
                    <div style={{ fontSize:'1.5rem' }}></div>
                    <div style={{ fontSize:'0.8rem' }}>Sin devoluciones</div>
                  </div>
                ) : (
                  <table style={{ width:'100%', fontSize:'0.8rem' }}>
                    <thead>
                      <tr style={{ background:'var(--bg-surface2)' }}>
                        <th style={{ padding:'7px 10px', textAlign:'left', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>TRANSPORTADORA</th>
                        <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>CANTIDAD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(m.devoluciones?.por_transportadora || []).map((d, i) => (
                        <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ padding:'7px 10px' }}>{d.name}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:C.rojo }}>
                            {Number(d.cantidad).toLocaleString('es-CO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel titulo="Top ciudades con devoluciones">
                <table style={{ width:'100%', fontSize:'0.8rem' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-surface2)' }}>
                      <th style={{ padding:'7px 10px', textAlign:'left', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>CIUDAD</th>
                      <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'var(--text-secondary)', fontSize:'0.72rem' }}>CANTIDAD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.devoluciones?.por_ciudad || []).map((d, i) => (
                      <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                        <td style={{ padding:'7px 10px' }}>{d.ciudad}</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:C.rojo }}>
                          {Number(d.cantidad).toLocaleString('es-CO')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            {/* Base de datos */}
            <Panel titulo="Base de Datos"
              badge={`${Number(dashboardData.total_filtrado||0).toLocaleString('es-CO')} registros`}
              accion={
                <button className="btn btn-primary btn-sm"
                    onClick={() => {
                      const params = {}
                      if (filtros.historial_id)        params.historial_id     = filtros.historial_id
                      if (filtrosLocales.transportador) params.transportador   = filtrosLocales.transportador
                      if (filtrosLocales.mes)           params.mes             = filtrosLocales.mes
                      if (filtrosLocales.estado)        params.estado          = filtrosLocales.estado
                      downloadDashboard(params)
                    }}>


                  ⬇ Descargar filtrado
                </button>
              }
            >
              <div style={{ overflowX:'auto', maxHeight:'360px', overflowY:'auto' }}>
                <table style={{ width:'100%', fontSize:'0.75rem', whiteSpace:'nowrap' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-surface2)', position:'sticky', top:0 }}>
                      {(dashboardData.columns || []).map(col => (
                        <th key={col} style={{ padding:'6px 10px', textAlign:'left',
                          fontWeight:600, color:'var(--text-secondary)', fontSize:'0.7rem',
                          borderBottom:'1px solid var(--border)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboardData.preview || []).map((row, i) => (
                      <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                        {(dashboardData.columns || []).map(col => (
                          <td key={col} style={{ padding:'6px 10px', color:'var(--text-secondary)' }}>
                            {row[col] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                            {/* Footer con conteo por transportadora */}
              <div style={{
                marginTop:    '12px',
                paddingTop:   '12px',
                borderTop:    '1px solid var(--border)',
                display:      'flex',
                gap:          '20px',
                flexWrap:     'wrap',
              }}>
                {Object.entries(m.filas_por_transportadora || {}).map(([nombre, cantidad]) => (
                  <div key={nombre} style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        '8px',
                    fontSize:   '0.8rem',
                  }}>
                    <span style={{
                      width:        '8px',
                      height:       '8px',
                      borderRadius: '50%',
                      background:   C.carriers[Object.keys(m.filas_por_transportadora).indexOf(nombre) % C.carriers.length],
                      flexShrink:   0,
                    }} />
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{nombre}:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {Number(cantidad).toLocaleString('es-CO')}
                    </span>
                  </div>
                ))}
              </div>

            </Panel>

          </>
        )
      })()}

    </div>
  )
}

export default Indicadores
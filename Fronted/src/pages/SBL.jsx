import { useState, useRef, useMemo } from 'react'
import {
  Chart as ChartJS, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useToast } from '../components/Toast'

ChartJS.register(BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend)

const BASE_URL = 'http://localhost:5000'

const MESES = {
  1:'Enero', 2:'Febrero', 3:'Marzo', 4:'Abril',
  5:'Mayo', 6:'Junio', 7:'Julio', 8:'Agosto',
  9:'Septiembre', 10:'Octubre', 11:'Noviembre', 12:'Diciembre'
}

const fmtNum = v => Number(v || 0).toLocaleString('es-CO')
const fmtPct = v => `${Number(v || 0).toFixed(1)}%`
const fmtDec = v => Number(v || 0).toFixed(1)

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ label, valor, sub, color = 'var(--accent)', icono }) {
  return (
    <div className="card" style={{ padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--text-muted)',
            textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'8px' }}>
            {label}
          </div>
          <div style={{ fontSize:'1.8rem', fontWeight:700, color, lineHeight:1 }}>
            {valor}
          </div>
          {sub && (
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'6px' }}>
              {sub}
            </div>
          )}
        </div>
        {icono && (
          <div style={{ fontSize:'1.6rem', opacity:0.15 }}>{icono}</div>
        )}
      </div>
    </div>
  )
}

// ── Panel contenedor ──────────────────────────────────────────────────────
function Panel({ titulo, badge, subtitulo, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <span className="card-title" style={{ fontSize:'0.9rem' }}>{titulo}</span>
            {badge && (
              <span className="badge badge-accent" style={{ fontSize:'0.7rem' }}>
                {badge}
              </span>
            )}
          </div>
          {subtitulo && (
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'2px' }}>
              {subtitulo}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding:'16px' }}>{children}</div>
    </div>
  )
}

// ── Gráfico barras con línea de meta ──────────────────────────────────────
function GraficoMeta({ labels, valores, meta, colorOk, colorFail, labelSerie }) {
  const chartData = useMemo(() => ({
    labels,
    datasets: [
      {
        type:            'bar',
        label:           labelSerie,
        data:            valores,
        backgroundColor: valores.map(v => v >= meta ? colorOk + 'CC' : colorFail + 'CC'),
        borderColor:     valores.map(v => v >= meta ? colorOk : colorFail),
        borderWidth:     1,
        borderRadius:    4,
        order:           2,
      },
      {
        type:        'line',
        label:       `Meta (${fmtDec(meta)})`,
        data:        labels.map(() => meta),
        borderColor: '#DC2626',
        borderWidth: 2,
        borderDash:  [6, 4],
        pointRadius: 0,
        fill:        false,
        order:       1,
      }
    ]
  }), [labels, valores, meta])

  return (
    <Bar data={chartData} options={{
      responsive:          true,
      maintainAspectRatio: true,
      aspectRatio:         2.2,
      plugins: {
        legend: {
          position: 'top',
          labels: { font:{ family:'Inter,sans-serif', size:11 }, color:'#4A5568',
            padding:12, boxWidth:12 }
        },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const item = items[0]
              if (item?.datasetIndex === 0) {
                const pct = meta > 0
                  ? Math.min((item.raw / meta * 100), 100).toFixed(1) : 0
                return [`${item.raw >= meta ? '✅ Cumple' : '❌ Bajo meta'} — ${pct}% de la meta`]
              }
              return []
            }
          }
        }
      },
      scales: {
        y: { beginAtZero:true,
          grid:  { color:'rgba(0,0,0,0.05)' },
          ticks: { callback: v => fmtDec(v), font:{ size:10 }, color:'#718096' } },
        x: { grid: { display:false },
          ticks: { font:{ size:10 }, color:'#718096',
            maxRotation:35, minRotation:35 } }
      }
    }} />
  )
}

// ── Gráfico línea tendencia mensual ───────────────────────────────────────
function GraficoTendencia({ data: chartData }) {
  return (
    <Line data={chartData} options={{
      responsive:          true,
      maintainAspectRatio: true,
      aspectRatio:         2.8,
      plugins: {
        legend: {
          position: 'top',
          labels: { font:{ family:'Inter,sans-serif', size:11 }, color:'#4A5568',
            padding:12, boxWidth:12 }
        }
      },
      scales: {
        y: { beginAtZero:false,
          grid:  { color:'rgba(0,0,0,0.05)' },
          ticks: { callback: v => fmtDec(v), font:{ size:10 }, color:'#718096' } },
        x: { grid: { display:false },
          ticks: { font:{ size:10 }, color:'#718096' } }
      }
    }} />
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  PÁGINA: SBL
// ══════════════════════════════════════════════════════════════════════════
function SBL() {
  const toast    = useToast()
  const inputRef = useRef(null)

  const [data,     setData]     = useState(null)
  const [estado,   setEstado]   = useState(null)
  const [cargando, setCargando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [filtros,  setFiltros]  = useState({ operario:'', mes:0, año:0, dia:0 })

  // ── Subir archivo ─────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.warning('Solo se aceptan archivos .xlsx o .xls'); return
    }
    setSubiendo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`${BASE_URL}/api/sbl/upload`, { method:'POST', body:form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Error al subir')
      setEstado({ filename:json.filename, cargado:json.cargado, filas:json.filas })
      setData(json)
      toast.success(`Archivo cargado — ${fmtNum(json.filas)} registros`)
    } catch (e) {
      toast.error(e.message || 'Error al procesar')
    } finally { setSubiendo(false) }
  }

  // ── Aplicar filtros ───────────────────────────────────────────────────
  async function aplicarFiltros(override = null) {
    const f = override || filtros
    if (!estado) return
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (f.operario)  params.append('operario', f.operario)
      if (f.mes > 0)   params.append('mes',      String(f.mes))
      if (f.año > 0)   params.append('año',      String(f.año))
      if (f.dia > 0)   params.append('dia',      String(f.dia))
      const res  = await fetch(`${BASE_URL}/api/sbl/metricas?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail)
      setData(json)
    } catch (e) {
      toast.error('Error al filtrar: ' + e.message)
    } finally { setCargando(false) }
  }

  function limpiarFiltros() {
    const vacios = { operario:'', mes:0, año:0, dia:0 }
    setFiltros(vacios)
    aplicarFiltros(vacios)
  }

  // ── Datos ─────────────────────────────────────────────────────────────
  const m  = data?.metricas       || {}
  const k  = m.kpis               || {}
  const vf = data?.valores_filtro || {}

  // Datos gráfico UPH por operario
  const operarios = (m.por_operario || []).map(o => o.Operario)
  const uphs      = (m.por_operario || []).map(o => o.uph)
  const lphs      = (m.por_operario || []).map(o => o.lph)

  // Datos gráfico tendencia mensual
  const dataTendencia = useMemo(() => {
    const arr = m.tendencia_mensual || []
    return {
      labels: arr.map(x => `${MESES[x._mes]} ${x._año}`),
      datasets: [
        {
          label:           'UPH promedio',
          data:            arr.map(x => x.uph),
          borderColor:     '#2563EB',
          backgroundColor: 'rgba(37,99,235,0.08)',
          fill:            true,
          tension:         0.3,
          pointRadius:     5,
          pointBackgroundColor: '#2563EB',
        },
        {
          label:       'Meta (500)',
          data:        arr.map(() => 500),
          borderColor: '#DC2626',
          borderWidth: 2,
          borderDash:  [6, 4],
          pointRadius: 0,
          fill:        false,
        }
      ]
    }
  }, [m])

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* ── ZONA DE CARGA ────────────────────────────────────────────── */}
      <div className="card" style={{ padding:'16px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls"
            style={{ display:'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          <button className="btn btn-primary" style={{ whiteSpace:'nowrap' }}
            onClick={() => inputRef.current?.click()} disabled={subiendo}>
            {subiendo
              ? <><div className="spinner" style={{ width:'14px', height:'14px' }} /> Procesando...</>
              : '📂 Cargar archivo SBL'}
          </button>
          <div style={{ flex:1, minWidth:'220px', padding:'10px 14px',
            border:'1px dashed var(--border)', borderRadius:'var(--radius-md)',
            fontSize:'0.78rem', color:'var(--text-muted)', cursor:'pointer', textAlign:'center' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}>
            {estado
              ? `📄 ${estado.filename} — ${fmtNum(estado.filas)} registros — ${estado.cargado}`
              : 'Arrastra el Excel de SBL aquí o haz clic en el botón'}
          </div>
        </div>
      </div>

      {/* ── FILTROS ──────────────────────────────────────────────────── */}
      {data && (
        <div className="card" style={{ padding:'12px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>

            <select className="form-select" style={{ width:'180px' }}
              value={filtros.operario}
              onChange={e => {
                const n = { ...filtros, operario: e.target.value }
                setFiltros(n); aplicarFiltros(n)
              }}>
              <option value="">Todos los operarios</option>
              {(vf.operarios || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            <select className="form-select" style={{ width:'150px' }}
              value={filtros.mes}
              onChange={e => {
                const n = { ...filtros, mes: Number(e.target.value) }
                setFiltros(n); aplicarFiltros(n)
              }}>
              <option value={0}>Todos los meses</option>
              {(vf.meses || []).map(m => (
                <option key={m} value={m}>{MESES[m]}</option>
              ))}
            </select>

            <select className="form-select" style={{ width:'100px' }}
              value={filtros.año}
              onChange={e => {
                const n = { ...filtros, año: Number(e.target.value) }
                setFiltros(n); aplicarFiltros(n)
              }}>
              <option value={0}>Todos los años</option>
              {(vf.años || []).map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select className="form-select" style={{ width:'130px' }}
              value={filtros.dia}
              onChange={e => {
                const n = { ...filtros, dia: Number(e.target.value) }
                setFiltros(n); aplicarFiltros(n)
              }}>
              <option value={0}>Todos los días</option>
              {(vf.dias || []).map(d => (
                <option key={d} value={d}>Día {d}</option>
              ))}
            </select>

            <button className="btn btn-secondary btn-sm" onClick={limpiarFiltros}>
              ✕ Limpiar
            </button>

            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginLeft:'4px' }}>
              {fmtNum(data.total_filas)} registros
              {filtros.operario && ` · ${filtros.operario}`}
              {filtros.mes > 0  && ` · ${MESES[filtros.mes]}`}
              {filtros.año > 0  && ` · ${filtros.año}`}
              {filtros.dia > 0  && ` · Día ${filtros.dia}`}
            </span>
          </div>
        </div>
      )}

      {/* ── SIN DATOS ────────────────────────────────────────────────── */}
      {!data && !subiendo && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🏭</div>
            <div className="empty-state-title">Sin datos de SBL</div>
            <div className="empty-state-desc">
              Carga el archivo Excel del sistema SBL para ver los KPIs de productividad por operario.
            </div>
          </div>
        </div>
      )}

      {/* ── SPINNER ──────────────────────────────────────────────────── */}
      {cargando && (
        <div style={{ display:'flex', justifyContent:'center', padding:'30px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', color:'var(--text-muted)' }}>
            <div className="spinner" /><span>Calculando métricas...</span>
          </div>
        </div>
      )}

      {/* ── DASHBOARD ────────────────────────────────────────────────── */}
      {data && !cargando && (() => {
        const hayBajaMeta = (m.bajo_meta || []).length > 0
        return (
          <>
            {/* Alerta operarios bajo meta */}
            {hayBajaMeta && (
              <div style={{ padding:'14px 18px', background:'#FFF5F5',
                borderRadius:'var(--radius-lg)', border:'1px solid #FED7D7',
                display:'flex', alignItems:'flex-start', gap:'12px' }}>
                <span style={{ fontSize:'1.3rem', flexShrink:0 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, color:'#DC2626', fontSize:'0.875rem', marginBottom:'8px' }}>
                    {m.bajo_meta.length} operario{m.bajo_meta.length > 1 ? 's' : ''} por
                    debajo de la meta de {fmtNum(k.meta_uph)} unidades/hora
                  </div>
                  <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    {m.bajo_meta.map((o, i) => (
                      <span key={i} style={{ padding:'4px 12px', background:'#FED7D7',
                        borderRadius:'20px', fontSize:'0.78rem', color:'#DC2626', fontWeight:600 }}>
                        {o.Operario} · {fmtDec(o.uph)} UPH · {fmtPct(o.pct_meta)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div style={{ display:'grid',
              gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:'12px' }}>
              <KpiCard
                icono="📦"
                label="Total unidades"
                valor={fmtNum(k.total_unidades)}
                sub="unidades confirmadas"
                color="#2563EB"
              />
              <KpiCard
                icono="📋"
                label="Total líneas"
                valor={fmtNum(k.total_lineas)}
                sub="líneas procesadas"
                color="#16A34A"
              />
              <KpiCard
                icono="⚡"
                label="UPH promedio"
                valor={fmtDec(k.avg_uph)}
                sub={`Meta: ${fmtNum(k.meta_uph)} unidades/hora`}
                color={k.avg_uph >= k.meta_uph ? '#16A34A' :
                       k.avg_uph >= k.meta_uph * 0.8 ? '#CA8A04' : '#DC2626'}
              />
              <KpiCard
                icono="🎯"
                label="% Cumplimiento"
                valor={fmtPct(k.pct_cumplimiento)}
                sub={`${fmtNum(k.cumpliendo)} de ${fmtNum(k.total_registros)} registros`}
                color={k.pct_cumplimiento >= 80 ? '#16A34A' :
                       k.pct_cumplimiento >= 60 ? '#CA8A04' : '#DC2626'}
              />
              <KpiCard
                icono="👥"
                label="Operarios activos"
                valor={fmtNum(k.operarios_unicos)}
                sub="personas en el período"
                color="#7C3AED"
              />
            </div>

            {/* Panel 1 y 2 — UPH y LPH por operario */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
              <Panel
                titulo="UPH por Operario"
                badge={`Meta: ${fmtNum(k.meta_uph)} u/hora`}
                subtitulo="Unidades por hora promedio · Verde = cumple · Rojo = bajo meta">
                <GraficoMeta
                  labels={operarios}
                  valores={uphs}
                  meta={k.meta_uph || 500}
                  colorOk="#16A34A"
                  colorFail="#DC2626"
                  labelSerie="UPH"
                />
              </Panel>

              <Panel
                titulo="LPH por Operario"
                badge="Líneas / hora"
                subtitulo="Líneas por hora promedio del período">
                <GraficoMeta
                  labels={operarios}
                  valores={lphs}
                  meta={0}
                  colorOk="#2563EB"
                  colorFail="#2563EB"
                  labelSerie="LPH"
                />
              </Panel>
            </div>

            {/* Panel 3 — Tendencia mensual */}
            <Panel
              titulo="Tendencia Mensual — UPH Promedio"
              subtitulo="Evolución del promedio de unidades/hora mes a mes vs meta de 500">
              <GraficoTendencia data={dataTendencia} />
            </Panel>

            {/* Panel 4 — Detalle por operario */}
            <Panel
              titulo="Detalle por Operario"
              badge={`${(m.detalle||[]).length} registros`}
              subtitulo="Promedio UPH vs meta 500 · % máximo = 100%">
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:'0.82rem', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-surface2)' }}>
                      {[
                        { label:'Operario',      align:'left'   },
                        { label:'Mes',           align:'left'   },
                        { label:'Días',          align:'right'  },
                        { label:'Unidades',      align:'right'  },
                        { label:'Líneas',        align:'right'  },
                        { label:'UPH prom',      align:'right'  },
                        { label:'LPH prom',      align:'right'  },
                        { label:'% Meta UPH',    align:'right'  },
                        { label:'% Cumpliendo',  align:'right'  },
                        { label:'Desempeño',     align:'center' },
                      ].map(h => (
                        <th key={h.label} style={{
                          padding:'9px 12px', textAlign:h.align,
                          fontWeight:600, color:'var(--text-secondary)',
                          fontSize:'0.72rem', whiteSpace:'nowrap',
                          borderBottom:'2px solid var(--border)',
                        }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(m.detalle || []).map((d, i) => {
                      const colorM = d.pct_meta >= 100 ? '#16A34A' :
                                     d.pct_meta >= 80  ? '#CA8A04' : '#DC2626'
                      const colorC = d.pct_cumplimiento >= 80 ? '#16A34A' :
                                     d.pct_cumplimiento >= 60 ? '#CA8A04' : '#DC2626'
                      return (
                        <tr key={i} style={{
                          background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface2)'
                        }}>
                          <td style={{ padding:'9px 12px', fontWeight:600,
                            borderBottom:'1px solid var(--border)' }}>
                            {d.Operario}
                          </td>
                          <td style={{ padding:'9px 12px',
                            borderBottom:'1px solid var(--border)' }}>
                            {MESES[d._mes]}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            color:'var(--text-muted)',
                            borderBottom:'1px solid var(--border)' }}>
                            {d.dias}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            fontWeight:600, borderBottom:'1px solid var(--border)' }}>
                            {fmtNum(d.unidades)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            borderBottom:'1px solid var(--border)' }}>
                            {fmtNum(d.lineas)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            fontWeight:600, borderBottom:'1px solid var(--border)' }}>
                            {fmtDec(d.uph)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            color:'var(--text-muted)',
                            borderBottom:'1px solid var(--border)' }}>
                            {fmtDec(d.lph)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            borderBottom:'1px solid var(--border)' }}>
                            <span style={{ padding:'2px 8px', borderRadius:'12px',
                              fontSize:'0.75rem', fontWeight:700,
                              color:colorM, background:colorM + '18' }}>
                              {fmtPct(d.pct_meta)}
                            </span>
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            borderBottom:'1px solid var(--border)' }}>
                            <span style={{ padding:'2px 8px', borderRadius:'12px',
                              fontSize:'0.75rem', fontWeight:700,
                              color:colorC, background:colorC + '18' }}>
                              {fmtPct(d.pct_cumplimiento)}
                            </span>
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'center',
                            borderBottom:'1px solid var(--border)' }}>
                            <span style={{
                              padding:'3px 10px', borderRadius:'12px',
                              fontSize:'0.75rem', fontWeight:600,
                              background: d.cumple ? '#F0FFF4' : '#FFF5F5',
                              color:      d.cumple ? '#16A34A' : '#DC2626',
                            }}>
                              {d.cumple ? '✅ Cumple' : '❌ No cumple'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )
      })()}
    </div>
  )
}

export default SBL
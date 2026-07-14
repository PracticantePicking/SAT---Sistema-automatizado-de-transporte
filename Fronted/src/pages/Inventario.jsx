import { useState, useEffect, useCallback, useRef } from 'react'
import ReactECharts from 'echarts-for-react'


const BASE_URL     = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const META_DEFAULT = 99   // ⬅️ era 98 — la meta real llega desde la API (kpis.meta)


const MESES = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};


const C = {
  fondo:    '#F8FAFC',
  card:     '#FFFFFF',
  borde:    '#E2E8F0',
  texto:    '#1A202C',
  textoMut: '#718096',
  azul:     '#2563EB',
  verde:    '#16A34A',
  amarillo: '#CA8A04',
  rojo:     '#DC2626',
  morado:   '#7C3AED',
}


const fmtPct  = v => `${Number(v || 0).toFixed(2)}%`
const fmtMon  = v => Number(v || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
const fmtNum  = v => Number(v || 0).toLocaleString('es-CO')


function colorInd(v, meta = META_DEFAULT) {
  return v >= meta ? C.verde : v >= meta * 0.95 ? C.amarillo : C.rojo
}


//  KPI Card
function KpiCard({ label, valor, sub, color, cumple, desc }) {
  return (
    <div title={desc} style={{
      background: C.card, borderRadius: '12px', padding: '20px',
      border: `1px solid ${C.borde}`, flex: 1, minWidth: '220px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.textoMut, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1 }}>
        {valor}
      </div>
      {desc && <div style={{ fontSize: '0.7rem', color: C.textoMut, marginTop: '8px', lineHeight: 1.4 }}>{desc}</div>}
      {sub && <div style={{ fontSize: '0.72rem', color: C.textoMut, marginTop: '6px' }}>{sub}</div>}
      {cumple !== undefined && (
        <div style={{
          marginTop: '8px', fontSize: '0.7rem', fontWeight: 600,
          color: cumple ? C.verde : C.rojo,
          background: cumple ? '#F0FFF4' : '#FFF5F5',
          padding: '2px 8px', borderRadius: '12px', display: 'inline-block',
        }}>
          {cumple ? '✅ Cumple meta' : '❌ Bajo meta'}
        </div>
      )}
    </div>
  )
}


// ── Panel log de ejecución ────────────────────────────────────────────────
function PanelEjecucion() {
  const [estado,   setEstado]   = useState(null)
  const [polling,  setPolling]  = useState(false)
  const logRef = useRef(null)


  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`${BASE_URL}/api/inventario/ejecutar/estado`)
        const json = await res.json()
        setEstado(json)
        if (!json.corriendo) setPolling(false)
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [polling])


  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [estado?.log])


  async function ejecutar() {
    try {
      const res  = await fetch(`${BASE_URL}/api/inventario/ejecutar`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { alert(json.detail); return }
      setEstado({ corriendo: true, log: ['🚀 Iniciando...'], resultado: null })
      setPolling(true)
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }


  const corriendo = estado?.corriendo
  const resultado = estado?.resultado


  return (
    <div style={{ background: C.card, borderRadius: '12px', border: `1px solid ${C.borde}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borde}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #EEF2FF, #F8FAFC)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: C.texto }}> Actualización de Inventario</div>
          <div style={{ fontSize: '0.75rem', color: C.textoMut, marginTop: '2px' }}>Ejecuta el script SAP ZWM53 + MM60</div>
        </div>
        <button
          onClick={ejecutar}
          disabled={corriendo}
          style={{
            background: corriendo ? C.textoMut : C.azul,
            color: '#fff', border: 'none', borderRadius: '8px',
            padding: '8px 18px', fontSize: '0.82rem', fontWeight: 600,
            cursor: corriendo ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
          {corriendo
            ? <><div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Ejecutando...</>
            : '▶ Ejecutar ahora'}
        </button>
      </div>


      {estado && (
        <div style={{ padding: '16px 20px' }}>
          {resultado && (
            <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, background: resultado === 'ok' ? '#F0FFF4' : '#FFF5F5', color: resultado === 'ok' ? C.verde : C.rojo }}>
              {resultado === 'ok' ? '✅ Proceso completado exitosamente' : '❌ El proceso terminó con errores'}
            </div>
          )}
          <div ref={logRef} style={{ background: '#0F172A', borderRadius: '8px', padding: '12px', maxHeight: '220px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.6 }}>
            {(estado.log || []).map((l, i) => (
              <div key={i} style={{ color: l.includes('ERROR') || l.includes('❌') ? '#F87171' : l.includes('✅') || l.includes('OK') ? '#4ADE80' : '#94A3B8' }}>
                {l}
              </div>
            ))}
            {corriendo && <div style={{ color: C.azul }}>▋</div>}
          </div>
        </div>
      )}
    </div>
  )
}


// ── Panel calidad de datos ─────────────────────────────────────────────────
function PanelValidacion() {
  const [reporte,   setReporte]   = useState(null)
  const [cargando,  setCargando]  = useState(false)
  const [verDetalle, setVerDetalle] = useState(false)

  async function validar() {
    setCargando(true)
    try {
      const res  = await fetch(`${BASE_URL}/api/inventario/validacion`)
      const json = await res.json()
      setReporte(json)
      setVerDetalle(false)
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setCargando(false)
    }
  }

  const sinProblemas = reporte && reporte.total_con_problemas === 0 && (reporte.duplicados_logicos || []).length === 0

  return (
    <div style={{ background: C.card, borderRadius: '12px', border: `1px solid ${C.borde}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borde}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #EEF2FF, #F8FAFC)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: C.texto }}>🔍 Calidad de Datos</div>
          <div style={{ fontSize: '0.75rem', color: C.textoMut, marginTop: '2px' }}>Revisa inconsistencias en los registros ya cargados</div>
        </div>
        <button
          onClick={validar}
          disabled={cargando}
          style={{
            background: cargando ? C.textoMut : C.azul,
            color: '#fff', border: 'none', borderRadius: '8px',
            padding: '8px 18px', fontSize: '0.82rem', fontWeight: 600,
            cursor: cargando ? 'not-allowed' : 'pointer',
          }}>
          {cargando ? 'Analizando...' : '▶ Analizar'}
        </button>
      </div>

      {reporte && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <div><strong>{fmtNum(reporte.total_registros)}</strong> registros totales</div>
            <div style={{ color: reporte.total_con_problemas > 0 ? C.rojo : C.verde }}>
              <strong>{fmtNum(reporte.total_con_problemas)}</strong> con problemas
            </div>
            {(reporte.duplicados_logicos || []).length > 0 && (
              <div style={{ color: C.rojo }}>
                <strong>{reporte.duplicados_logicos.length}</strong> grupos duplicados
              </div>
            )}
          </div>

          {sinProblemas && (
            <div style={{ fontSize: '0.85rem', color: C.verde, fontWeight: 600 }}>✅ Sin inconsistencias detectadas</div>
          )}

          {(reporte.resumen || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '14px' }}>
              <thead>
                <tr style={{ background: C.fondo }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: C.textoMut, fontSize: '0.7rem', textTransform: 'uppercase' }}>Problema</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: C.textoMut, fontSize: '0.7rem', textTransform: 'uppercase' }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {reporte.resumen.map(r => (
                  <tr key={r.problema} style={{ borderBottom: `1px solid ${C.borde}` }}>
                    <td style={{ padding: '6px 10px' }}>{r.problema}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: C.rojo }}>{r.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {((reporte.detalle || []).length > 0 || (reporte.duplicados_logicos || []).length > 0) && (
            <button onClick={() => setVerDetalle(v => !v)} style={{ background: 'transparent', border: 'none', color: C.azul, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              {verDetalle ? '▲ Ocultar detalle' : '▼ Ver detalle'}
            </button>
          )}

          {verDetalle && (
            <div style={{ marginTop: '12px' }}>
              {(reporte.duplicados_logicos || []).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px' }}>
                    Duplicados lógicos (mismo material + ubicación + fecha, distinto documento)
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: `1px solid ${C.borde}`, borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: C.fondo }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Material</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Ubicación</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Fecha</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Documentos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reporte.duplicados_logicos.map((d, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.borde}` }}>
                            <td style={{ padding: '6px 10px' }}>{d.material}</td>
                            <td style={{ padding: '6px 10px' }}>{d.ubicacion}</td>
                            <td style={{ padding: '6px 10px' }}>{d.fecha}</td>
                            <td style={{ padding: '6px 10px' }}>{d.documentos.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(reporte.detalle || []).length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px' }}>Registros con problemas</div>
                  <div style={{ maxHeight: '260px', overflowY: 'auto', border: `1px solid ${C.borde}`, borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: C.fondo }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Documento</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Ubicación</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Material</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Fecha</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Problemas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reporte.detalle.map(d => (
                          <tr key={d.id} style={{ borderBottom: `1px solid ${C.borde}` }}>
                            <td style={{ padding: '6px 10px' }}>{d.documento_inventario}</td>
                            <td style={{ padding: '6px 10px' }}>{d.ubicacion}</td>
                            <td style={{ padding: '6px 10px' }}>{d.material}</td>
                            <td style={{ padding: '6px 10px' }}>{d.fecha}</td>
                            <td style={{ padding: '6px 10px', color: C.rojo }}>{d.problemas.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


//  PÁGINA PRINCIPAL


function Inventario() {
  const [data,    setData]    = useState(null)
  const [cargando, setCargando] = useState(false)
  const [filtros, setFiltros] = useState({ mes: '', año: 0, clasificacion: '' })


  const cargar = useCallback(async (f = filtros) => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (f.mes)           params.append('mes',           f.mes)
      if (f.año > 0)       params.append('año',           f.año)
      if (f.clasificacion) params.append('clasificacion', f.clasificacion)
      const res  = await fetch(`${BASE_URL}/api/inventario/dashboard?${params}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }, [])


  useEffect(() => { cargar() }, [])


  function handleFiltro(key, value) {
    const n = { ...filtros, [key]: value }
    setFiltros(n)
    cargar(n)
  }


  function limpiar() {
    const v = { mes: '', año: 0, clasificacion: '' }
    setFiltros(v)
    cargar(v)
  }


  const kpis = data?.kpis             || {}
  const vf   = data?.valores_filtro   || {}
  const tend = data?.tendencia_mensual || []
  const pcls = data?.por_clasificacion || []
  const META = kpis?.meta ?? META_DEFAULT   // ⬅️ la meta real viene del backend
  const ultimoMes    = tend.length > 0 ? tend[tend.length - 1] : null
  const penultimoMes = tend.length > 1 ? tend[tend.length - 2] : null
  const tendGlobal   = (ultimoMes && penultimoMes) ? (() => {
    const keys = ['ind_valor', 'ind_unidades', 'ind_absoluto', 'ind_impacto']
    const avg  = m => keys.reduce((s, k) => s + (m[k] || 0), 0) / 4
    const diff = avg(ultimoMes) - avg(penultimoMes)
    return { diff, mejorando: diff >= 0 }
  })() : null
  const maxDifAbs = pcls.length > 0 ? Math.max(...pcls.map(p => p.diferencia_abs || 0)) : 1
  const maxValAbs = pcls.length > 0 ? Math.max(...pcls.map(p => p.valor_abs || 0)) : 1
  const colorMag  = (v, max) => v / max > 0.6 ? C.rojo : v / max > 0.3 ? C.amarillo : C.textoMut


  // Gráfica tendencia
  const mkLinea = (name, key, color) => ({
    name, type: 'line', data: tend.map(t => t[key]), smooth: true,
    symbol: 'circle',
    symbolSize: (_, params) => params.dataIndex === tend.length - 1 ? 9 : 5,
    lineStyle: { color, width: 2 }, itemStyle: { color },
    label: {
      show: true, position: 'top', fontSize: 10, fontWeight: 600, color,
      formatter: p => p.dataIndex === tend.length - 1 ? `${Number(p.value).toFixed(1)}%` : '',
    },
  })

  const opTendencia = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: C.borde,
      textStyle: { color: C.texto, fontSize: 12 },
      formatter: params => {
        const mes = params[0]?.axisValueLabel || ''
        let html = `<div style="font-weight:700;margin-bottom:8px;font-size:13px">${mes}</div>`
        params.filter(p => p.seriesName !== 'Meta').forEach(p => {
          const v   = Number(p.value || 0)
          const col = colorInd(v, META)
          html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0"></span>
            <span style="min-width:90px;font-size:12px">${p.seriesName}</span>
            <span style="font-weight:700;color:${col};font-size:13px">${v.toFixed(2)}%</span>
            <span style="font-size:11px">${v >= META ? '✅' : '❌'}</span>
          </div>`
        })
        html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #E2E8F0;font-size:11px;color:#718096">Meta: ${META}%</div>`
        return html
      },
    },
    legend: { data: ['Valor', 'Unidades', 'Absoluto', 'Impacto', 'Meta'], textStyle: { color: C.textoMut, fontSize: 11 }, bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: tend.map(t => t.nombre_mes || t.mes), axisLabel: { color: C.textoMut, fontSize: 11, rotate: 30 }, axisLine: { lineStyle: { color: C.borde } } },
    yAxis: { type: 'value', min: 80, max: 100, axisLabel: { color: C.textoMut, fontSize: 11, formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } } },
    series: [
      {
        ...mkLinea('Valor', 'ind_valor', C.azul),
        markArea: {
          silent: true,
          data: [
            [{ yAxis: META,        itemStyle: { color: '#16A34A', opacity: 0.07 } }, { yAxis: 100 }],
            [{ yAxis: META * 0.95, itemStyle: { color: '#CA8A04', opacity: 0.08 } }, { yAxis: META }],
            [{ yAxis: 80,          itemStyle: { color: '#DC2626', opacity: 0.07 } }, { yAxis: META * 0.95 }],
          ],
        },
      },
      mkLinea('Unidades', 'ind_unidades', C.verde),
      mkLinea('Absoluto', 'ind_absoluto', C.amarillo),
      mkLinea('Impacto',  'ind_impacto',  C.morado),
      { name: 'Meta', type: 'line', data: tend.map(() => META), lineStyle: { color: C.rojo, width: 2, type: 'dashed' }, symbol: 'none', itemStyle: { color: C.rojo } },
    ],
  }


  // Gráfica por clasificación
  const opClasificacion = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: C.borde, textStyle: { color: C.texto, fontSize: 12 } },
    grid: { left: '3%', right: '4%', bottom: '25%', top: '5%', containLabel: true },
    xAxis: { type: 'category', data: pcls.map(p => p.clasificacion), axisLabel: { color: C.textoMut, fontSize: 10, rotate: 35, interval: 0 }, axisLine: { lineStyle: { color: C.borde } } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: C.textoMut, fontSize: 11, formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } } },
    series: [
      {
        name: 'Indicador Valor', type: 'bar', data: pcls.map(p => p.ind_valor), barMaxWidth: 40,
        itemStyle: { color: p => colorInd(pcls[p.dataIndex]?.ind_valor || 0, META), borderRadius: [4, 4, 0, 0] },
      },
      { name: 'Meta', type: 'line', data: pcls.map(() => META), lineStyle: { color: C.rojo, width: 2, type: 'dashed' }, symbol: 'none', itemStyle: { color: C.rojo } },
    ],
  }


  const selectStyle = { background: '#fff', border: `1px solid ${C.borde}`, color: C.texto, borderRadius: '8px', padding: '7px 12px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }


  return (
    <div style={{ background: C.fondo, minHeight: '100vh', padding: '20px', fontFamily: 'Inter, sans-serif', color: C.texto }}>


      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Inventario</h1>
        <p style={{ fontSize: '0.82rem', color: C.textoMut, margin: '4px 0 0' }}>
          Indicadores de exactitud · Transacción ZWM53 + MM60 · Meta: {META}%
        </p>
      </div>


      {/* Recuadro de ayuda: neto vs absoluto */}
      <div style={{ background: '#EEF2FF', border: `1px solid #C7D2FE`, borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.76rem', color: '#3730A3', lineHeight: 1.5 }}>
        <strong>¿Cómo leer los indicadores?</strong> Todos miden exactitud de inventario (físico vs. teórico) y la meta es {META}%.
        Los indicadores <strong>"neto"</strong> (Valor y Unidades) permiten que sobrantes y faltantes se compensen entre ítems.
        Los <strong>"absolutos"</strong> suman el descuadre ítem por ítem sin compensar, por eso son más estrictos y reflejan la exactitud real.
      </div>


      {/* Filtros */}
      <div style={{ background: C.card, borderRadius: '12px', padding: '14px 18px', border: `1px solid ${C.borde}`, marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: C.textoMut }}>Filtros</span>


          <select value={filtros.mes} style={selectStyle} onChange={e => handleFiltro('mes', e.target.value)}>
            <option value="">Todos los meses</option>
            {(vf.meses || []).map((m) => (
            <option key={m} value={m}>{MESES[m] || m}</option>
            ))}
          </select>


          <select value={filtros.año} style={selectStyle} onChange={e => handleFiltro('año', Number(e.target.value))}>
            <option value={0}>Todos los años</option>
            {(vf.años || []).map(a => <option key={a} value={a}>{a}</option>)}
          </select>


          <select value={filtros.clasificacion} style={selectStyle} onChange={e => handleFiltro('clasificacion', e.target.value)}>
            <option value="">Todas las clasificaciones</option>
            {(vf.clasificaciones || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>


          <button onClick={limpiar} style={{ ...selectStyle, background: 'transparent', color: C.textoMut }}>✕ Limpiar</button>


          {cargando && <div style={{ fontSize: '0.78rem', color: C.textoMut }}>Cargando...</div>}
        </div>
        {data && (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${C.borde}`, fontSize: '0.72rem', color: C.textoMut }}>
            {fmtNum(data.total_filas)} registros
          </div>
        )}
      </div>


      {/* Sin datos */}
      {!data && !cargando && (
        <div style={{ background: C.card, borderRadius: '12px', padding: '60px', textAlign: 'center', border: `1px solid ${C.borde}` }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📦</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>Sin datos de inventario</div>
          <div style={{ fontSize: '0.82rem', color: C.textoMut }}>Ejecuta el script de automatización para cargar datos.</div>
        </div>
      )}


      {data && !cargando && (
        <>
          {/* KPIs — 4 indicadores */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <KpiCard label="Indicador en Valor" valor={fmtPct(kpis.ind_valor)} color={colorInd(kpis.ind_valor, META)}
              cumple={kpis.ind_valor >= META} sub={`Meta ${META}%`}
              desc="Exactitud del inventario en pesos: valor contado vs. teórico. Sobrantes y faltantes se compensan entre ítems. Indica qué tan confiable es el valor total." />
            <KpiCard label="Indicador en Unidades" valor={fmtPct(kpis.ind_unidades)} color={colorInd(kpis.ind_unidades, META)}
              cumple={kpis.ind_unidades >= META} sub={`Meta ${META}%`}
              desc="Exactitud en cantidades: unidades contadas vs. teóricas. Sobrantes y faltantes se compensan. Mide la precisión del conteo." />
            <KpiCard label="Absoluto en Unidades" valor={fmtPct(kpis.ind_absoluto)} color={colorInd(kpis.ind_absoluto, META)}
              cumple={kpis.ind_absoluto >= META} sub={`Meta ${META}%`}
              desc="Versión estricta en unidades: suma el descuadre ítem por ítem SIN compensar. Mide cuántas unidades se movieron en total." />
            <KpiCard label="Valor Absoluto" valor={fmtPct(kpis.ind_impacto)} color={colorInd(kpis.ind_impacto, META)}
              cumple={kpis.ind_impacto >= META} sub={`Meta ${META}%`}
              desc="Versión estricta en pesos: suma el descuadre de cada ítem SIN compensar. Mide el impacto económico real de los errores." />
          </div>


          {/* KPIs secundarios */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <KpiCard label="Costo Físico"     valor={fmtMon(kpis.total_costo_fisica)}   color={C.azul}    sub="suma total" />
            <KpiCard label="Costo Teórico"    valor={fmtMon(kpis.total_costo_teorica)}  color={C.textoMut} sub="suma total" />
            <KpiCard label="Diferencia ABS"   valor={fmtNum(kpis.total_diferencia_abs)} color={kpis.total_diferencia_abs > 0 ? C.rojo : C.verde} sub="unidades" />
            <KpiCard label="Valor ABS"        valor={fmtMon(kpis.total_valor_abs)}      color={kpis.total_valor_abs > 0 ? C.rojo : C.verde} sub="impacto económico" />
          </div>


          {/* Gráficas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={{ background: C.card, borderRadius: '12px', padding: '18px', border: `1px solid ${C.borde}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {/* Header con badge de tendencia global */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Tendencia Mensual</div>
                {tendGlobal && (
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: '12px',
                    background: tendGlobal.mejorando ? '#F0FFF4' : '#FFF5F5',
                    color: tendGlobal.mejorando ? C.verde : C.rojo,
                  }}>
                    {tendGlobal.mejorando ? '↑ Mejorando' : '↓ Declinando'} {Math.abs(tendGlobal.diff).toFixed(2)}pp
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '14px' }}>
                Evolución de los 4 indicadores vs meta {META}%
                {ultimoMes && <span style={{ marginLeft: '6px' }}>· último: <strong>{ultimoMes.nombre_mes}</strong></span>}
              </div>

              {tend.length > 0
                ? <ReactECharts option={opTendencia} style={{ height: '300px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}

              {/* Badges con valor actual y variación vs mes anterior */}
              {ultimoMes && penultimoMes && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${C.borde}` }}>
                  {[
                    { key: 'ind_valor',    label: 'Valor',    color: C.azul },
                    { key: 'ind_unidades', label: 'Unidades', color: C.verde },
                    { key: 'ind_absoluto', label: 'Absoluto', color: C.amarillo },
                    { key: 'ind_impacto',  label: 'Impacto',  color: C.morado },
                  ].map(({ key, label, color }) => {
                    const val  = ultimoMes[key] || 0
                    const diff = val - (penultimoMes[key] || 0)
                    const dir  = diff > 0.05 ? '↑' : diff < -0.05 ? '↓' : '→'
                    const dc   = diff > 0.05 ? C.verde : diff < -0.05 ? C.rojo : C.textoMut
                    return (
                      <div key={key} style={{
                        display: 'flex', alignItems: 'center', gap: '5px', flex: 1, minWidth: '120px',
                        background: C.fondo, border: `1px solid ${C.borde}`, borderRadius: '8px', padding: '6px 10px',
                      }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: '0.71rem', color: C.textoMut }}>{label}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: colorInd(val, META), marginLeft: 'auto' }}>{fmtPct(val)}</span>
                        <span style={{ fontSize: '0.71rem', fontWeight: 600, color: dc }}>{dir}{Math.abs(diff).toFixed(2)}pp</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>


            <div style={{ background: C.card, borderRadius: '12px', padding: '18px', border: `1px solid ${C.borde}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Por Clasificación</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '14px' }}>Indicador en Valor por tipo de producto</div>
              {pcls.length > 0
                ? <ReactECharts option={opClasificacion} style={{ height: '280px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
          </div>


          {/* Tabla por clasificación */}
          <div style={{ background: C.card, borderRadius: '12px', border: `1px solid ${C.borde}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Detalle por Clasificación</div>
                <div style={{ fontSize: '0.72rem', color: C.textoMut, marginTop: '2px' }}>Ordenado de peor a mejor indicador en Valor</div>
              </div>
              <span style={{ fontSize: '0.75rem', color: C.textoMut }}>{pcls.length} categorías</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: C.fondo }}>
                    {[
                      { label: 'Estado',        align: 'center' },
                      { label: 'Clasificación', align: 'left'   },
                      { label: 'Ind. Valor',    align: 'right'  },
                      { label: 'Ind. Unidades', align: 'right'  },
                      { label: 'Abs. Unidades', align: 'right'  },
                      { label: 'Abs. Valor %',  align: 'right'  },
                      { label: 'Monto ABS',     align: 'right'  },
                      { label: 'Dif. ABS',      align: 'right'  },
                    ].map(({ label, align }) => (
                      <th key={label} style={{ padding: '9px 12px', textAlign: align, fontWeight: 600, color: C.textoMut, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${C.borde}` }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pcls.map((p, i) => {
                    const fallando    = [p.ind_valor, p.ind_unidades, p.ind_absoluto, p.ind_impacto].filter(v => v < META).length
                    const estadoColor = fallando === 0 ? C.verde : C.rojo
                    const estadoText  = fallando === 0 ? 'Cumple' : `${fallando} fallando`
                    return (
                      <tr key={p.clasificacion} style={{ borderBottom: `1px solid ${C.borde}`, background: i % 2 === 0 ? C.card : C.fondo }}>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: estadoColor, background: fallando === 0 ? '#F0FFF4' : '#FFF5F5', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                            {estadoText}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{p.clasificacion}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: colorInd(p.ind_valor,    META) }}>{fmtPct(p.ind_valor)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: colorInd(p.ind_unidades, META) }}>{fmtPct(p.ind_unidades)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: colorInd(p.ind_absoluto, META) }}>{fmtPct(p.ind_absoluto)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: colorInd(p.ind_impacto,  META) }}>{fmtPct(p.ind_impacto)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: colorMag(p.valor_abs,      maxValAbs) }}>{fmtMon(p.valor_abs)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: colorMag(p.diferencia_abs, maxDifAbs) }}>{fmtNum(p.diferencia_abs)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>


          {/* Panel calidad de datos */}
          <PanelValidacion />

          {/* Panel ejecución */}
          <PanelEjecucion />
        </>
      )}


      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}


export default Inventario

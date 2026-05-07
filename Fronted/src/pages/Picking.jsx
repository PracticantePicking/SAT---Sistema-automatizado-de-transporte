import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { useToast } from '../components/Toast'

const BASE_URL = 'http://localhost:5000'

const fmtNum = v => Number(v || 0).toLocaleString('es-CO')
const fmtDec = v => Number(v || 0).toFixed(1)

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

const META_UXH = 640
const META_LXH = 68

const THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: C.texto, fontFamily: 'Inter, sans-serif' },
  grid: { left:'3%', right:'4%', bottom:'8%', containLabel:true },
  xAxis: {
    axisLine:  { lineStyle: { color: C.borde } },
    axisLabel: { color: C.textoMut, fontSize: 11 },
    splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } },
  },
  yAxis: {
    axisLine:  { lineStyle: { color: C.borde } },
    axisLabel: { color: C.textoMut, fontSize: 11 },
    splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } },
  },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor:     C.borde,
    textStyle:       { color: C.texto, fontSize: 12 },
    extraCssText:    'box-shadow: 0 4px 20px rgba(0,0,0,0.1)',
  },
  legend: { textStyle: { color: C.textoMut, fontSize: 11 } },
}

function KpiCard({ label, valor, sub, color }) {
  return (
    <div style={{ background:C.card, borderRadius:'12px', padding:'18px 20px',
      border:`1px solid ${C.borde}`, flex:1, minWidth:'160px',
      boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize:'0.72rem', fontWeight:600, color:C.textoMut,
        textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'8px' }}>
        {label}
      </div>
      <div style={{ fontSize:'1.8rem', fontWeight:700, color: color || C.azul, lineHeight:1 }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize:'0.72rem', color:C.textoMut, marginTop:'6px' }}>{sub}</div>
      )}
    </div>
  )
}

function Panel({ titulo, sub, children }) {
  return (
    <div style={{ background:C.card, borderRadius:'12px', padding:'18px',
      border:`1px solid ${C.borde}`, boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight:600, fontSize:'0.9rem', color:C.texto, marginBottom:'2px' }}>
        {titulo}
      </div>
      {sub && (
        <div style={{ fontSize:'0.75rem', color:C.textoMut, marginBottom:'14px' }}>{sub}</div>
      )}
      {children}
    </div>
  )
}

function Picking() {
  const toast = useToast()
  const [data,     setData]     = useState(null)
  const [cargando, setCargando] = useState(false)
  const [filtros,  setFiltros]  = useState({ usuario:'', tipo_picking:'', mes:'', fecha:'' })

  const cargarDashboard = useCallback(async (f = filtros) => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (f.usuario)      params.append('usuario',      f.usuario)
      if (f.tipo_picking) params.append('tipo_picking', f.tipo_picking)
      if (f.mes)          params.append('mes',          f.mes)
      if (f.fecha)        params.append('fecha',        f.fecha)
      const res  = await fetch(`${BASE_URL}/api/picking2/dashboard?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Error')
      setData(json)
    } catch (e) {
      toast.error('Error al cargar: ' + e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargarDashboard() }, [])

  function handleFiltro(key, value) {
    const n = { ...filtros, [key]: value }
    setFiltros(n)
    cargarDashboard(n)
  }

  function limpiarFiltros() {
    const v = { usuario:'', tipo_picking:'', mes:'', fecha:'' }
    setFiltros(v)
    cargarDashboard(v)
  }

  const kpis      = data?.kpis           || {}
  const vf        = data?.valores_filtro || {}
  const tendencia = data?.tendencia      || []
  const ranking   = data?.ranking        || []
  const porTipo   = data?.por_tipo       || []

  // ── Gráfico tendencia ─────────────────────────────────────────────────
  const opTendencia = {
    ...THEME,
    tooltip: { ...THEME.tooltip, trigger:'axis',
      formatter: p => `<div style="padding:4px 8px">
        <b>${p[0]?.axisValue}</b><br/>
        UxH: <b style="color:${C.azul}">${p[0]?.value}</b><br/>
        <span style="color:${C.textoMut}">Meta: ${META_UXH}</span>
      </div>` },
    legend: { ...THEME.legend, data:['Unidades/hora','Meta'] },
    xAxis: { ...THEME.xAxis, type:'category',
      data: tendencia.map(d => d.fecha?.slice(5) || d.fecha),
      axisLabel: { ...THEME.xAxis.axisLabel, rotate:30 } },
    yAxis: { ...THEME.yAxis, type:'value' },
    series: [
      { name:'Unidades/hora', type:'line', data:tendencia.map(d=>d.uxh),
        smooth:true, symbol:'circle', symbolSize:6,
        lineStyle:{ color:C.azul, width:2.5 }, itemStyle:{ color:C.azul },
        areaStyle:{ color:{ type:'linear',x:0,y:0,x2:0,y2:1,
          colorStops:[{offset:0,color:'rgba(37,99,235,0.15)'},{offset:1,color:'rgba(37,99,235,0)'}]}} },
      { name:'Meta', type:'line', data:tendencia.map(()=>META_UXH),
        lineStyle:{ color:C.textoMut, width:1.5, type:'dashed' },
        itemStyle:{ color:C.textoMut }, symbol:'none' },
    ]
  }

  // ── Gráfico por tipo ──────────────────────────────────────────────────
  const opTipo = {
    ...THEME,
    tooltip: { ...THEME.tooltip, trigger:'axis', axisPointer:{ type:'shadow' } },
    xAxis: { ...THEME.xAxis, type:'value' },
    yAxis: { ...THEME.yAxis, type:'category', data:porTipo.map(d=>d.tipo) },
    series: [{
      name:'UxH', type:'bar', data:porTipo.map(d=>d.uxh), barMaxWidth:40,
      itemStyle:{ color: p => [C.azul,C.verde,C.amarillo,C.morado][p.dataIndex%4],
        borderRadius:[0,4,4,0] },
      label:{ show:true, position:'right', color:C.texto, fontSize:11 }
    }]
  }

  // ── Gráfico ranking horizontal ────────────────────────────────────────
  const opRanking = {
    ...THEME,
    tooltip: { ...THEME.tooltip, trigger:'axis', axisPointer:{ type:'shadow' },
      formatter: p => {
        const u = ranking[p[0]?.dataIndex]
        return `<div style="padding:4px 8px">
          <b>${u?.usuario}</b><br/>
          UxH: <b>${p[0]?.value}</b><br/>
          Unidades: ${fmtNum(u?.unidades)}<br/>
          Órdenes: ${u?.ordenes}
        </div>`
      }
    },
    xAxis: { ...THEME.xAxis, type:'value' },
    yAxis: { ...THEME.yAxis, type:'category', data:ranking.map(r=>r.usuario),
      axisLabel:{ ...THEME.yAxis.axisLabel, fontSize:10 } },
    series: [{
      name:'UxH', type:'bar', data:ranking.map(r=>r.uxh), barMaxWidth:28,
      itemStyle:{ color: p => {
        const v = ranking[p.dataIndex]?.uxh||0
        return v>=META_UXH ? C.verde : v>=META_UXH*0.85 ? C.amarillo : C.rojo
      }, borderRadius:[0,4,4,0] },
      label:{ show:true, position:'right', color:C.texto, fontSize:10 }
    }]
  }

  // ── Gráfico barras por usuario ────────────────────────────────────────
  const opBarras = {
    ...THEME,
    tooltip: { ...THEME.tooltip, trigger:'axis', axisPointer:{ type:'shadow' } },
    xAxis: { ...THEME.xAxis, type:'category', data:ranking.map(r=>r.usuario),
      axisLabel:{ ...THEME.xAxis.axisLabel, rotate:30, fontSize:10 } },
    yAxis: { ...THEME.yAxis, type:'value' },
    series: [
      { name:'UxH', type:'bar', data:ranking.map(r=>r.uxh), barMaxWidth:35,
        itemStyle:{ color: p => {
          const v = ranking[p.dataIndex]?.uxh||0
          return v>=META_UXH ? C.verde : v>=META_UXH*0.85 ? C.amarillo : C.rojo
        }, borderRadius:[4,4,0,0] } },
      { name:'Meta', type:'line', data:ranking.map(()=>META_UXH),
        lineStyle:{ color:C.textoMut, width:1.5, type:'dashed' },
        itemStyle:{ color:C.textoMut }, symbol:'none' }
    ]
  }

  const selectStyle = {
    background: '#FFFFFF', border:`1px solid ${C.borde}`, color:C.texto,
    borderRadius:'8px', padding:'7px 12px', fontSize:'0.8rem',
    cursor:'pointer', outline:'none',
  }

  return (
    <div style={{ background:C.fondo, minHeight:'100vh', padding:'20px',
      fontFamily:'Inter, sans-serif', color:C.texto }}>

      {/* Header */}
      <div style={{ marginBottom:'20px' }}>
        <h1 style={{ fontSize:'1.4rem', fontWeight:700, margin:0, color:C.texto }}>
          Productividad Picking
        </h1>
        <p style={{ fontSize:'0.82rem', color:C.textoMut, margin:'4px 0 0' }}>
          Datos en tiempo real desde el script de SAP · Actualización diaria automática
        </p>
      </div>

      {/* Filtros */}
      <div style={{ background:C.card, borderRadius:'12px', padding:'14px 18px',
        border:`1px solid ${C.borde}`, marginBottom:'20px',
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'0.78rem', fontWeight:600, color:C.textoMut }}>Filtros</span>

          <select value={filtros.usuario} style={selectStyle}
            onChange={e => handleFiltro('usuario', e.target.value)}>
            <option value="">Todos los usuarios</option>
            {(vf.usuarios||[]).map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <select value={filtros.tipo_picking} style={selectStyle}
            onChange={e => handleFiltro('tipo_picking', e.target.value)}>
            <option value="">Todos los tipos</option>
            {(vf.tipos||[]).map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={filtros.mes} style={selectStyle}
            onChange={e => handleFiltro('mes', e.target.value)}>
            <option value="">Todos los meses</option>
            {(vf.meses||[]).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filtros.fecha} style={selectStyle}
            onChange={e => handleFiltro('fecha', e.target.value)}>
            <option value="">Todos los días</option>
            {(vf.fechas||[]).map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          <button onClick={limpiarFiltros} style={{ ...selectStyle,
            background:'transparent', color:C.textoMut }}>
            ✕ Limpiar
          </button>

          {cargando && (
            <div style={{ display:'flex', alignItems:'center', gap:'6px',
              color:C.textoMut, fontSize:'0.78rem' }}>
              <div style={{ width:'14px', height:'14px',
                border:`2px solid ${C.borde}`, borderTop:`2px solid ${C.azul}`,
                borderRadius:'50%', animation:'spin 1s linear infinite' }} />
              Cargando...
            </div>
          )}
        </div>

        {data && (
          <div style={{ marginTop:'10px', paddingTop:'10px',
            borderTop:`1px solid ${C.borde}`,
            fontSize:'0.72rem', color:C.textoMut, display:'flex', gap:'16px' }}>
            <span>{fmtNum(data.total_filas)} registros</span>
            {filtros.usuario      && <span style={{ color:C.azul }}>· {filtros.usuario}</span>}
            {filtros.tipo_picking && <span style={{ color:C.azul }}>· {filtros.tipo_picking}</span>}
            {filtros.mes          && <span style={{ color:C.azul }}>· {filtros.mes}</span>}
            {filtros.fecha        && <span style={{ color:C.azul }}>· {filtros.fecha}</span>}
          </div>
        )}
      </div>

      {/* Sin datos */}
      {!data && !cargando && (
        <div style={{ background:C.card, borderRadius:'12px', padding:'60px',
          textAlign:'center', border:`1px solid ${C.borde}` }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'12px' }}>📦</div>
          <div style={{ fontSize:'1.1rem', fontWeight:600, marginBottom:'8px' }}>
            Sin datos de Picking
          </div>
          <div style={{ fontSize:'0.82rem', color:C.textoMut }}>
            El script de SAP aún no ha enviado datos. Se ejecuta automáticamente cada día.
          </div>
        </div>
      )}

      {data && !cargando && (
        <>
          {/* KPIs */}
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'20px' }}>
            <KpiCard label="Total unidades"  valor={fmtNum(kpis.total_unidades)}
              sub="unidades procesadas"  color={C.azul} />
            <KpiCard label="Total líneas"    valor={fmtNum(kpis.total_lineas)}
              sub="líneas procesadas"    color={C.verde} />
            <KpiCard label="Tiempo total"    valor={`${fmtDec(kpis.tiempo_total)} h`}
              sub="horas trabajadas"     color={C.amarillo} />
            <KpiCard label="Unidades × Hora" valor={fmtDec(kpis.uxh)}
              sub={`Meta: ${META_UXH} u/h`}
              color={kpis.uxh>=META_UXH ? C.verde : kpis.uxh>=META_UXH*0.85 ? C.amarillo : C.rojo} />
            <KpiCard label="Líneas × Hora"   valor={fmtDec(kpis.lxh)}
              sub="Meta: 68 l/h"      color={C.morado} />
          </div>

          {/* Fila 1 — Tendencia + Por tipo */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr',
            gap:'16px', marginBottom:'16px' }}>
            <Panel titulo="Tendencia en unidades por hora"
              sub={filtros.mes || 'Período completo'}>
              {tendencia.length > 0
                ? <ReactECharts option={opTendencia} style={{ height:'220px' }} />
                : <div style={{ height:'220px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut, fontSize:'0.82rem' }}>
                    Sin datos para el período
                  </div>
              }
            </Panel>
            <Panel titulo="Por tipo de picking" sub="Unidades / hora">
              {porTipo.length > 0
                ? <ReactECharts option={opTipo} style={{ height:'220px' }} />
                : <div style={{ height:'220px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>
          </div>

          {/* Fila 2 — Ranking barras + lista */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr',
            gap:'16px', marginBottom:'16px' }}>

            {/* LxH por usuario */}
            <Panel titulo="Distribución LxH por usuario"
              sub="Líneas por hora · Comparativa individual">
              {ranking.length > 0
                ? <ReactECharts option={{
                    ...THEME,
                    tooltip: { ...THEME.tooltip, trigger:'axis', axisPointer:{ type:'shadow' } },
                    xAxis: { ...THEME.xAxis, type:'category',
                      data: ranking.map(r => r.usuario),
                      axisLabel: { ...THEME.xAxis.axisLabel, rotate:30, fontSize:10 } },
                    yAxis: { ...THEME.yAxis, type:'value' },
                    series: [{
                      name: 'LxH', type:'bar', data: ranking.map(r => r.lxh),
                      barMaxWidth: 35,
                      itemStyle: {
                        color: C.morado,
                        borderRadius: [4,4,0,0]
                      },
                      label: { show:true, position:'top', color:C.texto, fontSize:10,
                        formatter: p => fmtDec(p.value) }
                    }]
                  }} style={{ height:'600px' }} />
                : <div style={{ height:'280px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>

            {/* Operarios */}
            <Panel titulo="Operarios">
              <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop:'8px' }}>
                {ranking.map((r, i) => {
                  const color = r.uxh>=META_UXH ? C.verde :
                                r.uxh>=META_UXH*0.85 ? C.amarillo : C.rojo
                  return (
                    <div key={r.usuario} style={{ display:'flex', alignItems:'center',
                      gap:'10px', padding:'8px 12px', background:C.fondo,
                      borderRadius:'8px', border:`1px solid ${C.borde}` }}>
                      <span style={{ width:'24px', height:'24px', borderRadius:'50%',
                        background: i<3 ? color+'20' : C.fondo,
                        border: `1px solid ${i<3 ? color : C.borde}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'0.72rem', fontWeight:700,
                        color: i<3 ? color : C.textoMut, flexShrink:0 }}>
                        {i+1}
                      </span>
                      <span style={{ flex:1, fontSize:'0.82rem', fontWeight:500, color:C.texto }}>
                        {r.usuario}
                      </span>
                      <span style={{ fontSize:'1rem', fontWeight:700, color }}>
                        {fmtDec(r.uxh)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>

          {/* Tabla detalle */}
          <div style={{ background:C.card, borderRadius:'12px',
            border:`1px solid ${C.borde}`, overflow:'hidden', marginBottom:'16px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.borde}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'0.9rem', color:C.texto }}>
                  Detalle por usuario
                </div>
                <div style={{ fontSize:'0.75rem', color:C.textoMut, marginTop:'2px' }}>
                  Agregado del período
                </div>
              </div>
              <span style={{ fontSize:'0.75rem', color:C.textoMut }}>
                {ranking.length} operarios
              </span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead>
                  <tr style={{ background:C.fondo }}>
                    {['Usuario','Unidades','Líneas','UxH','LxH','OTS','Tiempo (h)'].map(h => (
                      <th key={h} style={{ padding:'10px 14px',
                        textAlign: h==='Usuario' ? 'left' : 'right',
                        fontWeight:600, color:C.textoMut, fontSize:'0.72rem',
                        textTransform:'uppercase', letterSpacing:'0.5px',
                        borderBottom:`1px solid ${C.borde}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const colorUxH = r.uxh>=META_UXH ? C.verde :
                                     r.uxh>=META_UXH*0.85 ? C.amarillo : C.rojo
                    return (
                      <tr key={r.usuario} style={{
                        borderBottom:`1px solid ${C.borde}`,
                        background: i%2===0 ? C.card : C.fondo
                      }}>
                        <td style={{ padding:'10px 14px', fontWeight:600, color:C.texto }}>
                          {r.usuario}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color:C.texto }}>
                          {fmtNum(r.unidades)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color:C.texto }}>
                          {fmtNum(r.lineas)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right',
                          fontWeight:700, color:colorUxH }}>
                          {fmtDec(r.uxh)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color:C.textoMut }}>
                          {fmtDec(r.lxh)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color:C.texto }}>
                          {fmtNum(r.ordenes)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color:C.textoMut }}>
                          {fmtDec(r.tiempo)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fila 3 — Desempeño + Barras */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'16px' }}>

            <Panel titulo="Desempeño" sub={`Meta: ${META_UXH} u/h`}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                gap:'10px', margin:'12px 0 16px' }}>
                <div style={{ background:'#F0FFF4', borderRadius:'10px', padding:'14px',
                  textAlign:'center', border:`1px solid #9AE6B4` }}>
                  <div style={{ fontSize:'1.8rem', fontWeight:700, color:C.verde }}>
                    {ranking.filter(r=>r.uxh>=META_UXH).length}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:C.verde, marginTop:'4px' }}>
                    Cumpliendo
                  </div>
                </div>
                <div style={{ background:'#FFF5F5', borderRadius:'10px', padding:'14px',
                  textAlign:'center', border:`1px solid #FED7D7` }}>
                  <div style={{ fontSize:'1.8rem', fontWeight:700, color:C.rojo }}>
                    {ranking.filter(r=>r.uxh<META_UXH).length}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:C.rojo, marginTop:'4px' }}>
                    Incumpliendo
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {ranking.map(r => (
                  <div key={r.usuario} style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', padding:'6px 10px', borderRadius:'6px',
                    background:C.fondo, border:`1px solid ${C.borde}` }}>
                    <span style={{ fontSize:'0.8rem', color:C.texto }}>{r.usuario}</span>
                    <span style={{ padding:'2px 10px', borderRadius:'12px',
                      fontSize:'0.72rem', fontWeight:600,
                      background: r.uxh>=META_UXH ? '#F0FFF4' : '#FFF5F5',
                      color:      r.uxh>=META_UXH ? C.verde : C.rojo,
                      border: `1px solid ${r.uxh>=META_UXH ? '#9AE6B4' : '#FED7D7'}` }}>
                      {r.uxh>=META_UXH ? 'Cumpliendo' : 'Incumpliendo'}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel titulo="Distribución UxH por usuario"
              sub="Comparativa individual vs meta">
              {ranking.length > 0
                ? <ReactECharts option={opBarras} style={{ height:'700px' }} />
                : <div style={{ height:'300px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

export default Picking
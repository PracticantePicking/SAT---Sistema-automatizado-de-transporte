import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { useToast } from '../components/Toast'

const BASE_URL = 'http://localhost:5000'

const fmtNum = v => Number(v || 0).toLocaleString('es-CO')
const fmtDec = v => Number(v || 0).toFixed(1)

const META_UPH = 500

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
  cyan:     '#0891B2',
}

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

function SBL() {
  const toast = useToast()
  const [data,     setData]     = useState(null)
  const [cargando, setCargando] = useState(false)
  const [filtros,  setFiltros]  = useState({
    operario: '', mes_num: 0, ano: 0, fecha: ''
  })

  const cargarDashboard = useCallback(async (f = filtros) => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (f.operario)    params.append('operario', f.operario)
      if (f.mes_num > 0) params.append('mes_num',  f.mes_num)
      if (f.ano > 0)     params.append('ano',      f.ano)
      if (f.fecha)       params.append('fecha',    f.fecha)
      const res  = await fetch(`${BASE_URL}/api/sbl2/dashboard?${params}`)
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
    const v = { operario:'', mes_num:0, ano:0, fecha:'' }
    setFiltros(v)
    cargarDashboard(v)
  }

  const kpis     = data?.kpis           || {}
  const vf       = data?.valores_filtro || {}
  const tendencia = data?.tendencia     || []
  const ranking   = data?.ranking       || []
  const tdDiaria  = data?.tendencia_diaria || []

  // ── Gráfico tendencia mensual UPH ─────────────────────────────────────
  const opTendencia = {
    ...THEME,
    tooltip: { ...THEME.tooltip, trigger:'axis',
      formatter: p => `<div style="padding:4px 8px">
        <b>${p[0]?.axisValue}</b><br/>
        UPH: <b style="color:${C.azul}">${p[0]?.value}</b><br/>
        <span style="color:${C.textoMut}">Meta: ${META_UPH}</span>
      </div>` },
    legend: { ...THEME.legend, data:['UPH','Meta'] },
    xAxis: { ...THEME.xAxis, type:'category',
      data: tendencia.map(d => d.nombre || d.mes),
      axisLabel: { ...THEME.xAxis.axisLabel, rotate:30 } },
    yAxis: { ...THEME.yAxis, type:'value' },
    series: [
      { name:'UPH', type:'line', data:tendencia.map(d=>d.uph),
        smooth:true, symbol:'circle', symbolSize:7,
        lineStyle:{ color:C.azul, width:2.5 }, itemStyle:{ color:C.azul },
        areaStyle:{ color:{ type:'linear',x:0,y:0,x2:0,y2:1,
          colorStops:[{offset:0,color:'rgba(37,99,235,0.15)'},{offset:1,color:'rgba(37,99,235,0)'}]}} },
      { name:'Meta', type:'line', data:tendencia.map(()=>META_UPH),
        lineStyle:{ color:C.rojo, width:1.5, type:'dashed' },
        itemStyle:{ color:C.rojo }, symbol:'none' },
    ]
  }

  const opUPH = {
    ...THEME,
    grid: { left:'3%', right:'5%', bottom:'25%', top:'15%', containLabel:true },
    tooltip: { ...THEME.tooltip, trigger:'axis', axisPointer:{ type:'shadow' },
      formatter: p => {
        const r = ranking[p[0]?.dataIndex]
        return `<div style="padding:6px 10px;font-size:13px">
          <b>${r?.operario}</b><br/>
          UPH: <b style="color:${p[0]?.value >= META_UPH ? C.verde : C.rojo}">${p[0]?.value}</b><br/>
          Unidades: ${fmtNum(r?.unidades)} · Días: ${r?.registros}
        </div>`
      }
    },
    legend: { ...THEME.legend, data:['UPH','Meta'], top:0 },
    xAxis: { ...THEME.xAxis, type:'category',
      data: ranking.map(r => r.operario),
      axisLabel: { color:C.textoMut, fontSize:10, rotate:40,
        interval:0, margin:8 } },
    yAxis: { ...THEME.yAxis, type:'value',
      axisLabel: { color:C.textoMut, fontSize:11 } },
    series: [
      {
        name:'UPH', type:'bar', data:ranking.map(r=>r.uph),
        barMaxWidth:40,
        itemStyle: {
          color: p => {
            const v = ranking[p.dataIndex]?.uph||0
            return v>=META_UPH ? C.verde : v>=META_UPH*0.8 ? C.amarillo : C.rojo
          },
          borderRadius:[4,4,0,0]
        },
        label:{ show:true, position:'top', fontSize:10, color:C.texto,
          formatter: p => fmtDec(p.value) }
      },
      {
        name:'Meta', type:'line', data:ranking.map(()=>META_UPH),
        lineStyle:{ color:C.rojo, width:2, type:'dashed' },
        itemStyle:{ color:C.rojo }, symbol:'none'
      }
    ]
  }

  // ── Gráfico LPH por operario (barras) ────────────────────────────────
  // ── Gráfico LPH por operario ─────────────────────────────────────────
const opLPH = {
    ...THEME,
    grid: { left:'3%', right:'5%', bottom:'25%', top:'10%', containLabel:true },
    tooltip: { ...THEME.tooltip, trigger:'axis', axisPointer:{ type:'shadow' } },
    xAxis: { ...THEME.xAxis, type:'category',
      data: ranking.map(r=>r.operario),
      axisLabel: { color:C.textoMut, fontSize:10, rotate:40, interval:0, margin:8 } },
    yAxis: { ...THEME.yAxis, type:'value',
      axisLabel: { color:C.textoMut, fontSize:11 } },
    series: [{
      name:'LPH', type:'bar', data:ranking.map(r=>r.lph),
      barMaxWidth:40,
      itemStyle:{ color:C.morado, borderRadius:[4,4,0,0] },
      label:{ show:true, position:'top', fontSize:10, color:C.texto,
        formatter: p => fmtDec(p.value) }
    }]
  }

  // ── Gráfico tendencia diaria ─────────────────────────────────────────
  // ── Gráfico tendencia diaria ─────────────────────────────────────────
  const opDiaria = {
    ...THEME,
    grid: { left:'3%', right:'3%', bottom:'20%', top:'10%', containLabel:true },
    tooltip: { ...THEME.tooltip, trigger:'axis',
      formatter: p => `<div style="padding:6px 10px;font-size:13px">
        <b>${p[0]?.axisValue}</b><br/>
        UPH: <b style="color:${C.cyan}">${p[0]?.value}</b>
      </div>` },
    legend: { ...THEME.legend, data:['UPH diario','Meta'], top:0 },
    xAxis: { ...THEME.xAxis, type:'category',
      data: tdDiaria.map(d=>d.fecha?.slice(5)||d.fecha),
      axisLabel: { color:C.textoMut, fontSize:10, rotate:45, interval:2 } },
    yAxis: { ...THEME.yAxis, type:'value',
      axisLabel: { color:C.textoMut, fontSize:11 } },
    series: [
      { name:'UPH diario', type:'bar', data:tdDiaria.map(d=>d.uph),
        barMaxWidth:16,
        itemStyle:{ color: p => {
          const v = tdDiaria[p.dataIndex]?.uph||0
          return v>=META_UPH ? C.verde+'CC' : C.rojo+'99'
        }, borderRadius:[3,3,0,0] } },
      { name:'Meta', type:'line', data:tdDiaria.map(()=>META_UPH),
        lineStyle:{ color:C.rojo, width:2, type:'dashed' },
        itemStyle:{ color:C.rojo }, symbol:'none' }
    ]
  }

  const selectStyle = {
    background:'#FFFFFF', border:`1px solid ${C.borde}`, color:C.texto,
    borderRadius:'8px', padding:'7px 12px', fontSize:'0.8rem',
    cursor:'pointer', outline:'none',
  }

  return (
    <div style={{ background:C.fondo, minHeight:'100vh', padding:'20px',
      fontFamily:'Inter, sans-serif', color:C.texto }}>

      {/* Header */}
      <div style={{ marginBottom:'20px' }}>
        <h1 style={{ fontSize:'1.4rem', fontWeight:700, margin:0, color:C.texto }}>
          Productividad SBL
        </h1>
        <p style={{ fontSize:'0.82rem', color:C.textoMut, margin:'4px 0 0' }}>
          Sistema de Bandas Logísticas · Datos desde AtpPut · Meta: {META_UPH} u/hora
        </p>
      </div>

      {/* Filtros */}
      <div style={{ background:C.card, borderRadius:'12px', padding:'14px 18px',
        border:`1px solid ${C.borde}`, marginBottom:'20px',
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'0.78rem', fontWeight:600, color:C.textoMut }}>Filtros</span>

          <select value={filtros.operario} style={selectStyle}
            onChange={e => handleFiltro('operario', e.target.value)}>
            <option value="">Todos los operarios</option>
            {(vf.operarios||[]).map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          <select value={filtros.mes_num} style={selectStyle}
            onChange={e => handleFiltro('mes_num', Number(e.target.value))}>
            <option value={0}>Todos los meses</option>
            {(vf.meses||[]).map(m => (
              <option key={m.num} value={m.num}>{m.nombre}</option>
            ))}
          </select>

          <select value={filtros.ano} style={selectStyle}
            onChange={e => handleFiltro('ano', Number(e.target.value))}>
            <option value={0}>Todos los años</option>
            {(vf.anos||[]).map(a => <option key={a} value={a}>{a}</option>)}
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
            {filtros.operario  && <span style={{ color:C.azul }}>· {filtros.operario}</span>}
            {filtros.mes_num>0 && <span style={{ color:C.azul }}>· Mes {filtros.mes_num}</span>}
            {filtros.ano>0     && <span style={{ color:C.azul }}>· {filtros.ano}</span>}
            {filtros.fecha     && <span style={{ color:C.azul }}>· {filtros.fecha}</span>}
          </div>
        )}
      </div>

      {/* Sin datos */}
      {!data && !cargando && (
        <div style={{ background:C.card, borderRadius:'12px', padding:'60px',
          textAlign:'center', border:`1px solid ${C.borde}` }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'12px' }}>🏭</div>
          <div style={{ fontSize:'1.1rem', fontWeight:600, marginBottom:'8px' }}>
            Sin datos de SBL
          </div>
          <div style={{ fontSize:'0.82rem', color:C.textoMut }}>
            El script de AtpPut aún no ha enviado datos.
          </div>
        </div>
      )}

      {data && !cargando && (
        <>
          {/* KPIs */}
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'20px' }}>
            <KpiCard label="Total unidades"  valor={fmtNum(kpis.total_unidades)}
              sub="unidades confirmadas"  color={C.azul} />
            <KpiCard label="Total líneas"    valor={fmtNum(kpis.total_lineas)}
              sub="líneas procesadas"    color={C.verde} />
            <KpiCard label="Total horas"     valor={`${fmtDec(kpis.total_horas)} h`}
              sub="horas trabajadas"     color={C.amarillo} />
            <KpiCard label="UXH promedio"    valor={fmtDec(kpis.avg_uph)}
              sub={`Meta: ${META_UPH} u/hora`}
              color={kpis.avg_uph>=META_UPH ? C.verde :
                     kpis.avg_uph>=META_UPH*0.8 ? C.amarillo : C.rojo} />
            <KpiCard label="LXH promedio"    valor={fmtDec(kpis.avg_lph)}
              sub="líneas por hora"      color={C.morado} />
            <KpiCard label="% Cumplimiento"  valor={`${fmtDec(kpis.pct_cumplimiento)}%`}
              sub={`${fmtNum(kpis.cumpliendo)} de ${fmtNum(kpis.total_registros)}`}
              color={kpis.pct_cumplimiento>=80 ? C.verde :
                     kpis.pct_cumplimiento>=60 ? C.amarillo : C.rojo} />
          </div>

          {/* Fila 1 — Tendencia mensual + UPH por operario */}
          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr',
            gap:'16px', marginBottom:'16px' }}>
            <Panel titulo="Tendencia Mensual — UPH"
              sub="Evolución mes a mes vs meta de 500 u/hora">
              {tendencia.length > 0
                ? <ReactECharts option={opTendencia} style={{ height:'280px' }} />
                : <div style={{ height:'240px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>

            <Panel titulo="UXH por Operario"
              sub="Verde ≥ 500 · Amarillo ≥ 400 · Rojo < 400">
              {ranking.length > 0
                ? <ReactECharts option={opUPH} style={{ height:'320px' }} />
                : <div style={{ height:'240px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>
          </div>

          {/* Fila 2 — Tendencia diaria + LPH */}
          <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr',
            gap:'16px', marginBottom:'16px' }}>
            <Panel titulo="Tendencia Diaria — UXH"
              sub="UPH por día vs meta">
              {tdDiaria.length > 0
                ? <ReactECharts option={opDiaria} style={{ height:'280px' }} />
                : <div style={{ height:'220px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>

            <Panel titulo="LXH por Operario"
              sub="Líneas por hora">
              {ranking.length > 0
                ? <ReactECharts option={opLPH} style={{ height:'280px' }} />
                : <div style={{ height:'220px', display:'flex', alignItems:'center',
                    justifyContent:'center', color:C.textoMut }}>Sin datos</div>
              }
            </Panel>
          </div>

          {/* Fila 3 — Tabla + Desempeño */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr',
            gap:'16px', marginBottom:'16px' }}>

            {/* Tabla detalle */}
            <div style={{ background:C.card, borderRadius:'12px',
              border:`1px solid ${C.borde}`, overflow:'hidden',
              boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.borde}`,
                display:'flex', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:'0.9rem' }}>Detalle por Operario</div>
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
                      {['Operario','Unidades','Líneas','UPH','LPH','Días','% Cumpl.'].map(h => (
                        <th key={h} style={{ padding:'9px 12px',
                          textAlign: h==='Operario' ? 'left' : 'right',
                          fontWeight:600, color:C.textoMut, fontSize:'0.7rem',
                          textTransform:'uppercase', letterSpacing:'0.5px',
                          borderBottom:`1px solid ${C.borde}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => {
                      const colorUPH = r.uph>=META_UPH ? C.verde :
                                       r.uph>=META_UPH*0.8 ? C.amarillo : C.rojo
                      const colorPct = r.pct_cumplimiento>=80 ? C.verde :
                                       r.pct_cumplimiento>=60 ? C.amarillo : C.rojo
                      return (
                        <tr key={r.operario} style={{
                          borderBottom:`1px solid ${C.borde}`,
                          background: i%2===0 ? C.card : C.fondo
                        }}>
                          <td style={{ padding:'9px 12px', fontWeight:600 }}>{r.operario}</td>
                          <td style={{ padding:'9px 12px', textAlign:'right' }}>
                            {fmtNum(r.unidades)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right' }}>
                            {fmtNum(r.lineas)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            fontWeight:700, color:colorUPH }}>
                            {fmtDec(r.uph)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            color:C.textoMut }}>
                            {fmtDec(r.lph)}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right',
                            color:C.textoMut }}>
                            {r.registros}
                          </td>
                          <td style={{ padding:'9px 12px', textAlign:'right' }}>
                            <span style={{ padding:'2px 8px', borderRadius:'12px',
                              fontSize:'0.72rem', fontWeight:700,
                              color:colorPct, background:colorPct+'18' }}>
                              {fmtDec(r.pct_cumplimiento)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel desempeño */}
            <Panel titulo="Desempeño" sub={`Meta: ${META_UPH} u/hora`}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                gap:'10px', margin:'10px 0 16px' }}>
                <div style={{ background:'#F0FFF4', borderRadius:'10px', padding:'14px',
                  textAlign:'center', border:'1px solid #9AE6B4' }}>
                  <div style={{ fontSize:'1.8rem', fontWeight:700, color:C.verde }}>
                    {ranking.filter(r=>r.cumple_meta).length}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:C.verde, marginTop:'4px' }}>
                    Cumpliendo
                  </div>
                </div>
                <div style={{ background:'#FFF5F5', borderRadius:'10px', padding:'14px',
                  textAlign:'center', border:'1px solid #FED7D7' }}>
                  <div style={{ fontSize:'1.8rem', fontWeight:700, color:C.rojo }}>
                    {ranking.filter(r=>!r.cumple_meta).length}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:C.rojo, marginTop:'4px' }}>
                    Incumpliendo
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {ranking.map(r => (
                  <div key={r.operario} style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', padding:'7px 10px', borderRadius:'8px',
                    background:C.fondo, border:`1px solid ${C.borde}` }}>
                    <span style={{ fontSize:'0.78rem', color:C.texto, fontWeight:500 }}>
                      {r.operario}
                    </span>
                    <span style={{ padding:'2px 10px', borderRadius:'12px',
                      fontSize:'0.7rem', fontWeight:600,
                      background: r.cumple_meta ? '#F0FFF4' : '#FFF5F5',
                      color:      r.cumple_meta ? C.verde : C.rojo,
                      border: `1px solid ${r.cumple_meta ? '#9AE6B4' : '#FED7D7'}` }}>
                      {r.cumple_meta ? 'Cumpliendo' : 'Incumpliendo'}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default SBL
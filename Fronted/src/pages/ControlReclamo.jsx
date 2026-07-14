import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'


const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'


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

const PALETTE = [C.azul, C.verde, C.amarillo, C.morado, C.rojo, '#0EA5E9', '#F97316', '#059669', '#DB2777', '#64748B']

const fmtMon = v => Number(v || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
const fmtCompact = v => new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0)
const fmtNum = v => Number(v || 0).toLocaleString('es-CO')

const selectStyle = { background: '#fff', border: `1px solid ${C.borde}`, color: C.texto, borderRadius: '8px', padding: '7px 12px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }
const inputStyle  = { background: '#fff', border: `1px solid ${C.borde}`, color: C.texto, borderRadius: '8px', padding: '7px 12px', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' }

const cardStyle = { background: C.card, borderRadius: '12px', padding: '18px', border: `1px solid ${C.borde}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }


// ── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ label, valor, color, icon }) {
  return (
    <div style={{
      background: C.card, borderRadius: '12px', padding: '20px',
      border: `1px solid ${C.borde}`, flex: 1, minWidth: '220px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.textoMut, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color, lineHeight: 1 }}>
        {valor}
      </div>
    </div>
  )
}


// ── Campo de formulario ──────────────────────────────────────────────────
function Campo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: C.textoMut, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  )
}


const FORM_INICIAL = {
  fecha: '', nota_credito: '', factura2: '', fecha_factura: '',
  codigo_cliente: '', nombre_cliente: '', codigo_vendedor: '', nombre_vendedor: '',
  referencia: '', marca_referencia: '', unidades: '', novedad: '', responsable: '',
  trazabilidad: '', unidades_3002: '', usuario: '', tipo_picking: '', estado: '',
  valor: '', fecha_entrega: '', observaciones_transporte: '', dias_proceso: '',
  indicador: '', ciudad: '', canal: '', ceco: '', guias: '', permanencia_dias: '',
}


// ── Modal: Registrar nuevo control ───────────────────────────────────────
function ModalRegistrar({ onClose, onGuardado }) {
  const [form, setForm]         = useState({ ...FORM_INICIAL, fecha: new Date().toISOString().slice(0, 10) })
  const [guardando, setGuardando] = useState(false)

  function set(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }))
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    try {
      const payload = {
        ...form,
        unidades:         Number(form.unidades) || 0,
        unidades_3002:    Number(form.unidades_3002) || 0,
        valor:            Number(form.valor) || 0,
        dias_proceso:     Number(form.dias_proceso) || 0,
        permanencia_dias: Number(form.permanencia_dias) || 0,
      }
      const res  = await fetch(`${BASE_URL}/api/control-reclamo/registrar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.detail || 'No se pudo registrar el control')
      onGuardado()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const secciones = [
    {
      titulo: 'Identificación', campos: [
        ['fecha', 'Fecha', 'date'], ['nota_credito', 'Nota crédito'],
        ['factura2', 'Factura'], ['fecha_factura', 'Fecha factura', 'date'],
      ],
    },
    {
      titulo: 'Cliente', campos: [
        ['codigo_cliente', 'Código cliente'], ['nombre_cliente', 'Nombre cliente'],
        ['ciudad', 'Ciudad'], ['canal', 'Canal'], ['ceco', 'CECO'],
      ],
    },
    {
      titulo: 'Vendedor', campos: [
        ['codigo_vendedor', 'Código vendedor'], ['nombre_vendedor', 'Nombre vendedor'],
      ],
    },
    {
      titulo: 'Novedad', campos: [
        ['referencia', 'Referencia'], ['marca_referencia', 'Marca'],
        ['unidades', 'Unidades', 'number'], ['unidades_3002', 'Unidades 3002', 'number'],
        ['novedad', 'Novedad'], ['responsable', 'Responsable'],
        ['trazabilidad', 'Trazabilidad'], ['indicador', 'Indicador'],
      ],
    },
    {
      titulo: 'Proceso', campos: [
        ['usuario', 'Usuario'], ['tipo_picking', 'Tipo picking'], ['estado', 'Estado'],
        ['dias_proceso', 'Días proceso', 'number'], ['permanencia_dias', 'Permanencia (días)', 'number'],
      ],
    },
    {
      titulo: 'Transporte', campos: [
        ['guias', 'Guías'], ['fecha_entrega', 'Fecha entrega', 'date'],
        ['observaciones_transporte', 'Observaciones transporte'],
      ],
    },
    {
      titulo: 'Valor', campos: [
        ['valor', 'Valor (COP)', 'number'],
      ],
    },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
    }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: C.card, borderRadius: '14px', width: '100%', maxWidth: '820px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Registrar nuevo control</div>
            <div style={{ fontSize: '0.75rem', color: C.textoMut, marginTop: '2px' }}>Un control corresponde a una factura única</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.3rem', color: C.textoMut, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={guardar} style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {secciones.map(sec => (
            <div key={sec.titulo} style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.azul, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>
                {sec.titulo}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {sec.campos.map(([key, label, type]) => (
                  <Campo key={key} label={label}>
                    <input
                      type={type || 'text'}
                      step={type === 'number' ? 'any' : undefined}
                      value={form[key]}
                      onChange={e => set(key, e.target.value)}
                      style={inputStyle}
                    />
                  </Campo>
                ))}
              </div>
            </div>
          ))}
        </form>

        <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} type="button" style={{ ...selectStyle, background: 'transparent' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{
            background: guardando ? C.textoMut : C.azul, color: '#fff', border: 'none',
            borderRadius: '8px', padding: '8px 20px', fontSize: '0.82rem', fontWeight: 600,
            cursor: guardando ? 'not-allowed' : 'pointer',
          }}>
            {guardando ? 'Guardando...' : 'Guardar control'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────
function ControlReclamo() {
  const [data,     setData]     = useState(null)
  const [cargando, setCargando] = useState(false)
  const [filtros,  setFiltros]  = useState({ año: 0, mes: 0, canal: '', usuario: '', cliente: '' })
  const [clienteInput, setClienteInput] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = useCallback(async (f) => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (f.año)      params.append('año', f.año)
      if (f.mes)      params.append('mes', f.mes)
      if (f.canal)    params.append('canal', f.canal)
      if (f.usuario)  params.append('usuario', f.usuario)
      if (f.cliente)  params.append('cliente', f.cliente)
      const res  = await fetch(`${BASE_URL}/api/control-reclamo/dashboard?${params}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar(filtros) }, [filtros, cargar])

  // Debounce de la búsqueda por cliente
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros(f => f.cliente === clienteInput ? f : { ...f, cliente: clienteInput })
    }, 450)
    return () => clearTimeout(t)
  }, [clienteInput])

  function handleFiltro(key, value) {
    setFiltros(f => ({ ...f, [key]: value }))
  }

  function limpiar() {
    setClienteInput('')
    setFiltros({ año: 0, mes: 0, canal: '', usuario: '', cliente: '' })
  }

  const kpis        = data?.kpis || {}
  const vf          = data?.valores_filtro || {}
  const porAño       = data?.por_año || []
  const porMes       = data?.por_mes || []
  const partNovedad = data?.participacion_novedad || []
  const porCanal     = data?.por_canal || []
  const topClientes = data?.top_clientes || []
  const hayDatos    = data && (kpis.total_controles > 0)

  // ── Gráficas ─────────────────────────────────────────────────────────
  const opPorAño = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: C.borde, textStyle: { color: C.texto, fontSize: 12 } },
    grid: { left: '3%', right: '4%', bottom: '6%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: porAño.map(r => r.año), axisLabel: { color: C.textoMut, fontSize: 11 }, axisLine: { lineStyle: { color: C.borde } } },
    yAxis: { type: 'value', axisLabel: { color: C.textoMut, fontSize: 11 }, splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } } },
    series: [{
      name: 'Controles', type: 'bar', data: porAño.map(r => r.controles), barMaxWidth: 50,
      itemStyle: { color: C.azul, borderRadius: [6, 6, 0, 0] },
      label: { show: true, position: 'top', color: C.textoMut, fontSize: 11, fontWeight: 600 },
    }],
  }

  const opPorMes = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: C.borde, textStyle: { color: C.texto, fontSize: 12 },
      formatter: params => {
        const p = params[0]
        return `<div style="font-weight:700;margin-bottom:4px">${p.axisValueLabel}</div><div>${fmtMon(p.value)}</div>`
      },
    },
    grid: { left: '3%', right: '4%', bottom: '6%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: porMes.map(r => r.nombre_mes), axisLabel: { color: C.textoMut, fontSize: 11, rotate: 30 }, axisLine: { lineStyle: { color: C.borde } } },
    yAxis: { type: 'value', axisLabel: { color: C.textoMut, fontSize: 11, formatter: fmtCompact }, splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } } },
    series: [{
      name: 'Valor', type: 'bar', data: porMes.map(r => r.valor), barMaxWidth: 40,
      itemStyle: { color: C.verde, borderRadius: [6, 6, 0, 0] },
    }],
  }

  const mkDonut = (rows, valorKey, pctKey, tooltipFmt) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: C.borde, textStyle: { color: C.texto, fontSize: 12 }, formatter: tooltipFmt },
    legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { color: C.textoMut, fontSize: 11 }, type: 'scroll' },
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['36%', '50%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{d}%', fontSize: 10, color: C.textoMut },
      labelLine: { length: 6, length2: 6 },
      data: rows.map((r, i) => ({ name: r.novedad, value: r[valorKey], pct: r[pctKey], itemStyle: { color: PALETTE[i % PALETTE.length] } })),
    }],
  })

  const opNovedadControles = mkDonut(partNovedad, 'controles', 'pct_control',
    p => `${p.marker}${p.name}<br/>Controles: <strong>${fmtNum(p.value)}</strong> (${p.data.pct}%)`)

  const opNovedadValor = mkDonut(partNovedad, 'valor', 'pct_valor',
    p => `${p.marker}${p.name}<br/>Valor: <strong>${fmtMon(p.value)}</strong> (${p.data.pct}%)`)

  const mkBarrasCanal = (valorKey, color, tooltipFmt, axisFmt) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: C.borde, textStyle: { color: C.texto, fontSize: 12 }, formatter: tooltipFmt },
    grid: { left: '3%', right: '6%', top: '4%', bottom: '4%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: C.textoMut, fontSize: 11, formatter: axisFmt }, splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } } },
    yAxis: { type: 'category', data: porCanal.map(r => r.canal), axisLabel: { color: C.textoMut, fontSize: 11 }, axisLine: { lineStyle: { color: C.borde } } },
    series: [{
      type: 'bar', data: porCanal.map(r => r[valorKey]), barMaxWidth: 22,
      itemStyle: { color: params => PALETTE[params.dataIndex % PALETTE.length], borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', color: C.textoMut, fontSize: 11 },
    }],
  })

  const opCanalControles = mkBarrasCanal('controles', C.morado,
    params => { const p = params[0]; return `${p.axisValueLabel}<br/>Controles: <strong>${fmtNum(p.value)}</strong>` },
    v => fmtNum(v))

  const opCanalValor = mkBarrasCanal('valor', C.amarillo,
    params => { const p = params[0]; return `${p.axisValueLabel}<br/>Valor: <strong>${fmtMon(p.value)}</strong>` },
    fmtCompact)

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', padding: '20px', fontFamily: 'Inter, sans-serif', color: C.texto }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Control Reclamo</h1>
          <p style={{ fontSize: '0.82rem', color: C.textoMut, margin: '4px 0 0' }}>
            Dashboard de control de reclamos por filtros
          </p>
        </div>
        <button onClick={() => setModalAbierto(true)} style={{
          background: C.azul, color: '#fff', border: 'none', borderRadius: '8px',
          padding: '10px 18px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
        }}>
          + Registrar nuevo control
        </button>
      </div>

      {/* Filtros */}
      <div style={{ background: C.card, borderRadius: '12px', padding: '14px 18px', border: `1px solid ${C.borde}`, marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: C.textoMut }}>Filtros</span>

          <select value={filtros.año} style={selectStyle} onChange={e => handleFiltro('año', Number(e.target.value))}>
            <option value={0}>Todos los años</option>
            {(vf.años || []).map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={filtros.mes} style={selectStyle} onChange={e => handleFiltro('mes', Number(e.target.value))}>
            <option value={0}>Todos los meses</option>
            {(vf.meses || []).map(m => <option key={m.num} value={m.num}>{m.nombre}</option>)}
          </select>

          <select value={filtros.canal} style={selectStyle} onChange={e => handleFiltro('canal', e.target.value)}>
            <option value="">Todos los canales</option>
            {(vf.canales || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filtros.usuario} style={selectStyle} onChange={e => handleFiltro('usuario', e.target.value)}>
            <option value="">Todos los usuarios</option>
            {(vf.usuarios || []).map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <input
            placeholder="Buscar cliente..."
            value={clienteInput}
            onChange={e => setClienteInput(e.target.value)}
            style={{ ...selectStyle, minWidth: '180px' }}
          />

          <button onClick={limpiar} style={{ ...selectStyle, background: 'transparent', color: C.textoMut }}>✕ Limpiar</button>

          {cargando && <div style={{ fontSize: '0.78rem', color: C.textoMut }}>Cargando...</div>}
        </div>
      </div>

      {/* Sin datos */}
      {!hayDatos && !cargando && (
        <div style={{ background: C.card, borderRadius: '12px', padding: '60px', textAlign: 'center', border: `1px solid ${C.borde}` }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📢</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>Sin registros de control reclamo</div>
          <div style={{ fontSize: '0.82rem', color: C.textoMut }}>Ajusta los filtros o registra un nuevo control para comenzar.</div>
        </div>
      )}

      {hayDatos && !cargando && (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <KpiCard label="Total Controles" valor={fmtNum(kpis.total_controles)} color={C.azul} icon="📋" />
            <KpiCard label="Total Líneas"    valor={fmtNum(kpis.total_lineas)}    color={C.morado} icon="📄" />
            <KpiCard label="Valor Total"      valor={fmtMon(kpis.valor_total)}     color={C.verde} icon="💰" />
          </div>

          {/* Fila 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={cardStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Controles por Año</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '10px' }}>Cantidad de facturas únicas (controles) por año</div>
              {porAño.length > 0
                ? <ReactECharts option={opPorAño} style={{ height: '280px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
            <div style={cardStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Valor por Mes</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '10px' }}>Valor total reclamado por mes</div>
              {porMes.length > 0
                ? <ReactECharts option={opPorMes} style={{ height: '280px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
          </div>

          {/* Fila 2 — donas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={cardStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Participación por Novedad — Controles</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '10px' }}>% de controles por tipo de novedad</div>
              {partNovedad.length > 0
                ? <ReactECharts option={opNovedadControles} style={{ height: '280px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
            <div style={cardStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Participación Económica por Novedad — Valor</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '10px' }}>% del valor reclamado por tipo de novedad</div>
              {partNovedad.length > 0
                ? <ReactECharts option={opNovedadValor} style={{ height: '280px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
          </div>

          {/* Fila 3 — por canal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={cardStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Controles por Canal</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '10px' }}>Cantidad de controles por canal de venta</div>
              {porCanal.length > 0
                ? <ReactECharts option={opCanalControles} style={{ height: Math.max(200, porCanal.length * 40) + 'px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
            <div style={cardStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Valor por Canal</div>
              <div style={{ fontSize: '0.75rem', color: C.textoMut, marginBottom: '10px' }}>Valor reclamado por canal de venta</div>
              {porCanal.length > 0
                ? <ReactECharts option={opCanalValor} style={{ height: Math.max(200, porCanal.length * 40) + 'px' }} />
                : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textoMut }}>Sin datos</div>}
            </div>
          </div>

          {/* Top 10 clientes */}
          <div style={{ background: C.card, borderRadius: '12px', border: `1px solid ${C.borde}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Top 10 Clientes Más Afectados</div>
                <div style={{ fontSize: '0.72rem', color: C.textoMut, marginTop: '2px' }}>Ordenado por cantidad de controles</div>
              </div>
              <span style={{ fontSize: '0.75rem', color: C.textoMut }}>{topClientes.length} clientes</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: C.fondo }}>
                    {[{ l: '#', a: 'center' }, { l: 'Cliente', a: 'left' }, { l: 'Controles', a: 'right' }, { l: 'Valor', a: 'right' }].map(({ l, a }) => (
                      <th key={l} style={{ padding: '9px 12px', textAlign: a, fontWeight: 600, color: C.textoMut, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${C.borde}` }}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topClientes.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: C.textoMut }}>Sin datos</td></tr>
                  )}
                  {topClientes.map((r, i) => (
                    <tr key={r.cliente} style={{ borderBottom: `1px solid ${C.borde}`, background: i % 2 === 0 ? C.card : C.fondo }}>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: C.textoMut }}>{i + 1}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.cliente}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmtNum(r.controles)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: C.rojo }}>{fmtMon(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalAbierto && (
        <ModalRegistrar
          onClose={() => setModalAbierto(false)}
          onGuardado={() => { setModalAbierto(false); cargar(filtros) }}
        />
      )}
    </div>
  )
}

export default ControlReclamo
